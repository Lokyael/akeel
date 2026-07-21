# Pi Keel

Engineering skills and an access-control system for [pi](https://pi.dev).

Pi Keel combines behavioral principles, engineering disciplines, workflows, and a Profile-driven access gate in one `pi install`. The gate is user-space policy enforcement; it is not an OS sandbox.

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

Principles and the access gate activate automatically. Skills load on demand.

## What's Inside

- **2 foundations** — always-on engineering principles and evidence-first verification
- **12 disciplines** — TDD, code review, debugging, security review, domain modeling, planning, documentation sync, and related practices
- **10 workflows** — design, grilling, implementation, rollback, handoff, and context workflows
- **Access profiles** — composable read/write path rules, Shell command decisions, one-time approval, hard protected paths, and threat scanning
- **Session-safe authorization** — each Session starts from the configured default Profile; approvals are `Allow once` only
- **Recovery boundary** — no automatic snapshots or rollback extension; use version control, editor history, or pi's session tree
- **Test coverage** — 24 skill validations and 146 access-gate assertions（Profile 5 + 路径 4 + 加载 4 + Gate 13 + Shell IR 54 + control-flow 21 + adapters 40 + 集成 2 + Footer 3）

## Access Gate

The active Profile is the only permission mode exposed to users. Built-ins include `file-read`, `project-read`, `research`, `plan`, `safe-write`, `project-write`, and `guarded-write`. Project-local Profile overrides are read only for Pi-trusted projects.

```text
/profile                 # Select a Profile
/profile <name>          # Activate a Profile
/profile status          # Show its detailed policy
```

The Footer wraps Pi's native `FooterComponent` when available and uses two lines: the active Profile name appears on the first line with the project location, while the second line retains Pi's native token, context, cost, model, and extension-status details. Standalone tests use a local rendering fallback when the Pi host package is unavailable. Unknown Shell commands use the Profile's `unclassified` decision. Network commands are not managed by a separate policy axis yet, so unclassified network commands require one-time approval in Profiles that allow it.

Hard threats, unsafe Shell syntax, symlink escapes, and blocked paths always deny and cannot be overridden by a Profile or approval.

## Documentation

| Document | For |
|----------|-----|
| [USAGE.md](USAGE.md) | Profile configuration, skills, security boundaries, and workflows |
| [CONTEXT.md](CONTEXT.md) | Current project context and active decision index |
| [docs/decisions.md](docs/decisions.md) | Long-term architecture and policy decisions |
| [docs/task.md](docs/task.md) | Current Access Gate security task |
| [docs/traceability.md](docs/traceability.md) | Sources, fusion decisions, and compliance traceability |
| [docs/security-boundaries.md](docs/security-boundaries.md) | Residual security boundaries |

## License

MIT
