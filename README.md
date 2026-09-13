# AKeel

Engineering skills and user-space access decisions for [Pi](https://pi.dev)-based AI coding.

## Install

Full package from Git:

```bash
pi install git:github.com/Lokyael/akeel
```

The package is also split into independently installable capabilities:

```bash
pi install npm:akeel-guidance        # bootstrap principles + skills
pi install npm:akeel-access-gate     # tool-call access decisions
pi install npm:akeel-context-pruner  # test-output context pruning
```

The `akeel` package is the full bundle. The capability package manifests are maintained under `packages/`; publishing them to npm is a release operation outside this repository change.

AKeel provides bootstrap principles and on-demand engineering skills. It does not create snapshots or provide a `/rollback` command.

## Access decisions

AKeel governs the managed `read`, `write`, `edit`, `find`, `grep`, `ls`, and `bash` tool surfaces. Other tool surfaces pass through unchanged. Decisions use a Pi-host-neutral canonical pipeline based on the supported Linux pathname contract; system hard boundaries and unsupported forms fail closed.

Shell analysis covers bounded Git operations, interpreter information commands, Python quality tools, and common uv/npm/pnpm/yarn/npx classifications. Git operations that may invoke repository or user-configured helpers remain hard-denied, including `status`, `diff`, `log`, `show`, `add`, `commit`, fetch/push/clone, related mutations, and `git config`. Script/package/download delegates and unknown subcommands remain opaque; explicit project path boundaries hard-deny them, and `develop` does not widen that boundary. Path-form executables remain opaque `execute` operations, while destructive forms remain hard-denied. Git `-C`, `--git-dir`, `--work-tree`, and explicit project-local `file://` paths are canonicalized; HTTPS/SSH, hosted `file://`, aliases, indirect config remotes, `clone --separate-git-dir`, and other unmodeled locations fail closed.

AKeel hard-denies managed path operations on identifiable live credential artifacts under the configured agent directory, including `auth.json` and non-template variants. Template-class artifacts remain policy-governed; parent-directory, recursive, and opaque accesses use path evidence rather than recursive credential expansion. `accessGate: disabled` removes AKeel's credential and tool-call protection guarantee.

## Policy configuration

The global policy input is:

```text
~/.pi/agent/akeel/policy.yaml    # $PI_CODING_AGENT_DIR replaces ~/.pi/agent
```

The built-in `review`, `guided`, and `develop` presets are always available. A missing, empty, malformed, legacy, or otherwise unusable `policy.yaml` is ignored as a whole and falls back to the least-privileged built-in `review`. Legacy `config.yaml`/Profile fields are not accepted as policy input. A valid file may select a built-in preset, define complete custom presets, use a flat `paths`/`commands` policy, or select the explicit `accessGate: disabled` form.

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
      destroy: deny
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
      destroy: deny
      unknown: ask
activePreset: develop
```

Policy configuration rules:

- Custom presets use strict lower-kebab-case names, complete `paths`/`commands` definitions, and optional independent `allowedRoots`, `blockedRoots`, and `blockedPaths`. Built-in names and the reserved `status` name remain fixed.
- A flat `paths`/`commands` policy uses the same complete schema as custom presets and is a single static policy without runtime switching.
- In native TUI mode, `/policy` opens the temporary selector for all loaded presets; `/policy status` reports the active preset; `/policy <preset>` switches it for the session. Outside native TUI, `/policy` reports status and does not switch automatically.
- Path and command modes are `allow`, `ask`, or `deny`. `destroy`/`delete` operations remain a permanent hard boundary even when `commands.destroy: allow` is configured. System hard boundaries take precedence over every preset.
- `ask` requires interactive host confirmation, never executes automatically, and shows bounded summaries with the literal Shell command form and without file content.
- Malformed YAML, unknown fields, incomplete definitions, conflicting names, and legacy fields cause the complete file to be ignored and the built-in `review` baseline to be used.

## Access Gate disabled mode

For a session that should retain only AKeel's bootstrap principles and skills, explicitly disable the Access Gate in `policy.yaml`:

```yaml
accessGate: disabled
```

This form is the only policy field and takes effect after a session restart. All Pi `tool_call` requests then pass through without AKeel operation or path admission; bootstrap and skills remain active. AKeel supplies no tool-call admission, path-boundary, Shell, or approval guarantee in this mode. Remove the setting and restart the session to restore the Gate.

## Test output context pruning

AKeel trims output from model-invoked `bash` tool results for standalone `npm test` and `npm run test` commands only when building model context. A run becomes `All tests passed` only when the host reports success and the output contains a recognized positive test-runner summary; arbitrary success text, zero-test runs, skipped/todo results, warnings, and uncertain formats remain unchanged. Failed runs retain failure cases, diagnostics, and stack traces. Cancelled or truncated results, non-test commands, and user-entered `!`/`!!` `bashExecution` messages are outside this feature and are never pruned. The original tool result remains in the session; this feature does not call a model.

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
