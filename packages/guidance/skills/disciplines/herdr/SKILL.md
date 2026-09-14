---
name: herdr
description: Use when delegating isolated work to a synchronous Herdr child agent.
---

# Herdr Delegation

Use Herdr when process context must stay separate and the current Task Owner retains final authority (per principles.md §11). The owning skill defines the task and artifact contract; Herdr manages child execution and artifact handoff.

## Start

Verify the current session is inside Herdr:

```bash
test "${HERDR_ENV:-}" = 1
```

Create the workspace matching the child's capability:

- **Modifying child** (`write`, `edit`, or file-changing Shell) — create an independent worktree on a unique branch:
  ```bash
  herdr worktree create --cwd "$PWD" --branch "<unique-branch>" --label "<label>" --no-focus
  ```
- **Read-only child** — create a workspace in the current checkout:
  ```bash
  herdr workspace create --cwd "$PWD" --label "<label>" --no-focus
  ```

Start the child in the returned root pane:

```bash
herdr agent start <unique-name> --kind pi --pane <root-pane-id> --timeout 30000
```

## Run and join

Reserve the artifact path, pass the bounded contract, and wait for settlement:

```bash
herdr agent prompt <name> "<task and artifact contract>" --wait --timeout 120000
```

Read the completed artifact from the reserved path. If the wait times out or the child pauses for input, inspect its state before continuing:

```bash
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines 80
```

## Cleanup

After integrating results and receiving user approval, the Task Owner removes the resources created for this run:

- **Worktree run**:
  ```bash
  herdr worktree remove --workspace <workspace-id>
  git branch -d <unique-branch>
  ```
- **Workspace run**:
  ```bash
  herdr workspace remove <workspace-id>
  ```
