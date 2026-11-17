# AI Invoice Processing Pipeline --- Engineering Plan

**Project:** Techjays AI Invoice Processing Pipeline\
**Deployment target:** Google Cloud Platform (GCP)\
**Architecture:** Human-supervised, event-driven processing system\
**Planning estimate:** 38 working days for an experienced developer,
subject to integration access and scope

------------------------------------------------------------------------

## 1. Project Objectives

The distributor receives approximately 500 supplier invoices per day,
increasing to around 2,000 per day at month-end. Invoices arrive as PDF
email attachments and phone photographs through WhatsApp. The system
must extract invoice details and submit approved invoices to existing
accounting software through its API.

### Core requirements

  -----------------------------------------------------------------------
  ID                      Requirement             Engineering response
  ----------------------- ----------------------- -----------------------
  R1                      Blurry/handwritten      Document preprocessing,
                          photos and multi-page   OCR, multimodal
                          invoices                extraction and human
                                                  exception handling

  R2                      Wrong amounts must not  Deterministic
                          reach accounting        validation, human
                          software without a      approval and
                          person seeing them      backend-enforced
                                                  posting controls

  R3                      Suppliers may send the  File-level and
                          same invoice more than  business-level
                          once                    duplicate detection

  R4                      Month-end volume is     Durable queues, retries
                          approximately 4× normal and independently
                                                  scalable workers
  -----------------------------------------------------------------------

### Success criteria

-   No invoice can be posted without an authorized person approving the
    exact version being posted.
-   Extraction quality is measured at field level against human-verified
    invoices.
-   Duplicate detection prevents repeated accounting entries while
    preserving possible matches for investigation.
-   Processing remains reliable during month-end bursts.
-   Every processing stage and human action is auditable.
-   Failed jobs can be retried safely without creating duplicate
    accounting entries.

Do not set arbitrary accuracy targets before collecting a representative
invoice dataset. Establish a baseline, then agree targets with the
business.

------------------------------------------------------------------------

## 2. Target Architecture

``` mermaid
flowchart TD
    A[Email PDFs] --> I[Ingestion API - FastAPI / Cloud Run]
    B[WhatsApp photos] --> I
    C[Manual upload] --> I

    I --> V[File validation and SHA-256]
    V --> GCS[Cloud Storage - original documents]
    V --> DB[(Cloud SQL PostgreSQL)]
    DB --> O[Transactional outbox]
    O --> P[Pub/Sub]

    P --> PRE[Preprocessing workers]
    PRE --> EXT[Extraction workers]
    EXT --> N[Normalization]
    N --> VAL[Deterministic validation]
    VAL --> DUP[Duplicate detection]
    DUP --> WF[Workflow routing]

    WF -->|Needs review / approval| UI[Unified React dashboard]
    UI --> DB
    WF -->|Retry / exception| EX[Exception handling]

    UI -->|Authorized approval| CT[Cloud Tasks]
    CT --> PUSH[Accounting delivery worker]
    PUSH --> API[Accounting software API]
    API --> REC[Reconciliation]
    REC --> DB
```

### Main components

1.  **Input channels:** Email, WhatsApp and manual upload.
2.  **Ingestion API:** Authenticates requests, validates files, computes
    hashes and registers documents.
3.  **Cloud Storage:** Stores original files and processed page images.
4.  **Cloud SQL PostgreSQL:** Operational source of truth for invoices,
    jobs, approvals, events and audit history.
5.  **Pub/Sub:** Distributes asynchronous processing events.
6.  **Cloud Run workers:** Preprocess, extract, normalize, validate and
    route invoices.
7.  **Unified dashboard:** Enables accountants and approvers to inspect
    and manage invoice workflows.
8.  **Cloud Tasks:** Controls accounting delivery, rate limits and retry
    scheduling.
9.  **Accounting API:** Receives approved invoice records.
10. **Reconciliation:** Verifies the external accounting record where
    the API supports it.

**Queue distinction:** Pub/Sub distributes processing events. Cloud
Tasks controls scheduled delivery to a specific downstream endpoint.
They have different responsibilities and should not be treated as
interchangeable.

------------------------------------------------------------------------

