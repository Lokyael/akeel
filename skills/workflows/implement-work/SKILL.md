---
name: implement-work
description: Implement work described by a spec or set of tickets, orchestrating test-driven-development, code-audit, and code-review in sequence. Use when ready to build from an approved spec or plan.
disable-model-invocation: true
---

# Implement Work

If you are still in PLAN mode, tell the user: "Run /build to switch to BUILD mode first." Do not proceed until build mode is active.

## Process

**Lifecycle:** When starting, update artifact status `draft` → `in-progress`. When done, `in-progress` → `done`. Per principles.md Quick Reference — Artifact Status Transitions. If no artifact file is found, ask: "Where is the plan/spec/tickets file, or describe the work."

Use `/skill:test-driven-development` where possible, at pre-agreed seams (confirm seams with the user before writing tests).

Run typechecking and tests: single test files while iterating, then the full test suite before finishing.

Once done, use `/skill:code-audit` to self-review, then `/skill:code-review` for independent review.
Finally, apply `doc-sync`: verify that project documentation reflects the current code. Fix stale counts, broken references, and outdated architecture descriptions.

Commit your work to the current branch with meaningful messages.
