---
name: code-audit
description: Use before code-review, before committing, or when the user asks for a code quality check, `/audit cleanup`, `clean up`, or `整理代码` — self-review checklist covering conventions, Boy Scout Rule, test coverage, types, SOLID, agent readability, and a post-milestone cleanup workflow.
---

# Audit Code

> **HARD GATE** — Audit must check for: bugs (correctness), security, performance, and clarity. Do NOT skip security review if code touches user data, auth, or external APIs.

Run this self-review before asking anyone else to look at the code. Catch everything clearly wrong so the reviewer can focus on design, not hygiene.

**If triggered by `clean up` / `整理代码`:** skip the checklist and go directly to "阶段性清理" below.

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

### Code Style
- [ ] Functions: 4–20 lines; split if longer — unless splitting would scatter a single cohesive concern
- [ ] Files: ~300 lines target.  Above 350 is a **smell** — investigate, but don't dogmatically split.  Do NOT split if:
  - the file guards a single concept and splitting would scatter it (§8 Centralize Don't Scatter)
  - module-private state (WeakSet, closure) couples functions that would need to share exported internals after splitting
  - the "overhead" section (imports, re-exports, section banners) accounts for the excess and core logic is within budget
  When the above apply, the file's size is justified — the smell is acknowledged and the limit does not apply.  Above ~500 lines, reconsider whether the module itself is doing too many things, not just whether it can be split.
- [ ] Names: specific and unique (grep returns < 5 hits)
- [ ] No duplication — shared logic extracted (DRY)
- [ ] Early returns over nested ifs; max 2 levels of indentation
- [ ] Comments explain WHY, not WHAT

### Agent Readability (Akita's Lens)
- [ ] Functions small enough for context window (4–20 lines)
- [ ] Names unique enough to grep (< 5 hits)
- [ ] Types explicit (no `any`, no inferred return types for public APIs)
- [ ] Code avoids deep nesting (max 2 levels), uses early returns

### 阶段性清理（开发阶段完成后 / `clean up` / `整理代码`）

当用户表示一个开发阶段结束、准备合并或发布时，按以下顺序系统清理：

1. **死代码**
   - `npx tsc --noEmit` 确认零错误
   - 对每个 `export` 执行 `grep -rn <name> src/ tests/`，无引用方则删除
   - 检查 import 列表，移除未使用的导入

2. **重复逻辑**
   - 找相似度高的代码块（相同函数签名、相同控制流结构）
   - 评估：抽取后的接口复杂度 > 节省的代码行数 → 不抽取
   - 仅抽取"改一处即全局生效"的重复

3. **长文件**
   - 超过 ~350 行的文件，检查是否有独立职责可拆出
   - 拆分标准：可独立命名、可独立测试、有明确单一职责
   - **不拆的情形（满足任一即保留原样，不限行数）：**
     - 模块私有状态（WeakSet、闭包变量）被多个函数共享，拆分后必须导出 → 打破安全边界
     - 多个函数共同守卫一个概念（如 request 构造+验证），拆开后概念散落两处 → 违反 §8
     - 超出部分来自 import/export 声明、section banner 等结构性开销，核心逻辑在大约 300 行以内
   - 不拆但超过 ~500 行：重新审视模块职责是否过于庞杂，考虑通过重构（而非拆分文件）来简化

4. **模块边界**
   - imports 是否形成单向依赖树（不应有循环引用）
   - 同一抽象层级的概念是否放在同一个模块中
   - 路径深度 > 4 层时检查是否可以扁平化

5. **测试清理**
   - 相同输入 + 相同断言 → 合并为一个参数化用例
   - 断言覆盖唯一路径（equivalence class 每类一个），不重复验证同一行为
   - 删除"为了覆盖率"写的、不测试实际行为的测试

6. **文档同步**
   - 运行 `doc-sync` 技能检查过期引用、stale 计数
   - 近期变更的模块、API、配置项是否有对应文档更新

### Red Flags

Before reporting, name any rationalization you caught yourself making for skipping an item.

## Output

Report with ✓ / ✗ per item. For each ✗, describe what needs fixing.

If all pass: suggest running `code-review` for independent second opinion.
If any fail: fix before proceeding.
