---
name: handoff-session
description: Use /skill:handoff-session to publish a verified handoff document so a successor session can continue the work. Reference artifacts by path; redact sensitive information.
disable-model-invocation: true
---

Publish a handoff document summarising the current conversation so a successor session can continue using only that document and repository content. Resolve information gaps first. A handoff transfers context to a successor; it is not a delegated run result and does not grant acceptance or publication authority.

## Content

Include:
- **Goal**: What we're trying to accomplish
- **Current state**: Where we are in the process
- **Decisions**: references only — link `D-xxx` entries and active Task sections with repo-relative paths (`docs/decisions.md#...`, `docs/task.md#...`). Reference authoritative records instead of copying them (per principles.md Project Records — Project Record Authority). Record an adopted but missing decision through domain-modeling before handing off.
- **Files involved**: Use repo-relative paths for repo files and exact `/tmp/akeel/...` paths for retained temporary artifacts. Reference skills by name rather than installed path.
- **Next steps**: What to do next
- **Suggested skills**: Skill names only

## Excluded Content

- Content already captured in `CONTEXT.md`, `docs/decisions.md`, an active Task Record, or commits; reference it by path.
- Sensitive information: API keys, passwords, tokens, capability values, personally identifiable information.
- Full terminal output, search trails, repeated failures, and intermediate drafts.

## Publish and verify

If the user passed arguments, treat them as the successor's focus and tailor the handoff accordingly.

Call `akeel_handoff` action `publish` with the complete Markdown document. The Handoff Store creates one owner-controlled `/tmp/akeel/handoffs/handoff-<random>/` envelope and atomically publishes `handoff.json`, `handoff.md`, and `receipt.json` with private permissions. Do not use ordinary `write`, create a legacy flat handoff file, or choose the path yourself.

Return the exact published `handoff.md` path and a brief summary. The successor calls `akeel_handoff` action `verify` with that exact path before relying on its content. Missing or mismatched manifest, content, or receipt is a failed handoff; do not reconstruct it from terminal output. Handoff Store does not delete the envelope, so the successor reports the exact retained path for explicit user-managed cleanup after successful takeover.
