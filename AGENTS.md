# Operational Rules & Guidelines for AI Assistant (`AGENTS.md`)

This repository follows strict development and quality assurance rules. The agent must enforce the following 7 core disciplines across all tasks:

## 1. Git Workflow
- Always commit changes locally after completing any task, bug fix, or file creation.
- Use Conventional Commit format: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
- **Never push to GitHub cloud automatically**; only push when the user explicitly requests it.

## 2. Activity Logging (`alogs.md`)
- Log every single action, file creation, code change, and rationale in `alogs.md`.
- Each log entry must include:
  - Exact timestamp
  - Files modified or created
  - "What changed" technical summary
  - "Why" rationale and objective link
  - QA verification status

## 3. Quality Assurance & Regression Auditing
- Audit every code change immediately upon completion.
- Ensure the changes fix the target issue without creating regression bugs.
- Verify every changed processing file against project-specific test samples (PDFs, photos, edge-case GST calculations).
- Include developer debug logging (`logger.debug` / `TRACE`) for internal diagnostics, keeping user-facing outputs clean and professional.

## 4. Scope Control
- Stay strictly within the scope of the active task, command, or file.
- Never perform unrequested refactors, rewrite working unrelated files, or add unnecessary heavy dependencies.

## 5. API Testing
- Whenever an API endpoint is created or updated, immediately test it.
- Verify 200/201 (success), 422/400 (validation error), 404 (not found), and 409 (conflict/duplicate) states.
- Ensure response payloads conform to the defined Pydantic schemas.

## 6. Senior Backend Developer Standards
- Use FastAPI with Python 3.12, strict Pydantic v2 typing, and dependency injection.
- Ensure all multi-table state updates run in explicit ACID database transactions.
- Enforce idempotency keys and duplicate prevention on all data-writing operations.

## 7. Senior Frontend Developer Standards
- Use React 18, TypeScript (strict mode), and Tailwind CSS.
- Implement split-screen document review (canvas/viewer on the left, editable form and line-item grid on the right).
- Provide real-time client-side arithmetic recalculation and enforce maker-checker governance (prevent self-approval).
