# Pi Keel

Engineering skills and an access-control system for [pi](https://pi.dev).

Pi Keel combines behavioral principles, engineering disciplines, workflows, and a Profile-driven access gate in one `pi install`. The gate is user-space policy enforcement; it is not an OS sandbox.

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

Principles and the access gate activate automatically. Skills load on demand.

## What's Inside

- **Injected principles and evidence-first verification** — session-wide engineering guidance plus explicit completion checks
- **Engineering disciplines** — TDD, code review, debugging, security review, domain modeling, planning, documentation sync, and related practices
- **User workflows** — design, grilling, implementation, rollback, handoff, and context workflows
- **Access profiles** — composable read/write path rules, Shell command decisions, one-time approval, hard protected paths, and threat scanning
- **Session-safe authorization** — each Session starts from the configured default Profile; approvals are `Allow once` only
- **Recovery boundary** — no automatic snapshots or rollback extension; use version control, editor history, or pi's session tree
- **Test coverage** — skill validation and access-gate assertions covering Profile, paths, Shell IR, command semantics, compiler, kernel, guidance, invariants, gate decisions, and extension integration

## Access Gate

The active Profile is the only permission mode exposed to users. Built-in definitions live in `src/access-gate/profile/builtins.json`; user Profiles load only from the global agent configuration. Use `/profile status` for the complete resolved policy instead of relying on a duplicated profile list.

```text
/profile                 # Select a Profile
/profile <name>          # Activate a Profile
/profile status          # Show its detailed policy
```

The Footer wraps Pi's native `FooterComponent` when available and uses two lines: the active Profile name appears on the first line with the project location, while the second line retains Pi's native token, context, cost, model, and extension-status details. Standalone tests use a local rendering fallback when the Pi host package is unavailable. Shell commands without a matching adapter use the Profile's `unknown` decision; commands an adapter cannot safely analyze are hard-denied as opaque. Network commands are not managed by a separate policy axis yet: modeled commands with network effects (e.g. `git push`) follow the Shell policy, while unknown network commands (e.g. `curl`, `wget`) require one-time approval in Profiles that allow it.

Hard threats, unsafe Shell syntax, symlink escapes, and blocked paths always deny and cannot be overridden by a Profile or approval. `ask` offers only `Allow once` and `Deny`; headless modes fail closed when approval would be required.

## Configuration

Pi Keel loads configuration **only** from the user agent directory (`~/.pi/agent` by default, or `$PI_CODING_AGENT_DIR`). All user configuration — Profiles, Shell command semantics, and optional tool modeling — is centralized in a single file:

```text
~/.pi/agent/pi-keel/config.yaml
```

```yaml
# pi-keel 唯一用户配置入口（D-041）
defaultProfile: team-develop

profiles:
  team-develop:
    description: Project writes allowed; execution requires approval.
    extends: [keel-develop]
    shellPolicy:
      execute: ask

subagentProfiles:
  worker: project

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

Profile decisions are `allow`, `ask`, or `deny`. Path rules independently control `read`, `list`, `search`, and `write`; use `/profile status` to inspect the fully resolved policy. Rule patterns match the resolved path in its virtual form (`project/**`, `staging/**`), absolute form (e.g. `/tmp/**`), or home-relative form (`~/...`, e.g. `~/.gitconfig`). Hard-blocked secret paths under `~/` (`.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker/config.json`, `.config/gcloud`) stay hard-denied regardless of rules.

### Command Semantics Overrides (`commands`)

The `commands` section extends or adjusts Shell command semantics declaratively; built-in TypeScript adapters remain authoritative. Resolution order: `commands` definitions → `aliases` → `commands` definitions (alias target) → built-in adapter → `reclassify`.

```yaml
# 别名：让未知命令复用已知 adapter 的完整语义分析
# （路径提取、效果推断和子命令解析全部沿用目标 adapter 的逻辑）。
# 键为显式作用域：裸名（仅裸调用）/ 完整路径字符串 / 路径前缀（以 / 结尾，
# 覆盖该前缀下所有路径形式；前缀键与路径形式均做 ./ 归一化；
# 精确键优先，最长前缀优先）
aliases:
  fd: find
  bat: cat
  exa: ls
  just: make
  "./node_modules/.bin/eslint": node   # 精确：npm 本地 eslint 按 node 语义
  "bin/": cat                          # 前缀：项目 bin/ 脚本只读语义（./bin/ 同样命中）

# 新命令定义：为没有对应 adapter 的命令提供声明式分类
# 适合只需分类、不需要路径提取的简单命令
commands:
  docker:
    class: execute
    effects: [execute, network]
    subcommands:
      ps: { class: inspect, effects: [read] }
      images: { class: inspect, effects: [read] }
      build: { class: execute, effects: [write, network] }

# 分类微调：修改内置 adapter 的分类结果
# pattern 是正则，匹配完整的子命令字符串（从第一个非选项参数起，空格连接）
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
```

### Optional Tool Modeling (`optionalAdapters`)

Pi Keel ships token-level command modeling for a few tools that are **not loaded by default**: they only take effect when you explicitly list them under `optionalAdapters`. This keeps the default adapter set closed and predictable, while giving you high-quality modeling (option-value consumption, per-subcommand classes) where the declarative `commands` section is too coarse. Enabling an unknown name fails closed — a loud error is reported and no optional adapters are loaded.

```yaml
optionalAdapters:
  - herdr
```

With `herdr` enabled, `herdr status` classifies as `inspect`, control subcommands (`agent`, `pane`, `workspace`, …) as `execute`, and `herdr update` as `execute` with a network effect; `--session`/`--remote` option values are consumed correctly. Without it, `herdr` keeps the default fallback (bare-name unknown / path-form execute).

Built-in TypeScript adapters remain authoritative. Project-local config files are ignored, and unknown Direct tool surfaces are outside this configuration. See [D-024](docs/decisions.md#d-024-命令覆盖层) for the overrides design and known limitations, and [D-041](docs/decisions.md#d-041-集中配置与可选工具建模configyaml--optionaladapters) for centralized config and optional adapters.

## Companion Packages

Recommended third-party packages that pair well with Pi Keel:

| Package | Source | What it adds |
|---------|--------|--------------|
| pi-subagents | `npm:pi-subagents` | Sub-agent delegation: parallel tasks, chains, async runs, and supervisor review. Children load Pi Keel's gate automatically (ambient extensions), and Pi Keel manages sub-agent permissions via tiered sub-agent Profiles (see [D-039](docs/decisions.md#d-039-子代理档位制pi-keel--pi-subagents))
| pi-search | `npm:@heyhuynhgiabuu/pi-search` | Research tools for the agent: web search, code search, library docs, repo Q&A, URL fetching, and Firecrawl scraping/crawling |
| herdr | `https://herdr.dev` | Terminal workspace manager for coding agents: persistent panes, tabs, and workspaces, agent lifecycle control, and background terminals that keep running after a session ends. Pairs with the herdr agent skill registered at `~/.pi/agent/skills/herdr` |

```bash
pi install npm:pi-subagents
pi install npm:@heyhuynhgiabuu/pi-search
```

Herdr is a standalone binary rather than a Pi package; install it with its own installer:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

Review the source of any third-party package before installing — Pi packages run with full system access.

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
