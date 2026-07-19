# Pi Keel — Usage

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

Verify with `/security status`. No configuration required — principles and security activate immediately.

## How It Works

```
pi 启动
  ├─ src/bootstrap/index.ts 注入 engineering-principles + evidence-first
  │   成为系统提示词的一部分，始终可见。compaction 后自动重新注入。
  │
  ├─ taxonomy/ 统一受限 shell 词法和命令分类
  │   taxonomy/index.ts 是公共入口，commands.ts 是规则数据唯一来源。
  │   pipeline/plan-gate.ts（PLAN 门控）和 pipeline/bash.ts（BUILD 评估）从此派生。
  │   literal read/write intent 进入统一 policy/path.ts。
  │
  ├─ security-gate/index.ts 分层拦截管道
  │   PLAN 门控 → critical/threat 扫描 → shell/path policy → 权限评估
  │
  ├─ skills/disciplines/ 的 name + description 出现在 <available_skills>
  │   模型根据任务自动匹配，通过 read 工具加载完整 SKILL.md。
  │
  └─ skills/workflows/ 注册为 /skill:name 命令
      用户主动调用时加载 SKILL.md。
```

## Skills Reference

### Foundations (always active)

| Skill | Principle |
|-------|-----------|
| `engineering-principles` | Think First, Simplicity, Surgical Changes, Goal-Driven Execution, Verify Before Claiming, Keep Docs in Sync |
| `evidence-first` | No completion claims without fresh verification evidence |

### Disciplines (auto-matched)

| Skill | Use When |
|-------|----------|
| `test-driven-development` | Implementing features or fixing bugs — red-green-refactor with seams |
| `code-review` | Reviewing changes — two-axis parallel review (Standards + Spec) |
| `systematic-debugging` | Any bug or test failure — 4-phase root cause analysis |
| `bug-diagnosis` | Hard/intermittent bugs — build a tight feedback loop first |
| `security-review` | Before merge — 5-phase CWE-mapped security scan |
| `code-audit` | Before code-review — self-review checklist |
| `domain-modeling` | Defining project terminology — build CONTEXT.md + ADRs |
| `codebase-design` | Designing modules — deep module principles |
| `plan-writing` | Before implementation — bite-sized task plans with exact file paths |
| `fix-validation` | After fixing — prove the fix works with fresh evidence |
| `bug-investigation` | Bug reported — gather evidence, write bug file |
| `doc-sync` | After code changes — verify docs for stale counts, broken refs, outdated architecture |

### Workflows (user-invoked)

| Skill | Use When |
|-------|----------|
| `brainstorm-design` | Starting new work — HARD-GATE: no code without design approval |
| `grill-plan` | Stress-testing a plan — one question at a time until every decision is resolved |
| `grill-docs` | Plan relies on external libraries — doc-grounded grilling that creates ADRs |
| `improve-architecture` | Scanning for deepening opportunities — visual HTML report |
| `implement-work` | Ready to build — orchestrates TDD → code-audit → code-review |
| `survey-context` | Starting a session or returning after a break — "where am I?" |
| `handoff-session` | Handing work to a fresh session — compact conversation to handoff doc |
| `draft-spec` | Turn conversation into formal spec |
| `draft-tickets` | Break spec into independent, tracer-bullet tickets |
| `rollback-session` | Recovering unwanted changes — version control and session tree; no automatic file snapshots |

## Security

### Levels

| Level | Semantic analysis | Permission |
|-------|-------------------|------------|
| `strict` | all hard boundaries + configured rules | `*` = ask |
| `standard` | all hard boundaries + configured rules | `*` = ask |
| `permissive` | critical/hard boundaries remain | `*` = allow |

```bash
/security status              # View current config
/security level standard      # Switch level
```

### Configuration

```
Global:  ~/.pi/agent/extensions/security-gate/config.json
Project: .pi/extensions/security-gate/config.json
```

