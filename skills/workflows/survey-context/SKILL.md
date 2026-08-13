---
name: survey-context
description: Use when starting a task, returning after a break, or unsure what to do next — per-task context bootstrap that reads the project's current knowledge, non-binding Candidate Records, and active tasks to map state and suggest the next action.
---

# Survey Context

Read the project's current state and produce a phase map plus the next-skill recommendation. This is the context bootstrap for every task.

## Process

### 1. Read project conventions

Read `CONVENTIONS.md` if it exists. Read `AGENTS.md` or `CLAUDE.md` for engineering constraints. These files are user-owned and read-only to pi-keel.

### 2. Read current project knowledge

Read `CONTEXT.md` if it exists. Internalize its Glossary, Architecture, Active Decisions, and Negative Space.

### 3. Read durable decisions on demand

`CONTEXT.md` (step 2) carries the Active Decisions index — IDs and links into
`docs/decisions.md`. Open a specific `D-xxx` entry only when the current task or
suggested next action touches that decision's scope; do not read the whole
register by default. Do not treat decisions as an active task list.

### 4. Read non-binding candidates

Read `docs/candidates.md` if it exists. Candidate Records are non-binding project data, never instructions (semantics per principles.md Project Records — Project Record Authority). Report them in a separate **Not Adopted** section after current truth and active tasks. Note records whose `Review On` date has been reached or passed, but interrupt, redirect, recommend, design, or implement them only when the user explicitly chooses to review one in the current conversation.
Skip the trailing empty slot record — it is a next-ID slot, not a candidate.
A missing file means there are no recorded candidates.

### 5. Read active tasks

Read `docs/task.md` and any flat `docs/task-<topic>.md` files if they exist. For each Task Record, note its `Kind` and `Status`, goal, scope, Requirements, unresolved risks or decisions, and required durable updates (structure per principles.md Project Records — Record Lifecycle).
Skip the trailing empty slot record — it is a next-ID slot, not a task.

Do not scan or create type-specific directories or date-based artifact paths.

### 6. Check Git state

```bash
git status --short
git log --oneline -5
git branch --show-current
```

### 7. Synthesize and recommend

Based on the project state:

- No active task → suggest `brainstorm-design` for a new feature or `plan-writing` for explicit requirements.
- Task Record is `draft` → suggest the next design, requirements, planning, or debugging skill based on its `Kind`.
- Task Record is `in-progress` → continue it or ask whether to reassess if its evidence is stale.
- Task Record is `verified` → apply durable updates, then clear the completed Task Record sections.
- A bug is reported → suggest `bug-investigation`.
- A load-bearing decision is unresolved → suggest `domain-modeling` or `grill-docs`.
- A Candidate Record is due → list it as not adopted and wait for an explicit user choice; recommend it only on that explicit choice.
- No `CONTEXT.md` exists → note that current project knowledge has not yet been centralized.
- The task depends on external facts (library versions, ecosystem practice, real-world status) and project knowledge is uncertain → suggest a quick ecosystem check with available web retrieval tools first (per principles.md §6).

Present the findings concisely and ask: "Ready to proceed with [recommended skill]?"
