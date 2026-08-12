---
name: draft-spec
description: Use /skill:draft-spec when requirements need to be captured before implementation. Turn the current conversation into a structured Task Record — synthesize what has already been discussed without re-interviewing.
disable-model-invocation: true
---

Turn the current conversation into a structured Task Record. Synthesize everything that's been discussed — requirements, constraints, design decisions, tradeoffs — into one section of the current task file (`docs/task.md` or `docs/task-<topic>.md`).

## What to Capture

- **Kind**: `feature` or `maintenance`.
- **Status**: `draft`. After design review, transition to `in-progress`, then `verified`. Per principles.md Quick Reference — Record Lifecycle.
- **Goal**: What are we building and why?
- **Requirements**: Functional and non-functional, success criteria
- **Design decisions**: What was chosen and why, alternatives considered
- **Constraints**: Technical, timeline, resource constraints
- **Out of scope**: Per principles.md §7 format. Skip if nothing is excluded.
- **Open questions**: Anything still unresolved

## Output

Add the Requirements sections to the current task file under a precise `T-xxx: <topic>` heading (per principles.md Next-ID slots). Use `docs/task.md` by default; use `docs/task-<topic>.md` only when the task has an independent lifecycle. If the user specifies an issue tracker, link it from the Task Record. Do not create a separate spec file or directory.

If the source is a `C-xxx` entry, proceed only after the user explicitly commits to the work in the current conversation (migration per principles.md Quick Reference — Migration Protocol). Add optional `Origin: C-xxx` metadata to the Task Record and remove the Candidate Record in the same change. The existence, wording, `Review On`, or `Trigger` of a Candidate Record is never sufficient approval.

Do not re-interview the user — this skill synthesizes what's already been discussed. If key information is missing, flag it rather than making assumptions.
