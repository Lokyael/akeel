---
name: brainstorm-design
description: Turn ideas into fully formed designs through collaborative dialogue before any creative work. You MUST use this before building features, creating components, adding functionality, or modifying behavior. Explores user intent, requirements, and design before implementation.
disable-model-invocation: true
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Process

1. **Explore project context** — read CONTEXT.md if it exists (Glossary, Negative Space), then check docs, recent commits
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria. Prefer multiple choice when possible. One question per message.
3. **Propose 2-3 approaches** — with trade-offs and your recommendation. For interface-level design, apply Design Twice from codebase-design. Lead with your recommended option and explain why.
4. **Present design** — in sections scaled to their complexity, get user approval after each section. Cover: architecture, components, data flow, error handling, testing, and Out of Scope (principles.md §7 format).
5. **Write design doc** — save to `docs/designs/YYYY-MM-DD-<topic>-design.md`. Include Out of Scope.
6. **Spec self-review** — quick check for placeholders, contradictions, ambiguity. Fix inline.
7. **User reviews spec** — ask user to review before proceeding.

## Working in Existing Codebases

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work, include targeted improvements as part of the design.
- Don't propose unrelated refactoring. Stay focused on the current goal.

## Design for Isolation

Break the system into units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently. Can someone understand what a unit does without reading its internals? If not, boundaries need work.

## After the Design

When the user approves the design, remind them: "Design approved. Run /build to switch to BUILD mode and /skill:implement-work to start implementing."
