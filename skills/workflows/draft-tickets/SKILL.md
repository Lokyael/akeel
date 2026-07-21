---
name: draft-tickets
description: Break the current Task Record into tracer-bullet task sections, each declaring its blocking edges. Use after draft-spec or when a plan is ready for decomposition.
disable-model-invocation: true
---

Break the Task Record in the current task file (`docs/task.md` or `docs/task-<topic>.md`) into independent, vertical-slice task sections. Each task should be a self-contained unit of work that delivers user-visible value.

## Ticket Template

```markdown
### Ticket N: [Title]

**Goal:** [One sentence]
**Depends on:** [Ticket IDs this blocks on, or "none"]
**Blocks:** [Ticket IDs that depend on this]
**Out of Scope:** (per principles.md §7 — what this ticket deliberately excludes. Omit if nothing.)

**Acceptance Criteria:**
- [ ] [Criterion]
- [ ] [Criterion]

**Files:**
- Create: `path/to/file`
- Modify: `path/to/file`

**Verify:**
```bash
[command to verify completion]
```
```

## Principles

- **Vertical slices**: Each ticket delivers a thin but complete slice of functionality
- **Tracer bullets**: First tickets should go end-to-end through the system, proving the architecture
- **Dependencies explicit**: Every ticket declares what it blocks on and what it blocks
- **Independent testable**: Each ticket should be independently testable and deliverable
- **Right-sized**: 2-5 hours per ticket. Split larger tickets

## Output

Add task sections to the current Task Record. Use `docs/task.md` by default; use `docs/task-<topic>.md` only when the task has an independent lifecycle. If the user specifies an issue tracker, link each task from its section. Do not create a separate ticket file or directory.
