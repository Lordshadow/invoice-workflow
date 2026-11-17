---
name: scope-control
description: >-
  Enforces strict boundary and scope control for all tasks, commands, and files.
  Prevents scope creep, unrequested refactors, unnecessary dependency additions, or touching out-of-scope files.
---

# Scope Control & Boundary Enforcement Skill

This skill enforces surgical discipline, ensuring that every command and code edit remains strictly bounded to its designated file, feature, and task scope.

## Rules of Scope Enforcement

### 1. Surgical File Edits
* **Single Scope Focus:** Only touch the files directly related to the active prompt or task.
* **No Unprompted Refactors:** Do not rewrite adjacent working files, change established design patterns, or reformulate unrelated modules unless specifically requested.
* **Minimal Diff Principle:** Keep code changes focused and minimal. Avoid mass reformatting, whitespace churn, or renaming established variables unless necessary for the task.

### 2. Dependency Discipline
* Do not introduce heavy or exotic third-party packages when standard libraries or already installed packages can fulfill the requirement.
* If a new dependency is required (e.g., `pyzbar`, `opencv-python`), verify its necessity, compatibility, and license before adding it to `requirements.txt` or `package.json`.

### 3. Command Execution Boundaries
* Run only commands directly relevant to the current task (build, test, run, lint).
* Do not explore, modify, or probe system directories or parent folders outside the project workspace.
* Keep temporary scratch scripts isolated in designated directories (e.g., `./tests/scratch/` or `./tmp/`).

### 4. Verification Check
Before concluding any task, perform a quick git diff check (`git diff --stat`) to verify that no unintended files or lines were altered.
