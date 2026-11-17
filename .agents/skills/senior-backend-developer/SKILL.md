---
name: senior-backend-developer
description: >-
  Guides senior-level backend architecture, FastAPI best practices, PostgreSQL data modeling,
  concurrency, idempotency, rate limiting, and robust error handling.
---

# Senior Backend Developer Skill

This skill enforces enterprise-grade backend engineering practices across Python, FastAPI, PostgreSQL, and event-driven architectures.

## Architectural Principles

### 1. Data Modeling & Database Integrity
* **ACID Transactions:** Wrap multi-table state transitions in explicit database transactions (`async with session.begin():`).
* **Idempotency Keys:** Every mutative operation (invoice ingestion, DB posting) must support idempotency keys to ensure retries never produce duplicate financial entries.
* **Optimistic Locking:** Use version numbers (`version INT DEFAULT 1`) on financial entities to avoid race conditions when multiple users or workers interact with the same record.
* **Indexing Strategy:** Create targeted indexes on high-frequency query fields (`file_hash`, `(supplier_gstin, invoice_number)`, `status`, `created_at`).

### 2. FastAPI Best Practices
* **Strong Typing:** Use Pydantic v2 schemas for all request bodies, query parameters, and response models.
* **Dependency Injection:** Use FastAPI `Depends()` for database sessions, authentication, and service instances.
* **Clean Separation of Concerns:**
  - `routers/`: HTTP routing, status codes, and input/output contracts.
  - `services/`: Business logic, state transitions, and calculations.
  - `repositories/` or `models/`: Database access and SQLAlchemy models.
  - `adapters/`: External client abstractions (Gemini, OpenWA, Cloud Storage).
* **Graceful Error Handling:** Implement custom exception handlers returning unified error envelopes:
  ```json
  {
    "error": {
      "code": "INVOICE_NOT_FOUND",
      "message": "Invoice with ID ... does not exist.",
      "details": {}
    }
  }
  ```

### 3. Worker & Queue Safety
* **Idempotent Workers:** Design queue consumers assuming messages can be delivered more than once (`at-least-once` delivery).
* **Dead-Letter Queues (DLQ):** After $N$ retries (e.g., 5 attempts with exponential backoff), move poisoned messages to a DLQ rather than blocking the worker.
* **Connection Pooling:** Configure SQLAlchemy connection pools (`pool_size`, `max_overflow`, `pool_recycle`) to avoid exhausting Cloud SQL connections.
