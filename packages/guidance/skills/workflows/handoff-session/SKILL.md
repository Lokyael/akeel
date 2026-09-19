---
name: handoff-session
description: Use /skill:handoff-session to audit live semantics and prepare a verified in-session continuation capsule for native replacement via /akeel-handoff. Reference artifacts by path; redact sensitive information.
disable-model-invocation: true
---

Prepare a continuation capsule so one successor Pi session can continue the current Task without silently dropping any captured live semantic unit. A handoff transfers Task Owner authority only after the user runs `/akeel-handoff` and the native replacement binds the successor; preparation alone leaves authority with the source session.

## 1. Resolve authority and reality first

Read the active Task, referenced Decisions, `CONTEXT.md`, involved files, and current verification evidence. Resolve material gaps before preparing the capsule. A handoff does not turn an inference into user approval and does not make stale evidence fresh.

Move durable meaning to its authoritative destination before handoff, per principles.md Project Records — Project Record Authority:

- adopted Requirements and active scope → Task Record;
- adopted load-bearing conclusions → Decision Record;
- standing terminology and architecture → `CONTEXT.md`;
- behavior and executable proof → code and tests;
- bounded supporting results → referenced artifacts.

Do not copy authoritative content into the capsule when a repo-relative reference is sufficient.

## 2. Audit captured semantics

Call `akeel_handoff` action `status`. Review every existing Semantic Unit and inventory any expressed meaning that can still change the successor's valid next action, authority, safety boundary, current-state interpretation, or verification obligation.

Call action `record` once for each missing live unit. Use one stable ID and one role from:

`requirement | constraint | assumption | finding | risk | decision-candidate | evidence | external-effect | work-state | next-action`

Record its statement, authority (`user-approved | project-record | observed | inferred`), source reference, `status: live`, and dependencies when another live unit carries part of its meaning. Unknown or unclassified meaning remains live. Never store secrets, full logs, repeated failures, search trails, or intermediate drafts.

A unit being operationally complete does not make its meaning dead. Keep completed conclusions, performed external effects, safety findings, and rejected approaches live while they can still affect continuation or prevent repetition.

## 3. Close only proven-dead semantics

Call action `close` only when removal can no longer change a valid future action and no live unit depends on the old meaning. Supply:

- `status`: `closed` or `superseded`;
- `closure.disposition`: `materialized | superseded | invalidated | irrelevant`;
- `closure.basisRef`: the evidence supporting closure;
- `closure.destinationRef`: the current authority, replacement, or proof.

Do not close a unit merely because its operation ended. When closure is uncertain, keep it live.

## 4. Prepare the Continuation Capsule

Call action `status` again and build the `prepare` payload:

- `taskRef` and `authorityRefs`;
- `roots`: live IDs whose dependency closure covers every live unit;
- `checkpoint.state`: `complete | incomplete | blocked`;
- `checkpoint.currentSlice` and factual `actualState`;
- exactly one live `next-action` ID as `checkpoint.nextActionId`;
- current absolute `workspace.cwd` and involved repo-relative files.

Call `akeel_handoff` action `prepare`. Preparation fails closed on duplicate IDs, dangling dependencies, unreachable live units, dependencies on closed units, closure without evidence, missing next action, cwd mismatch, or an oversized capsule. Preparation records the canonical Continuation Capsule directly as an in-session custom entry with zero external directory footprint, immune to system reboots and cleaned up together with the session.

Return the digest, summarize the checkpoint state, and tell the user to run `/akeel-handoff` (or `/akeel-handoff <next-action>`) when ready to transfer authority. Users may also run `/akeel-handoff` directly at any time to synthesize and switch in a single step without invoking this skill. Do not claim that preparation switched sessions.

## 5. Native replacement and successor reconciliation

`/akeel-handoff` is the explicit authority gate. It requires an idle source, verifies that the prepared capsule still matches the current session ledger and cwd, writes switch intent, and calls Pi's native `newSession` with parent lineage. Replacement code uses only the fresh `withSession` context, binds one successor, and sends a provenance-marked kickoff that cannot grant new user approval.

The successor verifies the capsule, reads its authority references, inspects the current workspace, and rechecks evidence as needed. It then calls `akeel_handoff` action `reconcile` with every live semantic ID classified exactly once as:

- imported;
- conflict, with observed reality; or
- unresolved.

Reconciliation succeeds only when the workspace is verified and every live ID is imported without conflicts or unresolved items. Otherwise stop and ask the user to resolve the discrepancy. Receipt integrity and ID coverage do not prove model understanding or recover unexpressed, uncaptured intent.

## Failure and privacy boundaries

- If native replacement is cancelled, the handoff becomes cancelled and the source remains Owner; prepare a new capsule for another attempt.
- A crash after switch intent but before successor transfer is ambiguous; do not infer ownership or retry automatically. Reopening a source whose latest handoff is switch-started, transferred, or reconciled disables its model tools until the user resolves ownership.
- Never auto-commit, stash, revert, merge, publish, clean resources, scan other session JSONL files, or replace Pi compaction.
- Reference sensitive or large material by approved path when possible. Do not place credentials, tokens, `.env` values, personal data, or full terminal output in semantic entries or capsules.
- The source Pi session remains the cold forensic archive; the successor does not load it wholesale into context.
