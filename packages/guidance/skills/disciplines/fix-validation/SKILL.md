---
name: fix-validation
description: 'Use after fixing a bug or implementing a feature, before code-review — prove the fix works with fresh evidence: re-run failing test, full suite, check regressions.'
---

# Validate Fix

> **HARD GATE** — Apply principles.md §6: prove completion with fresh verification evidence before code review.

## Process

### 1. Re-run the Failing Test

Run the exact test, command, or reproduction harness that previously failed. Confirm the targeted test passes. If the failure persists, return to `/skill:systematic-debugging`.

### 2. Run the Full Test Suite

Run the project test suite using its standard test runner. Confirm all tests pass with zero failures and no regressions are introduced.

### 3. Check Repository Validation Gates

Run the project's build, typechecking, lint, and validation checks. Confirm all validation gates exit cleanly with zero errors.

### 4. Verify User-Visible Behavior

When the change affects UI or human-observable behavior, verify the result directly:
- Confirm the reported symptom is resolved;
- Confirm the new behavior satisfies Task Record requirements;
- Confirm boundary conditions and edge cases behave as specified.

### 5. Verify Working Tree Scope

```bash
git status --short
git diff --stat
```

Confirm modified paths match the intended change scope and no unintended files remain.

## Handoff

When all verification steps succeed, proceed to `/skill:code-review`.