See [src/security-gate/config/presets.json](src/security-gate/config/presets.json) for full examples. Project config overrides global. Unknown top-level configuration fields are rejected.

### What Gets Blocked

All levels block: `rm -rf /`, `sudo rm *`, `curl URL | sh`, writes to `.env`/`*.pem`/`*.key`/`*.ppk`/`.netrc`.

Standard adds: `git push --force`, `git reset --hard`, `git clean -f`, `sudo *`, writes to `~/.ssh/*`/`~/.aws/*`/`~/.kube/*`/`~/.gnupg/*`/`*.pfx`/`*.p12`/`*.cred`/`*.credentials`/`.npmrc`/`.pypirc`/`/etc/passwd`/`/etc/shadow`/`**/.git/config`.

Shell bypasses (`sed -i .env`, `echo > .env`, `tee .env`, `cp /tmp/x .env`) are detected and blocked.

See `src/security-gate/config/presets.json` — the single source of truth for all protected paths and security levels.

### Session And Authorization

PLAN/BUILD mode belongs to the current `securityGate(pi)` extension instance. A new session or session replacement resets the controller to PLAN; `session_tree` keeps the current mode because it remains the same extension instance. Headless `/plan` and `/build` commands do not change mode.

Permission prompts offer only `Allow once` and `Deny`. There is no session-wide allow, and a prior PLAN decision is never reused by BUILD. Critical taxonomy rules, unsafe syntax, dynamic execution, unknown commands, and immutable path denials cannot be bypassed by configuration allow or one-time approval.

`/security status` reports the active command/path policy. Pi-keel does not provide or install a sandbox, Landlock, seccomp, network namespace, or other kernel-level isolation.

### Testing

```bash
npm test

npx tsx tests/security-gate/taxonomy.test.ts        # 1192 assertions
npx tsx tests/security-gate/plan-gate.test.ts       # 30 assertions
npx tsx tests/security-gate/permission-engine.test.ts # 33 assertions
npx tsx tests/security-gate/tool-gate.test.ts       # 22 assertions
npx tsx tests/security-gate/path.test.ts            # 23 assertions
npx tsx tests/security-gate/config.test.ts          # 15 assertions
npx tsx tests/security-gate/phase.test.ts           # 5 assertions
npx tsx tests/security-gate/index.test.ts           # 5 assertions
npx tsx tests/security-gate/integration.test.ts     # 6 assertions
```

### Recovery

pi-keel no longer creates, reads, restores, manages, or cleans up snapshots and does not register `/rollback`. Existing `.pi-keel/snapshots/` data is not a recovery source and is left untouched. Use version control, editor history, or pi's `/tree` for recovery.

## Common Workflows

### New Feature

```
/skill:survey-context        → assess project state
/skill:brainstorm-design     → design with HARD-GATE
/skill:plan-writing          → implementation plan
/skill:implement-work        → TDD → code-audit → code-review
```

### Bug Fix

```
/skill:bug-investigation     → gather evidence, write bug file
  → systematic-debugging auto-activates
  → test-driven-development auto-activates
  → fix-validation auto-activates
```

### Code Review

```
/skill:code-review           → two-axis review
/skill:security-review       → if touching auth/data/API
```

### Handoff

```
/skill:handoff-session       → compact session to /tmp/handoff-*.md
```

## FAQ

### Does compaction remove the principles?

No. Bootstrap re-injects `engineering-principles` and `evidence-first` after every compaction.

### Can I disable a skill?

Yes. In `~/.pi/agent/settings.json`:

```json
{ "pi": { "skills": { "disabled": ["code-audit"] } } }
```

### What if a skill doesn't activate when it should?

Try `/skill:survey-context` first — it will recommend the right next step. You can also invoke any skill manually with `/skill:name`.

### How do I add project-specific security rules?

Copy the relevant section from `src/security-gate/config/presets.json` to `.pi/extensions/security-gate/config.json` and customize. Project config merges over global.
