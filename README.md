# Pi Keel

Engineering skills and security system for [pi](https://pi.dev) — the keel that keeps AI coding steady.

Pi Keel fuses the best practices from four leading agent-skills communities into a single `pi install`: behavioral principles, engineering disciplines, orchestration workflows, and a layered security gate. The gate is policy enforcement in the extension; it does not install an OS-level sandbox.

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

Principles and security activate automatically. Skills load on-demand. No configuration required.

## What's Inside

- **2 foundations** — always-on behavioral principles (think first, simplicity, surgical changes, goal-driven, verify before claiming, keep docs in sync)
- **12 disciplines** — auto-matched engineering practices (TDD, code review, debugging, security review, domain modeling, planning, doc sync)
- **10 workflows** — user-invoked orchestration (brainstorming, grilling, implementing, rollback, handoff)
- **Security gate** — PLAN/BUILD shell policy, threat scan, shell-write and literal-read path policy, permission evaluation, canonical file path protection
- **Session-safe authorization** — PLAN/BUILD mode is owned per extension instance; new sessions start in PLAN and approvals are `Allow once` only
- **Recovery boundary** — no automatic file snapshots or `/rollback`; use version control, editor history, or pi session-tree recovery. Existing legacy snapshot data is never read or deleted by pi-keel.
- **Test coverage** — 1,192 taxonomy + 30 plan-gate + 33 permission-engine + 22 tool-gate + 23 path + 15 config + 5 phase + 5 index + 6 integration = 1,331 security assertions + skill validation gate

## Documentation

| Document | For |
|----------|-----|
| [USAGE.md](USAGE.md) | How to use every skill, configure security, and run common workflows |
| [docs/adr/INDEX.md](docs/adr/INDEX.md) | Why pi-keel is built the way it is — 13 current architecture decision records |
| [docs/traceability.md](docs/traceability.md) | Main community sources and adaptation decisions |
| [docs/security-boundaries.md](docs/security-boundaries.md) | Security boundaries recorded outside the implementation plan |

## License

MIT
