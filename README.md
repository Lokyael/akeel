# AKeel

Engineering skills and a user-space access-decision system for [pi](https://pi.dev).

## Install

```bash
pi install git:github.com/Lokyael/akeel
```

Principles and skills activate automatically. Skills load on demand.

AKeel includes evidence-first verification, TDD, code review, debugging, security review, planning, and related engineering disciplines. Recovery remains outside the package: use version control, editor history, or pi's session tree.

## Access decisions

AKeel governs the managed `read`, `write`, `edit`, `find`, `grep`, `ls`, and `bash` tool surfaces. Other tool surfaces pass through unchanged. Decisions are made by a Pi-host-neutral canonical pipeline using the supported Linux pathname contract; hard security boundaries and unsupported forms fail closed.

The global policy input is:

```text
~/.pi/agent/akeel/policy.yaml    # $PI_CODING_AGENT_DIR replaces ~/.pi/agent
```

A missing policy file denies all managed operations. The file is a new schema and is not compatible with the former `config.yaml` or Profile configuration.

```yaml
paths:
  read: allow
  write: ask
  list: allow
  search: allow
  allowedRoots:
    - /workspace/project
commands:
  inspect: allow
  modify: ask
  execute: deny
  destroy: deny
  unknown: deny
```

Path modes are `allow`, `ask`, or `deny`; command modes are `allow`, `ask`, or `deny`. The policy may narrow access with `allowedRoots`, `blockedRoots`, and `blockedPaths`. `ask` requires an interactive host confirmation and never executes automatically. Confirmation summaries are bounded, include the literal Shell command form, and omit file content. The policy file is validated when loaded; malformed YAML, unknown fields, and legacy fields fail closed.

The current release does not provide `/profile`, a Profile Footer, policy-selection UI, or AKeel-managed subagent permission tiers. These capabilities require separate future work.

## Companion packages

Recommended third-party packages that pair well with AKeel:

| Package | Source | What it adds |
|---------|--------|--------------|
| pi-subagents | `npm:pi-subagents` | Parallel tasks, chains, async runs, and supervisor review. It is independent of AKeel's access-decision policy. |
| pi-search | `npm:@heyhuynhgiabuu/pi-search` | Research tools for web search, code search, library docs, repo Q&A, URL fetching, and Firecrawl scraping/crawling |

```bash
pi install npm:pi-subagents
pi install npm:@heyhuynhgiabuu/pi-search
```

Review third-party packages before installing: Pi packages run with full system access.

### Environment variables

AKeel reads `PI_CODING_AGENT_DIR` to override the default agent directory. It reads no API keys. Companion packages read their own configuration.

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
