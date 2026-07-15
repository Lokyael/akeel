---
name: improve-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through the chosen one. Use when the codebase feels like a ball of mud or the user wants to improve architecture.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that make modules deeper (more behaviour behind a smaller interface). Uses the vocabulary from `codebase-design`: module, interface, depth, seam, adapter, leverage, locality.

## Process

### 1. Explore

**Scope before you scan.** Deciding *where* to look before you look:

- If the user named a direction (a module, subsystem, pain point), take it.
- Otherwise, walk back commit history (`git log --oneline`) to find hot spots — files and areas that keep coming up.

Read the project's `CONTEXT.md` and any ADRs in the area first. Then explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Which parts are untested, or hard to test through their current interface?

Apply the **deletion test**: would deleting this module *concentrate* complexity, or just *move* it?

### 2. Present Candidates as HTML Report

Write a self-contained HTML file to `/tmp/architecture-review-<timestamp>.html`. Open it for the user (`xdg-open <path>` on Linux).

For each candidate, render a card with:
- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — in terms of locality, leverage, and testability
- **Before / After diagram** — side-by-side, using Mermaid or hand-drawn
- **Recommendation strength** — Strong / Worth exploring / Speculative

End with a **Top recommendation** — which to tackle first and why.

### 3. Grilling Loop

Once the user picks a candidate, run the `/grill-plan` skill to walk the decision tree — constraints, dependencies, the shape of the deepened module, what tests survive.

Side effects happen inline as decisions crystallise: update `CONTEXT.md` for new terms, create ADRs for load-bearing decisions.
