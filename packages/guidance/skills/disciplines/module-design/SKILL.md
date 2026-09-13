---
name: module-design
description: Use when designing or revising a known module or interface — compare alternatives using depth, leverage, locality, and test seams.
---

# Module Design

This discipline applies after a concrete module or interface question is identified. It helps choose a boundary that hides meaningful complexity, preserves locality, and remains testable. Use `assess-modularity` instead when the problem still needs repository-wide discovery.

## Core Vocabulary

| Term | Definition |
|------|------------|
| **Module** | A unit of code with a well-defined interface. |
| **Interface** | What a module exposes to its callers, including function signatures, types, and contracts. |
| **Depth** | A module is *deep* when its interface is small relative to the functionality it provides. It is *shallow* when the interface is nearly as complex as the implementation. |
| **Seam** | A public boundary where behavior can be observed without reaching inside. It is the testing surface. |
| **Adapter** | Code that bridges modules. Its consumers provide evidence about whether a seam is worth the abstraction cost. |
| **Leverage** | The ratio of callers to implementation complexity. High leverage means many callers rely on a simple interface. |
| **Locality** | Code that stays close to what it depends on. Extracting pure functions far from their callers can weaken locality. |

## Evaluate the Boundary

Before designing an interface, decide whether the proposed boundary genuinely concentrates complexity and supports an observable contract.

### Deletion Test

Ask: "If I deleted this module, would the system's complexity **concentrate** elsewhere, or just **move**?"

- Complexity that concentrates elsewhere indicates genuine encapsulation.
- Complexity that merely moves indicates a shallow pass-through module.

### Test Surface

Prefer testing through the public interface. If doing so would require test-only methods, question the boundary first. For behavior that is inherently integration-dependent, use a higher-level seam rather than exposing implementation details.

### Adapter Evidence

Adapter count is evidence, not a rule. A second independent consumer is useful evidence, not a prerequisite; a boundary with clear leverage or a necessary contract may justify extraction without waiting for a fixed consumer count.

## Design Twice

Before settling on an interface, sketch 2–3 distinct alternatives. The first feasible design anchors thinking, so deliberately move past it.

Compare each alternative across:

| Dimension | Question |
|-----------|----------|
| **Depth** | How much behavior sits behind how small an interface? |
| **Leverage** | If the interface changes slightly, how much of the system changes with it? |
| **Locality** | Are the things that change together located together? |
| **Testability** | Can callers verify the contract through a stable seam? |
| **Cost** | Does the boundary earn its implementation and migration cost? |

Choose the trade-off that best fits the stated constraints, not automatically the first workable design.

## Shape a Deep Module

1. **Start with the interface** — Write the wished-for API from the caller's needs before choosing the implementation.
2. **Hide complexity** — Keep information about how the behavior works inside the module.
3. **Constrain invalid states** — Make invalid states unrepresentable where practical; do not rely on callers to preserve hidden invariants.
4. **Handle remaining failures explicitly** — Define the failure contract for states that cannot be eliminated instead of pretending they are impossible.
5. **Validate through the seam** — Test the public interface, or use a higher-level seam when the behavior necessarily crosses module boundaries.

## Red Flags

- **Shallow module**: The interface is as complex as the implementation.
- **Leaky abstraction**: Callers must understand internals to use the module correctly.
- **Shotgun surgery**: One logical change touches many files without a clear owner.
- **Divergent change**: One file changes for unrelated reasons.
