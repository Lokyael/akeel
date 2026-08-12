---
name: implement-work
description: Use /skill:implement-work when ready to build. Implement an approved Task Record from `docs/task.md` or `docs/task-<topic>.md`, orchestrating test-driven-development, code-audit, code-review, and documentation synchronization.
disable-model-invocation: true
---

# Implement Task

If you are still in a restrictive profile (e.g. `keel-plan`), tell the user: "Switch to a permissive profile with `/profile keel-build` first." Do not proceed without sufficient permissions.

## Process

**Lifecycle:** When starting, update the Task Record in `docs/task.md` or `docs/task-<topic>.md` from `draft` to `in-progress`. After fresh verification and durable documentation updates, set it to `verified` and clear the completed sections (per principles.md Next-ID slots); the file remains a container for future tasks. If no Task Record is found, ask: "Where is the Task Record, or what task should be recorded?"

Use `/skill:test-driven-development` where possible, at pre-agreed seams (confirm seams with the user before writing tests).

Run typechecking and tests: single test files while iterating, then the full test suite before finishing.

Once done, use `/skill:code-audit` to self-review, then `/skill:code-review` for independent review.
Finally, apply `doc-sync`: verify that project documentation reflects the current code. Fix stale counts, broken references, and outdated architecture descriptions.

Commit code and durable documentation changes to the current branch with meaningful messages. Clear completed Task Record sections (per principles.md Next-ID slots); the file remains as a container for future tasks.