## 3. AI Model and Extraction Strategy

Use a provider-independent extraction layer. Do not make Gemini the only
extraction mechanism.

  -----------------------------------------------------------------------
  Component               Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Primary extraction      Google Document AI      Extract invoice
                          Invoice Parser          headers, supplier
                                                  details, tax fields and
                                                  line items

  Secondary extraction    Gemini multimodal model Interpret complex
                          through Vertex AI       layouts, ambiguous
                                                  fields and difficult
                                                  page relationships

  PDF text extraction     PyMuPDF                 Read digital PDF text
                                                  layers before invoking
                                                  OCR

  Image preprocessing     OpenCV                  Deskew, denoise and
                                                  improve contrast

  Validation              Python and Pydantic     Deterministic business
                                                  checks; not an AI model
  -----------------------------------------------------------------------

### Extraction sequence

1.  Inspect the uploaded file and determine its type.
2.  For digital PDFs, attempt text-layer extraction first.
3.  Run Document AI Invoice Parser.
4.  Normalize its response into the canonical invoice schema.
5.  Check required fields, confidence and structural consistency.
6.  Use Gemini as a fallback for difficult or incomplete documents.
7.  If the result remains uncertain, route it to human review.

Benchmark handwriting and regional-language invoices before selecting a
production model. Do not assume that a general-purpose multimodal model
or invoice parser will reliably interpret every handwriting style or
language.

### Canonical extraction schema

Illustrative example:

``` json
{
  "supplier": {
    "name": "ABC Distributors",
    "gstin": "33XXXXXXXXXXXXXX"
  },
  "invoice": {
    "number": "INV-2026-001",
    "date": "2026-11-15",
    "currency": "INR"
  },
  "line_items": [
    {
      "description": "Product A",
      "quantity": 10,
      "rate": 100,
      "amount": 1000,
      "tax_rate": 18
    }
  ],
  "subtotal": 1000,
  "tax": {
    "cgst": 90,
    "sgst": 90,
    "igst": 0
  },
  "total": 1180
}
```

The production schema must additionally retain page references, source
evidence, field confidence, extraction provider, model version and
schema version.

Store the raw model response separately from normalized invoice data.
Human corrections must not overwrite the original extraction result.

------------------------------------------------------------------------

## 4. Backend Engineering Plan

Use a **modular monolith** initially: one FastAPI codebase with clearly
separated modules and independently deployable worker processes. This
avoids unnecessary microservice complexity while preserving boundaries.

  -----------------------------------------------------------------------
  Module                              Responsibility
  ----------------------------------- -----------------------------------
  `ingestion`                         Email, WhatsApp and manual file
                                      intake

  `document_processing`               File checks, PDF parsing, image
                                      preprocessing and page grouping

  `extraction`                        Document AI and Gemini provider
                                      adapters

  `normalization`                     Convert provider output into
                                      canonical invoice data

  `validation`                        GST, totals, required fields and
                                      business rules

  `deduplication`                     File hashes and supplier invoice
                                      matching

  `workflow`                          State machine, routing and approval
                                      rules

  `accounting`                        Accounting API mapping, posting and
                                      reconciliation

  `audit`                             User and system action history

  `dashboard_api`                     Data and actions exposed to React
  -----------------------------------------------------------------------

### Initial PostgreSQL tables

  Table                    Purpose
  ------------------------ ------------------------------------------------------
  `documents`              Original files, source, hashes and storage locations
  `document_pages`         Page order and page-level metadata
  `invoices`               Canonical invoice records and current state
  `line_items`             Individual invoice items
  `extractions`            Raw and normalized model outputs and metadata
  `validation_results`     Validation outcomes and failed rules
  `duplicate_candidates`   Potential matching invoices
  `approval_records`       Approver, timestamp and invoice version
  `processing_jobs`        Worker job status and retry information
  `processing_events`      Stage-by-stage processing history
  `accounting_posts`       External IDs, attempts and responses
  `audit_log`              User and system actions
  `outbox_events`          Events waiting to be published

A document is not necessarily one invoice. A document may contain
multiple invoices, and one invoice may span multiple pages or supporting
documents. Model these relationships explicitly.

### Transactional outbox

