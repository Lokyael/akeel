---
name: test-driven-development
description: Use when implementing any feature or bugfix before writing implementation code, or when the user mentions "test-first", "tdd", "red-green", or asks for integration tests — red-green-refactor loop with seams.
---

# Test-Driven Development

TDD is the red → green loop. This discipline ensures the loop produces durable, behavior-protecting tests: defining observable seams, maintaining test falsifiability, and executing minimal implementation steps.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language. Respect relevant entries in `docs/decisions.md`.

## Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write production code before the test? Delete it and restart with TDD.

## What a Good Test Is

Tests verify behavior through public interfaces, not implementation details. Code may be refactored freely; tests change only when behavior changes. A good test reads like a specification describing an observable capability and survives refactoring because it remains uncoupled from internal structure.

A good test is **falsifiable**: it fails when the behavior it guards breaks (see [tests.md](tests.md) — Falsifiability).

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams — Where Tests Go

A **seam** is the public boundary where behavior can be observed without reaching into private implementation. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing tests, identify the seams under test and confirm them with the user.

Ask: "What is the public interface, and which seams should we test?"

## Anti-Patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through side channels. The test breaks during refactoring even though behavior is unchanged.
- **Tautological** — recomputes expected values using the same logic as the implementation (`expect(add(a,b)).toBe(a+b)`). Expected values must come from an independent source of truth.
- **String-presence** — asserts a file or configuration contains exact literal text rather than executing it. It fails on benign rewording instead of behavioral breakage.
- **Change detector** — asserts private structure or internal constant values rather than behavior. It fails on redesign and misses functional regressions.
- **Horizontal slicing** — writing all tests before any implementation. Work in **vertical slices** instead: one test → one minimal implementation → repeat.

## Rules of the Red-Green-Refactor Loop

### 1. RED — Write Failing Test

Write one minimal test exercising one observable behavior through the public seam.

Requirements:
- One behavior per test;
- Descriptive name stating expected capability;
- Real collaborators where possible (mock only I/O boundaries per [mocking.md](mocking.md));
- Demonstrates falsifiability by catching a specific production defect (see [tests.md](tests.md)).

### 2. Verify RED — Watch It Fail

Run the targeted test runner command:

Confirm:
- The test fails with an assertion failure (not a crash or syntax error);
- The failure message matches the missing capability;
- It fails because the feature is missing, not due to test errors.

### 3. GREEN — Minimal Code

Write the simplest code that passes the test. Add no extra features, speculative abstractions, or unrelated refactoring.

### 4. Verify GREEN — Watch It Pass

Run the targeted test command and verify:
- The targeted test passes;
- Existing tests continue to pass;
- Output is clean.

### 5. REFACTOR — Clean Up

With tests green, remove duplication, improve naming, and extract clean helpers without altering observable behavior.

Before moving on, verify through a mutation check: every realistic defect must fail at least one test (see [tests.md](tests.md)).

### 6. Repeat

Advance to the next failing test for the next behavior slice.

## When Stuck

| Friction | Resolution |
|----------|------------|
| Unclear how to test | Design wished-for API from caller's perspective; write assertion first; ask user. |
| Test too complex | Interface is too complex. Simplify the public boundary. |
| Excessive mocking required | Code is too tightly coupled. Apply dependency injection. |
| Setup boilerplate too large | Extract test helpers; if still large, simplify module design. |
