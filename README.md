# Pi Keel

Engineering skills and an access-control system for [pi](https://pi.dev).

Pi Keel combines behavioral principles, engineering disciplines, workflows, and a Profile-driven access gate in one `pi install`. The gate is user-space policy enforcement; it is not an OS sandbox.

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

Principles and the access gate activate automatically. Skills load on demand.

## What's Inside

- **Injected principles + engineering disciplines + user workflows** — evidence-first verification, TDD, code review, debugging, security review, domain modeling, planning, implementation, and related practices
- **Access profiles** — composable read/write path rules, Shell command decisions, one-time approval, hard protected paths, and threat scanning
- **Session-safe authorization** — each Session starts from the configured default Profile; approvals are `Allow once` only
- **Recovery boundary** — no automatic snapshots or rollback; use version control, editor history, or pi's session tree

## Access Gate

The active Profile is the only permission mode exposed to users. Built-ins live in `src/access-gate/profile/builtins.json`; user Profiles load only from the global agent configuration. Use `/profile status` for the complete resolved policy.

```text
/profile                 # Select a Profile
/profile <name>          # Activate a Profile
/profile status          # Show its detailed policy
```

The Footer shows the active Profile and project location on the first line, with Pi's native token/context/model details on the second. Shell commands without a matching adapter use the Profile's `unknown` decision; commands an adapter cannot safely analyze are hard-denied as opaque. Network effects follow Shell policy (e.g. `git push`); unknown network commands (`curl`, `wget`) require one-time approval in Profiles that allow it.

Hard threats, unsafe Shell syntax, symlink escapes, and blocked paths always deny and cannot be overridden by a Profile or approval. `ask` offers only `Allow once` and `Deny`; headless modes fail closed when approval would be required.

## Configuration

All user configuration — Profiles, Shell command semantics, and optional tool modeling — is centralized in a single file:

```text
~/.pi/agent/pi-keel/config.yaml        # $PI_CODING_AGENT_DIR replaces ~/.pi/agent
```

```yaml
defaultProfile: team-develop

profiles:
  team-develop:
    description: Project writes allowed; execution requires approval.
    extends: [keel-develop]
    shellPolicy:
      execute: ask

subagentProfiles:
  worker: project   # scratch → keel-explore；project → keel-subagent-project（D-039）

commands:
  aliases:
    fd: find
  commands:
    docker:
      class: execute
      effects: [execute, network]

optionalAdapters:
  - herdr
```

Profile decisions are `allow`, `ask`, or `deny`. Path rules independently control `read`, `list`, `search`, and `write`; patterns match virtual (`project/**`), absolute (e.g. `/tmp/**`), or home-relative (`~/...`) forms. Hard-blocked secret paths under `~/` (`.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker/config.json`, `.config/gcloud`) stay hard-denied regardless of rules.

### Command Semantics Overrides (`commands`)

Extends or adjusts Shell command semantics declaratively; built-in TypeScript adapters remain authoritative. Resolution order: `commands` definitions → `aliases` → `commands` definitions (alias target) → built-in adapter → `reclassify`.

```yaml
aliases:
  fd: find
  bat: cat
  just: make
  "./node_modules/.bin/eslint": node   # 精确键；前缀键（如 "bin/"）覆盖整个前缀
commands:
  docker:
    class: execute
    effects: [execute, network]
    subcommands:
      ps: { class: inspect, effects: [read] }
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
```

Alias keys are explicit-scope: bare name, full path, or path prefix. `reclassify` patterns are regexes matched against the subcommand string. See [D-024](docs/decisions.md#d-024-命令覆盖层) for the design and known limitations.

### Optional Tool Modeling (`optionalAdapters`)

Token-level modeling for a few tools that are **not loaded by default**; list them under `optionalAdapters` to enable. This keeps the default adapter set closed and predictable. Enabling an unknown name fails closed — a loud error is reported and no optional adapters are loaded.

Shipped adapter — `herdr` (terminal workspace manager, https://herdr.dev):

```yaml
optionalAdapters:
  - herdr
```

With `herdr` enabled, `herdr status` classifies as `inspect`, control subcommands (`agent`, `pane`, `workspace`, …) as `execute`, and `herdr update` as `execute` with a network effect; `--session`/`--remote` option values are consumed correctly. Without it, `herdr` keeps the default fallback (bare-name unknown / path-form execute). Pairs with the herdr agent skill registered at `~/.pi/agent/skills/herdr`. See [D-041](docs/decisions.md#d-041-集中配置与可选工具建模configyaml--optionaladapters) for the centralized-config design.

## Companion Packages

Recommended third-party packages that pair well with Pi Keel:

| Package | Source | What it adds |
|---------|--------|--------------|
| pi-subagents | `npm:pi-subagents` | Sub-agent delegation: parallel tasks, chains, async runs, and supervisor review. Children load Pi Keel's gate automatically (ambient extensions), and Pi Keel manages sub-agent permissions via tiered sub-agent Profiles (see [D-039](docs/decisions.md#d-039-子代理档位制pi-keel--pi-subagents)) |
| pi-search | `npm:@heyhuynhgiabuu/pi-search` | Research tools for the agent: web search, code search, library docs, repo Q&A, URL fetching, and Firecrawl scraping/crawling |
| herdr | `https://herdr.dev` | Terminal workspace manager for coding agents: persistent panes, tabs, and workspaces, agent lifecycle control, and background terminals that keep running after a session ends |

```bash
pi install npm:pi-subagents
pi install npm:@heyhuynhgiabuu/pi-search
```

Herdr is a standalone binary rather than a Pi package; install it with its own installer:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

Review the source of any third-party package before installing — Pi packages run with full system access.

### Recommended environment variables

Pi Keel reads internal environment variables only — `PI_CODING_AGENT_DIR` (agent directory override, see Configuration) and sub-agent tier variables (`PI_SUBAGENT_CHILD`/`PI_SUBAGENT_CHILD_AGENT`/`PI_KEEL_PARENT_TIER`, see [D-039](docs/decisions.md#d-039-子代理档位制pi-keel--pi-subagents)). It reads no API keys. The companion packages read their own configuration — set these in your shell profile, or equivalently in `~/.pi/pi-search.json` (environment variables take precedence):

| Variable | Package | Effect | Without it |
|----------|---------|--------|------------|
| `EXA_API_KEY` | pi-search | `websearch`/`codesearch` call Exa REST directly: `searchType: deep`, `recencyFilter`, `domainFilter`, `highlights` | Falls back to the public Exa MCP server — narrower feature set |
| `FIRECRAWL_API_KEY` | pi-search | Enables `firecrawl_scrape` and `firecrawl_crawl` | Those two tools always fail |
| `BRAVE_API_KEY` | pi-search | Optional `websearch` failover when Exa is unavailable | No failover (a free key is available) |
| `GITHUB_TOKEN` / `GH_TOKEN` | pi-search | Avoids GitHub API rate limiting (HTTP 403) in `web_fetch` for GitHub URLs | Intermittent 403s when fetching GitHub content |

```bash
# shell profile (or the equivalent keys in ~/.pi/pi-search.json)
export EXA_API_KEY=your-exa-key
export FIRECRAWL_API_KEY=your-firecrawl-key
export GITHUB_TOKEN=your-github-token   # optional
```

See the [pi-search README](https://github.com/heyhuynhgiabuu/pi-search) for the full configuration reference.

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
