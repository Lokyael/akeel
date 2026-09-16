---
name: code-review
description: 'Use when the user wants an independent review of a branch, PR, or task-in-progress change — inspect one fixed Review Surface and report Engineering and Requirements findings without modifying files.'
---

# Code Review

Independently review one fixed change set. Reviewers report evidence-backed findings; file modifications and finding disposition belong to the Task Owner.

## 1. Accept a Fixed Review Surface

The Task Owner coordinator captures one bounded review packet before delegation. For an immutable committed target, resolve the target and base OIDs and record the committed diff directly; a dirty worktree outside that surface does not block review. For a mutable task surface, require a current `READY` result from the read-only `/skill:change-preflight` and consume the exact surface it pinned.

For a branch or PR, record the fixed point and committed diff from its merge base to `HEAD`. For task-in-progress work, also include:

- staged changes;
- unstaged changes;
- in-scope untracked files;
- `git status --short`;
- the authoritative Task Record or other Requirements source;
- repository standards that govern the changed paths.

If the fixed point does not resolve, the change set is empty, untracked content cannot be bounded, or the Requirements source is ambiguous, stop and ask. Both review axes must consume the same immutable packet rather than rereading a moving working tree independently. The reviewer never performs cleanup or mutates the surface.

## 2. Run Independent Axes

Run both axes as parallel independent Herdr analyses so their contexts do not contaminate each other. Start each Pi child with only its bound Artifact Exchange capability. The Task Owner waits for both slots to reach verified `collect`; Herdr settlement cannot substitute for either artifact; `agent read` is diagnostic only. The Task Owner owns final finding disposition.

### Owner Resource Record

Before delegation, use `akeel_run_artifact` to reserve one `code-review` run containing the immutable Owner packet plus separate Engineering and Requirements child slots. Publish the fixed Review Surface to the packet slot. Give each file-modifying child its own Herdr worktree; a genuinely read-only child may share the checkout. For a worktree, record the resolved base commit OID, choose a unique branch absent before creation, and mark it created by this run. Add the coordinator's server/session route and Herdr's workspace, pane, repository, checkout, and branch facts to the packet, then bind each child slot to its exact workspace, root pane, and Agent name. Do not expose full workspace lists, command output, terminal history, or one child's capability to the other child.

### Engineering

Inspect every changed hunk for:

- correctness, edge cases, error paths, regressions, and unsafe assumptions;
- resource, concurrency, security, and performance risks supported by concrete evidence;
- violations of repository standards;
- maintainability problems at the changed seam.

Use documented repository standards first. Baseline smells such as duplicated code, speculative generality, feature envy, data clumps, primitive obsession, message chains, middle men, and mysterious names are heuristics, not automatic violations. Skip checks already enforced by tooling unless the diff demonstrates a gap. Report immediate security findings directly while routing broader vulnerability scans to `security-review`.

### Requirements

Check the authoritative Requirements source for:

- missing or partial behavior;
- behavior implemented incorrectly;
- unmet acceptance criteria;
- unrequested behavior or scope creep;
- tests that do not prove the claimed Requirement.

If no Requirements source exists after asking, report that limitation.

## 3. Report Findings

Keep `## Engineering` and `## Requirements` separate. Each finding includes severity, file and line or other stable anchor, evidence, impact, and the smallest corrective direction. Report the total and worst finding for each axis; do not hide one axis behind an aggregate score.

The Task Owner accepts, rejects, or defers findings. Review remains read-only; the Task Owner owns cleanup scope, file edits, and commits.

## 4. Check Staleness

After both analyses settle, compare the current working state with the pinned packet. Any reviewed content change makes the affected result stale. Fixes re-enter preflight and review before final acceptance.

## 5. Clean Up Child Resources

Once both artifacts have been verified and collected, findings reported, and staleness checked, present the run and resource records and obtain explicit approval to terminate the settled Agents and remove the listed worktree/workspace and branch resources. `idle` and `done` mean a settled turn, not that the process exited or artifact delivery succeeded; a `blocked` Agent qualifies only when the user explicitly abandons it.

Before removal, use the recorded server/session and verify the repository, workspace, checkout, and branch provenance; a clean checkout; a branch created by this run; and a branch tip equal to the resolved base commit OID. Retain and report dirty, diverged, unknown, reused, provenance-mismatched, or force-required resources without cleanup.

For each eligible child, run exact non-force removal in order: `herdr worktree remove --workspace <workspace-id>`, then, only after that worktree is gone, `git -C <owner-checkout> branch -d -- <branch>`. Never use `--force`, `-D`, or prefix-based discovery or deletion. Verify the workspace, checkout, and branch are absent. On retry, a missing worktree permits branch cleanup only if the unchanged record proves repository identity, branch ownership, and branch tip; absence alone never authorizes deletion. Artifact Exchange never removes the run directory; report its exact path for explicit user-managed cleanup.
