# AKeel

Engineering skills and user-space access decisions for [Pi](https://pi.dev)-based AI coding.

## Install

Full package from Git:

```bash
pi install git:github.com/Lokyael/akeel
```

The package is also split into independently installable capabilities:

```bash
pi install npm:akeel-guidance        # bootstrap + skills + workflow artifact transport
pi install npm:akeel-access-gate     # tool-call access decisions
pi install npm:akeel-context-pruner  # test-output context pruning
```

The `akeel` package is the full bundle. The capability package manifests are maintained under `packages/`; publishing them to npm is a release operation outside this repository change.

AKeel provides bootstrap principles and on-demand engineering skills. It does not create snapshots or provide a `/rollback` command.

## Access decisions

AKeel governs the managed `read`, `write`, `edit`, `find`, `grep`, `ls`, and `bash` tool surfaces when they are invoked by the model. Pi's `powershell` tool is explicitly blocked as unsupported on AKeel's Linux-only boundary; other genuinely unknown tool surfaces pass through unchanged, including user-entered `!`/`!!` commands. AKeel's Access Gate promise is limited to model tool-call permissions. Guidance's `akeel_run_artifact`, `akeel_publish_artifact`, and `akeel_handoff` are separate self-authorizing custom tools: their bounded capability and receipt contracts do not widen ordinary Access Gate policy. Private Direct and Shell semantic lanes converge on one sealed admission and authorization chain based on the supported Linux pathname contract; mandatory system boundaries precede configurable policy, while approval availability remains a Pi-host concern. System hard boundaries and unsupported forms fail closed.

Shell analysis covers bounded Git operations, interpreter information commands, Python quality tools, and common uv/npm/pnpm/yarn/npx classifications. Git inspect arguments and path facts remain bounded, but live `status`, `diff`, `log`, `show`, `rev-list`, and `stash show` may consult configured helpers; they retain inspect intent while also using the `opaque` policy axis, and `status` additionally consumes write policy because Git may refresh repository metadata; explicit `--no-optional-locks` suppresses that write effect but not the opaque helper risk. Built-in `review`, `guided`, and `develop` therefore deny, request approval, and allow these live inspections respectively. Metadata-only forms such as selected `branch`/`rev-parse` queries and `stash list` remain ordinary inspect reads. Explicit external drivers, remote/network helpers, unsafe mutations, and `git config` remain hard-denied; bounded local `add`/`commit` retain their existing modify contracts and Git control-artifact protection. Path-form executables remain opaque `execute` operations, while destructive forms remain hard-denied. Git `-C`, `--git-dir`, `--work-tree`, and explicit project-local `file://` paths are canonicalized; HTTPS/SSH, hosted `file://`, aliases, indirect config remotes, `clone --separate-git-dir`, and other unmodeled locations fail closed.

AKeel hard-denies managed path operations on identifiable live credential artifacts under the configured agent directory, including `auth.json` and non-template variants. Template-class artifacts remain policy-governed; parent-directory, recursive, and opaque accesses use path evidence rather than recursive credential expansion. `accessGate: off` removes AKeel's ordinary credential, path, and tool-call protection guarantee; mandatory unsupported host-surface boundaries such as Linux-only PowerShell rejection remain active.

## Policy configuration

The global policy input is:

```text
~/.pi/agent/akeel/policy.yaml    # $PI_CODING_AGENT_DIR replaces ~/.pi/agent
```

The built-in `review`, `guided`, and `develop` presets are always available. A missing, empty, malformed, legacy, or otherwise unusable `policy.yaml` is ignored as a whole and falls back to the least-privileged built-in `review`. Legacy `config.yaml`/Profile fields are not accepted as policy input. A valid file may select a built-in preset, define complete custom presets, use a flat `paths`/`commands` policy, or select the explicit `accessGate: off` form.

```yaml
presets:
  review:
    paths:
      read: allow
      write: deny
      edit: deny
      list: allow
      search: allow
    commands:
      inspect: allow
      modify: deny
      execute: deny
      opaque: deny
      destroy: deny
      unknown: deny
  guided:
    paths:
      read: allow
      write: ask
      edit: ask
      list: allow
      search: allow
    commands:
      inspect: allow
      modify: ask
      execute: ask
      opaque: ask
      destroy: ask
      unknown: deny
  develop:
    paths:
      read: allow
      write: allow
      edit: allow
      list: allow
      search: allow
    commands:
      inspect: allow
      modify: allow
      execute: allow
      opaque: allow
      destroy: ask
      unknown: ask
activePreset: develop
```

Policy configuration rules:

- Custom presets use strict lower-kebab-case names, complete `paths`/`commands` definitions, and optional independent `allowedRoots`, `blockedRoots`, and `blockedPaths`. Built-in names and the reserved `status` name remain fixed.
- Policy path entries must be absolute Linux paths; glob patterns and `~/` shorthand are invalid.
- A non-empty `allowedRoots` list limits managed paths to those roots and their descendants. When it is omitted or empty, the runtime supplies the session Access Root, session staging root, and `/tmp/akeel` as defaults. `blockedRoots` rejects each listed root and its descendants, while `blockedPaths` rejects exact paths; recursive search is also rejected when its starting path could reach a blocked descendant. Blocked scope wins over allowed scope, and path-scope violations cannot be approved through an `ask` mode.
- A flat `paths`/`commands` policy uses the same complete schema as custom presets and is a single static policy without runtime switching.
- In native TUI mode, `/policy` opens the temporary selector for all loaded presets; `/policy status` reports the active preset; `/policy <preset>` switches it for the session. Outside native TUI, `/policy` reports status and does not switch automatically.
- Path and command modes are `allow`, `ask`, or `deny`. `commands.opaque` is an independent mode for commands whose runtime path effects cannot be statically proven: built-in `review` denies, `guided` asks, and `develop` allows. It does not provide a sandbox or make `allowedRoots` enforce runtime script access. Unbounded or unproven `destroy`/`delete` operations (recursive deletions, directory removals, unmodeled commands, and path-form executables) remain a permanent hard boundary even when `commands.destroy: allow` is configured. Only bounded non-recursive `rm` commands with verified target paths are admitted through the configured `destroy` mode (built-in `review` denies, while `guided` and `develop` require interactive host confirmation `ask`; headless/no-UI fails closed). System hard boundaries take precedence over every preset.
- `ask` requires interactive host confirmation, never executes automatically, and shows bounded summaries with the literal Shell command form. Opaque approval is labeled as not fully statically verified; summaries never include file content or policy data.
- Malformed YAML, unknown fields, incomplete definitions, conflicting names, and legacy fields cause the complete file to be ignored and the built-in `review` baseline to be used.

## Access Gate off mode

For a session that should retain only AKeel's bootstrap principles and skills, explicitly turn off the Access Gate in `policy.yaml`:

```yaml
accessGate: off
```

This form is the only policy field. When configured, ordinary Pi `tool_call` requests pass through without AKeel operation or path admission; mandatory unsupported host-surface boundaries remain active. Bootstrap and skills remain active. In native TUI mode, the Gate can be dynamically enabled for the session at any time via `/policy <preset>` (or turned off via `/policy off`).

## Test output context pruning

AKeel trims output from model-invoked `bash` tool results for standalone `npm test` and `npm run test` commands only when building model context. A run becomes `All tests passed` only when the host reports success and the output contains a recognized positive test-runner summary; arbitrary success text, zero-test runs, skipped/todo results, warnings, and uncertain formats remain unchanged. Failed runs retain failure cases, diagnostics, and stack traces. Cancelled or truncated results, non-test commands, and user-entered `!`/`!!` `bashExecution` messages are outside this feature and are never pruned. The original tool result remains in the session; this feature does not call a model.

## Workflow artifacts and temporary resources

Guidance supplies a formal text-artifact channel for synchronous Herdr children. The Task Owner reserves a run and packet, binds one result slot to the exact Herdr workspace/pane/Agent, and starts Pi with that slot's opaque capability. When a read-only child depends on repository state, its immutable Owner packet carries the fixed Git status, staged/unstaged diffs, untracked inventory, refs, and OIDs; the child does not refresh live Git. A modifying child uses an isolated worktree and remains subject to its effective policy. The child publishes its single bounded artifact through `akeel_publish_artifact`, with destination, limits, and binding determined by the capability. The Owner accepts a result only after `akeel_run_artifact` verifies its receipt, length, digest, and binding. Herdr `idle`/`done` and terminal output are diagnostic state, not artifact delivery.

Session continuity is entirely session-embedded: `/handoff [optional-notes]` is the single user entry point. Live Semantic Units and Continuation Capsules are stored directly in Pi's native JSONL session files (`~/.pi/agent/sessions/`), with zero external filesystem footprint. They survive system reboots, eliminate orphan directories, and are automatically cleaned up when the session file is removed. `/handoff view` inspects the active capsule in the terminal without disk writes. When replacing sessions, the command verifies ledger state, invokes Pi's native parent-linked session replacement, and kicks off successor reconciliation. Successor sessions verify the workspace and classify every live semantic ID before a reconciliation entry is issued.

AKeel-owned temporary resources under `/tmp/akeel/` are classified by lifecycle:

```text
/tmp/akeel/
  sessions/session-<random>/staging/  # Access Gate session; crash retention applies
  runs/run-<random>/                  # Owner workflow packet/artifacts/control/quarantine
```

New controlled directories use private permissions. Session residue is reclaimed under the documented retention policy; workflow runs are retained for explicit user cleanup. Session handoff creates no external filesystem directories. Unrecognized filesystem entries are not claimed or removed.

## Companion tools

Optional companion tools provide research and isolated interactive workflows:

| Companion | Source | Role |
|-----------|--------|------|
| Herdr | [herdr.dev](https://herdr.dev) | Interactive context isolation for workflows that need it; not an AKeel runtime dependency |
| pi-search | `npm:@heyhuynhgiabuu/pi-search` | Web, code, library-documentation, repository, and URL research tools |

```bash
pi install npm:@heyhuynhgiabuu/pi-search
```

Install Herdr from its official documentation when an isolated interactive workflow needs it. Review third-party tools and packages before installing: terminal managers and Pi packages run with the user's system access.

### Environment variables

AKeel reads `PI_CODING_AGENT_DIR` to override the default agent directory. It reads no API keys. Companion tools read their own configuration.

## Project documentation

| Document | For |
|----------|-----|
| [CONTEXT.md](CONTEXT.md) | Current project context and active decision index |
| [docs/candidates.md](docs/candidates.md) | Non-binding candidates that are not adopted or committed work |
| [docs/decisions.md](docs/decisions.md) | Long-term architecture and policy decisions |
| [docs/task.md](docs/task.md) | Git-checkpointed active task records, cleared from the current tree after completion |
| [docs/traceability.md](docs/traceability.md) | External sources, adoption mapping, and license obligations |

## License

MIT
