---
name: implement-work
description: Use /skill:implement-work when ready to build. Implement an approved Task Record from `docs/task.md` or `docs/task-<topic>.md`, orchestrating test-driven-development, change preflight, independent review, and documentation synchronization.
disable-model-invocation: true
---

# Implement Task

If the current policy does not permit the required writes, tell the user: "Switch to a writable policy with `/policy develop` first." Do not proceed without sufficient permissions.

## Process

**Lifecycle:** Require a Task Record in `docs/task.md` or `docs/task-<topic>.md`; if none exists, ask: "Where is the Task Record, or what task should be recorded?" Set it from `draft` to `in-progress`. Before implementation, confirm reachable Git history contains its heading, approved Requirements, and necessary Design/Plan. If not, commit only the Task Record as a checkpoint, with no implementation or unrelated changes. If repository state or commit authority prevents that commit, stop and ask the user. A slot advance or commit-message mention is not a checkpoint.

Use approved Plan Slices as the implementation order and Requirements-to-verification map. A Task that fits one coherent test cycle can proceed directly; multi-step work receives an implementation-ready Plan through `implementation-planning` before code changes. Do not commit Task Record changes for individual slices, tests, or steps. Update it only for cross-session continuity, handoff, or material authority changes.

Use `/skill:test-driven-development` where possible, at pre-agreed seams (confirm seams with the user before writing tests).

Iterate with focused tests, then prepare the complete change in this order:

1. Run `/skill:doc-sync` so code, user documentation, current architecture, and Project Records agree.
2. Run the relevant tests, typechecking, build, and full repository validation on that resulting surface.
3. Run `/skill:security-review` when the changed surface triggers its security scope, and resolve every blocking finding.
4. Use `/skill:change-preflight` for a read-only readiness check and publish `READY` with its pinned surface. It may autonomously handle only current-run-owned, non-sensitive, recoverable residue under its quarantine contract; if it changes anything, return to step 1 and refresh affected evidence.
5. Use `/skill:code-review` for independent Engineering and Requirements findings against that unchanged READY Review Surface. An immutable committed target may be reviewed directly from its fixed OIDs without a separate mutable-worktree readiness gate.

The Task Owner disposes every finding. Any accepted fix returns to step 1 and repeats documentation synchronization, fresh validation, applicable specialized review, preflight, and independent code review; do not treat an earlier result as covering changed content.

Re-read every Task Requirement and verify it with concrete evidence; passing tests alone does not prove completion. After the Task Owner disposes all findings from the unchanged READY surface, confirm the checkpoint remains reachable and freeze the accepted Requirements in the review packet. Apply durable updates and include the Task clear operation in the final landing surface (per principles.md Next-ID slots). Repeat steps 1–5 against that surface using the frozen Requirements; closure does not recreate the Task. When the surface remains unchanged and all blocking findings are resolved, set the Task to `verified` and commit the final landing change; it clears the Task before another Task starts. Never squash or rewrite away the only checkpoint.
