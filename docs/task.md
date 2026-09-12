# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-088: Task Record 的 Git 可达生命周期

**Kind:** maintenance
**Status:** in-progress

### Goal

确保每个已分配 T-ID 的完整 Task Record 至少进入一次 Git 可达历史，完成后再从当前树清除，消除只推进占位而没有 Task 历史的不可追溯状态。

### Requirements

- `docs/task.md` 与 flat `docs/task-<topic>.md` 继续由 Git 跟踪；Task 正文只在 active 生命周期存在于当前树。
- 实施开始前，已批准 Requirements 与必要 Design/Plan 必须作为 Task checkpoint 进入可达提交；不含实施的 Task 最迟也必须在清档前 checkpoint，占位推进或提交信息不能替代 Task Record。
- 进度只在跨会话、交接或实质改变权威输入时提交；不提交逐步日志。
- 完成时先验证 checkpoint 可达并提炼 durable content，再清除 Task；不得通过 squash/rewrite 删除唯一 checkpoint。
- 更新 D-028、恒定注入生命周期、`implement-work` 动作点和当前架构说明，不改变 C/D 生命周期。

### Design

D-028 只保留结论与理由，`principles.md` 单源定义 Git-backed Task lifecycle，`implement-work` 在实施与清档动作点执行 checkpoint 守卫；AGENTS、CONTEXT 与 README 只保留各自读取面所需的短说明。暂不修改 `validate-docs`：D-077 将其限定为确定性文档结构检查，Git 历史没有稳定的通用判定 seam。

### Out of Scope

- **外部 Issue/PR 取代 T 系列：** 会退役当前 Project Record 权威模型；仅在项目选择外部任务系统时重访。
- **全局 Git-history validator：** 对浅克隆、历史重写和当前尚未提交的 Task 缺少稳定判定；出现可移植 seam 后重访。
- **既有不可追溯 T-ID 回填：** 不能伪造历史正文；新合同从本任务 checkpoint 后约束后续生命周期。

### Plan

#### Slice 1: 建立 Git-backed Task 生命周期

**Goal:** Task checkpoint 在实施前进入 Git 历史，最终 HEAD 只保留活动 Task 或下一占位。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [x] D-028、principles 与 CONTEXT 使用一致的 Git 可达术语。
- [x] `implement-work` 明确 checkpoint、进度提交、清档与禁止 squash 的顺序。
- [x] 所有 principles 引用继续解析，仓库全量验证通过。

**Files and Seams:**
- Modify: `docs/decisions.md` — D-028
- Modify: `src/bootstrap/principles.md` — Project Records / Record Lifecycle
- Modify: `skills/workflows/implement-work/SKILL.md` — Lifecycle 与 completion action point
- Modify: `CONTEXT.md` — Task Record 当前事实与 workflow 架构
- Verify: `scripts/validate-skills.ts`、`scripts/validate-docs.ts` 的现有公共命令入口

**Verification:**
- `npm test`

**Steps:**
1. 将已批准 Git checkpoint 合同整合进 D-028 与 principles。
2. 更新 `implement-work` 的实施前和清档前动作顺序。
3. 同步 CONTEXT 并执行引用、文档和全量验证。

### Evidence

- D-028、principles、`implement-work`、AGENTS、CONTEXT 与 README 已统一 Task checkpoint、清档和禁止删除唯一 checkpoint 的合同。
- `npm test`：文档与 skills 校验通过，TypeScript 与测试通过。
- `git log --all -G'^## T-088:' -- docs/task.md ':(glob)docs/task-*.md'` 命中 checkpoint 提交 `0b723c1`；本 Task 仍保持 active，最终清档由 Task Owner 决定。

### Durable Updates

- [x] D-028 与 CONTEXT 反映当前合同。
- [x] 本 Task 已在 `0b723c1` 进入可达 checkpoint；最终清档仍待 Task Owner 完成。

## T-091: 提交预检的最小充分 Git 检查

**Kind:** maintenance
**Status:** in-progress

### Goal

让提交前变更预检先使用有界摘要，只有在证据不足时才展开详细 Git diff，避免无必要的大段历史与元数据输出。

### Requirements

- `change-preflight` 先检查状态、统计和 diff 校验结果，再判断是否需要详细 diff。
- 详细检查仅针对具体文件或 hunk，并由范围、归属或语义疑点触发。
- 默认不读取完整提交元数据或完整历史 diff。
- 不改变变更归属、完整工作面、清理范围和验证要求。

### Design

只修改 `skills/disciplines/change-preflight/SKILL.md`，在 Pin the Active Change 的检查步骤中加入最小充分输出顺序和按疑点展开的边界。不修改 `principles.md`、插件运行时代码或其他 skill。

### Out of Scope

- **全局所有 Git 检查：** 当前证据只涉及提交预检；其他流程出现同类问题时再单独评估是否提升为全局原则。
- **插件级输出拦截：** 这是 Agent 的检查策略，不改变运行时工具结果或模型 context。
- **审查历史代码卫生：** 继续遵守 change-preflight 只处理当前变更的边界。

### Plan

#### Slice 1: 收紧提交预检的 Git 输出范围

**Goal:** 提交预检默认使用摘要，疑点存在时才读取局部详细 diff。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] `change-preflight` 明确列出摘要优先和局部展开规则。
- [ ] skill 校验和全量测试通过。
- [ ] 其他 prompt surface、插件代码和行为保持不变。

**Files and Seams:**
- Modify: `skills/disciplines/change-preflight/SKILL.md` — Pin the Active Change inspection procedure
- Verify: `scripts/validate-skills.ts`、`npm test`

**Verification:**
- `npm test`

**Steps:**
1. 在现有变更面检查步骤加入摘要优先和疑点触发展开规则。
2. 运行 skills 校验、类型检查和全量测试。

### Evidence

- 用户已确认只修改 `change-preflight`，并明确要求实施；必要 Design 已获确认。

### Durable Updates

- [ ] 当前无新的长期决策或架构事实。

## T-092: 待创建
