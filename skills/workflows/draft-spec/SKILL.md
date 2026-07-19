---
name: draft-spec
description: Turn the current conversation into a formal specification document — synthesizes what you've already discussed without re-interviewing. Use when you want to capture decisions as a spec.
disable-model-invocation: true
---

Turn the current conversation into a formal specification document. Synthesize everything that's been discussed — requirements, constraints, design decisions, tradeoffs — into a single structured spec.

## What to Capture

- **Status**: `draft`. Transitions: `approved` (after design review) → `implemented` (after completion). Per principles.md Quick Reference — Artifact Status Transitions.
- **Goal**: What are we building and why?
- **Requirements**: Functional and non-functional, success criteria
- **Design decisions**: What was chosen and why, alternatives considered
- **Constraints**: Technical, timeline, resource constraints
- **Out of scope**: Per principles.md §7 format. Skip if nothing is excluded.
- **Open questions**: Anything still unresolved

## Output

Save the spec to `docs/specs/YYYY-MM-DD-<topic>-spec.md`. If the user specifies an issue tracker, also create the corresponding issue and link it in the spec.

Do not re-interview the user — this skill synthesizes what's already been discussed. If key information is missing, flag it rather than making assumptions.
