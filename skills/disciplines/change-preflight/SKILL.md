---
name: change-preflight
description: Use before independent review or commit — prepare the current Task's active changes as a scoped, clean, freshly verified Review Surface.
---

# Change Preflight

Prepare the current Task's active changes for independent review or commit. This is an author-side readiness gate: it may clean residue created by the active change, but it does not review historical code or start unrelated refactoring.

## 1. Pin the Active Change

Read the active Task Record and capture the complete working surface. During final lifecycle closure after the completed Task Record is cleared, use the accepted Requirements frozen in the prior Review Surface instead of reconstructing or inventing them:

- committed changes since the agreed base, when applicable;
- staged and unstaged changes;
- untracked files that belong to the Task.

Use `git status --short` and the applicable diffs. If a modified file cannot be attributed to the active Task or changed since it was last inspected, stop and ask instead of cleaning or reverting it.

## 2. Clean Only the Current Change

Remove or fix residue introduced by the active change:

- temporary files, throwaway harnesses, generated logs, and debug instrumentation;
- imports, variables, functions, or comments made obsolete by the change;
- accidental formatting, type, lint, or build errors introduced by the change;
- obvious duplication contained within newly added or modified logic;
- unintended files or sensitive material in the change surface.

Do not modify pre-existing dead code, historical duplication, unrelated tests, public interfaces, or module boundaries. Report those separately; use `code-cleanup` only after the user or an approved maintenance Task defines the scope.

## 3. Check Readiness

- Every changed path traces to a Requirement or an explicitly approved supporting change.
- Requirements and applicable acceptance criteria are covered.
- Documentation has been synchronized when behavior, architecture, commands, records, or references changed.
- Applicable specialized gates, including security review, have completed without unresolved blocking findings.
- Relevant tests, typechecking, build, and repository checks were run after the final modification. Run any missing or stale checks now.

If preflight changes a file, invalidate earlier evidence affected by that file and rerun the applicable checks.

## 4. Publish the Result

Return one status:

### READY

Name the pinned change surface, cleanup performed, exact verification commands and results, documentation status, specialized-gate status, and any non-blocking observations.

### BLOCKED

For each blocker, name the evidence, the required action, and which check must be rerun. Do not commit or present the change as review-ready.

## Boundary

Preflight does not commit, perform independent review, dispose review findings, or undertake deep cleanup. The outer workflow or Task Owner owns those actions.
