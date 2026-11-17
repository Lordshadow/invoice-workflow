---
name: qa-auditor
description: >-
  Enforces rigorous QA audit on every created or modified file. Ensures changes fix bugs,
  prevent regression bugs, run automated/sample tests relevant to the invoice pipeline,
  and include hidden/dev debug logging (levels DEBUG/TRACE) that do not pollute user output.
---

# Quality Assurance (QA) & Audit Skill

This skill enforces strict quality gates, non-regression guarantees, test sample verifications, and professional developer-only debug instrumentation across the codebase.

## Core QA Mandates

### 1. Mandatory Post-Change Audit
After every file creation or modification:
* **Syntax & Type Check:** Ensure zero syntax errors, missing imports, or type mismatches.
* **Regression Protection:** Verify that fixing one bug or adding a feature did not break existing functions or assumptions.
* **Side-Effect Audit:** Check that global variables, shared state, database connections, and file handles are safely scoped and released.

### 2. Verification with Project-Specific Test Samples
Every processing module must be verified with realistic test samples representing real invoice scenarios:
* Digital multi-page invoice PDFs.
* Noisy / blurry WhatsApp photos (low-light, angled receipts).
* Edge-case GST calculations (inter-state IGST vs intra-state CGST/SGST, rounding differences $\le ₹1.00$).
* Malformed / corrupted files and invalid GSTIN strings.

### 3. Developer Debug Instrumentation (Hidden from Users)
* **Log Levels:** Use standard logging libraries (e.g., Python `logging` or `structlog`, Node.js `pino` or `winston`).
* **Debug Logging Rule:** Detailed developer diagnostics must be emitted at `DEBUG` or `TRACE` level:
  ```python
  logger.debug(f"[DEV_DEBUG] Intermediate OCR bounding boxes: {boxes_len}, latency: {latency_ms}ms")
  ```
* **Clean User Output:** User-facing responses, UI dashboards, and production API payloads must remain clean and concise—never expose internal stack traces, intermediate embeddings, or raw tokens to end users.
* **Security & PII:** Never output raw API keys, passwords, or customer PII into unmasked log streams.
