---
name: handoff-session
description: Compact the current conversation into a handoff document so another agent can continue the work. Reference existing artifacts by path rather than duplicating content. Redact sensitive information.
disable-model-invocation: true
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS — not the current workspace.

## Content

Include:
- **Goal**: What we're trying to accomplish
- **Current state**: Where we are in the process
- **Key decisions**: What was decided and why
- **Files involved**: Paths to relevant files, specs, plans
- **Next steps**: What to do next
- **Suggested skills**: Which skills the next agent should invoke

## What NOT to Include

- Content already captured in other artifacts (specs, plans, ADRs, tickets, commits). Reference them by path instead.
- Sensitive information: API keys, passwords, tokens, personally identifiable information.

## How to Use

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the document accordingly.

Save the handoff document to `$TMPDIR/handoff-session-<timestamp>.md` (or `/tmp/` on Linux) and tell the user the path.
