# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-099: Task checkpoint 生命周期措辞收敛

**Kind:** maintenance
**Status:** draft

### Goal

整体重写 Task checkpoint、更新、清档和上下文边界的操作措辞，去除可由规则结构准确推出的重复说明，同时保留不可省略的动作约束。

### Requirements

- 保留实施前 checkpoint、事件驱动 Task 更新、完成即清档和当前树上下文边界。
- 删除“最低两次提交”及其同义说明，不把推导结果单独包装成规则。
- 原则只定义生命周期；workflow 只定义执行动作；survey 只定义读取边界。
- 不修改 D-028、README 或 CONTEXT；不保留重复规则。

### Design

整体重写 `principles.md` 的生命周期段、`implement-work` 的生命周期动作和 `survey-context` 的 Task 读取段；同步最小化技能合同测试。已有 checkpoint 由 Git 保留，完成后清档。

### Out of Scope

- **Task 生命周期语义：** 只压缩表达，不改变 checkpoint、清档或历史保留行为；若行为需要改变，另立设计。
- **模型能力评测：** 不以未核实的模型版本能力作为规则依据；只保留跨模型稳定的动作边界。

### Plan

#### Slice 1: 整体重写 Task 生命周期提示面

**Goal:** 三个提示面以最少且一致的措辞表达同一生命周期。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] 三个目标文件不再专门说明最低提交次数。
- [ ] checkpoint、事件驱动更新、完成清档和当前树读取边界仍明确。
- [ ] 技能合同测试与全量验证通过。

**Files and Seams:**
- Modify: `src/bootstrap/principles.md` — Project Record lifecycle
- Modify: `skills/workflows/implement-work/SKILL.md` — implementation lifecycle
- Modify: `skills/workflows/survey-context/SKILL.md` — Task context boundary
- Test: `tests/validate-skills.test.ts` — lifecycle contract

**Verification:**
- `npm test`

**Steps:**
1. 整体重写三个提示面的相关段落。
2. 删除冗余合同断言，保留必要边界断言。
3. 执行全量验证并清档 Task。

### Evidence

- 用户明确要求整体重写，并删除对最低提交次数的专门说明。

### Durable Updates

- [ ] 核对 D-028、`README.md` 和 `CONTEXT.md`；保持现有长期决策与当前事实不变。

## T-100: 待创建
