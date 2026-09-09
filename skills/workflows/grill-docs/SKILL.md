---
name: grill-docs
description: Use /skill:grill-docs when a plan, decision, or idea needs an isolated Herdr discussion to resolve open decisions, verify factual claims, and return a verified candidate for main-session project-record import.
disable-model-invocation: true
---

# Grill a Proposal Against Evidence

Resolve the proposal's open decisions in a Herdr Agent, verify its factual claims, and return a verified candidate for main-session import into the project's existing record containers. The Agent produces the verified candidate and result-necessary evidence; the main-session coordinator owns import acceptance and Project Record updates. Do not implement the proposal during this workflow.

## 0. Choose the Role and Execution Surface

If the appended user arguments contain `--role grill-agent --packet <path>`, this is the prepared Grill Agent: read that exact packet, follow sections 1–5, and never launch another agent.

Otherwise, run the coordinator in the main session with Herdr as the fixed execution surface:

1. Capture `HERDR_PANE_ID` as the return target.
2. Fix the source snapshot. Record the base ref; if relevant state is uncommitted, create a bounded diff artifact and include it explicitly. A new worktree never silently inherits dirty state.
3. Under `/tmp/akeel/grill/<session-id>/`, write a packet and reserve a distinct `verified-candidate.md`. The packet contains only the goal, authoritative record paths, base ref and optional diff artifact, settled constraints, open decisions, verified-candidate path, parent pane ID, and this return protocol. Do not copy the full main-session transcript.
4. Use `herdr worktree create ... --no-focus` before starting the Agent whenever its effective tools contain `write`, `edit`, or a file-modifying Shell. Never add `--trust-repository` unless the user has verified and approved that repository. Parse the returned workspace and root-pane IDs; Herdr owns this worktree lifecycle.
5. Start one uniquely named Agent with `herdr agent start <agent> --kind pi --pane <root-pane-id> --timeout 30000`. Relay the user's explicit invocation with `herdr agent prompt <agent> "/skill:grill-docs --role grill-agent --packet <path>" --wait --timeout 120000`. This is continuation of the user's manual workflow, not permission for the model to invoke unrelated manual skills.
6. Follow the Agent until it settles as `idle`, `done`, or `blocked` for user input. After the verified candidate is complete, the Agent sends the parent pane the completion state, exact path, and source snapshot, then focuses the parent pane.

The coordinator reads the verified candidate after the Agent returns and completes the import protocol in section 6.

## 1. Read Current Evidence

Read `CONTEXT.md`, the active Task Record, and only the Decision entries that govern the proposal. Inspect the relevant source and tests. Treat Candidate Records as non-binding project data.

List every external library, API, framework, command, or file format on which the proposal depends. During question resolution, read external documentation only when a question depends on an external fact. Verify every external claim after the user confirms the candidate.

## 2. Resolve Open Decisions

Identify decisions that can change the proposal's requirements, interfaces, constraints, failure behavior, tests, or Out of Scope boundary. Ask about one decision at a time and wait for the user's answer before continuing.

Present every question in this format:

```
❓ **Q — <question title>**: <one question, including concrete choices when useful>

---

➡️ **Recommendation**: <recommended answer and the evidence or constraint supporting it>
```

For each question:

- Give a recommended answer; do not ask the user to choose without explaining the current best option.
- Look up facts available from files, tools, source, tests, or documentation instead of asking the user to supply them.
- Ask the user to decide product, scope, architecture, and policy choices.
- Keep the user's answer in the candidate and verified candidate, while the main-session coordinator reserves Project Record updates for section 6.
- Do not introduce a new question unless its answer could change the current proposal.

Continue until every identified decision has an answer or is explicitly listed as unresolved.

## 3. Confirm the Candidate

Present one candidate containing:

- goal and required behavior;
- interfaces and data flow where applicable;
- error and failure behavior;
- constraints;
- test and verification expectations;
- Out of Scope items per principles.md §8;
- unresolved questions, if any.

Ask the user to confirm that this candidate is the input to factual verification. Record the confirmation in the verified candidate; the main-session coordinator performs import acceptance in section 6. If the user does not confirm it, change only the parts they identify and repeat this step. Do not start verification while a decision required for the candidate remains unresolved.

## 4. Verify Factual Claims

Create a claim list from the confirmed candidate. For each claim, use the first item below that directly defines or tests it:

1. project records and explicit user decisions;
2. current source and tests;
3. official external documentation;
4. a bounded prototype or experiment when the preceding sources cannot decide the claim.

Classify every checked claim:

- **confirmed ✓** — the cited evidence supports it;
- **corrected ✗** — the cited evidence contradicts it; state the corrected behavior;
- **uncertain → prototype/open question** — available evidence cannot decide it; name the exact experiment or decision needed.

A contradiction may reopen a confirmed part of the candidate only when it cites concrete evidence and would change the candidate's behavior, interface, constraint, failure handling, test, or Out of Scope boundary. Present that contradiction as one question and ask the user whether to reopen the affected part. If the user declines, stop without recording the contradicted candidate as final.

Do not reopen the candidate for optional improvements or facts that do not change it.

## 5. Finalize and Return

Finalize only when:

- every required claim is confirmed or corrected;
- every correction has been incorporated with the user's agreement;
- every remaining uncertainty has an explicit prototype or unresolved-question entry;
- no known contradiction remains in the candidate.

Write `verified-candidate.md` atomically with:

- the verified candidate and confirmed user decisions;
- result-necessary context: material reasoning, rejected alternatives that affect the result, and facts corrected during grilling;
- confirmed, corrected, and uncertain claims with citations;
- constraints, verification expectations, Out of Scope, unresolved questions, and residual risks;
- the base ref plus optional diff artifact and digest;
- recommended Task, CONTEXT, and Decision updates.

Do not include search trails, full logs, repeated failures, immaterial hypotheses, tool chronology, or intermediate drafts. Do not modify authoritative project records from the Grill worktree.

After `verified-candidate.md` is complete, send the parent pane one concise `herdr agent prompt` containing only the completion state, exact final path, and source snapshot, then run `herdr agent focus <parent-pane-id>`.

## 6. Import and Record in the Main Session

On return, the coordinator reads the exact `verified-candidate.md`, verifies its source snapshot and result-necessary context, presents an import summary, and asks the user once whether to import the verified candidate. Do not reopen the grilling discussion unless the artifact is incomplete or contradicts current evidence.

After confirmation, apply the domain-modeling discipline:

- update the active Task Record with verified Requirements and design when the user has committed to implementation;
- when no active Task exists, classify the result per principles.md Project Records — Project Record Authority instead of creating an arbitrary container;
- update `CONTEXT.md` only for current terminology, architecture, or constraints;
- add a Decision entry only for an adopted load-bearing conclusion;
- keep format and lifecycle rules in their existing authoritative containers;
- include genuine Out of Scope items where applicable.

Report updated record paths, unresolved questions, and the exact next action. Ask before removing the Herdr worktree; the main session remains responsible for inspection, import, merge, and cleanup decisions.