When an invoice is registered, save the database record and an outbox
event in the same database transaction. A separate publisher sends the
event to Pub/Sub and marks it as published. This prevents a database
commit from succeeding while its corresponding message is lost.

Workers must be idempotent because event delivery can be repeated.

------------------------------------------------------------------------

## 5. Invoice State Machine

``` mermaid
flowchart TD
    A[Received] --> B[Queued]
    B --> C[Extracting]
    C --> D{Extraction usable?}
    D -->|No| E[Needs Review]
    D -->|Yes| F[Validating]
    F --> G{Validation passed?}
    G -->|No| E
    G -->|Yes| H{Duplicate candidate?}
    H -->|Yes| I[Duplicate Investigation]
    H -->|No| J[Pending Approval]
    I --> E
    E --> J
    J --> K{Authorized approval?}
    K -->|Reject| L[Rejected]
    K -->|Approve| M[Approved]
    M --> N[Push Queued]
    N --> O[Posting]
    O --> P{Accounting response?}
    P -->|Success| Q[Reconciliation Pending]
    P -->|Failure| R[Push Failed]
    R --> N
    Q --> S[Reconciled]
```

### Mandatory workflow rules

-   Only an authorized approver can approve an invoice.
-   Approval references the exact invoice version reviewed.
-   Editing an approved invoice invalidates approval and triggers
    revalidation.
-   The backend rejects accounting-post requests without valid approval.
-   An ambiguous accounting API timeout triggers reconciliation before
    retrying a create request.
-   A successful HTTP response is not necessarily proof that the invoice
    is correctly recorded; verify the external record where possible.

Require human approval for every invoice in the first production
release. Do not introduce automatic approval solely because a model
reports high confidence.

------------------------------------------------------------------------

## 6. Duplicate Detection

Use two separate layers.

### Layer 1 --- Exact document duplicate

-   Calculate SHA-256 for every incoming file.
-   If the same file arrives again, record the duplicate event.
-   Avoid unnecessary reprocessing where safe.

### Layer 2 --- Business-level duplicate

After extraction, compare:

-   Supplier GSTIN.
-   Normalized invoice number.
-   Invoice date.
-   Invoice total.
-   Supplier identity and supporting invoice details.

Use database uniqueness constraints for confirmed business identity
where business rules permit. Use fuzzy matching to identify possible
duplicates. Do not automatically reject every candidate: similar invoice
numbers or amounts may be legitimate. Route uncertain matches to the
accounts team.

------------------------------------------------------------------------

## 7. Unified Dashboard

Use React + TypeScript with FastAPI REST endpoints. The backend remains
the authority for workflow and permissions.

  -----------------------------------------------------------------------
  Dashboard section                   Responsibilities
  ----------------------------------- -----------------------------------
  Overview                            Daily volume, pending reviews,
                                      approvals, failures and trends

  Invoice Management                  Search, filter, sort and inspect
                                      invoices

  Review & Approval                   Document preview, edit fields,
                                      validate, approve or reject

  Pipeline Monitor                    Processing stages, job status,
                                      backlog and worker health

  Accounting Integration              Posting attempts, external
                                      references and reconciliation

  Exceptions & Recovery               Investigate errors, retry safe
                                      operations and resolve exceptions

  Supplier Management                 Maintain supplier records and GSTIN
                                      information

  Users, Settings & Audit             Manage permissions, integration
                                      configuration and audit history
  -----------------------------------------------------------------------

### Review workspace

The review screen should provide:

-   Original PDF/photo with page navigation.
-   Extracted supplier, invoice and line-item details.
-   Validation indicators for arithmetic and tax consistency.
-   Duplicate warnings.
-   Field-level confidence and source evidence.
-   Edit, submit for approval, approve and reject actions.
-   Complete audit history.

For maker-checker approval, the accountant who edits and submits an
invoice should not be able to approve their own submission.

### Initial REST API surface

