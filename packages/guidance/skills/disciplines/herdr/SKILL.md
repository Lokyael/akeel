---
name: herdr
description: Use when delegating isolated work to a synchronous Herdr child agent.
---

# Herdr Delegation

Use Herdr when process context must stay separate and the current Task Owner retains final authority (per principles.md §11). The owning skill defines the task, packet, and result contract; Herdr manages child execution while AKeel Artifact Exchange owns formal result publication.

## Start the run

Verify the current session is inside Herdr:

```bash
printenv HERDR_ENV
```

Use `akeel_run_artifact` action `reserve` to create one run with an Owner-published `packet` slot and one child-published artifact slot per child. Publish the complete packet with action `put`; use only the returned run ID, exact paths, and opaque child capabilities. A missing Artifact Exchange tool blocks formal delegation.

Create the workspace matching the child's effective capability:

- **Modifying child** (`write`, `edit`, or file-changing Shell) — create an independent worktree on a unique branch:
  ```bash
  herdr worktree create --cwd . --branch "<unique-branch>" --label "<label>" --no-focus
  ```
- **Read-only child** — create a workspace in the current checkout:
  ```bash
  herdr workspace create --cwd . --label "<label>" --no-focus
  ```

When the delegated task depends on repository state, the Owner packet includes the fixed Git status, staged and unstaged diffs, untracked inventory, relevant refs, and base/head OIDs. A read-only child treats this immutable Owner packet as its Git authority and must not run live Git commands or refresh repository state. If the packet is missing required Git evidence or appears stale, the child reports the gap instead of reconstructing it. A modifying child may inspect live Git only in its isolated worktree and under its effective policy.

Use `akeel_run_artifact` action `bind` to bind each child slot to the returned workspace ID, root pane ID, and planned unique Agent name. Then start Pi with only that slot's opaque capability:

```bash
herdr agent start <unique-name> --kind pi --pane <root-pane-id> --timeout 30000 -- --akeel-artifact-capability <opaque-capability>
```

The capability grants only one bounded artifact publication. It does not grant ordinary file writes, validation, code changes, arbitrary execution, acceptance, or cleanup.

## Run and join

Prompt the child with the exact packet path and require it to finish by calling `akeel_publish_artifact` once with the contracted result:

```bash
herdr agent prompt <name> "Read <exact-packet-path>, perform the bounded task, and publish the required result with akeel_publish_artifact." --wait --timeout 120000
```

After Herdr settles, call `akeel_run_artifact` action `status`, then `collect`. Formal handoff succeeds only when collect verifies the bound identity, receipt, byte count, and digest and returns the artifact. `idle`, `done`, or terminal completion text alone is not success.

If the wait times out, stalls, or the child pauses for input, inspect its state before retrying:

```bash
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines 80
```

`herdr agent read` is diagnostic only. Never copy terminal output into a replacement artifact or silently treat it as formal delivery. A missing, partial, expired, replayed, or unverifiable artifact is a failed handoff and must be reported to the Task Owner.

## Cleanup

After verified collection, Owner disposition, and user approval, remove only the exact Herdr resources recorded for this run:

- **Worktree run**:
  ```bash
  herdr worktree remove --workspace <workspace-id>
  git branch -d <unique-branch>
  ```
- **Workspace run**:
  ```bash
  herdr workspace close <workspace-id>
  ```

The child never cleans itself. Artifact Exchange does not delete run directories; report the exact run path returned by Artifact Exchange for explicit user-managed cleanup. Never construct a physical runtime path, infer ownership from a prefix, or clean another run.
