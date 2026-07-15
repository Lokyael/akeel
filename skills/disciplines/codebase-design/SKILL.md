---
name: codebase-design
description: Shared discipline and vocabulary for designing deep modules — a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface. Use when designing new modules or evaluating existing architecture.
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
