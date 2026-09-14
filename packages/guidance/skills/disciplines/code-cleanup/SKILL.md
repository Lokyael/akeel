---
name: code-cleanup
description: 'Use when the user explicitly requests cleanup of a named scope or an approved maintenance Task requires it — make behavior-preserving code, test, and documentation improvements.'
---

# Code Cleanup

Perform deep maintenance only inside an explicitly named scope. Cleanup preserves externally observable behavior and applies strictly to the approved scope.

## 1. Fix Scope and Baseline

Name the approved files, module, subsystem, or repository scope before editing. If the request is ambiguous, ask. Read the applicable Requirements, public interfaces, package exports, host/plugin registration, and repository conventions.

Run the relevant tests, typechecking, build, and repository checks before cleanup. The required baseline must be green before any cleanup edit. If it is not, return `BLOCKED`, record the existing failure, and repair it only under a separately approved Task.

## 2. Remove Proven Dead Code

- Remove unused imports and unreachable private implementation.
- Treat an export as dead only when repository references, public entry points, package exports, dynamic registration, host contracts, and documented external use jointly prove it unreachable.
- Report exports whose external reachability cannot be disproved.

## 3. Reduce Proven Duplication

Extract duplication only when the repeated logic represents one behavior that must change together and the shared abstraction preserves locality without exceeding the complexity of the duplicated logic.

## 4. Improve Local Structure

Investigate long functions, files, dependency cycles, and scattered responsibilities as evidence, not numerical violations. Split or move code only when the result has a clear name, stable seam, tighter locality, and independent testability.

Public interfaces, policy meaning, product behavior, and module ownership remain outside cleanup authority. Route recurring or public-boundary problems to a separate module-design proposal; repository-wide discovery belongs to `assess-modularity` on user request.

## 5. Clean Tests Carefully

Parameterize or merge tests only when their behavior seam, setup, side effects, and expected result are equivalent, failure diagnostics remain specific, and bug or Requirement traceability is preserved. Remove tests only when they do not protect an observable contract.

## 6. Verify the Cleanup

Work in small batches and run relevant tests after each behavior-sensitive change. At the end:

- run `/skill:doc-sync` for affected documentation and Project Records;
- run the full repository validation on the resulting final surface;
- inspect the complete diff for scope and behavior drift;
- run applicable specialized review, then `/skill:change-preflight`;
- submit the unchanged READY Review Surface to `/skill:code-review`.

If documentation synchronization, preflight, a specialized review finding, or any later action changes content, repeat documentation synchronization, full validation, applicable specialized review, and preflight before code review.

Report the cleanup diff, baseline and final evidence, documentation changes, unresolved observations, and residual risks. The outer workflow or Task Owner owns the commit and final disposition.
