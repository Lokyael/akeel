# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-098: Task checkpoint 与清档生命周期收敛

**Kind:** maintenance
**Status:** draft

### Goal

在不把 Task Record 变成步骤日志的前提下，固定最低 checkpoint 次数、事件驱动更新和完成即清档的生命周期，避免提交噪声与已完成任务污染新上下文。

### Requirements

- **R1 — 最低 checkpoint：** 从未有可达 checkpoint 的实质 Task，实施前必须先提交完整 Task Record；完成时再提交成果、必要的 durable updates 和清档，因此最低为两次提交。
- **R2 — 事件驱动：** 普通 Plan Slice、测试和实施步骤不得单独触发 Task Record 提交；只有跨会话、交接或 Requirements、Design、范围、权威裁决发生实质变化时才更新。
- **R3 — 立即清档：** 完成验证后，最终成果提交可以同时包含 durable updates 和 Task 清档；不得将清档延迟到下一 Task 完成。
- **R4 — 上下文边界：** routine survey 只读取当前树中的 active Task；已清档 Task 仅在需要核对 checkpoint 或审计时从 Git 历史按需读取。

### Design

以 `src/bootstrap/principles.md` 维护 Project Record 生命周期的权威规则；由 `skills/workflows/implement-work/SKILL.md` 编排 checkpoint、实施和完成清档；由 `skills/workflows/survey-context/SKILL.md` 明确当前树与 Git 历史的上下文边界。已有 D-028 继续作为 Project Record 模型的长期决策，不新增平行 Decision。

### Out of Scope

- **自动提交或 commit hook：** 当前没有可靠的宿主 enforcement seam；仅调整原则和 workflow 的执行合同，待宿主提供可测试 seam 时再评估。
- **历史提交改写：** 既有 Task checkpoint 由 Git 保留，不为新规则重写、压缩或迁移历史。

### Plan

#### Slice 1: 收敛 Task checkpoint 与清档合同

**Goal:** 原则、实施 workflow 和上下文 survey 对提交与清档生命周期使用同一规则。
**Requirements covered:** R1、R2、R3、R4
**Depends on:** none

**Acceptance Criteria:**
- [ ] `principles.md` 明确最低两次提交、事件驱动更新和完成即清档。
- [ ] `implement-work` 不要求步骤日志提交，并在最终成果阶段清档。
- [ ] `survey-context` 不把 Git 历史中的已清档 Task 作为 routine context。
- [ ] 相关文档校验、技能校验、TypeScript 检查和全量测试通过。

**Files and Seams:**
- Modify: `src/bootstrap/principles.md` — Project Record Record Lifecycle
- Modify: `skills/workflows/implement-work/SKILL.md` — Task lifecycle
- Modify: `skills/workflows/survey-context/SKILL.md` — active Task context boundary
- Test: `tests/validate-skills.test.ts` — workflow contract assertions

**Verification:**
- `npm run test:file -- tests/validate-skills.test.ts`
- `npm test`

**Steps:**
1. Rewrite the affected lifecycle clauses as one coherent contract.
2. Align the implementation and survey workflows without duplicating the format authority.
3. Add only the structural assertions needed to guard the workflow contract.
4. Run documentation, skill, type, and full validation.

### Evidence

- 用户已接受“实施前 checkpoint、完成时成果与清档、事件驱动更新”的设计。

### Durable Updates

- [ ] 核对 D-028、`CONTEXT.md` 和 `README.md`；若现有描述已一致则不新增 Decision 或重复说明。

## T-099: 待创建
