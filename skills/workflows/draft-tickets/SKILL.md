---
name: draft-tickets
description: Break any plan, spec, or conversation into a set of tracer-bullet tickets, each declaring its blocking edges. Use after draft-spec or when you have a plan ready for decomposition.
disable-model-invocation: true
---

Break the plan or spec into independent, vertical-slice tickets. Each ticket should be a self-contained unit of work that delivers user-visible value.

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

Save tickets to `docs/tickets/YYYY-MM-DD-<topic>-tickets.md`. If the user specifies an issue tracker, also create the corresponding issues and link them.
