---
name: implementation-planning
description: Use when approved Requirements and Design need an implementation-ready Plan before code changes — create or reuse the committed Task Record, organize verifiable Plan Slices, and define dependencies, seams, tests, and verification.
---

# Implementation Planning

Turn approved Requirements and Design into a self-contained Task Plan that `implement-work` can execute without relying on unstated session context.

## Planning Contract

Start with explicit user commitment and sufficiently resolved Requirements and Design. Use the matching active Task Record when one exists. Only material work enters this planner; a local wording-only adjustment that is not material under `principles.md` Project Record Authority is handled directly. When the current conversation provides material commitment and approved input without a Task Record, create one per principles.md Project Records — Record Lifecycle and Next-ID slots. Ask the user to select the authority source when multiple active records could own the work.

Planning produces or updates the Task Record's `Plan` section. The Task Record remains `draft`; `implement-work` owns implementation start, lifecycle progression, validation, review, and commit.

For Requirements or Design questions that materially change the plan, tell the user to run `/skill:brainstorm-design`. Applicable external contracts receive fresh verification per principles.md §6 before their details enter the Plan.

## Process

### 1. Establish the Planning Input

Read the Task Record, current project knowledge, governing Decisions, repository conventions, and approved conversation context. Preserve the distinction between:

- **Requirements** — observable outcomes and acceptance conditions
- **Design** — approved structural and interface choices
- **Plan** — ordered implementation and verification work

Carry every approved Requirement into the coverage review. Represent unresolved non-blocking details as explicit verification steps or open questions with an owner.

### 2. Inspect the Implementation Surface

Read the relevant source, tests, public interfaces, package exports, and integration points before naming files or seams. Reuse established project patterns. For interface-level choices already within the approved Design, apply Design Twice from `module-design` and keep the selected interface consistent across slices.

Use stable anchors such as exported symbols, type names, test names, and document headings. Include signatures, small pseudocode, or focused code excerpts where they remove interface ambiguity; TDD supplies production details during implementation.

### 3. Shape Plan Slices

A **Plan Slice** is an ordered, independently verifiable implementation unit inside one Task. Slices share the Task's T-ID, lifecycle, scope, and Task Owner.

Choose boundaries around observable behavior, one coherent test cycle, or one stable interface. A simple multi-step Task may have one Slice. Use an early tracer Slice when a cross-layer path or integration seam needs proof before broader work.

Record dependencies in one direction with `Depends on`; derive reverse relationships from that graph.

Use this structure for every Slice:

```markdown
#### Slice N: [Outcome]

**Goal:** [Observable result]
**Requirements covered:** [Requirement identifiers or precise phrases]
**Depends on:** [Earlier Slice IDs, or "none"]

**Acceptance Criteria:**
- [ ] [Observable criterion]

**Files and Seams:**
- Modify: `path/to/file` — `publicSymbol`
- Test: `tests/path/to/test` — [public behavior]

**Verification:**
- `exact command`

**Steps:**
1. [First concrete action]
2. [Next concrete action]
```

For behavior changes, express the relevant red-green cycle in the Steps and test through the agreed public seam. Fold setup, documentation, and migration work into the Slice whose outcome needs them.

### 4. Review the Plan

Confirm that:

- every Requirement maps to at least one Slice and Acceptance Criterion;
- each Slice names an observable result and exact verification;
- dependencies are complete, acyclic, and reference existing Slices;
- files and seams come from repository evidence;
- interfaces remain consistent across dependent Slices;
- scope and Out of Scope match the approved Task;
- open questions have an owner or a concrete resolution path;
- the Plan contains enough context for another engineer to execute it.

Resolve planning defects inline. Present the updated Task Record for user review, then direct the user to `/skill:implement-work` when the Plan is approved.
