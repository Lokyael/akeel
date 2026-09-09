# AKeel

Engineering skills and a user-space access-decision system for [pi](https://pi.dev).

## Install

```bash
pi install git:github.com/Lokyael/akeel
```

Principles and skills activate automatically. Skills load on demand.

AKeel includes always-on evidence-before-assertion principles plus on-demand TDD, code review, debugging, security review, planning, and related engineering skills. Recovery remains outside the package: use version control, editor history, or pi's session tree.

## Access decisions

AKeel governs the managed `read`, `write`, `edit`, `find`, `grep`, `ls`, and `bash` tool surfaces. Other tool surfaces pass through unchanged. Decisions are made by a Pi-host-neutral canonical pipeline using the supported Linux pathname contract; hard security boundaries and unsupported forms fail closed.

Shell program semantics cover bounded Git operations, interpreter information commands, Python quality tools, and common uv/npm/pnpm/yarn/npx classifications. Git operations that may invoke repository/user-configured helpers remain hard-denied; this includes `status`, `diff`, `log`, `show`, `add`, `commit`, fetch/push/clone and related mutation commands. `git config` is also hard-denied to avoid exposing implicit configuration credentials. Path-form executables are treated as opaque `execute` operations even when their basename matches a known non-destructive program; destructive forms remain hard-denied. Commands that delegate to scripts, package lifecycle hooks, downloads, or unknown subcommands remain opaque and are hard-denied when project path boundaries are active; `develop` does not disable that safety boundary. Git `-C`, `--git-dir`, and `--work-tree` paths plus explicit project-local `file://` remotes are canonicalized in the current command-local cwd seam; HTTPS/SSH and other external transports, hosted `file://` forms, aliases, indirect config remotes, `clone --separate-git-dir`, and other unmodeled location forms still fail closed.

The global policy input is:

```text
~/.pi/agent/akeel/policy.yaml    # $PI_CODING_AGENT_DIR replaces ~/.pi/agent
```

The built-in `review`, `guided`, and `develop` presets do not depend on an external policy file. If `policy.yaml` is missing, empty, malformed, legacy, or otherwise unusable, AKeel ignores the entire external file and uses the least-privileged built-in `review` preset; it does not partially apply the file or fall back to the former `config.yaml`/Profile configuration. A valid file may select a built-in preset, define custom presets, or use the explicit `accessGate: disabled` form.

AKeel applies a preset-independent hard boundary to identifiable live credential artifacts under the configured agent directory: `auth.json` and its non-template backup/variant paths are denied for managed path operations. Template-class artifacts remain subject to the active preset. Parent-directory listing and recursive or opaque accesses without a concrete credential path are not recursively expanded by this boundary; protection is path-evidence-driven best effort. When `accessGate: disabled`, AKeel provides no credential or tool-call protection guarantee.

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

The built-in named presets are `review`, `guided`, and `develop`. In preset mode they are always available and keep fixed, complete semantics; a valid `policy.yaml` may add custom presets with strict lower-kebab-case names. Custom presets use complete `paths` and `commands` definitions, may have their own `allowedRoots`, `blockedRoots`, and `blockedPaths`, and cannot override built-in semantics or use the reserved name `status`. A flat `paths`/`commands` policy remains valid as a single static policy without runtime switching and uses the same complete `paths`/`commands` schema as custom presets. In native TUI mode, use `/policy` to open the temporary selector for all loaded presets; use `/policy status` to show the active preset, or `/policy <preset>` to switch it explicitly for the current session. Outside native TUI, `/policy` does not open a selector or switch automatically. Path modes for `read`, `write`, `edit`, `list`, and `search` are `allow`, `ask`, or `deny`; command modes are `allow`, `ask`, or `deny`. `commands.destroy` may be set to `allow` in a custom preset, but Canonical `destroy`/`delete` operations are a permanent hard boundary and remain denied; the setting never produces an approval prompt. System hard boundaries remain ahead of every preset. `ask` requires an interactive host confirmation and never executes automatically. Confirmation summaries are bounded, include the literal Shell command form, and omit file content. The policy file is validated when loaded; malformed YAML, unknown fields, incomplete external policies, conflicting names, and legacy fields cause the entire external file to be ignored and the built-in `review` baseline to remain active.

The current release does not provide the legacy `/profile` command, a Profile Footer, or AKeel-managed subagent permission tiers. Subagent policy management remains a separate candidate; use `/policy` for the built-in or configured custom session presets.

For a session that should retain only AKeel's bootstrap principles and skills, explicitly disable the Access Gate in `policy.yaml`:

```yaml
accessGate: disabled
```

This form must be the only policy field. After restarting the session, all Pi `tool_call` requests pass through without AKeel operation or path admission. Bootstrap and skills remain active, but AKeel provides no tool-call security, path-boundary, Shell, or approval guarantee while disabled. Remove the setting and restart the session to re-enable the Gate.

## Companion tools

AKeel does not depend on a delegation runtime. Work stays in the main session when it needs no process-context isolation. Isolated work whose result returns for parent/user judgment uses Herdr. A delegated agent with effective write/edit/file-modifying Shell capability must run in an independently owned Git worktree. Unattended automatic multi-agent pipelines are not part of the current workflow.

`/skill:grill-docs` coordinates a separate Herdr worktree and Grill Agent, then returns `verified-candidate.md` to the main session for confirmed record updates.

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
