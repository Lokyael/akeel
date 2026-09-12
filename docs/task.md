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
- `npm test`：文档与 19 个 skills 校验通过，TypeScript 与 326 个测试通过。
- `git log --all -G'^## T-088:' -- docs/task.md ':(glob)docs/task-*.md'` 无输出：本 Task 尚未进入可达 checkpoint，因此保持 active，不清档。

### Durable Updates

- [x] D-028 与 CONTEXT 反映当前合同。
- [ ] 本 Task 至少进入一个可达 checkpoint 后方可清除；等待独立 Task checkpoint commit。

## T-089: 无模型参与的测试输出上下文裁剪

**Kind:** feature
**Status:** in-progress

### Goal

在不调用模型、不破坏原始会话记录的前提下，裁剪发送给模型的测试命令输出：成功结果只保留 `All tests passed`，失败结果保留失败用例、错误和堆栈信息。

### Requirements

- 只实现测试输出裁剪，不扩展到其他命令输出或模型摘要。
- 只识别 `npm test` 与 `npm run test` 测试命令，并处理 Pi 的 `bashExecution` 上下文消息。
- 成功且未取消、未截断的测试输出在模型 context 中精确替换为一行 `All tests passed`。
- 失败测试保留可识别的失败用例、错误和堆栈；无法可靠提取时保留原始输出。
- 裁剪仅修改 `context` 事件返回值，不修改 session 持久化内容或 TUI 中的原始结果。
- 裁剪器不调用模型，且非测试命令、取消或截断结果保持不变。

### Design

新增独立 `src/context-pruner/` 扩展，注册 Pi `context` handler。纯裁剪函数识别测试命令与 `bashExecution` 消息，根据退出状态选择成功固定文本或失败信息提取结果；handler 对消息做不可变复制后返回裁剪后的 context。原始输出由 Pi session 保留，裁剪器不使用 `tool_result` middleware，也不接入 `session_before_compact`。

### Out of Scope

- **其他命令输出裁剪：** 当前只需要测试结果语义；待出现稳定的其他命令输出合同后再扩展。
- **模型摘要或 LLM 调用：** 需求明确要求无模型参与；待未来明确需要语义归纳时另行设计。
- **持久化原始输出副本：** Pi session 已保存原始结果；待宿主不再提供该保证时再评估独立存储。
- **失败输出的通用测试框架解析：** 首版只提取稳定的失败块和诊断行；待具体框架语料证明需要时再增加解析器。

### Plan

#### Slice 1: 裁剪测试上下文

**Goal:** 测试命令的 context 输出按成功或失败结果缩减，同时原始消息保持不变。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] 成功测试输出在 context 中精确变为 `All tests passed`。
- [ ] 失败测试保留失败用例、错误和堆栈，并移除成功噪声。
- [ ] 非测试、取消和截断消息不变，输入消息不被修改。
- [ ] 扩展已加入 Pi 分发入口，类型检查和全量测试通过。

**Files and Seams:**
- Add: `src/context-pruner/index.ts` — context extension and public pruning seam
- Add: `tests/context-pruner/index.test.ts` — pure pruner and context handler behavior
- Modify: `package.json` — Pi extension registration
- Modify: `README.md`、`CONTEXT.md` — current capability and architecture

**Verification:**
- `npm run test:file -- tests/context-pruner/index.test.ts`
- `npm test`

**Steps:**
1. 先写成功、失败、边界和不可变行为测试，并确认失败原因是裁剪接口不存在。
2. 实现纯函数和 `context` handler，最小化支持范围并让聚焦测试通过。
3. 注册扩展，同步 README 与 CONTEXT，运行类型检查和全量验证。

### Evidence

- 设计已获用户确认；实现与验证待完成。

### Durable Updates

- [ ] 当前无新增长期决策；完成后确认是否需要更新 CONTEXT 的架构描述。

## T-090: 待创建
