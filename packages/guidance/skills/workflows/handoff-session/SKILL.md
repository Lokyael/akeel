---
name: handoff-session
description: Use /skill:handoff-session to write a handoff document summarising the current conversation so another agent can continue the work. Reference artifacts by path; redact sensitive information.
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so another agent can continue the work using only this document and repository content. Resolve any information gaps in the current session before writing to ensure a complete handoff.

## Content

Include:
- **Goal**: What we're trying to accomplish
- **Current state**: Where we are in the process
- **Decisions**: references only — link `D-xxx` entries and active Task sections with repo-relative paths (`docs/decisions.md#...`, `docs/task.md#...`). Reference decisions by path rather than restating content; the container is the single authoritative home (per principles.md Project Records — Project Record Authority). If a decision from this session is not yet recorded, record it first (domain-modeling) before handing off.
- **Files involved**: Use repo-relative paths for repo files and `/tmp/akeel/...` for AKeel scratch artifacts. Reference skills by name rather than installed path; the next session resolves them from `<available_skills>`.
- **Next steps**: What to do next
- **Suggested skills**: Skill names only.

## Excluded Content

- Content already captured in `CONTEXT.md`, `docs/decisions.md`, an active Task Record, or commits. Reference it by path.
- Sensitive information: API keys, passwords, tokens, personally identifiable information.

## How to Use

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the document accordingly.

Write the document to `/tmp/akeel/handoffs/handoff-<timestamp>.md` unless the user requested another path. Reply with the file path and a brief summary.
