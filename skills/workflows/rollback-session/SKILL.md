---
name: rollback-session
description: Guide the user through rolling back unwanted changes — file snapshots first, then session tree branching. Use when the user says "undo", "rollback", "revert", "go back", or when the agent has made changes the user wants to discard.
disable-model-invocation: true
argument-hint: "What do you want to roll back? (leave empty for guidance)"
---

# Rollback Session

Guide the user through recovering from unwanted changes. Two layers, progressively:

## Layer 1: File Snapshots (fast, precise)

pi-keel automatically backs up every file before modifying it. Snapshots live in `.pi-keel/snapshots/`.

**Check what's available:**
```
/rollback
```

**Restore the most recent change:**
```
/rollback undo
```

**Restore a specific file:**
```
/rollback undo src/main.ts
```

**Restore multiple recent changes:**
```
/rollback undo 3
```

**Clean up when done:**
```
/rollback clean
```

## Layer 2: Session Tree (context-level)

If the problem is the conversation direction (not just file changes), use pi's built-in `/tree`:

1. Run `/tree` to see the session branch tree
2. Navigate with arrow keys to the point before things went wrong
3. Press Enter to continue from that point
4. **Important:** `/tree` only affects the conversation context. Files already modified remain modified — run `/rollback undo` first if needed.

## What To Do

1. First, try `/rollback` to see available file snapshots
2. If the right snapshot exists, `/rollback undo` to restore
3. If files are restored but the conversation is off-track, use `/tree`
4. Verify the result: check the restored files, run tests

## Notes

- Snapshots are created automatically before every `write` and `edit` operation
- Only the last 10 snapshots per file are kept
- Snapshots are local to the project (stored in `.pi-keel/`)
- The `.pi-keel/` directory should be added to `.gitignore`
