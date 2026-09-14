---
name: herdr
description: Use when delegating isolated work to a Herdr child agent or coordinating a background sub-agent.
---

# Herdr Delegation

Use Herdr for isolated delegated work. The owning skill defines the task, evidence, report, and acceptance contract; Herdr manages execution and artifact handoff.

## Route the work

Load the skill that owns the work, then run it through Herdr when its process context should stay separate:

| Work | Skill |
|---|---|
| Context survey | `survey-context` |
| Requirements/design | `brainstorm-design` |
| Module/interface design | `module-design` |
| Reproduction/debugging | `bug-reproduction`, `systematic-debugging` |
| Planning/implementation | `implementation-planning`, `implement-work`, `test-driven-development` |
| Security scan | `security-review` |
| Independent review | `code-review` |
| Proposal/fact verification | `grill-docs` |
| Documentation sync | `doc-sync` |

## Start

Verify the current session:

```bash
test "${HERDR_ENV:-}" = 1
```

Use a background workspace by default:

```bash
herdr workspace create --cwd "$PWD" --label "<short-task-label>" --no-focus
```

Read `.result.workspace` and `.result.root_pane` from the JSON response. Start the child in the returned pane:

```bash
herdr agent start <unique-name> --kind pi --pane <pane-id> --timeout 30000
```

A child with `write`, `edit`, or file-modifying Shell capability uses an independent Herdr worktree. A genuinely read-only child may share the checkout.

## Run and join

Reserve the artifact path before prompting. Pass the owning skill's bounded task and artifact contract:

```bash
herdr agent prompt <name> "<task and artifact contract>" --wait --timeout 120000
```

After settlement, read the artifact. If the wait times out, inspect before retrying:

```bash
herdr agent get <name>
herdr agent read <name> --source recent-unwrapped --lines 80
```

A missing artifact is a failed handoff. A child blocked on user input requires user intervention.

## Cleanup

After the result is accepted and the user requests cleanup, verify exact resource ownership and remove only resources created by this run. Use non-force, exact-target operations. A child does not remove its own pane, workspace, worktree, or branch.
