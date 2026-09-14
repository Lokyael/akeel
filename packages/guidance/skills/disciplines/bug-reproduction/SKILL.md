---
name: bug-reproduction
description: Use when a bug, failure, or performance regression lacks a reliable agent-runnable signal — construct and minimise a deterministic or measured probabilistic reproduction for causal debugging.
---

# Build a Reproduction Signal

Turn the user's exact symptom into a faithful, specific feedback signal that can support repeated causal experiments. Prefer the cheapest seam that exercises the real behavior with a clear verdict.

## Define the Signal

Capture the observed behavior, expected behavior, relevant environment, and the assertion that distinguishes this symptom from a generic failure. A useful runner may be an automated test, request script, CLI fixture, browser scenario, trace replay, focused benchmark, property run, bisection harness, or differential comparison.

Choose the runner by:

1. **Fidelity** — it reaches the behavior the user reported.
2. **Specificity** — its verdict identifies that symptom rather than any crash or timeout.
3. **Iteration cost** — it is cheap enough to run for each experiment.
4. **Control** — time, randomness, filesystem, network, and environment inputs are explicit where relevant.
5. **Minimality** — inputs, callers, configuration, and setup contain only conditions needed to trigger the symptom.

Treat a comparison baseline as known-good when user evidence, an external contract, or an independent test establishes its correctness. Use a difference as divergence evidence and assign correctness from that independent basis.

## Tighten the Loop

Run the signal, verify that its failure matches the user's symptom, and reduce the scenario one condition at a time. Improve determinism where practical by fixing seeds, clocks, schedules, fixtures, and environmental inputs while preserving the original behavior.

For intermittent behavior, measure the loop directly:

- attempts and matching failures;
- iteration cost and total observation budget;
- conditions shared by matching failures;
- competing failure signatures;
- targeted perturbations used after the unmodified baseline is measured.

A probabilistic signal is usable when its measured rate and iteration cost allow a discriminating experiment to complete within a stated budget.

## Manage Investigation Artifacts

Mark temporary harnesses and instrumentation so change preflight can identify them. A reproduction at an approved public seam may become a regression-test candidate; instrumentation-coupled or environment-only probes remain investigation artifacts.

## Return the Result

Return the result to the caller with:

- **Status:** `reliable`, `probabilistic`, or `blocked`;
- **Runner:** the exact command or harness entry point;
- **Failure signal:** the assertion or observation matching the reported symptom;
- **Iteration cost:** measured runtime for one attempt or the observation batch;
- **Observed rate:** attempts, matching failures, and relevant conditions;
- **Minimal conditions:** required input, environment, and configuration;
- **Artifacts:** regression-test candidates and temporary investigation material;
- **Next evidence:** access, trace, fixture, or instrumentation needed when blocked.

A `reliable` result reproduces the matching symptom consistently. A `probabilistic` result provides a measured signal within an explicit experiment budget. A `blocked` result names the evidence needed to construct a usable signal. Causal analysis consumes this result through `systematic-debugging`.
