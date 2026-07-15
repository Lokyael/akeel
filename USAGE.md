# Pi Keel — Usage

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

Verify with `/security status`. No configuration required — principles and security activate immediately.

## How It Works

```
pi 启动
  ├─ bootstrap.ts 注入 engineering-principles + evidence-first
  │   成为系统提示词的一部分，始终可见。compaction 后自动重新注入。
  │
  ├─ command-taxonomy.ts 统一命令分类体系
  │   phase.ts（PLAN 门控）和 detection.ts（威胁/shell-write）从此派生。
  │   加一条规则即可控制所有模式行为，无需多处同步。
  │
  ├─ security-gate/index.ts 五层拦截管道
  │   PLAN 门控 → 威胁扫描 → 密钥扫描 → shell-write 检测 → 权限评估
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
| `rollback-session` | Undoing unwanted changes — file snapshots, then session tree |

## Security

### Levels

| Level | Sandbox | Semantic Analysis | Permission | Content Scan |
|-------|---------|-------------------|------------|--------------|
| `strict` | ✅ Landlock | ✅ All rules | `*` = ask | ✅ |
| `standard` | — | ✅ Critical | `*` = ask | ✅ |
| `permissive` | — | — | `*` = allow | — |

```bash
/security status              # View current config
/security level standard      # Switch level
/security sandbox on          # Toggle sandbox
```

### Configuration

```
Global:  ~/.pi/agent/extensions/security-gate/config.json
Project: .pi/extensions/security-gate/config.json
```

See [config/presets.json](config/presets.json) for full examples. Project config overrides global.

### What Gets Blocked

All levels block: `rm -rf /`, `sudo rm *`, `curl URL | sh`, writes to `.env`/`*.pem`/`*.key`/`*.ppk`/`.netrc`.

Standard adds: `git push --force`, `git reset --hard`, `git clean -f`, `sudo *`, writes to `~/.ssh/*`/`~/.aws/*`/`~/.kube/*`/`~/.gnupg/*`/`*.pfx`/`*.p12`/`*.cred`/`*.credentials`/`.npmrc`/`.pypirc`/`/etc/passwd`/`/etc/shadow`/`**/.git/config`.

Shell bypasses (`sed -i .env`, `echo > .env`, `tee .env`, `cp /tmp/x .env`) are detected and blocked.

See `config/presets.json` — the single source of truth for all protected paths and security levels.

### Testing

```bash
# Command classification
npx tsx extensions/security-gate/taxonomy.test.ts  # 1123 tests

# Security gate end-to-end
npx tsx extensions/security-gate/gate.test.ts       # 39 tests
```

### Rollback

Every `write`/`edit` is automatically backed up to `.pi-keel/snapshots/`.

```bash
/rollback              # List snapshots
/rollback undo         # Restore most recent
/rollback undo file    # Restore specific file
/rollback undo 3       # Restore last 3 files
/rollback clean        # Clear all
```

## Common Workflows

### New Feature

```
/skill:survey-context        → assess project state
/skill:brainstorm-design     → design with HARD-GATE
/skill:plan-writing          → implementation plan
/skill:implement-work        → TDD → audit → review
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

### Rollback

```
/rollback                    → what was changed?
/rollback undo               → restore last change
/skill:rollback-session      → if conversation is also off-track
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

Copy the relevant section from `config/presets.json` to `.pi/extensions/security-gate/config.json` and customize. Project config merges over global.
