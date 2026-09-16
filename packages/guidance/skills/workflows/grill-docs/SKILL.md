---
name: grill-docs
description: Use /skill:grill-docs when a plan, decision, or idea needs an isolated Herdr discussion to resolve open decisions, verify factual claims, and return a verified candidate for Task Owner project-record import.
disable-model-invocation: true
---

# Grill a Proposal Against Evidence

Resolve the proposal's open decisions in a Herdr Agent, verify its factual claims, and return a verified candidate for Task Owner import into the project's existing record containers. The Agent produces the verified candidate and result-necessary evidence; the Task Owner coordinator owns import acceptance and Project Record updates. Implementation remains a separate subsequent step.

## 0. Choose the Role and Execution Surface

If the appended user arguments contain `--role grill-agent --packet <path>`, this is the prepared Grill Agent: read that exact packet, follow sections 1–5, and never launch another agent.

Otherwise, run the coordinator in the Task Owner Session with Herdr as the fixed execution surface:

1. Use `akeel_run_artifact` to reserve one `grill-docs` run with an Owner packet slot and a child `verified-candidate` slot. Publish the complete packet through the Owner tool; use only its returned run ID, exact paths, and opaque child capability.
2. Fix the source snapshot as a base ref and resolved base commit OID. If relevant state is uncommitted, include a bounded diff artifact in the packet; a new worktree never inherits dirty state implicitly.
3. A child with `write`, `edit`, or file-modifying Shell uses `herdr worktree create ... --no-focus`; a genuinely read-only child may share the checkout. Select a unique branch that did not exist and record it as created by this run. Capture the server/session route and returned workspace, repository, checkout, and branch facts. Herdr owns this worktree lifecycle. Never use `--trust-repository` without the user's verified approval.
4. After topology is known, bind the result slot to the exact Agent/workspace/root-pane identity. The packet contains only the run, goal, authoritative records, source snapshot and optional diff, settled constraints, open decisions, result contract, bounded resource record, and trace protocol. Do not copy the Task Owner transcript, workspace lists, command output, or terminal history.
5. Start one uniquely named Agent with `herdr agent start <agent> --kind pi --pane <root-pane-id> --timeout 30000 -- --akeel-artifact-capability <opaque-capability>`. Relay the user's explicit invocation with `herdr agent prompt <agent> "/skill:grill-docs --role grill-agent --packet <exact-packet-path>" --wait --timeout 120000`. This continues the user's manual workflow; it does not permit unrelated manual skills. Store bounded successful Herdr control responses only under this run's `transport/herdr/`; on failure expose only the recovery error code, not terminal history.
6. Follow the Agent until it settles as `idle`, `done`, or `blocked`. On `idle` or `done`, call `akeel_run_artifact` status and collect for the bound result slot. Missing, incomplete, expired, or unverifiable publication is a failed handoff. `herdr agent read` is diagnostic only. A timeout does not prove the prompt was not delivered, so inspect before retrying; focus never carries the result.

The coordinator reads the verified candidate after the Agent settles and completes the import protocol in section 6. The child does not send a completion prompt to the Owner.

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

- Give a recommended answer with its supporting rationale alongside any choice.
- Look up facts directly from files, tools, source, tests, or documentation before asking the user.
- Ask the user to decide product, scope, architecture, and policy choices.
- Keep the user's answer in the candidate and verified candidate, while the Task Owner coordinator reserves Project Record updates for section 6.
- Introduce new questions only when their answers could change the current proposal.

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

Ask the user to confirm that this candidate is the input to factual verification. Record the confirmation in the verified candidate; the Task Owner coordinator performs import acceptance in section 6. If the user does not confirm it, change only the parts they identify and repeat this step. Resolve all candidate-required decisions before starting factual verification.

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

Keep the confirmed candidate stable against optional improvements or facts that do not change its requirements.

## 5. Finalize and Return

Finalize only when:

- every required claim is confirmed or corrected;
- every correction has been incorporated with the user's agreement;
- every remaining uncertainty has an explicit prototype or unresolved-question entry;
- no known contradiction remains in the candidate.

Publish the verified candidate once through `akeel_publish_artifact` with:

- the verified candidate and confirmed user decisions;
- result-necessary context: material reasoning, rejected alternatives that affect the result, and facts corrected during grilling;
- confirmed, corrected, and uncertain claims with citations;
- constraints, verification expectations, Out of Scope, unresolved questions, and residual risks;
- the run ID, Herdr child Agent/workspace/pane IDs, and `PI_SESSION_ID` plus `PI_SESSION_FILE` when available; identify an ephemeral Pi session explicitly instead of inventing a trace path;
- the base ref and resolved base commit OID plus optional diff artifact and digest;
- recommended Task, CONTEXT, and Decision updates.

Do not include search trails, full logs, repeated failures, immaterial hypotheses, tool chronology, or intermediate drafts. Session references are forensic pointers; child transcripts remain unloaded by default. Authoritative project records are updated only from the Task Owner Session.

After `akeel_publish_artifact` succeeds, finish the response so Herdr can observe the Agent settle. Do not write another result path, prompt or focus the Task Owner as a completion channel, or remove the child pane, workspace, or worktree.

## 6. Import and Record in the Task Owner Session

After the Agent settles, the coordinator formally collects the bound `verified-candidate` slot, verifies its run and child identity, source snapshot, and result-necessary context, presents an import summary, and asks the user once whether to import the verified candidate. Keep the discussion focused on the verified artifact, reading child session transcripts or reopening discussion only if the artifact is incomplete or contradicts current evidence.

After confirmation, apply the domain-modeling discipline:

- update the active Task Record with verified Requirements and design when the user has committed to implementation;
- when no active Task exists, classify the result per principles.md Project Records — Project Record Authority into existing project record containers;
- update `CONTEXT.md` only for current terminology, architecture, or constraints;
- add a Decision entry only for an adopted load-bearing conclusion;
- keep format and lifecycle rules in their existing authoritative containers;
- include genuine Out of Scope items where applicable.

### Resource cleanup

After the verified candidate is read and its import decided, present the bounded record and obtain explicit approval to terminate the settled Agent and remove the listed worktree/workspace and branch resources. `idle` and `done` mean a turn settled, not that its process exited; a `blocked` Agent qualifies only when the user explicitly abandons it.

After approval, use the recorded server/session and verify the repository, workspace, checkout, and branch provenance; a clean checkout; a branch created by this run; and a branch tip equal to the resolved base commit OID. Retain and report dirty, diverged, unknown, reused, provenance-mismatched, or force-required resources without cleanup.

For an eligible child, run exact non-force removal in order: `herdr worktree remove --workspace <workspace-id>`, then, only after that worktree is gone, `git -C <owner-checkout> branch -d -- <branch>`. Never use `--force`, `-D`, or prefix-based discovery or deletion. Verify the exact workspace, checkout, and branch are absent. On retry, a missing worktree permits branch cleanup only when the unchanged record still proves repository identity, branch ownership, and branch tip; absence alone never authorizes deletion.

Report updated record paths, unresolved questions, the cleanup result, the exact retained `/tmp/akeel/runs/<run-id>/` path, and the next action. Artifact Exchange never deletes the run directory.
