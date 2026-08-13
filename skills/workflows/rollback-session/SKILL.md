---
name: rollback-session
description: Use /skill:rollback-session when the user wants to undo, rollback, or revert changes, or discard changes the agent made. Guide the user through recovering from unwanted changes using version control and session tree branching.
disable-model-invocation: true
---

# Recovery Session

pi-keel does not create snapshots or provide a `/rollback` command.

## File Recovery

Use `git restore` or `git revert`. Destructive recovery commands (`git reset --hard`, `git checkout --`, `git clean`) run only with explicit user intent (per principles.md §9); confirm the exact paths and scope before running them.

## Conversation Recovery

If only the conversation direction needs to change, use pi's built-in `/tree` to navigate back to an earlier branch point. `/tree` changes context, not files already modified on disk.

## Verify

After recovery, confirm with `git status`, the relevant diff, and applicable tests.
