# Project Activity & Engineering Changelog (`alogs.md`)

This file records all architectural decisions, file creations, modifications, QA audits, and testing activities across the project lifecycle.

---

### [2026-11-17 12:21:45 +05:30] Project Initialization, Master Engineering Plan & Custom Skills Setup

- **Actor / Mode**: AI Engineering Assistant
- **Phase / Scope**: Foundation, Governance & Skill System Initialization
- **Files Modified / Created**:
  - `COMPLETE_ENGINEERING_PLAN.md` (Created): Master engineering plan covering all 9 phases, sub-phases, tasks, workflows, and multi-cloud containerization.
  - `.agents/skills/git-workflow/SKILL.md` (Created): Skill for continuous local commits and user-requested cloud pushes.
  - `.agents/skills/activity-logger/SKILL.md` (Created): Skill governing `alogs.md` audit trail maintenance.
  - `.agents/skills/qa-auditor/SKILL.md` (Created): Skill enforcing QA audits, regression testing, and hidden dev debug logging.
  - `.agents/skills/scope-control/SKILL.md` (Created): Skill enforcing strict task boundaries and preventing scope creep.
  - `.agents/skills/api-tester/SKILL.md` (Created): Skill for comprehensive API verification across all HTTP statuses.
  - `.agents/skills/senior-backend-developer/SKILL.md` (Created): Senior backend patterns for FastAPI, PostgreSQL, and event-driven architectures.
  - `.agents/skills/senior-frontend-developer/SKILL.md` (Created): Senior frontend patterns for React 18, TypeScript, and split-screen document review.
  - `alogs.md` (Created): Activity and changelog file.
- **What Changed**:
  - Initialized a local Git repository (`git init`).
  - Authored the master 9-phase engineering blueprint tailored for OpenWA WhatsApp ingestion, Target/Dummy DB delivery, and multi-cloud/local hosting.
  - Created 7 specialized workspace skills adhering to the user's mandatory quality, testing, logging, and engineering guidelines.
- **Why (Rationale & Purpose)**:
  - Fulfills the user's explicit directive to establish quality assurance, scope control, API testing, activity logging, Git management, and senior developer standards before writing operational code.
- **QA & Verification Status**:
  - All skill files verified with YAML frontmatter conforming to Antigravity Customization specifications.
  - Local git repository initialized and ready for first commit.
  - Status: PASS.


### [2026-11-17 12:33:00 +05:30] Phase 1: Document Processing Engine & Virtual Environment Implementation

- **Actor / Mode**: AI Engineering Assistant
- **Phase / Scope**: Phase 1 — Document Vision, Preprocessing & Fast-Paths
- **Files Modified / Created**:
  - `backend/requirements.txt` (Created): Core package specifications (FastAPI, Uvicorn, PyMuPDF, OpenCV, Pydantic, etc.).
  - `backend/app/config.py` (Created): Application settings, DPI parameters, and debug logging configuration.
  - `backend/app/schemas/document.py` (Created): Pydantic schemas for DocumentType, PageInfo, QRCodeData, and DocumentProcessingResult.
  - `backend/app/services/image_preprocessor.py` (Created): OpenCV image preprocessor handling text skew detection, rotation, and CLAHE adaptive contrast.
  - `backend/app/services/pdf_extractor.py` (Created): PyMuPDF digital text layer extractor and 300 DPI high-resolution page image renderer.
  - `backend/app/services/qr_scanner.py` (Created): Indian B2B GST e-invoice QR code scanner and signed JWT/JSON payload decoder.
  - `backend/app/services/document_processor.py` (Created): Unified service coordinating SHA-256 hashing, format detection, PDF parsing, deskewing, and QR decoding.
  - `backend/app/routers/document_processing.py` (Created): FastAPI router exposing `GET /health` and `POST /preprocess` endpoints.
  - `backend/app/main.py` (Created): Main FastAPI entrypoint with CORS, error handlers, and Uvicorn server launcher.
  - `backend/tests/conftest.py` (Created): Pytest fixtures for test clients, synthetic invoice images, and skewed receipts.
  - `backend/tests/test_document_processor.py` (Created): Automated test suite verifying digital PDFs, mobile photo deskewing, GST e-invoice QR codes, and error cases.
  - `alogs.md` (Modified): Appended activity log for Document Processing sub-phase.
