---
name: implement-work
description: Use /skill:implement-work when ready to build. Implement an approved Task Record from `docs/task.md` or `docs/task-<topic>.md`, orchestrating test-driven-development, change preflight, independent review, and documentation synchronization.
disable-model-invocation: true
---

# Implement Task

If the current policy does not permit the required writes, tell the user: "Switch to a writable policy with `/policy develop` first." Do not proceed without sufficient permissions.

## Process

**Lifecycle:** When starting, update the Task Record in `docs/task.md` or `docs/task-<topic>.md` from `draft` to `in-progress`. After fresh verification and durable documentation updates, set it to `verified` and clear the completed sections (per principles.md Next-ID slots); the file remains a container for future tasks. If no Task Record is found, ask: "Where is the Task Record, or what task should be recorded?"

Use `/skill:test-driven-development` where possible, at pre-agreed seams (confirm seams with the user before writing tests).

Iterate with focused tests, then prepare the complete change in this order:

1. Run `/skill:doc-sync` so code, user documentation, current architecture, and Project Records agree.
2. Run the relevant tests, typechecking, build, and full repository validation on that resulting surface.
3. Run `/skill:security-review` when the changed surface triggers its security scope, and resolve every blocking finding.
4. Use `/skill:change-preflight` to clean only residue introduced by the active change and publish `READY` with its pinned surface. If preflight modifies anything, return to step 1; earlier documentation, verification, and specialized-review evidence is stale for the changed content.
5. Use `/skill:code-review` for independent Engineering and Requirements findings against that unchanged READY Review Surface.

The Task Owner disposes every finding. Any accepted fix returns to step 1 and repeats documentation synchronization, fresh validation, applicable specialized review, preflight, and independent code review; do not treat an earlier result as covering changed content.

Re-read every Task Requirement and verify it with concrete evidence; passing tests alone does not prove the Task complete. After the Task Owner disposes all findings from the unchanged READY surface, retain the accepted Requirements in the review packet, apply the required durable updates, and clear the completed Task Record sections (per principles.md Next-ID slots). Then repeat steps 1–5 against the resulting final surface, using the frozen Requirements for preflight and Requirements review; lifecycle closure does not recreate the cleared Task. Commit only when that final review surface remains unchanged and all blocking findings are resolved; the task file remains a container for future tasks.
