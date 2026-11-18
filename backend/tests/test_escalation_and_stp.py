"""
Comprehensive Automated Test Suite for Straight-Through Processing (STP) and
Human-in-the-Loop (HITL) Escalation Engine.
Enforces AGENTS.md rules: Zero regressions, 100% test coverage for newly created endpoints,
proper HTTP status codes, and ACID database verification.
"""
import io
import json
import pytest
from PIL import Image, ImageDraw

from backend.app.config import settings
from backend.app.models.document import Document
from backend.app.models.invoice import (
    AuditLog,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
)
from backend.app.models.target_company import CompanyInvoice
from backend.app.schemas.invoice import (
    BuyerDetails,
    CanonicalInvoice,
    ExtractionResponse,
    InvoiceMetadata,
    LineItem,
    SupplierDetails,
    TaxBreakdown,
)
from backend.app.services.deduplication_service import DuplicateType
from backend.app.services.escalation_service import (
    EscalationCategory,
    EscalationService,
)


class TestEscalationAndSTPEngine:
    """Tests for Straight-Through Processing and HITL Escalation Classification."""

    def test_escalation_service_clean_invoice_stp_eligible(self):
        """Verifies clean invoice meets all STP criteria when STP is enabled."""
        invoice = CanonicalInvoice(
            supplier=SupplierDetails(name="Apex Supplies Ltd", gstin="33AAACA1234A1Z5"),
            buyer=BuyerDetails(name="TechCorp India"),
            metadata=InvoiceMetadata(invoice_number="INV-STP-101", invoice_date="2026-11-17"),
            line_items=[
                LineItem(description="Server Rack", quantity=1, unit_price=1000.0, total_amount=1000.0)
            ],
            subtotal=1000.0,
            tax=TaxBreakdown(cgst=90.0, sgst=90.0, igst=0.0),
            round_off=0.0,
            grand_total=1180.0,
            confidence_score=0.95
        )
        ext_res = ExtractionResponse(
            success=True,
            provider="test",
            model_name="test",
            latency_ms=10.0,
            invoice=invoice,
            validation_passed=True,
            validation_errors=[]
        )

        decision = EscalationService.evaluate(
            invoice_model=invoice,
            ext_res=ext_res,
            dup_type=DuplicateType.NONE,
            enable_stp=True
        )

        assert decision.is_escalated is False
        assert decision.is_stp_eligible is True
        assert decision.target_status == InvoiceStatus.APPROVED
        assert decision.escalation_category is None

    def test_escalation_service_math_mismatch_escalated(self):
        """Verifies invoices with validation errors are escalated to PENDING_CORRECTION."""
        invoice = CanonicalInvoice(
            supplier=SupplierDetails(name="Apex Supplies Ltd", gstin="33AAACA1234A1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-ERR-102", invoice_date="2026-11-17"),
            line_items=[
                LineItem(description="Parts", quantity=2, unit_price=100.0, total_amount=200.0)
            ],
            subtotal=200.0,
            tax=TaxBreakdown(cgst=18.0, sgst=18.0),
            round_off=0.0,
            grand_total=999.0,  # Deliberate math mismatch (236.0 vs 999.0)
            confidence_score=0.90
        )
        ext_res = ExtractionResponse(
            success=True,
            provider="test",
            model_name="test",
            latency_ms=10.0,
            invoice=invoice,
            validation_passed=False,
            validation_errors=["Grand total 999.0 != calculated total 236.0"]
        )

        decision = EscalationService.evaluate(
            invoice_model=invoice,
            ext_res=ext_res,
            dup_type=DuplicateType.NONE,
            enable_stp=True
        )

        assert decision.is_escalated is True
        assert decision.is_stp_eligible is False
        assert decision.escalation_category == EscalationCategory.MATH_MISMATCH.value
        assert decision.target_status == InvoiceStatus.PENDING_CORRECTION
        assert "Arithmetic or tax mismatch" in decision.escalation_reason

    def test_escalation_service_duplicate_suspected_escalated(self):
        """Verifies duplicate invoices are escalated to DUPLICATE_INVESTIGATION."""
        invoice = CanonicalInvoice(
            supplier=SupplierDetails(name="Apex Supplies Ltd", gstin="33AAACA1234A1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-DUP-103", invoice_date="2026-11-17"),
            line_items=[LineItem(description="Widget", quantity=1, unit_price=100.0, total_amount=100.0)],
            subtotal=100.0,
            grand_total=100.0,
            confidence_score=0.95
        )
        ext_res = ExtractionResponse(
            success=True,
            provider="test",
            model_name="test",
            latency_ms=10.0,
            invoice=invoice,
            validation_passed=True,
            validation_errors=[]
        )

        decision = EscalationService.evaluate(
            invoice_model=invoice,
            ext_res=ext_res,
            dup_type=DuplicateType.EXACT_BUSINESS_DUPLICATE,
            enable_stp=True
        )

        assert decision.is_escalated is True
        assert decision.is_stp_eligible is False
        assert decision.escalation_category == EscalationCategory.DUPLICATE_SUSPECTED.value
        assert decision.target_status == InvoiceStatus.DUPLICATE_INVESTIGATION

    def test_escalation_service_low_confidence_score_escalated(self):
        """Verifies confidence scores below threshold trigger low confidence escalation."""
        invoice = CanonicalInvoice(
            supplier=SupplierDetails(name="Apex Supplies Ltd", gstin="33AAACA1234A1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-CONF-104", invoice_date="2026-11-17"),
            line_items=[LineItem(description="Service", quantity=1, unit_price=500.0, total_amount=500.0)],
            subtotal=500.0,
            grand_total=500.0,
            confidence_score=0.65  # Below default 0.85 threshold
        )
        ext_res = ExtractionResponse(
            success=True,
            provider="test",
            model_name="test",
            latency_ms=10.0,
            invoice=invoice,
            validation_passed=True,
            validation_errors=[]
        )

        decision = EscalationService.evaluate(
            invoice_model=invoice,
            ext_res=ext_res,
            dup_type=DuplicateType.NONE,
            enable_stp=True,
            min_confidence=0.85
        )

        assert decision.is_escalated is True
        assert decision.is_stp_eligible is False
        assert decision.escalation_category == EscalationCategory.LOW_CONFIDENCE.value
        assert decision.target_status == InvoiceStatus.PENDING_APPROVAL
        assert "below STP threshold" in decision.escalation_reason

    def test_escalation_service_high_value_audit_mandate(self):
        """Verifies invoices exceeding high-value limit require human authorization even if clean."""
        invoice = CanonicalInvoice(
            supplier=SupplierDetails(name="Apex Supplies Ltd", gstin="33AAACA1234A1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-HIGH-105", invoice_date="2026-11-17"),
            line_items=[LineItem(description="Heavy Machinery", quantity=1, unit_price=250000.0, total_amount=250000.0)],
            subtotal=250000.0,
            grand_total=250000.0,  # Exceeds default limit of 100,000
            confidence_score=0.98
        )
        ext_res = ExtractionResponse(
            success=True,
            provider="test",
            model_name="test",
            latency_ms=10.0,
            invoice=invoice,
            validation_passed=True,
            validation_errors=[]
        )

        decision = EscalationService.evaluate(
            invoice_model=invoice,
            ext_res=ext_res,
            dup_type=DuplicateType.NONE,
            enable_stp=True,
            max_amount=100000.0
        )

        assert decision.is_escalated is True
        assert decision.is_stp_eligible is False
        assert decision.escalation_category == EscalationCategory.HIGH_VALUE_AUDIT.value
        assert decision.target_status == InvoiceStatus.PENDING_APPROVAL
        assert "human authorization required" in decision.escalation_reason

    def test_escalation_service_missing_mandatory_fields(self):
        """Verifies missing invoice number or generic vendor triggers missing fields escalation."""
        # Generic supplier name
        inv_no_supplier = CanonicalInvoice(
            supplier=SupplierDetails(name="UNKNOWN SUPPLIER"),
            metadata=InvoiceMetadata(invoice_number="INV-999"),
            line_items=[LineItem(description="Item", quantity=1, unit_price=10.0, total_amount=10.0)],
            subtotal=10.0,
            grand_total=10.0,
            confidence_score=0.95
        )
        ext_res = ExtractionResponse(
            success=True, provider="test", model_name="test", latency_ms=10.0,
            invoice=inv_no_supplier, validation_passed=True, validation_errors=[]
        )
        decision = EscalationService.evaluate(inv_no_supplier, ext_res, enable_stp=True)
        assert decision.is_escalated is True
        assert decision.escalation_category == EscalationCategory.MISSING_FIELDS.value
        assert "supplier name" in decision.escalation_reason.lower()

    def test_process_invoice_api_stp_auto_delivered(self, client, monkeypatch, target_db_session):
        """Tests that clean e-invoice with enable_stp=True auto-approves and delivers straight to Target DB."""
        # Monkeypatch extraction service to return a pristine invoice
        clean_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="Solaris Power Systems", gstin="33AAACA9999A1Z5"),
            buyer=BuyerDetails(name="Enterprise Retailers"),
            metadata=InvoiceMetadata(invoice_number="INV-AUTO-777", invoice_date="2026-11-17", currency="INR"),
            line_items=[
                LineItem(description="Solar Inverter 5kW", quantity=1, unit_price=45000.0, total_amount=45000.0)
            ],
            subtotal=45000.0,
            tax=TaxBreakdown(cgst=4050.0, sgst=4050.0, igst=0.0),
            round_off=0.0,
            grand_total=53100.0,
            confidence_score=0.99
        )
        mock_ext = ExtractionResponse(
            success=True,
            provider="mock_cloud",
            model_name="mock_v1",
            latency_ms=10.0,
            invoice=clean_inv,
            validation_passed=True,
            validation_errors=[]
        )

        from backend.app.routers.invoices import extraction_service
        monkeypatch.setattr(extraction_service, "process_and_extract", lambda filename, b: mock_ext)

        # Upload with enable_stp=true
        dummy_file = b"%PDF-1.4 dummy pdf bytes"
        res = client.post(
            "/api/v1/invoices/process",
            files={"file": ("clean_solaris.pdf", dummy_file, "application/pdf")},
            data={"source": "upload", "enable_stp": "true"}
        )

        assert res.status_code == 201
        data = res.json()
        assert data["success"] is True
        assert data["status"] == "DELIVERED"
        assert data["delivered_to_target"] is True
        assert data["is_escalated"] is False
        assert data["escalation_category"] is None
        assert "Straight-Through Processing" in data["message"]

        # Verify entry in Target DB
        target_inv = target_db_session.query(CompanyInvoice).filter_by(invoice_number="INV-AUTO-777").first()
        assert target_inv is not None
        assert target_inv.supplier_name == "Solaris Power Systems"
        assert target_inv.grand_total == 53100.0
        assert len(target_inv.lines) == 1

    def test_process_invoice_api_escalated_on_math_error(self, client, monkeypatch):
        """Tests that invoice with math mismatch lands in PENDING_CORRECTION and is flagged as escalated."""
        mismatch_inv = CanonicalInvoice(
            supplier=SupplierDetails(name="Faulty Supplier", gstin="33AAACA9999A1Z5"),
            metadata=InvoiceMetadata(invoice_number="INV-ERR-888", invoice_date="2026-11-17"),
            line_items=[LineItem(description="Widget", quantity=10, unit_price=10.0, total_amount=100.0)],
            subtotal=100.0,
            grand_total=500.0,  # Invalid
            confidence_score=0.90
        )
        mock_ext = ExtractionResponse(
            success=True,
            provider="mock",
            model_name="mock",
            latency_ms=10.0,
            invoice=mismatch_inv,
            validation_passed=False,
            validation_errors=["Grand total mismatch: expected 100.0, got 500.0"]
        )

        from backend.app.routers.invoices import extraction_service
        monkeypatch.setattr(extraction_service, "process_and_extract", lambda filename, b: mock_ext)

        res = client.post(
            "/api/v1/invoices/process",
            files={"file": ("error_inv.pdf", b"pdf bytes", "application/pdf")},
            data={"source": "upload", "enable_stp": "true"}
        )

        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "PENDING_CORRECTION"
        assert data["is_escalated"] is True
        assert data["escalation_category"] == "MATH_MISMATCH"
        assert data["delivered_to_target"] is False
        assert "escalated for Human-in-the-Loop review" in data["message"]

    def test_list_escalated_invoices_api(self, client, db_session):
        """Verifies GET /api/v1/invoices/escalated returns only invoices requiring human action."""
        doc = Document(source="upload", file_name="e1.pdf", file_path="e1.pdf", file_hash="eh1", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv1 = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_CORRECTION,
            supplier_name="Escalated Vendor 1",
            invoice_number="INV-ESC-1",
            grand_total=100.0,
            is_escalated=True,
            escalation_category="MATH_MISMATCH",
            escalation_reason="Math error in subtotal",
            version=1
        )
        inv2 = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.DELIVERED,
            supplier_name="Delivered Clean Vendor",
            invoice_number="INV-CLEAN-2",
            grand_total=200.0,
            is_escalated=False,
            version=1
        )
        db_session.add_all([inv1, inv2])
        db_session.commit()

        # Query all escalated
        res = client.get("/api/v1/invoices/escalated")
        assert res.status_code == 200
        escalated_list = res.json()
        assert len(escalated_list) == 1
        assert escalated_list[0]["invoice_number"] == "INV-ESC-1"
        assert escalated_list[0]["is_escalated"] is True

        # Query by category
        res_cat = client.get("/api/v1/invoices/escalated?category=MATH_MISMATCH")
        assert res_cat.status_code == 200
        assert len(res_cat.json()) == 1

        res_cat_empty = client.get("/api/v1/invoices/escalated?category=DUPLICATE_SUSPECTED")
        assert res_cat_empty.status_code == 200
        assert len(res_cat_empty.json()) == 0

    def test_escalation_stats_api(self, client, db_session):
        """Verifies GET /api/v1/invoices/escalation-stats accurately computes metrics and breakdown."""
        doc = Document(source="upload", file_name="stat.pdf", file_path="stat.pdf", file_hash="sh1", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv_delivered = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.DELIVERED,
            supplier_name="Auto Vendor",
            invoice_number="INV-STAT-1",
            grand_total=500.0,
            is_escalated=False,
            version=1
        )
        inv_math = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_CORRECTION,
            supplier_name="Error Vendor",
            invoice_number="INV-STAT-2",
            grand_total=100.0,
            is_escalated=True,
            escalation_category="MATH_MISMATCH",
            version=1
        )
        db_session.add_all([inv_delivered, inv_math])
        db_session.commit()

        res = client.get("/api/v1/invoices/escalation-stats")
        assert res.status_code == 200
        stats = res.json()
        assert stats["total_invoices"] == 2
        assert stats["escalated_count"] == 1
        assert stats["delivered_count"] == 1
        assert stats["clean_count"] == 1
        assert stats["stp_rate_percentage"] == 50.0
        assert stats["category_breakdown"].get("MATH_MISMATCH") == 1

    def test_manual_escalate_and_de_escalate_endpoints(self, client, db_session):
        """Verifies POST /api/v1/invoices/{id}/escalate and /de-escalate endpoints."""
        doc = Document(source="upload", file_name="manual.pdf", file_path="manual.pdf", file_hash="mh1", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_APPROVAL,
            supplier_name="Manual Vendor",
            invoice_number="INV-MAN-1",
            grand_total=150.0,
            is_escalated=False,
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        # 1. Manually escalate
        esc_res = client.post(
            f"/api/v1/invoices/{inv.id}/escalate",
            json={
                "actor": "senior_auditor",
                "reason": "Suspicious price hike compared to historical purchases",
                "category": "HIGH_VALUE_AUDIT"
            }
        )
        assert esc_res.status_code == 200
        esc_data = esc_res.json()
        assert esc_data["is_escalated"] is True
        assert esc_data["escalation_category"] == "HIGH_VALUE_AUDIT"
        assert "Suspicious price hike" in esc_data["escalation_reason"]

        # Verify audit log recorded
        audits = db_session.query(AuditLog).filter_by(entity_id=inv.id, action="MANUAL_ESCALATION").all()
        assert len(audits) == 1
        assert audits[0].actor == "senior_auditor"

        # 2. De-escalate after investigation
        de_res = client.post(
            f"/api/v1/invoices/{inv.id}/de-escalate",
            json={
                "actor": "finance_manager",
                "notes": "Verified against revised vendor quote"
            }
        )
        assert de_res.status_code == 200
        de_data = de_res.json()
        assert de_data["is_escalated"] is False
        assert de_data["escalation_category"] is None
        assert de_data["escalation_reason"] is None

        # Verify de-escalation audit log
        res_audits = db_session.query(AuditLog).filter_by(entity_id=inv.id, action="ESCALATION_RESOLVED").all()
        assert len(res_audits) == 1
        assert res_audits[0].actor == "finance_manager"

    def test_human_correction_clears_escalation_upon_valid_edit(self, client, db_session):
        """Verifies that human correction of an escalated invoice clears the escalation if validation passes."""
        doc = Document(source="upload", file_name="fix.pdf", file_path="fix.pdf", file_hash="fh1", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_CORRECTION,
            supplier_name="Vendor Fix",
            supplier_gstin="33AAACA1234A1Z5",
            invoice_number="INV-FIX-1",
            subtotal=100.0,
            cgst=9.0,
            sgst=9.0,
            grand_total=999.0,  # Invalid
            is_valid=False,
            is_escalated=True,
            escalation_category="MATH_MISMATCH",
            escalation_reason="Grand total mismatch",
            version=1
        )
        db_session.add(inv)
        db_session.flush()

        line = InvoiceLineItem(
            invoice_id=inv.id,
            description="Item 1",
            quantity=1,
            unit_price=100.0,
            tax_rate=18.0,
            cgst_amount=9.0,
            sgst_amount=9.0,
            total_amount=118.0
        )
        db_session.add(line)
        db_session.commit()

        # Update grand_total to 118.0 (correct math)
        put_res = client.put(
            f"/api/v1/invoices/{inv.id}",
            json={
                "actor": "accountant_jane",
                "expected_version": 1,
                "notes": "Corrected grand total to match line items + GST",
                "grand_total": 118.0
            }
        )
        assert put_res.status_code == 200
        updated = put_res.json()
        assert updated["is_valid"] is True
        assert updated["status"] == "PENDING_APPROVAL"
        assert updated["is_escalated"] is False
        assert updated["escalation_category"] is None
        assert updated["escalation_reason"] is None

    def test_approving_escalated_invoice_resolves_escalation_and_delivers(self, client, db_session):
        """Verifies that checker approval of an escalated invoice clears escalation and removes it from HITL queue."""
        doc = Document(source="upload", file_name="high.pdf", file_path="high.pdf", file_hash="hh1", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_APPROVAL,
            supplier_name="High Value Vendor",
            supplier_gstin="33AAACA1234A1Z5",
            invoice_number="INV-HIGH-777",
            grand_total=150000.0,
            is_valid=True,
            is_escalated=True,
            escalation_category="HIGH_VALUE_AUDIT",
            escalation_reason="Exceeds STP threshold",
            version=1
        )
        db_session.add(inv)
        db_session.flush()

        line = InvoiceLineItem(
            invoice_id=inv.id,
            description="Machinery Unit",
            quantity=1,
            unit_price=150000.0,
            total_amount=150000.0
        )
        db_session.add(line)
        db_session.commit()

        # Approve as authorized checker
        appr_res = client.post(
            f"/api/v1/invoices/{inv.id}/approve",
            json={
                "actor": "executive_checker",
                "notes": "Sign-off authorized for large capital expenditure",
                "expected_version": 1
            }
        )
        assert appr_res.status_code == 200
        appr_data = appr_res.json()
        assert appr_data["status"] == "DELIVERED"
        assert appr_data["is_escalated"] is False
        assert appr_data["escalation_category"] is None

        # Confirm it is no longer listed in active escalated invoices
        esc_queue = client.get("/api/v1/invoices/escalated").json()
        matching = [item for item in esc_queue if item["id"] == inv.id]
        assert len(matching) == 0

        # Confirm stats don't count delivered invoice in escalated_count
        stats = client.get("/api/v1/invoices/escalation-stats").json()
        assert stats["escalated_count"] == 0
        assert stats["delivered_count"] == 1

    def test_cannot_escalate_approved_invoice(self, client, db_session):
        """Verifies attempting to escalate an approved invoice returns HTTP 422."""
        doc = Document(source="upload", file_name="appr2.pdf", file_path="appr2.pdf", file_hash="ah2", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.APPROVED,
            supplier_name="Committed Vendor",
            invoice_number="INV-COMM-1",
            grand_total=200.0,
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        res = client.post(
            f"/api/v1/invoices/{inv.id}/escalate",
            json={
                "actor": "late_auditor",
                "reason": "Late inquiry"
            }
        )
        assert res.status_code == 422
        assert "Cannot escalate invoice in committed/terminal state" in res.json()["detail"]

    def test_escalate_and_deescalate_with_occ_protection(self, client, db_session):
        """Verifies OCC conflict (HTTP 409) on stale expected_version and version increment on success."""
        doc = Document(source="upload", file_name="occ.pdf", file_path="occ.pdf", file_hash="oh1", file_size_bytes=100, mime_type="application/pdf")
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_APPROVAL,
            supplier_name="OCC Vendor",
            invoice_number="INV-OCC-1",
            grand_total=300.0,
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        # 1. Stale version conflict
        res_conflict = client.post(
            f"/api/v1/invoices/{inv.id}/escalate",
            json={
                "actor": "auditor_a",
                "reason": "Check prices",
                "expected_version": 999
            }
        )
        assert res_conflict.status_code == 409
        assert "OCC conflict" in res_conflict.json()["detail"]

        # 2. Correct version succeeds and increments version to 2
        res_ok = client.post(
            f"/api/v1/invoices/{inv.id}/escalate",
            json={
                "actor": "auditor_a",
                "reason": "Check prices",
                "expected_version": 1
            }
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["version"] == 2
        assert res_ok.json()["is_escalated"] is True

        # 3. De-escalate with stale version 1 fails
        de_conflict = client.post(
            f"/api/v1/invoices/{inv.id}/de-escalate",
            json={
                "actor": "supervisor_b",
                "notes": "Verified",
                "expected_version": 1
            }
        )
        assert de_conflict.status_code == 409

        # 4. De-escalate with correct version 2 succeeds and increments version to 3
        de_ok = client.post(
            f"/api/v1/invoices/{inv.id}/de-escalate",
            json={
                "actor": "supervisor_b",
                "notes": "Verified",
                "expected_version": 2
            }
        )
        assert de_ok.status_code == 200
        assert de_ok.json()["version"] == 3
        assert de_ok.json()["is_escalated"] is False

    def test_get_invoice_file_stream(self, client, db_session, tmp_path):
        """Verifies GET /api/v1/invoices/{id}/file streams physical invoice file for split-screen canvas."""
        test_file = tmp_path / "stream_invoice.pdf"
        test_file.write_bytes(b"%PDF-1.4 Mock invoice content for canvas viewer")

        doc = Document(
            source="upload",
            file_name="stream_invoice.pdf",
            file_path=str(test_file),
            file_hash="mock_stream_hash_1",
            file_size_bytes=len(test_file.read_bytes()),
            mime_type="application/pdf"
        )
        db_session.add(doc)
        db_session.flush()

        inv = Invoice(
            document_id=doc.id,
            status=InvoiceStatus.PENDING_APPROVAL,
            supplier_name="Canvas Viewer Vendor",
            invoice_number="INV-CANVAS-1",
            grand_total=100.0,
            version=1
        )
        db_session.add(inv)
        db_session.commit()

        # Stream file
        res = client.get(f"/api/v1/invoices/{inv.id}/file")
        assert res.status_code == 200
        assert res.content == b"%PDF-1.4 Mock invoice content for canvas viewer"
        assert "application/pdf" in res.headers.get("content-type", "")

    def test_dashboard_static_app_mounted(self, client):
        """Verifies /dashboard/ serves the built Liquid Glass React dashboard."""
        res = client.get("/dashboard/")
        assert res.status_code == 200
        assert "<div id=\"root\">" in res.text