``` text
GET    /api/v1/dashboard/summary

GET    /api/v1/invoices
GET    /api/v1/invoices/{id}
GET    /api/v1/invoices/{id}/document
PATCH  /api/v1/invoices/{id}
POST   /api/v1/invoices/{id}/submit
POST   /api/v1/invoices/{id}/approve
POST   /api/v1/invoices/{id}/reject
GET    /api/v1/invoices/{id}/history

GET    /api/v1/pipeline/jobs
GET    /api/v1/exceptions

GET    /api/v1/accounting/posts
POST   /api/v1/accounting/posts/{id}/retry

GET    /api/v1/suppliers
GET    /api/v1/admin/audit-logs
```

Use pagination, authorization checks, optimistic concurrency/version
checks and consistent error responses. Do not expose Cloud Storage
credentials or let React communicate directly with Pub/Sub or Cloud SQL.

### Live updates

**Initial release:** REST APIs and dashboard polling every 15--30
seconds on operational pages, with manual refresh.

**Later phase:** Add Server-Sent Events (SSE) or another real-time
mechanism backed by persisted processing events. Correctness must not
depend on a live connection; refresh must always retrieve authoritative
state from PostgreSQL.

------------------------------------------------------------------------

## 8. GCP Technology Stack

  -----------------------------------------------------------------------
  Layer                   Technology              Reason
  ----------------------- ----------------------- -----------------------
  Frontend                React + TypeScript      Unified operational
                                                  dashboard

  UI                      Tailwind CSS +          Consistent component
                          shadcn/ui               system

  API                     Python 3.12 + FastAPI   AI ecosystem and typed
                                                  APIs

  AI extraction           Document AI + Gemini    Invoice extraction plus
                                                  multimodal fallback

  PDF processing          PyMuPDF                 PDF text extraction and
                                                  page rendering

  Image processing        OpenCV                  Deskewing, denoising
                                                  and contrast
                                                  enhancement

  Validation              Pydantic + Python       Deterministic business
                                                  rules

  Database                Cloud SQL PostgreSQL    Transactional data,
                                                  audit and deduplication

  File storage            Cloud Storage           Original invoices and
                                                  processed documents

  Messaging               Pub/Sub                 Asynchronous processing
                                                  events

  Delivery queue          Cloud Tasks             Controlled accounting
                                                  API calls

  Compute                 Cloud Run               API and independently
                                                  scalable workers

  Authentication          Identity Platform or an User authentication
                          OIDC provider           

  Secrets                 Secret Manager          API keys and
                                                  credentials

  CI/CD                   Cloud Build + Artifact  Build and deployment
                          Registry                

  Infrastructure          Terraform               Repeatable GCP
                                                  infrastructure

  Monitoring              Cloud Monitoring +      Operational visibility
                          Cloud Logging           
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 9. Implementation Roadmap

The following is a planning estimate for an experienced developer with
timely access to the accounting API, sample invoices and required GCP
resources. It is not a guaranteed delivery commitment. Team size and
integration complexity will change the schedule.

  ------------------------------------------------------------------------
  Phase                                         Days Deliverables
  --------------------- ---------------------------- ---------------------
  0\. Requirements and                          1--3 Confirm API, GCP
  foundation                                         region and data
                                                     policy; define
                                                     schema/state machine;
                                                     repo, Docker, CI and
                                                     cloud foundations

  1\. Document                                  4--7 Manual upload, email,
  ingestion                                          WhatsApp webhook,
                                                     file validation,
                                                     SHA-256, storage and
                                                     job registration

  2\. AI extraction                            8--12 Document AI, Gemini
                                                     adapter, PDF/image
                                                     preprocessing,
                                                     structured extraction
                                                     and multi-page
                                                     handling

  3\. Validation and                          13--16 GST and arithmetic
  deduplication                                      checks, duplicate
                                                     detection, state
                                                     transitions and
                                                     exception routing

  4\. Dashboard and                           17--22 Dashboard, invoice
  approvals                                          repository, review
                                                     workspace, edits,
                                                     maker-checker
                                                     approval

  5\. Accounting                              23--26 Provider adapter,
  integration                                        Cloud Tasks delivery,
                                                     retries, external
                                                     references and
                                                     reconciliation

  6\. Reliability and                         27--30 Retry/DLQ handling,
  scale                                              autoscaling, rate
                                                     limits, concurrency
                                                     controls and load
                                                     testing

  7\. Security and                            31--34 OIDC/RBAC,
  observability                                      encryption, audit,
                                                     monitoring, alerts,
                                                     backups and runbooks

  8\. Pilot and rollout                       35--38 Shadow mode, accuracy
                                                     comparison, fixes and
                                                     controlled production
                                                     rollout
  ------------------------------------------------------------------------

