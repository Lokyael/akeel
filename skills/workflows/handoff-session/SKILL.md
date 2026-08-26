---
name: handoff-session
description: Use /skill:handoff-session to write a handoff document summarising the current conversation so another agent can continue the work. Reference artifacts by path; redact sensitive information.
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so another agent can continue the work from the document and the repo content alone; if that cannot be guaranteed, abort before writing and resolve the gaps in this session first — never produce an incomplete document.

## Content

Include:
- **Goal**: What we're trying to accomplish
- **Current state**: Where we are in the process
- **Decisions**: references only — link the relevant `D-xxx` entries in `docs/decisions.md` and Task Record sections. Never restate decision content: its single authoritative home is the container (per principles.md Project Records — Record Lifecycle). If a decision from this session is not yet recorded, record it first (domain-modeling) before handing off.
- **Files involved**: Paths to relevant files, `CONTEXT.md`, `docs/decisions.md`, or the active Task Record (`docs/task.md` or `docs/task-<topic>.md`)
- **Next steps**: What to do next
- **Suggested skills**: Which skills the next agent should invoke

## What NOT to Include

- Content already captured in `CONTEXT.md`, `docs/decisions.md`, an active Task Record, or commits. Reference it by path.
- Sensitive information: API keys, passwords, tokens, personally identifiable information.

## How to Use

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the document accordingly.

Output the document in the conversation. With the user's agreement, write it to `/tmp/pi-work/handoffs/handoff-<timestamp>.md` or any user-named destination and show the path.