- **What Changed**:
  - Initialized isolated virtual environment `.venv` with `uv`.
  - Installed and locked core dependencies: `fastapi==0.163.1`, `uvicorn==0.54.0`, `pymupdf==2.1`, `opencv-python-headless==5.0.0.93`, `pydantic==2.14.3`, `qrcode==8.2`, `pytest==9.2.0`, `httpx==0.28.1`.
  - Implemented the complete Document Processing sub-phase with developer-only debug logging (`logger.debug`).
- **Why (Rationale & Purpose)**:
  - Deliver the foundational preprocessing layer of Phase 1, enabling the pipeline to ingest, clean, categorize, and extract text/QR data from incoming WhatsApp photos and digital PDFs before invoking AI extraction.
- **QA & Verification Status**:
  - Executed automated pytest test suite (`backend/tests/test_document_processor.py`).
  - Total 8 tests executed: 8 PASSED, 0 FAILED (100% pass rate).
  - Verified digital multi-page text extraction, mobile photo deskewing, GST QR code JWT decoding, empty file rejection (HTTP 400), and invalid file format rejection (HTTP 422).
  - Verified Uvicorn and FastAPI application startup.
  - Status: PASS.


### [2026-11-17 13:12:30 +05:30] Phase 1: AI Invoice Extraction Engine & Gemini/Vertex Dual Adapter

- **Actor / Mode**: AI Engineering Assistant
- **Phase / Scope**: Phase 1 — AI Extraction & Canonical Schema (Gemini Multimodal Adapter)
- **Files Modified / Created**:
  - `.env` (Created): Local environment configuration with placeholder for `GEMINI_API_KEY`, `GCP_PROJECT_ID`, and `GCP_LOCATION`.
  - `.env.example` (Created): Version-controlled environment template.
  - `backend/requirements.txt` (Modified): Added `google-genai>=3.4.0` and `python-dotenv>=1.0.0`.
  - `backend/app/config.py` (Modified): Loaded `.env` file and added Gemini/Vertex AI settings.
  - `backend/app/schemas/invoice.py` (Created): Pydantic canonical schema models (`SupplierDetails`, `BuyerDetails`, `InvoiceMetadata`, `LineItem`, `TaxBreakdown`, `CanonicalInvoice`, `ExtractionResponse`).
  - `backend/app/services/gemini_extractor.py` (Created): Gemini extraction service with dual support for Gemini Developer API and GCP Vertex AI, structured JSON outputs, and offline mock fallback.
  - `backend/app/services/extraction_service.py` (Created): Extraction orchestrator linking Document Preprocessing, QR fast-path, and Gemini AI.
  - `backend/app/routers/extraction.py` (Created): FastAPI endpoints `GET /api/v1/extract/status` and `POST /api/v1/extract`.
  - `backend/app/main.py` (Modified): Mounted extraction router under `/api/v1/extract`.
  - `backend/tests/conftest.py` (Modified): Added shared B2B QR code test fixtures.
  - `backend/tests/test_document_processor.py` (Modified): Cleaned up redundant fixtures.
  - `backend/tests/test_extraction.py` (Created): Automated unit and integration test suite for extraction and arithmetic validation.
  - `alogs.md` (Modified): Appended activity log for AI Extraction sub-phase.
- **What Changed**:
  - Implemented dual-mode Gemini multimodal extraction allowing instant local testing via `GEMINI_API_KEY` in `.env` and seamless cloud execution via GCP Vertex AI.
  - Enforced structured JSON output adhering to canonical Indian GST schema.
  - Added deterministic arithmetic validator checking $\text{Subtotal} + \text{Taxes} \pm \text{RoundOff} == \text{GrandTotal}$.
- **Why (Rationale & Purpose)**:
  - Fulfills user request to enable local testing with a Gemini API key via `.env` while preserving native Vertex AI GCP production readiness.
- **QA & Verification Status**:
  - Executed automated pytest test suite (`backend/tests/`).
  - Total 14 tests executed: 14 PASSED, 0 FAILED (100% pass rate).
  - Verified extraction status endpoint, image extraction, B2B QR fastpath, empty file handling, and math validator pass/fail edge cases.
  - Status: PASS.


### [2026-11-17 13:16:15 +05:30] Refinement: Optional QR Code Scanning & Comprehensive Requirement Extraction

