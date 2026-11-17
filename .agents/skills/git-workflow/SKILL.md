---
name: git-workflow
description: >-
  Enforces local git commit discipline after every meaningful task or file modification,
  and handles pushing to GitHub cloud when explicitly requested by the user.
---

# Git Workflow & Commit Skill

This skill enforces continuous local version control and safe cloud synchronization practices.

## Guidelines & Rules

### 1. Local Commits (Continuous & Mandatory)
* **When to commit:** Commit locally after completing each discrete task, subtask, bug fix, or new file creation.
* **Never leave uncommitted work:** Do not move to a new task without committing verified changes.
* **Commit Message Format:** Follow Conventional Commits:
  - `feat(<scope>): <short description>` — for new functionality or endpoints
  - `fix(<scope>): <short description>` — for bug fixes or test corrections
  - `docs(<scope>): <short description>` — for documentation, plans, or log updates
  - `refactor(<scope>): <short description>` — for code improvements without behavior change
  - `test(<scope>): <short description>` — for adding or updating tests
* **Staging Discipline:** Only stage files that are part of the specific task (`git add <file1> <file2>`). Avoid `git add .` unless staging intentional full-tree changes.

### 2. GitHub Cloud Push Protocol
* **Strict Rule:** **NEVER push automatically to GitHub remote unless explicitly asked by the user.**
* When the user requests a push:
  1. Verify the remote configuration: `git remote -v`.
  2. If no remote exists, prompt the user for the repository URL.
  3. Check the current branch: `git branch --show-current`.
  4. Perform the push: `git push -u origin <branch>`.
  5. Report the commit hash and push confirmation to the user.
