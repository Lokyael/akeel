---
name: handoff-session
description: Use /skill:handoff-session to compact the current conversation into a handoff document so another agent without access to this session's history can continue the work. Reference existing artifacts by path rather than duplicating content. Redact sensitive information.
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so an agent without access to this session's history can continue the work.

## When to Use

- **Same pi environment** (new session, another model, `pi -c`): prefer pi's built-in `/resume`, `/tree`, or `/import` — the full session history lives in pi's persistent session file and reloads completely. A handoff summary adds no fidelity here.
- **Cross-environment / non-pi agent**: the receiver cannot read this pi session's file. This is the only scenario where a handoff document adds value.

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

Output the handoff document in the conversation for the user to copy and deliver. Write a file only when the user specifies a target path — persistence is the user's choice. Do not default to a temp file: `/tmp` is cleared on reboot and unreachable across machines, so it can never actually deliver the handoff.
