---
name: assess-modularity
description: Use /skill:assess-modularity to scan a repository or subsystem for shallow modules, weak seams, and scattered responsibilities, then produce an evidence-backed review.
disable-model-invocation: true
---

# Assess Codebase Modularity

Surface structural friction and report **modularity findings** — evidence that module boundaries expose too much complexity, scatter responsibilities, or prevent testing through stable seams. A mid-task friction proposal (per principles.md Proposal signals) remains a one-line report until the user explicitly requests this assessment; the scan turns approved scope into findings, not Project Records. Before delegating, reserve an `assess-modularity` run with `akeel_run_artifact` (per `herdr`). Run the exploration within that scope in a Herdr Agent; the Task Owner coordinator waits for its verified result artifact, writes the HTML report under `/tmp/akeel/runs/<run-id>/report.html`, and presents it to the user.

This workflow discovers unknown structural problems across repository boundaries. When a concrete module or interface question is ready for design, use `module-design` instead.

## Process

### 1. Explore

**Scope before you scan.** Decide *where* to look before looking:

- If the user named a module, subsystem, or pain point, use that scope.
- Otherwise, walk back commit history (`git log --oneline`) to find hot spots — files and areas that keep coming up.

Read the project's `CONTEXT.md` and relevant entries in `docs/decisions.md` first. Then explore organically and collect concrete evidence for each question:

- Where does understanding one concept require bouncing between many modules?
- Where is an interface nearly as complex as the behaviour behind it — a shallow module?
- Where has extraction improved unit testability but weakened locality or left integration behavior untested?
- Which behaviours cannot be tested through a stable public seam?
- Would deleting a module concentrate its complexity elsewhere, or merely move the same complexity?

**Defer change cost.** Record findings regardless of perceived refactor size; evaluate cost during the grilling loop.

### 2. Present Findings as HTML Report

Write a self-contained HTML file to `/tmp/akeel/runs/<run-id>/report.html` under the reserved run. Open it for the user where a GUI is available (`xdg-open <path>` on Linux); in a headless environment, report the file path and ask the user to open it.

For each finding, render a card with:

- **Files** — which files or modules are involved
- **Evidence** — concrete recurring changes, navigation friction, or test limitations
- **Problem** — why the current boundaries cause friction
- **Direction** — a high-level remediation direction, not a frozen interface design
- **Benefits** — effects on locality, leverage, and testability
- **Before / After diagram** — side-by-side, using Mermaid or hand-drawn
- **Recommendation strength** — Strong / Worth exploring / Speculative

End with a **Top recommendation** — which finding to examine first and why.

### 3. Proposal Handoff

Once the user selects a finding, treat it as a proposal and tell them to run `/skill:grill-docs` to resolve open decisions, verify it against project evidence and applicable external documentation, and record the final result.

Leave implementation and record updates to subsequent workflows: `grill-docs` returns a verified candidate, and the Task Owner determines whether its durable content belongs in the active Task, `CONTEXT.md`, a Decision, or a Candidate Record.
