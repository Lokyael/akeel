---
name: survey-context
description: Use when starting a task, returning after a break, unsure what to do next, or when the user explicitly requests Candidate review — per-task context bootstrap that reads the project's current knowledge and active tasks to map state and suggest the next action.
---

# Survey Context

Read the project's current state and produce a phase map plus the next-skill recommendation. This is the context bootstrap for every task.

## Process

Skip the trailing empty slot record in `docs/task.md` — it is the next-ID slot, not a record (per principles.md Next-ID slots). Candidate review is an explicit branch of this workflow, not part of the routine survey.

### 1. Read project conventions

Read `CONVENTIONS.md` if it exists. Read `AGENTS.md` or `CLAUDE.md` for engineering constraints. These files are user-owned and read-only to AKeel.

### 2. Read current project knowledge

Read `CONTEXT.md` if it exists. Internalize its Glossary, Architecture, Active Decisions, and Negative Space.

### 3. Read durable decisions on demand

`CONTEXT.md` (step 2) carries the Active Decisions index — IDs and links into
`docs/decisions.md`. Open a specific `D-xxx` entry on demand when the current task or
suggested next action touches that decision's scope. Decisions record adopted conclusions,
while active work lives in Task Records.

### 4. Review Candidates on explicit request

Candidate Records are non-binding project data (semantics per principles.md Project Records — Project Record Authority). When Candidate review is explicitly requested, read `candidate-review.md` only for this explicit branch and apply its record-boundary and zero-loss checks.

During a routine survey, keep the context focused on current truth and active Tasks. When the user explicitly requests review of all candidates, read `docs/candidates.md`, skip its trailing slot, and report every Candidate in a separate **Not Adopted** section. When the user names one or more `C-xxx` records, locate each heading with Direct `grep` and read only from that heading through the next `##` heading; report a missing ID and keep the remaining requested scope unchanged. Use each record's `Revisit condition` as review evidence; promotion, dismissal, and revision remain explicit user choices. A missing file means no Candidate review material is available.

### 5. Read active tasks

Read `docs/task.md`. For each active Task Record, note its `Kind` and `Status`, goal, scope, Requirements, unresolved risks or decisions, and required durable updates (structure per principles.md Project Records — Record Lifecycle). Routine survey reads the current tree only. It does not load cleared Task Records from Git history; read history only to verify checkpoint reachability or audit a specific Task.

### 6. Check Git state

```bash
git status --short
git log --oneline -5
git branch --show-current
```

### 7. Synthesize and recommend

Based on the project state:

- A request that is not material under `principles.md` Project Record Authority → proceed with the relevant direct edit and applicable validation without creating a Task solely because no active Task exists.
- No active task → suggest `brainstorm-design` when Requirements or Design need resolution; use `implementation-planning` when the user has committed to explicit, approved input for multi-step implementation.
- Task Record is `draft` → use `brainstorm-design` for material open Requirements or Design questions, `implementation-planning` for multi-step work that needs an implementation-ready Plan, or tell the user to run `/skill:implement-work` when the approved Task is ready to build.
- Task Record is `in-progress` → continue implementation, validation, review, or durable updates; ask whether to reassess if evidence is stale, and clear it atomically in the completion commit once all gates pass.
- A bug investigation or fix is requested → suggest `systematic-debugging`; when the symptom lacks a reliable agent-runnable signal, start with `bug-reproduction`.
- A bug record is requested without technical investigation → create or update the `Kind: bug` Task directly per principles.md Project Records — Record Lifecycle.
- A load-bearing decision is unresolved → suggest `domain-modeling` or `grill-docs`.
- Candidate review is explicitly requested → read the requested Candidate records, list them as not adopted, and wait for the user's choice.
- No `CONTEXT.md` exists → note that current project knowledge has not yet been centralized.
- The task depends on external facts (library versions, ecosystem practice, real-world status) and project knowledge is uncertain → suggest a quick ecosystem check with available web retrieval tools first (per principles.md §6).

Present the findings concisely and ask: "Ready to proceed with [recommended skill]?"
