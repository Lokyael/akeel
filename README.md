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

The Footer wraps Pi's native `FooterComponent` when available and uses two lines: the active Profile name appears on the first line with the project location, while the second line retains Pi's native token, context, cost, model, and extension-status details. Standalone tests use a local rendering fallback when the Pi host package is unavailable. Shell commands without a matching adapter use the Profile's `unknown` decision; commands an adapter cannot safely analyze are hard-denied as opaque. Network commands are not managed by a separate policy axis yet, so unknown network commands require one-time approval in Profiles that allow it.

Hard threats, unsafe Shell syntax, symlink escapes, and blocked paths always deny and cannot be overridden by a Profile or approval. `ask` offers only `Allow once` and `Deny`; headless modes fail closed when approval would be required.

## Configuration

Pi Keel loads configuration only from the user agent directory (`~/.pi/agent` by default, or `$PI_CODING_AGENT_DIR`). Profiles and Shell command semantics are user-global configuration only.

### Profiles

Define user Profiles in `~/.pi/agent/pi-keel/profiles.json`. Built-ins load first; a user Profile can extend them, and `defaultProfile` selects the Profile used at the start of every Session.

```json
{
  "defaultProfile": "team-develop",
  "profiles": {
    "team-develop": {
      "description": "Project writes allowed; execution requires approval.",
      "extends": ["keel-develop"],
      "shellPolicy": {
        "execute": "ask"
      }
    }
  }
}
```

Profile decisions are `allow`, `ask`, or `deny`. Path rules independently control `read`, `list`, `search`, and `write`; use `/profile status` to inspect the fully resolved policy.

### Shell Command Overrides

Define user-only aliases, simple command semantics, and classification adjustments in `~/.pi/agent/pi-keel/command-overrides.yaml`:

```yaml
aliases:
  fd: find
  bat: cat

commands:
  docker:
    class: execute
    effects: [execute, network]
```

Built-in TypeScript adapters remain authoritative. Project-local override files are ignored, and unknown Direct tool surfaces are outside this configuration. See [D-024](docs/decisions.md#d-024-命令覆盖层) for the complete schema and precedence rules.

## Companion Packages

Recommended third-party packages that pair well with Pi Keel:

| Package | Source | What it adds |
|---------|--------|--------------|
| pi-search | `npm:@heyhuynhgiabuu/pi-search` | Research tools for the agent: web search, code search, library docs, repo Q&A, URL fetching, and Firecrawl scraping/crawling |
| pi-sticky-input | `npm:pi-sticky-input` | Keeps chat input, status widgets, and footer controls anchored while session history updates |

```bash
pi install npm:@heyhuynhgiabuu/pi-search
pi install npm:pi-sticky-input
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
| [docs/security-boundaries.md](docs/security-boundaries.md) | Residual security boundaries |

## License

MIT
