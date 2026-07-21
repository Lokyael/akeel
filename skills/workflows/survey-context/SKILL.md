---
name: survey-context
description: Per-task context bootstrap — reads the project's current knowledge and active tasks to map the project state and suggest the next action. Use at the start of any task, when returning after a break, or when unsure what to do next.
---

# Survey Context

Read the project's current state and produce a phase map plus the next-skill recommendation. This is the context bootstrap for every task.

## Process

### 1. Read project conventions

Read `CONVENTIONS.md` if it exists. Read `AGENTS.md` or `CLAUDE.md` for engineering constraints. These files are user-owned and read-only to pi-keel.

### 2. Read current project knowledge

Read `CONTEXT.md` if it exists. Internalize its Glossary, Architecture, Security Boundaries, Active Decisions, and Negative Space.

### 3. Read durable decisions

Read `docs/decisions.md` if it exists. Use it for the rationale behind current architecture and constraints. Do not treat it as an active task list.

### 4. Read active tasks

Read `docs/task.md` and any flat `docs/task-<topic>.md` files if they exist. For each Task Record, note:

- `Kind` and `Status`
- Goal, scope, and Requirements
- Unresolved risks or decisions
- Required durable updates

Do not scan or create type-specific directories or date-based artifact paths.

### 5. Check Git state

```bash
git status --short
git log --oneline -5
git branch --show-current
```

### 6. Synthesize and recommend

Based on the project state:

- No active task → suggest `brainstorm-design` for a new feature or `plan-writing` for explicit requirements.
- Task Record is `draft` → suggest the next design, requirements, planning, or debugging skill based on its `Kind`.
- Task Record is `in-progress` → continue it or ask whether to reassess if its evidence is stale.
- Task Record is `verified` → apply durable updates, then remove the Task Record.
- A bug is reported → suggest `bug-investigation`.
- A load-bearing decision is unresolved → suggest `domain-modeling` or `grill-docs`.
- No `CONTEXT.md` exists → note that current project knowledge has not yet been centralized.

Present the findings concisely and ask: "Ready to proceed with [recommended skill]?"
