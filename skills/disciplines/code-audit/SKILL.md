---
name: code-audit
description: Use before code-review, before committing, or when the user asks for a code quality check — self-review checklist covering conventions, Boy Scout Rule, test coverage, types, SOLID, and agent readability.
---

# Audit Code

> **HARD GATE** — Audit must check for: bugs (correctness), security, performance, and clarity. Do NOT skip security review if code touches user data, auth, or external APIs.

Run this self-review before asking anyone else to look at the code. Catch everything clearly wrong so the reviewer can focus on design, not hygiene.

## Churn Heuristic

Before the checklist, rank changed files by churn and review **high-churn hotspots first**:

```bash
git log --since=90.days --format=format: --name-only | sort | uniq -c | sort -rn | head -15
```

## Checklist

### Supply Chain & Security
- [ ] No secrets in diff (`sk-`, `ghp_`, `AKIA`, `.env` values, `-----BEGIN` private keys)
- [ ] OWASP Top 10 spot-check: injection, broken auth, sensitive data exposure
- [ ] No `[SLOP]` packages without documented approval
- [ ] Security: diff scanned — no unaddressed HIGH findings

For a deep security scan instead of this spot-check, run `/skill:security-review`.

### Scope
- [ ] Changes limited to what was asked — nothing extra refactored
- [ ] No speculative features
- [ ] No files touched outside stated scope

### Boy Scout Rule
- [ ] Every file touched is cleaner than when found
- [ ] No dead code left behind
- [ ] No commented-out code blocks

### Types and Safety
- [ ] No `any` types introduced (TypeScript) / untyped public functions
- [ ] No `@ts-ignore` or `// eslint-disable` added
- [ ] No `as unknown as X` casts bypassing type safety

### Test Coverage
- [ ] Every new function has at least one test
- [ ] Every bug fix has a regression test
- [ ] Tests verify behavior through public interfaces
- [ ] Tests are F.I.R.S.T compliant: Fast, Independent, Repeatable, Self-Validating, Timely

### SOLID
- [ ] Single Responsibility: no function/module doing two unrelated things
- [ ] Open/Closed: extended through interfaces, not by modifying stable code
- [ ] Dependency Inversion: dependencies injected, not imported globally

### Code Style (Human + Agent Readability)

These checks serve both human reviewers and the agent's context-window readability — no separate list needed.

- [ ] Functions: 4–20 lines; split if longer — unless splitting would scatter a single cohesive concern
- [ ] Files: ~300 lines target.  Above 350 is a **smell** — investigate, but don't dogmatically split.  Do NOT split if:
  - the file guards a single concept and splitting would scatter it (§9 Centralize Don't Scatter)
  - module-private state (WeakSet, closure) couples functions that would need to share exported internals after splitting
  - the "overhead" section (imports, re-exports, section banners) accounts for the excess and core logic is within budget
  When the above apply, the file's size is justified — the smell is acknowledged and the limit does not apply.  Above ~500 lines, reconsider whether the module itself is doing too many things, not just whether it can be split.
- [ ] Names: specific and unique (grep returns < 5 hits)
- [ ] No duplication — shared logic extracted (DRY)
- [ ] Early returns over nested ifs; max 2 levels of indentation
- [ ] Comments explain WHY, not WHAT
- [ ] Types explicit: no `any`, no inferred return types for public APIs

### Red Flags

Before reporting, name any rationalization you caught yourself making for skipping an item.

## Output

Report with ✓ / ✗ per item. For each ✗, describe what needs fixing.

If all pass: suggest running `code-review` for independent second opinion.
If any fail: fix before proceeding.
