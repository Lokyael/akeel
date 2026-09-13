---
name: systematic-debugging
description: Use when investigating the root cause of a technical issue before choosing or implementing a fix — establish a usable signal, test causal hypotheses, state the supported root cause, and apply an authorized regression-tested fix.
---

# Systematic Debugging

Establish the causal mechanism behind the reported behavior before selecting a durable fix. The method begins with a Task that owns the reported issue or a committed investigation and carries its evidence forward.

## Establish Scope and State

Clarify whether the requested result is a root-cause explanation or an implemented fix. Reuse an active Task Record that owns the reported issue; when the user commits to a separate unrecorded investigation, create the corresponding `Kind: bug` Task and maintain it per principles.md Project Records — Record Lifecycle. Keep Project Record structure in `principles.md` as the single format source.

Capture the exact observed behavior, expected behavior, relevant environment, onset window, and available evidence. These facts define the issue being explained.

## Phase 1: Establish a Usable Signal

Run the existing reproduction and confirm that its verdict matches the reported symptom. A focused failing test, command, request, trace replay, benchmark, or other observable seam is sufficient when it gives causal experiments a clear result.

Use `/skill:bug-reproduction` when the signal is intermittent, environment-dependent, ambiguous, or unavailable, then resume with its `reliable`, `probabilistic`, or `blocked` result. A blocked result completes the current investigation step by naming the next evidence required.

## Phase 2: Locate the Faulty Mechanism

Build a causal path from the symptom toward its source:

1. Read errors and inspect the state immediately before and after the failure.
2. Trace data and control flow across component boundaries, recording inputs and outputs at the boundary where behavior diverges.
3. Compare with a working path that shares the relevant contract.
4. Inspect changes within the evidence-based onset window and affected paths.
5. Identify assumptions about configuration, state, ordering, dependencies, and execution environment.
6. When behavior depends on an external library, framework, protocol, or tool, verify the applicable version and authoritative contract per principles.md §6.

Recent changes and working examples are evidence sources. The causal claim comes from an experiment that distinguishes competing explanations.

## Phase 3: Test Causal Hypotheses

Form hypotheses supported by the evidence and identify a plausible alternative when one exists. Select one active hypothesis and state its prediction:

```text
If [mechanism] causes the symptom, then [controlled experiment] produces [observable result].
```

Run the smallest discriminating experiment that changes one causal variable while preserving the symptom seam. Prefer debugger, REPL, fixture substitution, or dependency control; label temporary instrumentation with a unique `[DEBUG-...]` prefix and restore experimental production changes after the observation.

A matching result strengthens the hypothesis only when the experiment distinguishes it from the alternatives. A non-matching result becomes new evidence and starts the next hypothesis from the updated causal path.

## Phase 4: State the Root Cause

Publish one result status:

- **Confirmed:** name the trigger, faulty mechanism, reason it produces this symptom, discriminating evidence, alternatives ruled out, and residual uncertainty.
- **Likely:** name the best-supported mechanism and the experiment still needed for confirmation.
- **Blocked:** name the missing signal or evidence and the concrete acquisition step.

Use “supported root cause” only for the Confirmed result. A change that makes the symptom disappear is supporting evidence when the experiment also establishes why that mechanism caused the behavior.

## Phase 5: Apply an Authorized Fix

Phase 5 begins with a `Confirmed` root cause and explicit user authorization. A `Likely` result continues with its named discriminating experiment; a `Blocked` result continues when the required evidence becomes available. Use `/skill:test-driven-development` to establish the regression at an approved seam before production changes, then implement one coherent causal fix containing all necessary coordinated edits and no unrelated cleanup.

Remove investigation instrumentation and classify each harness as a retained regression test or temporary artifact. Use `/skill:fix-validation` for fresh evidence that the original signal passes, the wider suite remains healthy, and the user-visible symptom is resolved.

A failed fix invalidates the assumed mechanism or its implementation. Return to the reproduction and causal evidence, update the hypothesis, and run a new discriminating experiment before selecting another fix.

## Module-Boundary Findings

Evidence that the module boundary prevents locking down the issue is a concrete input to `/skill:module-design`. A recurring module-boundary problem is suitable for user-requested `/skill:assess-modularity`; the finding names the affected seam and observed friction.

## Guardrails

Return to the relevant phase when the work starts treating a symptom as a cause, changing several causal variables in one experiment, using a passing result as the complete causal explanation, or repeating a fix without revisiting the evidence. Architectural escalation follows demonstrated seam or responsibility friction rather than a fixed number of unsuccessful attempts.