- **Actor / Mode**: AI Engineering Assistant
- **Phase / Scope**: Phase 1 — Extraction Service Refinement & Scope Alignment
- **Files Modified / Created**:
  - `backend/app/config.py` (Modified): Added `ENABLE_QR_SCANNER` configuration flag (defaults to True, easily toggleable via `.env`).
  - `backend/app/services/document_processor.py` (Modified): Conditional check on `ENABLE_QR_SCANNER` for both image and PDF extraction streams.
  - `backend/app/services/extraction_service.py` (Modified): Redesigned extraction flow so Gemini Multimodal **always** extracts all required requirements (complete itemized line items, descriptions, rates, quantities, taxes, and totals). The QR code is made strictly optional and functions as a cross-verification/enrichment layer rather than a line-item bypass.
  - `backend/tests/test_extraction.py` (Modified): Updated tests to verify full line items are preserved during QR enrichment.
  - `alogs.md` (Modified): Recorded activity log entry.
- **What Changed**:
  - Decoupled line-item extraction from QR scanning: AI model extracts all fields and line items regardless of whether a QR code exists.
  - When a QR code is present, it optionally enriches the invoice with the official government IRN, cross-verifies supplier GSTIN and grand total, and raises verification warnings if discrepancies are found.
  - Added toggle `ENABLE_QR_SCANNER` to allow turning off QR detection completely when not needed.
- **Why (Rationale & Purpose)**:
  - Fulfills user directive: e-invoice QR codes only contain summary totals and do not contain individual itemized line-item details. The AI model must always extract the complete invoice requirements.
- **QA & Verification Status**:
  - Automated pytest test suite executed: 14 tests, 14 passed (100% pass rate).
  - Verified full line items are extracted and preserved with and without QR codes.
  - Status: PASS.


### [2026-11-17 13:41:30 +05:30] Live Batch AI Extraction on Real Sample Documents

- **Actor / Mode**: AI Engineering Assistant
- **Phase / Scope**: Phase 1 Verification — Live Multimodal Extraction Benchmark
- **Files Modified / Created**:
  - `run_samples.py` (Created): Batch runner script for processing sample directories and generating JSON outputs.
  - `outputs/01_synthetic_invoice_digital_extracted.json` (Created): Extracted JSON for Word `.docx` invoice (4 items, ₹2,914.60).
  - `outputs/02_synthetic_invoice_interstate_extracted.json` (Created): Extracted JSON for Interstate PDF (4 items, ₹28,709.40).
  - `outputs/03_synthetic_invoice_printed_photo_extracted.json` (Created): Extracted JSON for Printed Photo (3 items, ₹7,168.00).
  - `outputs/04_synthetic_invoice_handwritten_photo_extracted.json` (Created): Extracted JSON for Handwritten Photo (3 items, ₹1,480.50).
  - `outputs/ChatGPT Image Nov 17, 2026, 01_30_43 PM_extracted.json` (Created): Extracted JSON for Workwear Invoice.
  - `outputs/ChatGPT Image Nov 17, 2026, 01_30_57 PM_extracted.json` (Created): Extracted JSON for Riverbend Packing Invoice.
  - `outputs/WhatsApp Image 2026-11-17 at 1.24.06 PM_extracted.json` (Created): Extracted JSON for WhatsApp phone photo (₹2,200.00).
  - `backend/app/config.py` (Modified): Configured `gemini-3.7-flash` model and DOCX parsing support.
  - `backend/app/services/gemini_extractor.py` (Modified): Added DOCX text extraction and multi-model retry fallback against transient server overload.
  - `backend/app/services/document_processor.py` (Modified): Added DOCX MIME type detection.
  - `alogs.md` (Modified): Recorded batch run results.
- **What Changed**:
  - Connected the user's live Gemini API key from `.env`.
  - Added native support for Word document invoices (`.docx`) alongside PDFs, PNGs, and JPEGs.
  - Executed end-to-end extraction across all 7 user-provided sample documents in `samples/`.
  - Generated structured, pretty-printed canonical JSON files for every document.
- **Why (Rationale & Purpose)**:
  - Fulfills user request to test the extraction engine against real images and documents and verify JSON output structure.
- **QA & Verification Status**:
  - 7 out of 7 documents successfully extracted (100% success rate).
  - 100% of extractions passed deterministic arithmetic validation ($\text{Subtotal} + \text{Taxes} = \text{Total}$).
  - Validated across digital DOCX, inter-state PDF, mobile phone photos, handwritten receipts, and WhatsApp camera photos.
  - Status: PASS.
