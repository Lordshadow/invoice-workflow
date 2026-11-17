---
name: activity-logger
description: >-
  Maintains the alogs.md changelog file. Records timestamped entries for all file creations,
  modifications, and architecture decisions with 'what changed' and 'why' summaries.
---

# Activity Logger Skill

This skill ensures full transparency and auditability of all engineering actions across the project lifecycle.

## Target File: `alogs.md`

All activities must be recorded in the root file: `alogs.md`.
If `alogs.md` does not exist in the project root, create it immediately before proceeding with any other operation.

## Entry Structure & Format

Every entry appended to `alogs.md` must follow this standardized Markdown structure:

```markdown
### [YYYY-MM-DD HH:MM:SS ±ZZZZ] <Short Action Title>

- **Actor / Mode**: AI Assistant / Developer
- **Phase / Scope**: <e.g., Phase 1: Ingestion, Phase 3: AI Extraction, Refactoring>
- **Files Modified / Created**:
  - `path/to/file1.ext` (Created / Modified / Deleted)
  - `path/to/file2.ext` (Modified)
- **What Changed**:
  - Detailed technical summary of changes made in the code/file.
  - New functions, classes, schemas, or configurations added.
- **Why (Rationale & Purpose)**:
  - Exact justification for the change (e.g., resolving bug #X, implementing Task 2.1, enforcing GST math rules).
- **QA & Verification Status**:
  - Tests run, outcomes (PASS/FAIL), and any developer debug notes.
```

## Logging Rules

1. **Immediate Logging:** Write to `alogs.md` in the same turn that files are created or edited.
2. **Chronological Append:** Always append new entries to the bottom of the file (or under a clear chronological header).
3. **No Omissions:** Configuration changes, script modifications, bug fixes, and documentation updates must all be logged without exception.
4. **Honest Outcomes:** If a test failed or an unexpected behavior occurred during QA, record it along with the remediation steps.