------------------------------------------------------------------------

## 10. Testing Strategy

Build a labelled evaluation dataset of real or representative invoices
with human-verified ground truth.

  -----------------------------------------------------------------------
  Test category                       What to measure or verify
  ----------------------------------- -----------------------------------
  Extraction                          Field accuracy, line-item accuracy
                                      and missing fields

  Handwriting                         Performance on handwritten and
                                      blurry invoices

  Multi-page                          Correct page grouping and line-item
                                      continuity

  Validation                          Incorrect arithmetic and tax
                                      combinations are blocked

  Duplicates                          Same file and same business invoice
                                      cannot be posted twice

  Approval                            Unapproved or modified invoice
                                      versions cannot be posted

  Failure recovery                    Worker crashes, model timeouts and
                                      accounting API outages

  Load                                2,000 invoices/day and realistic
                                      arrival bursts

  Security                            Unauthorized approvals, file access
                                      and secret exposure

  Reconciliation                      Posted invoice matches the
                                      accounting system record
  -----------------------------------------------------------------------

### Critical replay test

1.  Submit the same invoice three times.
2.  Allow all three processing attempts to run.
3.  Approve the invoice once.
4.  Trigger delivery and simulate an ambiguous timeout.
5.  Retry the process.
6.  Verify that the accounting system contains only one invoice.

These tests are release gates, not optional post-launch checks.

------------------------------------------------------------------------

## 11. Risks and Decisions to Resolve

  -----------------------------------------------------------------------
  Decision                            Why it matters
  ----------------------------------- -----------------------------------
  Accounting software and API         Authentication, invoice mapping,
                                      idempotency and rate limits

  GCP region                          Data residency, latency and service
                                      availability

  Invoice languages                   OCR and model evaluation
                                      requirements

  External AI processing policy       Financial document privacy and
                                      compliance

  Approval responsibilities           RBAC and maker-checker workflow

  Accounting API outage behavior      Recovery and reconciliation

  Document retention period           Storage cost and compliance
  -----------------------------------------------------------------------

Do not retain financial documents indefinitely just because storage is
inexpensive. Establish retention and deletion rules with the business.

------------------------------------------------------------------------

## 12. First Engineering Milestone

### Build a working invoice extraction prototype

**Priority:** Highest --- prove extraction quality before building the
complete dashboard.

-   [ ] Collect 30--50 representative invoices.
-   [ ] Integrate Document AI Invoice Parser.
-   [ ] Integrate Gemini as a fallback.
-   [ ] Extract required invoice fields into structured JSON.
-   [ ] Run deterministic arithmetic and GST validation.
-   [ ] Compare results against manually verified values.
-   [ ] Record field-level accuracy, latency and cost per invoice.
-   [ ] Identify cases that must always go to human review.

**Acceptance criterion:** The team can explain which fields are
extracted reliably, which fields fail, and which cases must be reviewed
by a person.

------------------------------------------------------------------------

## 13. Engineering Priorities

Implement in this order:

1.  Extraction quality and canonical data model.
2.  Validation, deduplication and state machine.
3.  Approval and accounting safety.
4.  Accounting integration and reconciliation.
5.  Unified dashboard.
6.  Channel integrations and operational scaling.
7.  Production hardening.

A polished dashboard cannot compensate for unreliable extraction or
unsafe accounting integration.

------------------------------------------------------------------------

## 14. Decisions Required Before Detailed Implementation

1.  **Accounting software:** Tally, Zoho Books, QuickBooks or generic
    API until confirmed?
2.  **Invoice languages:** English only, English plus Tamil/other Indian
    languages, or multiple languages?
3.  **Development team:** One developer, a small team (2--4), or a
    larger team?

Once these are settled, the next engineering artifacts should be
designed together:

-   Database schema.
-   Invoice state machine and transition rules.
-   Backend API contract.

These should be agreed before implementing individual dashboard screens.
