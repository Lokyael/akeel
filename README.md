# AKeel

Engineering skills and a user-space access-decision system for [pi](https://pi.dev).

## Install

```bash
pi install git:github.com/Lokyael/akeel
```

Principles activate automatically; skills load on demand. The package includes evidence-before-assertion principles plus TDD, review, debugging, security, planning, and related engineering skills. AKeel does not create snapshots or provide a `/rollback` command.

## Access decisions

AKeel governs the managed `read`, `write`, `edit`, `find`, `grep`, `ls`, and `bash` tool surfaces. Other tool surfaces pass through unchanged. Decisions are made by a Pi-host-neutral canonical pipeline using the supported Linux pathname contract; hard security boundaries and unsupported forms fail closed.

Shell analysis covers bounded Git operations, interpreter information commands, Python quality tools, and common uv/npm/pnpm/yarn/npx classifications. Git operations that may invoke repository or user-configured helpers remain hard-denied, including `status`, `diff`, `log`, `show`, `add`, `commit`, fetch/push/clone, related mutations, and `git config`. Script/package/download delegates and unknown subcommands remain opaque; explicit project path boundaries hard-deny them, and `develop` does not widen that boundary. Path-form executables remain opaque `execute` operations, while destructive forms remain hard-denied. Git `-C`, `--git-dir`, `--work-tree`, and explicit project-local `file://` paths are canonicalized; HTTPS/SSH, hosted `file://`, aliases, indirect config remotes, `clone --separate-git-dir`, and other unmodeled locations fail closed.

The global policy input is:

```text
~/.pi/agent/akeel/policy.yaml    # $PI_CODING_AGENT_DIR replaces ~/.pi/agent
```

The built-in `review`, `guided`, and `develop` presets are always available. A missing, empty, malformed, legacy, or otherwise unusable `policy.yaml` is ignored as a whole and falls back to the least-privileged built-in `review`; the former `config.yaml`/Profile configuration has no fallback path. A valid file may select a built-in preset, define complete custom presets, use a flat `paths`/`commands` policy, or select the explicit `accessGate: disabled` form.

AKeel hard-denies managed path operations on identifiable live credential artifacts under the configured agent directory, including `auth.json` and non-template variants. Template-class artifacts remain policy-governed; parent-directory, recursive, and opaque accesses use path evidence rather than recursive credential expansion. `accessGate: disabled` removes AKeel's credential and tool-call protection guarantee.

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

Policy configuration follows these rules:

- Custom presets use strict lower-kebab-case names, complete `paths`/`commands` definitions, and optional independent `allowedRoots`, `blockedRoots`, and `blockedPaths`. Built-in semantics and the reserved `status` name remain fixed.
- A flat `paths`/`commands` policy uses the same complete schema as custom presets and is a single static policy without runtime switching. In native TUI mode, `/policy` opens the temporary selector for all loaded presets; `/policy status` reports the active preset and `/policy <preset>` switches it for the session. Outside native TUI, `/policy` does not open a selector or switch automatically.
- Path and command modes are `allow`, `ask`, or `deny`. `destroy`/`delete` operations remain a permanent hard boundary even when `commands.destroy: allow` is configured. System hard boundaries take precedence over every preset. `ask` requires interactive host confirmation, never executes automatically, and shows bounded summaries with the literal Shell command form and without file content.
- The loader validates the complete file. Malformed YAML, unknown fields, incomplete definitions, conflicting names, and legacy fields select the built-in `review` baseline.

The current release uses `/policy` rather than the legacy `/profile` command or Profile Footer. AKeel-managed subagent permission tiers remain a separate candidate.

For a session that should retain only AKeel's bootstrap principles and skills, explicitly disable the Access Gate in `policy.yaml`:

```yaml
accessGate: disabled
```

This form is the only policy field and takes effect after a session restart. All Pi `tool_call` requests then pass through without AKeel operation or path admission; bootstrap and skills remain active. AKeel supplies no tool-call security, path-boundary, Shell, or approval guarantee in this mode. Remove the setting and restart the session to restore the Gate.

## Companion tools

AKeel uses no delegation runtime of its own. Each task has one Task Owner Session; work stays with that Owner when it needs no process-context isolation, while isolated work that returns to that Owner uses a synchronous Herdr child and a prearranged artifact. A new Task Owner exists only when the user explicitly grants a mutually exclusive scope and independent acceptance. Delegated agents with effective write/edit/file-modifying Shell capability use independently owned Git worktrees, and parallel Task Owners follow the same checkout isolation. Unattended asynchronous child pipelines are outside the current workflow.

`/skill:grill-docs` runs a Grill Agent in a separate Herdr worktree, waits for it to settle, and pulls the exact pre-reserved `verified-candidate.md` path for Task Owner-confirmed record updates; the child does not push completion prompts or its transcript into the Owner context.

| Companion | Source | Bounded role |
|-----------|--------|--------------|
| Herdr | [herdr.dev](https://herdr.dev) | Preferred visible, interactive context-isolation surface; owns its panes and worktrees. It is not an AKeel runtime dependency. |
| pi-search | `npm:@heyhuynhgiabuu/pi-search` | Research tools for web search, code search, library docs, repo Q&A, URL fetching, and Firecrawl scraping/crawling. |

```bash
pi install npm:@heyhuynhgiabuu/pi-search
```

Install Herdr from its official documentation when the isolated interactive workflows are needed. Review third-party tools and packages before installing: terminal managers and Pi packages run with the user's system access.

### Environment variables

AKeel reads `PI_CODING_AGENT_DIR` to override the default agent directory. It reads no API keys. Companion tools read their own configuration.

## Documentation

| Document | For |
|----------|-----|
| [CONTEXT.md](CONTEXT.md) | Current project context and active decision index |
| [docs/candidates.md](docs/candidates.md) | Non-binding candidates that are not adopted or committed work |
| [docs/decisions.md](docs/decisions.md) | Long-term architecture and policy decisions |
| [docs/task.md](docs/task.md) | Active task records |
| [docs/traceability.md](docs/traceability.md) | External sources, adoption mapping, and license obligations |

## License

MIT
