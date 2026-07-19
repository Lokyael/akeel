---
name: rollback-session
description: Guide the user through recovering from unwanted changes using version control and session tree branching. Use when the user says "undo", "rollback", "revert", "go back", or when the agent has made changes the user wants to discard.
disable-model-invocation: true
---

# Recovery Session

Guide the user through recovering from unwanted changes. pi-keel does not create file snapshots or provide a `/rollback` command.

## Layer 1: Version Control

Inspect the working tree and history first:

```bash
git status --short
git diff --stat
git diff
```

Before changing files, identify whether each change is user-owned, agent-owned, staged, committed, or untracked. Do not use destructive commands such as `git reset --hard`, `git checkout --`, or `git clean` without explicit user approval for the exact paths and scope.

Use the narrowest approved recovery operation:

- `git restore -- path` for approved unstaged paths
- `git restore --staged -- path` for approved staged paths
- `git revert <commit>` for an approved committed change
- manual edits when only part of a file should be recovered

## Layer 2: Session Tree

If the problem is the conversation direction rather than file contents, use pi's built-in `/tree`:

1. Run `/tree` to see the session branch tree.
2. Navigate to the point before things went wrong.
3. Press Enter to continue from that point.
4. Remember that `/tree` changes conversation context, not files already modified on disk.

## What To Do

1. Inspect `git status`, the relevant diff, and recent commits.
2. Confirm the exact files or commit the user wants to recover.
3. Obtain explicit approval before destructive version-control operations.
4. Apply the narrowest recovery operation or use `/tree` for context-only recovery.
5. Verify the result with `git status`, a focused diff, and relevant tests.

## Notes

- Existing `.pi-keel/snapshots/` data is not a recovery source. The security extension does not read, restore, or delete legacy snapshot data.
- Any existing legacy data should be handled explicitly by the user, outside the security extension.
- Editor history, version control, and pi's session tree are the supported recovery mechanisms.
