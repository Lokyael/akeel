---
name: survey-context
description: Per-task context bootstrap — reads existing specs, plans, and docs to map the current project state and suggest the next action. Use at the start of any task, when returning after a break, or when unsure what to do next.
---

# Survey Context

Read the project's current state and give a phase map + next-skill recommendation. This is the "where am I?" skill — run it at the start of every task.

## Process

### 1. Read CONVENTIONS.md

If `CONVENTIONS.md` exists at the project root, read it first. It contains the rules all agents must follow.

### 2. Read CONTEXT.md

If `CONTEXT.md` exists at the project root, read it. Internalize the Glossary (use these exact terms) and Negative Space (do not propose work in these areas).

### 3. Read Specs Directory

Scan `specs/` if it exists:
```
specs/
├── state.yaml              → session: active_flow, epic, git, handoff
├── release-plan.yaml       → target version, epic index
├── execution-status.yaml   → story/epic status
├── requirements/           → VISION, SCOPE, GLOSSARY
├── plans/                  → TECH_STACK, TEST_PLAN
├── epics/                  → epic capsules with stories/tasks
└── bugs/                   → BUG-*.md
```

Note: exists? keys populated? `handoff.next_skill`?

### 4. Read AGENTS.md

Read the project's `AGENTS.md` (or `CLAUDE.md`) for project context: stack, commands, architecture, conventions.

### 5. Check Git State

```bash
git status --short
git log --oneline -5
git branch --show-current
```

### 6. Check Previous Session State

If `specs/state.yaml` exists, read `handoff.next_skill` — this tells you exactly which skill the previous session intended to invoke next.

### 7. Synthesize and Recommend

Based on what you found:
- **No specs exist, greenfield** → suggest `brainstorm-design`
- **Spec exists, no plan** → suggest `plan-writing`
- **Plan exists, ready** → suggest `implement-work`
- **Plan status: in-progress** → previous session may have been interrupted. Ask: "Plan X is marked in-progress. Continue or reassess?"
- **Plan status: done, but spec changed** → spec was updated after implementation. Flag mismatch.
- **Bug reported** → suggest `bug-investigation`
- **State stale** → request clarification rather than assuming intent
- **Specific phase active** (from state.yaml) → suggest next skill in that phase
- **No AGENTS.md or no centralization conventions in it** → note it: "This project has no documented conventions for where config, modules, and rules live. If I notice scattered changes, I'll suggest centralizing per principles.md §8."

Present findings concisely and ask: "Ready to proceed with [recommended skill]?"
