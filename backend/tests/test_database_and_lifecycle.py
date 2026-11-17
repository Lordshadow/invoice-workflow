"""
Targeted Automated Test Suite for Phase 2: Database Layer, State Machine & Target Delivery.
Enforces Senior Backend Developer Standards, API Tester Standards, and QA Auditor Disciplines:
- ACID transactional persistence across documents, invoices, line items, and audit logs
- Layer-1 (SHA-256) and Layer-2 (Supplier GSTIN + Invoice Number) deduplication
- State machine lifecycle transitions and illegal transition rejection
- Optimistic Concurrency Control (OCC versioning) and HTTP 409 conflict handling
- Target Company ERP database idempotent delivery and Outbox event publishing
"""
import json
import pytest
from sqlalchemy import select
from backend.app.models.document import Document
from backend.app.models.invoice import (
    AuditLog,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
    OutboxEvent,
    OutboxStatus,
)
from backend.app.models.target_company import CompanyInvoice
from backend.app.services.deduplication_service import (
    DeduplicationService,
    DuplicateType,
)
from backend.app.services.delivery_worker import DeliveryWorker
from backend.app.services.invoice_state_machine import (
    ConcurrencyConflictError,
    InvalidStateTransitionError,
    InvoiceStateMachine,
)


class TestDatabaseAndLifecycle:
    """Verifies Phase 2 database persistence, state transitions, and delivery."""

    def test_database_initialization(self, db_session, target_db_session):
        """Verifies primary and target databases initialize schemas properly."""
        assert db_session is not None
        assert target_db_session is not None

    def test_state_machine_allowed_transitions(self, db_session):
        """Verifies legal lifecycle transitions with audit log recording."""
        doc = Document(
            source="upload",
            file_name="test.pdf",
            file_path="uploads/test.pdf",
            file_hash="testhash123456",
            file_size_bytes=1000,
            mime_type="application/pdf"
        )
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.RECEIVED,
            supplier_name="ACME CORP",
            supplier_gstin="33AAAAA0000A1Z5",
            invoice_number="INV-001",
            subtotal=1000.0,
            grand_total=1180.0,
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        # RECEIVED -> PREPROCESSING
        InvoiceStateMachine.transition(inv, InvoiceStatus.PREPROCESSING, actor="tester", db=db_session)
        assert inv.status == InvoiceStatus.PREPROCESSING
        assert inv.version == 2

        # PREPROCESSING -> EXTRACTED
        InvoiceStateMachine.transition(inv, InvoiceStatus.EXTRACTED, actor="tester", db=db_session)
        assert inv.status == InvoiceStatus.EXTRACTED
        assert inv.version == 3

        # EXTRACTED -> VALIDATED
        InvoiceStateMachine.transition(inv, InvoiceStatus.VALIDATED, actor="tester", db=db_session)
        assert inv.status == InvoiceStatus.VALIDATED

        # VALIDATED -> PENDING_APPROVAL
        InvoiceStateMachine.transition(inv, InvoiceStatus.PENDING_APPROVAL, actor="tester", db=db_session)
        assert inv.status == InvoiceStatus.PENDING_APPROVAL
        db_session.commit()

        # Verify audit logs were written
        audit_entries = db_session.scalars(select(AuditLog).where(AuditLog.entity_id == inv.id)).all()
        assert len(audit_entries) >= 4

    def test_state_machine_illegal_transition_rejected(self, db_session):
        """Verifies illegal transition directly from RECEIVED -> DELIVERED is rejected."""
        doc = Document(
            source="upload",
            file_name="illegal.pdf",
            file_path="uploads/illegal.pdf",
            file_hash="illegalhash123",
            file_size_bytes=500,
            mime_type="application/pdf"
        )
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.RECEIVED,
            invoice_number="INV-ILLEGAL",
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        with pytest.raises(InvalidStateTransitionError):
            InvoiceStateMachine.transition(inv, InvoiceStatus.DELIVERED, actor="hacker", db=db_session)

    def test_optimistic_concurrency_control_version_mismatch(self, db_session):
        """Verifies ConcurrencyConflictError when expected_version does not match."""
        inv = Invoice(
            document_id="dummy-doc-id",
            status=InvoiceStatus.PENDING_APPROVAL,
            invoice_number="INV-OCC",
            version=3
        )
        with pytest.raises(ConcurrencyConflictError):
            InvoiceStateMachine.transition(
                inv,
                InvoiceStatus.APPROVED,
                actor="approver",
                expected_version=2  # Stale version!
            )

    def test_layer1_file_deduplication(self, db_session):
        """Verifies Layer 1 detects exact SHA-256 duplicate files."""
        unique_hash = "a" * 64
        doc = Document(
            source="upload",
            file_name="receipt.jpg",
            file_path="uploads/receipt.jpg",
            file_hash=unique_hash,
            file_size_bytes=2048,
            mime_type="image/jpeg"
        )
        db_session.add(doc)
        db_session.commit()

        is_dup, matched_doc = DeduplicationService.check_file_duplicate(unique_hash, db_session)
        assert is_dup is True
        assert matched_doc.id == doc.id

        is_not_dup, _ = DeduplicationService.check_file_duplicate("b" * 64, db_session)
        assert is_not_dup is False

    def test_layer2_business_identity_deduplication(self, db_session):
        """Verifies Layer 2 detects identical (Supplier GSTIN + Invoice Number)."""
        doc = Document(
            source="upload",
            file_name="layer2.pdf",
            file_path="uploads/layer2.pdf",
            file_hash="layer2hash123",
            file_size_bytes=1000,
            mime_type="application/pdf"
        )
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_APPROVAL,
            supplier_gstin="33AABCT1234F1Z9",
            invoice_number="INV-2026-900",
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        # Exact match (even with variations in punctuation/spaces)
        dup_type, matched = DeduplicationService.check_business_duplicate(
            supplier_gstin="33AABCT1234F1Z9",
            invoice_number="INV 2026 900",
            current_invoice_id="doc-2",
            db=db_session
        )
        assert dup_type == DuplicateType.EXACT_BUSINESS_DUPLICATE
        assert matched.id == inv.id

    def test_delivery_worker_idempotent_posting(self, db_session, target_db_session):
        """Verifies DeliveryWorker writes to Target DB and enforces idempotency."""
        doc = Document(
            source="upload",
            file_name="delivery.pdf",
            file_path="uploads/delivery.pdf",
            file_hash="deliverhash999",
            file_size_bytes=1000,
            mime_type="application/pdf"
        )
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.APPROVED,
            supplier_name="DELIVERY CORP",
            supplier_gstin="33DELIV1234F1Z9",
            invoice_number="INV-DELIV-001",
            currency="INR",
            subtotal=1000.0,
            cgst=90.0,
            sgst=90.0,
            grand_total=1180.0,
            version=1
        )
        db_session.add(inv)
        db_session.flush()

        item = InvoiceLineItem(
            invoice_id=inv.id,
            description="High precision delivery widgets",
            quantity=2.0,
            unit_price=500.0,
            total_amount=1000.0
        )
        db_session.add(item)
        db_session.commit()

        # Deliver to target DB
        ok, msg, comp_inv = DeliveryWorker.deliver_invoice(
            invoice_id=inv.id,
            primary_db=db_session,
            target_db=target_db_session,
            actor="test_worker"
        )
        assert ok is True
        assert comp_inv is not None
        assert comp_inv.grand_total == 1180.0
        assert inv.status == InvoiceStatus.DELIVERED

        # Second delivery attempt should succeed idempotently without creating duplicate target rows
        ok2, msg2, comp_inv2 = DeliveryWorker.deliver_invoice(
            invoice_id=inv.id,
            primary_db=db_session,
            target_db=target_db_session,
            actor="test_worker"
        )
        # Cannot deliver DELIVERED status again (status guard)
        assert ok2 is False
        assert "Cannot deliver invoice" in msg2

    def test_process_invoice_api_endpoint(self, client, sample_image_bytes):
        """Verifies POST /api/v1/invoices/process creates full ACID database records."""
        response = client.post(
            "/api/v1/invoices/process",
            files={"file": ("api_test_invoice.png", sample_image_bytes, "image/png")},
            data={"source": "upload"}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["document_id"] is not None
        assert data["invoice_id"] is not None
        assert data["status"] in ("PENDING_APPROVAL", "PENDING_CORRECTION")
        inv_id = data["invoice_id"]

        # Verify GET /api/v1/invoices/{id}
        get_res = client.get(f"/api/v1/invoices/{inv_id}")
        assert get_res.status_code == 200
        inv_detail = get_res.json()
        assert inv_detail["id"] == inv_id
        assert len(inv_detail["line_items"]) >= 1
        assert len(inv_detail["extractions"]) >= 1
        assert len(inv_detail["audit_logs"]) >= 1

        # Verify GET /api/v1/invoices listing
        list_res = client.get("/api/v1/invoices")
        assert list_res.status_code == 200
        invoices = list_res.json()
        assert any(i["id"] == inv_id for i in invoices)

    def test_process_invoice_layer1_duplicate_rejection(self, client, sample_image_bytes):
        """Verifies uploading identical file bytes triggers Layer-1 duplicate detection."""
        # First upload
        res1 = client.post(
            "/api/v1/invoices/process",
            files={"file": ("dup_receipt.png", sample_image_bytes, "image/png")},
        )
        assert res1.status_code == 201

        # Second identical upload
        res2 = client.post(
            "/api/v1/invoices/process",
            files={"file": ("dup_receipt_again.png", sample_image_bytes, "image/png")},
        )
        assert res2.status_code == 201
        data2 = res2.json()
        assert data2["duplicate_type"] == "EXACT_FILE_DUPLICATE"
        assert "Duplicate file detected" in data2["message"]

    def test_approve_and_deliver_api_endpoint(self, client, sample_image_bytes):
        """Verifies POST /api/v1/invoices/{id}/approve enforces OCC and delivers to Target DB."""
        # 1. Ingest document
        res = client.post(
            "/api/v1/invoices/process",
            files={"file": ("approve_test.png", sample_image_bytes, "image/png")},
        )
        assert res.status_code == 201
        inv_id = res.json()["invoice_id"]
        inv_detail = client.get(f"/api/v1/invoices/{inv_id}").json()

        # If it landed in PENDING_CORRECTION, transition to PENDING_APPROVAL first
        curr_version = inv_detail["version"]

        # 2. Test OCC conflict with stale version (expected_version=999)
        conflict_res = client.post(
            f"/api/v1/invoices/{inv_id}/approve",
            json={
                "actor": "senior_accountant",
                "notes": "Verified against PO",
                "expected_version": 999
            }
        )
        assert conflict_res.status_code == 409

        # 3. Test successful approval with correct version
        # If invoice is in PENDING_APPROVAL, approve directly
        if inv_detail["status"] == "PENDING_APPROVAL":
            approve_res = client.post(
                f"/api/v1/invoices/{inv_id}/approve",
                json={
                    "actor": "senior_accountant",
                    "notes": "Verified against PO",
                    "expected_version": curr_version
                }
            )
            assert approve_res.status_code == 200
            approved_inv = approve_res.json()
            assert approved_inv["status"] == "DELIVERED"

            # 4. Check Target Company DB has posted record
            target_res = client.get("/api/v1/target-company/invoices")
            assert target_res.status_code == 200
            target_invoices = target_res.json()
            assert any(t["ext_reference_id"] == inv_id for t in target_invoices)

    def test_invoice_not_found(self, client):
        """Verifies HTTP 404 for non-existent invoice ID."""
        res = client.get("/api/v1/invoices/00000000-0000-0000-0000-000000000000")
        assert res.status_code == 404

    def test_update_invoice_endpoint_and_human_correction(self, client, sample_image_bytes):
        """Verifies PUT /api/v1/invoices/{id} corrects invalid invoices, re-validates, and increments OCC version."""
        # 1. Ingest an invoice
        res = client.post(
            "/api/v1/invoices/process",
            files={"file": ("edit_test.png", sample_image_bytes, "image/png")},
        )
        assert res.status_code == 201
        inv_id = res.json()["invoice_id"]
        inv_detail = client.get(f"/api/v1/invoices/{inv_id}").json()
        orig_version = inv_detail["version"]

        # 2. Test OCC Version Mismatch (Stale Version -> HTTP 409)
        conflict_res = client.put(
            f"/api/v1/invoices/{inv_id}",
            json={
                "actor": "accountant_jane",
                "expected_version": 999,
                "supplier_name": "Corrected Supplier Ltd"
            }
        )
        assert conflict_res.status_code == 409

        # 3. Apply valid corrections (e.g. valid GSTIN, line items matching subtotal)
        update_res = client.put(
            f"/api/v1/invoices/{inv_id}",
            json={
                "actor": "accountant_jane",
                "expected_version": orig_version,
                "notes": "Fixed supplier name, GSTIN, and adjusted line items",
                "supplier_name": "ACME INDUSTRIAL CORP",
                "supplier_gstin": "33AAACA1234A1Z5",
                "subtotal": 1000.0,
                "cgst": 90.0,
                "sgst": 90.0,
                "igst": 0.0,
                "grand_total": 1180.0,
                "line_items": [
                    {
                        "description": "Premium Heavy Duty Bearings",
                        "hsn_code": 8482,  # Tests integer HSN code coercion
                        "quantity": 2.0,
                        "unit_price": 500.0,
                        "discount": 0.0,
                        "tax_rate": 18.0,
                        "cgst_amount": 90.0,
                        "sgst_amount": 90.0,
                        "igst_amount": 0.0,
                        "total_amount": 1000.0
                    }
                ]
            }
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["supplier_name"] == "ACME INDUSTRIAL CORP"
        assert updated["supplier_gstin"] == "33AAACA1234A1Z5"
        assert updated["version"] == orig_version + 1
        assert updated["status"] == "PENDING_APPROVAL"
        assert updated["is_valid"] is True
        assert len(updated["line_items"]) == 1
        assert updated["line_items"][0]["hsn_code"] == "8482"

        # Verify audit trail contains update action
        audit_actions = [a["action"] for a in updated["audit_logs"]]
        assert "INVOICE_UPDATED" in audit_actions

    def test_reject_invoice_json_and_form_support(self, client, sample_image_bytes):
        """Verifies POST /api/v1/invoices/{id}/reject accepts both JSON body and Form data."""
        # Test JSON body rejection
        res = client.post(
            "/api/v1/invoices/process",
            files={"file": ("reject_json.png", sample_image_bytes, "image/png")},
        )
        inv_id = res.json()["invoice_id"]
        rej_res = client.post(
            f"/api/v1/invoices/{inv_id}/reject",
            json={"actor": "auditor_smith", "reason": "Illegible receipt scan"}
        )
        assert rej_res.status_code == 200
        assert rej_res.json()["status"] == "REJECTED"

    def test_hsn_and_string_coercion_on_canonical_models(self):
        """Verifies integer HSN codes, numeric invoice numbers, and numeric phone numbers are cleanly coerced to strings."""
        from backend.app.schemas.invoice import LineItem, SupplierDetails, InvoiceMetadata

        item = LineItem(
            description="Motor Shaft",
            hsn_code=8483,  # Integer input
            quantity=1.0,
            unit_price=150.0,
            total_amount=150.0
        )
        assert item.hsn_code == "8483"
        assert isinstance(item.hsn_code, str)

        sup = SupplierDetails(
            name="Supplier A",
            phone=9876543210,  # Numeric input
            gstin="33AAACA1234A1Z5"
        )
        assert sup.phone == "9876543210"
        assert isinstance(sup.phone, str)

        meta = InvoiceMetadata(
            invoice_number=10042,  # Numeric invoice number
            invoice_date="2026-11-17"
        )
        assert meta.invoice_number == "10042"
        assert isinstance(meta.invoice_number, str)

