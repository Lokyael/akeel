---
name: change-preflight
description: Use before independent review or commit — perform a safe, read-only readiness check of the current change and publish a fixed Review Surface.
---

# Change Preflight

Prepare material Task changes for independent review or commit. For a local wording-only instruction change outside the material Task boundary, apply bounded inspection and verification without creating a Task. This is an author-side readiness gate with safe autonomy: it starts read-only, never touches unknown or user-owned content, and may handle only strongly proven, non-sensitive, recoverable residue from the current run.

## 1. Pin the Review Surface Without Mutation

Classify the target per `principles.md` Project Record Authority:

- **Immutable committed target:** resolve the target and base OIDs, and use their committed diff as the Review Surface. Unrelated dirty worktree content is an observation outside that surface and does not block review.
- **Mutable Task surface:** read the active Task Record and capture all committed changes since the agreed base, staged and unstaged changes, and untracked files that belong to the Task.
- **Final lifecycle closure:** after the Task Record has been cleared, use the accepted Requirements frozen in the prior Review Surface instead of reconstructing or inventing them. If a commit clears its Task Record, inspect the parent or frozen packet for those Requirements.

Live Git inspection is helper-sensitive and therefore uses the `opaque` policy axis. Before inspecting a mutable surface, require a policy that admits the operation; use `git --no-optional-locks status --short` to suppress Git's optional index refresh, followed by bounded `git diff --stat`, `git diff --cached --stat`, and `git diff --check` queries. The flag removes the known optional metadata write but does not turn configured helpers into a sandbox. If policy denies or approval is unavailable, return `BLOCKED` instead of retrying, wrapping, or reconstructing Git state. Expand to a detailed diff only when scope, ownership, or semantics remain unclear, and then target the specific file or hunk.

Classify each staged, unstaged, and untracked path as in-scope, out-of-scope, or unknown. Continue without asking when the classification is evidenced and the out-of-scope content cannot affect the pinned surface. Return `BLOCKED` and ask only when ownership is unknown and could affect the surface, the fixed point does not resolve, or the Requirements source cannot be established.

## 2. Safe Autonomous Handling

Preflight is read-only by default. It must not directly modify user files, delete ordinary untracked files, change semantic code or tests, commit, or rewrite Git history.

A safe autonomous action is allowed only when all conditions hold:

- the outer flow reserves an AKeel `change-preflight` run and supplies its run ID plus a creation ledger proving the current run created the residue;
- the item is non-sensitive, non-semantic, and recoverable;
- the action does not touch an existing user-owned or unknown path; and
- the recovery or quarantine step succeeds before the original path is changed.

Apply the narrowest handling:

- disposable residue in a dedicated temporary directory created by this run may be removed;
- residue inside the repository must be moved, never deleted, to the exact `/tmp/akeel/runs/<run-id>/quarantine/` owned by that run, with a manifest containing its original path and content fingerprint;
- possible credentials, sensitive material, ordinary untracked files, ambiguous residue, and any semantic change are reported without touching them and make the result `BLOCKED` when they affect the surface.

When the run ledger, non-sensitive classification, recovery artifact, quarantine move, or post-action verification is unavailable, report the required action without modifying files. Deep cleanup requires separate authorization through `code-cleanup`.

Quarantine is a run-scoped recovery aid, not a project artifact or formal child result. Retain it through validation and Code Review; it blocks automatic run cleanup while non-empty. After the Review Surface is accepted, the Task is completed, or the run is explicitly abandoned, report the exact run path and obtain user approval for cleanup. Artifact Exchange does not delete runs or quarantine, and workflow runs have no automatic retention sweep. Never expand cleanup to another run ID or use force deletion.

## 3. Check Readiness

- Every changed path traces to a Requirement or an explicitly approved supporting change.
- Requirements and applicable acceptance criteria are covered.
- Documentation has been synchronized when behavior, architecture, commands, records, or references changed.
- Applicable specialized gates, including security review, have completed without unresolved blocking findings.
- Relevant tests, typechecking, build, and repository checks were run after the final modification. Run any missing or stale checks now.
- If safe autonomous handling changed anything, rerun all checks affected by that change before publishing `READY`.

## 4. Publish the Result

Return one status:

### READY

Name the pinned target and base OIDs, complete path surface, Requirements source and version, exact verification commands and results, documentation and specialized-gate status, out-of-scope observations, and any safe autonomous handling performed. State explicitly that no other content was modified.

### BLOCKED

For each blocker, name the evidence, the required action, and which check must be rerun. Do not commit or present the change as review-ready.

## Boundary

Independent review, finding disposition, explicit cleanup, and final commits remain with the outer workflow or Task Owner. Preflight handles only content proven to belong to the current run.
