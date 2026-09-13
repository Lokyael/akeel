# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0100: 精简 Task 生命周期措辞并补强回归契约

**Kind:** maintenance
**Status:** in-progress

### Goal

在不改变 Task 生命周期语义的前提下，进一步整理 `implement-work` 的生命周期措辞，并补足已删除“最低两次提交”表述的回归保护。

### Requirements

- 保留实施前 checkpoint、可达历史核验、事件驱动 Task 更新、最终复审与完成清档。
- 仅优化 `implement-work` 的表达结构，不改变其执行顺序、审批边界或生命周期行为。
- 测试明确验证旧的“minimum two commits”措辞不会回归。
- 不修改 `principles.md`、`survey-context`、README、CONTEXT 或 Decisions 的语义。

### Design

将 `implement-work` 的生命周期段压缩为更直接的条件—动作—结果表达；在既有生命周期合同测试中加入禁止旧措辞的断言。保留执行必需约束在 workflow 动作点，不改用跨文件引用替代。

### Out of Scope

- Task 生命周期规则或状态机变更。
- 新增 checkpoint、清档机制或测试执行机制。
- 对用户暂存的 `docs/candidates.md` 变更进行处理。

### Plan

#### Slice 1: 整理生命周期措辞并锁定删除语义

**Goal:** workflow 更易扫描，旧最低提交次数规则不可回归。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] `implement-work` 保留完整生命周期动作且表达更紧凑。
- [ ] 生命周期测试拒绝旧的最低提交次数措辞。
- [ ] 相关测试与全量验证通过。

**Files and Seams:**
- Modify: `skills/workflows/implement-work/SKILL.md` — lifecycle wording
- Modify: `tests/validate-skills.test.ts` — lifecycle contract
- Do not modify: `src/bootstrap/principles.md`, `skills/workflows/survey-context/SKILL.md`

**Verification:**
- `npm run test:file -- tests/validate-skills.test.ts`
- `npm test`

**Steps:**
1. 先补充旧措辞禁止断言并确认测试失败。
2. 整理 workflow 生命周期段并恢复测试通过。
3. 执行全量验证并清档 Task。

### Evidence

- 用户接受进一步整理 `implement-work` 并补强旧措辞回归保护。

### Durable Updates

- [ ] 无；本次仅优化既有提示表达与测试保护。

## T-0101: 待创建
