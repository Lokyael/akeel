---
name: rollback-session
description: Guide the user through recovering from unwanted changes using version control and session tree branching. Use when the user says "undo", "rollback", "revert", "go back", or when the agent has made changes the user wants to discard.
disable-model-invocation: true
---

# Recovery Session

pi-keel does not create snapshots or provide a `/rollback` command.

## File Recovery

Use `git restore` or `git revert`. Before any destructive operation (`git reset --hard`, `git checkout --`, `git clean`), confirm the exact paths and scope with the user and obtain explicit approval.

## Conversation Recovery

If only the conversation direction needs to change, use pi's built-in `/tree` to navigate back to an earlier branch point. `/tree` changes context, not files already modified on disk.

## Verify

After recovery, confirm with `git status`, the relevant diff, and applicable tests.
