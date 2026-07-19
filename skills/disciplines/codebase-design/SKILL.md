---
name: codebase-design
description: Use when designing new modules or evaluating existing architecture — deep module vocabulary (depth, leverage, locality, seam) with Design Twice comparison.
---

# Codebase Design

Shared discipline and vocabulary for designing modules.

## Core Vocabulary

| Term | Definition |
|------|------------|
| **Module** | A unit of code with a well-defined interface. |
| **Interface** | What a module exposes to its callers. Includes function signatures, types, and contracts. |
| **Depth** | A module is *deep* when its interface is small relative to the functionality it provides. *Shallow* when interface nearly as complex as implementation. |
| **Seam** | A public boundary where you can observe behavior without reaching inside. The testing surface. |
| **Adapter** | Code that bridges between modules. One adapter = hypothetical seam. Two adapters = real seam. |
| **Leverage** | The ratio of callers to implementation complexity. High leverage = many callers, simple interface. |
| **Locality** | Code that is close to what it depends on. Pure functions extracted far from their callers lose locality. |

## Principles

### The Deletion Test

"If I deleted this module, would the system's complexity **concentrate** elsewhere, or just **move**?"

- Concentrates → Good. The module genuinely encapsulates complexity.
- Moves → Shallow. The module is just a pass-through.

### "The Interface is the Test Surface"

If you can't test a module through its public interface, the interface is wrong. Don't add test-only methods — fix the interface.

### "One Adapter = Hypothetical, Two = Real"

A seam you design for but only use once is speculative. Wait for the second adapter before extracting.

## Design Twice

Before settling on a module interface, sketch 2–3 distinct alternatives. The first feasible design anchors your thinking — force yourself past it.

For each alternative, ask:

| Dimension | Question |
|-----------|----------|
| **Depth** | How much behaviour sits behind how small an interface? Deeper = better. |
| **Leverage** | If this interface changes slightly, how much of the system changes with it? Higher = better. |
| **Locality** | Are the things that change together located together? Closer = better. |

Pick the alternative with the deepest interface, highest leverage, and tightest locality. The first design you thought of rarely wins.

## Designing a Deep Module

1. **Start with the interface** — What does the caller need? Write the wished-for API first.
2. **Hide complexity** — Information hiding: the caller should not need to know *how* it works.
3. **Define errors out of existence** — Rather than throwing, design so the error state is impossible.
4. **Test through the interface** — If testing is awkward, the interface is wrong, not the test.

## Red Flags

- **Shallow module**: Interface is as complex as implementation.
- **Leaky abstraction**: Caller must understand internals to use correctly.
- **Shotgun surgery**: One logical change touches many files.
- **Divergent change**: One file changes for unrelated reasons.
