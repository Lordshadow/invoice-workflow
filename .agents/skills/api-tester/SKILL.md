---
name: api-tester
description: >-
  Validates every newly created or updated API endpoint. Runs automated HTTP checks,
  verifies status codes, schema compliance, payload validation, and error edge cases.
---

# API Tester Skill

This skill guarantees that every API endpoint created or modified in the backend is systematically tested and validated before being marked as complete.

## API Testing Protocol

### 1. Mandatory Test Suite for Every Endpoint
Whenever an API endpoint is created or updated in FastAPI (or any service):
* **Happy Path (200 / 201):** Send valid payload; verify the response status code, headers, and body structure.
* **Schema Validation (422 / 400):** Send missing required fields, invalid datatypes, or malformed JSON; verify the API returns clear, standardized error messages without crashing.
* **Authentication & Authorization (401 / 403):** When auth is enabled, verify unauthenticated requests are rejected and unauthorized roles cannot execute protected actions.
* **Not Found / Conflict (404 / 409):** Verify that querying non-existent IDs returns 404, and submitting duplicate unique entities returns 409 (Conflict).

### 2. Execution Methods
* **Automated Integration Tests:** Write executable pytest test cases using `httpx.AsyncClient` or FastAPI's `TestClient`.
* **Live Smoke Tests:** If testing a running service, use `curl` or automated python scripts to fire test requests and verify responses.
* **Contract Verification:** Compare the returned JSON payload against the designated Pydantic response models (`response_model=...`) to ensure no extraneous or leaked internal fields.

### 3. Logged Test Output
Document the test invocation and response status in `alogs.md` under the verification section for the task.
