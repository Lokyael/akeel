---
name: brainstorm-design
description: Use /skill:brainstorm-design before building features or components, or modifying behavior. Turns ideas into fully formed designs through collaborative dialogue — exploring user intent and requirements before implementation.
disable-model-invocation: true
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and Requirements through natural collaborative dialogue.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Process

1. **Explore project context** — read `CONTEXT.md` if it exists (Glossary, Architecture, Active Decisions, Negative Space), then read `docs/decisions.md` and `docs/task.md` if they exist, and recent commits.
2. **Ask clarifying questions** — one at a time, understand purpose, constraints, and success criteria. Prefer concrete choices where applicable. One question per message.
3. **Propose 2–3 approaches** — with trade-offs and your recommendation. For interface-level design, apply Design Twice from `module-design`. Lead with your recommended option and explain why.
4. **Present design** — in sections scaled to their complexity, getting user approval after each section. Cover: architecture, components, data flow, error handling, testing, and Out of Scope (per principles.md §8 format).
5. **Record the design** — add the approved design to the current Task Record (`docs/task.md` or `docs/task-<topic>.md`), including Out of Scope (per principles.md §8) and any unresolved questions. Keep the design within the Task Record without creating separate design files.
6. **Work-item self-review** — check for placeholders, contradictions, and ambiguity; resolve inline.
7. **User reviews the Task Record** — ask the user to review the design section before proceeding.

## Working in Existing Codebases

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work, include targeted improvements as part of the design.
- Focus strictly on the current goal; propose unrelated refactoring separately.

## Design for Isolation

Break the system into units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently. Verify that callers can use a unit through its public boundary without relying on internal details.

## After the Design

When the user approves the design, use `implementation-planning` for multi-step work that needs an implementation-ready Plan. When the approved Task is ready to build, tell the user: "Switch to a writable policy with `/policy develop` and run `/skill:implement-work` to start implementing."
