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

## T-094: 测试成功输出的正向证据门槛

**Kind:** maintenance
**Status:** draft

### Goal

在保留原始 session 内容和现有 context/TUI 边界的前提下，避免把返回码为 0 但未实际运行测试、零测试或带重要跳过/警告的 `npm test` 结果误投影为 `All tests passed`，同时保留成功结果的主要 token 节省。

### Requirements

- 独立的模型 `npm test` / `npm run test` 只有同时具备宿主成功结果和受支持运行器的正向成功摘要时，才可裁剪逐条通过输出。
- 任意成功文本、零测试、skipped、todo、warning 或未识别测试格式不得被表述为无条件的 `All tests passed`；无法可靠归类时原样保留。
- 取消、截断、失败、非测试命令、用户 `!`/`!!` `bashExecution`、未关联 tool call 和多内容不确定结果继续保持现有行为。
- 原始 `toolResult` 对象和 session 内容不得被修改；context 投影仍通过现有纯函数接缝生成。
- 不引入 `pi-rtk` / `pi-token-killer` / `pi-token-saver` 的通用输出过滤器，不裁剪 diff、read、JSON、HTTP、grep、find、audit、日志或通用构建输出。

### Design

沿用 `projectTestOutput` 作为公共投影接缝，在成功分支增加封闭的运行器正向摘要识别；识别失败返回“不变投影”，不以失败标记缺失反推成功。对已确认成功且无需保留的逐条通过项和普通 runner 噪声继续生成短成功消息；跳过、todo、warning 等附加结果保留原始文本，避免扩展新的摘要语义。现有失败裁剪、tool call 关联、取消/截断守卫和 `bashExecution` 排除不变。

### Out of Scope

- 通用 bash/tool result 过滤框架或可配置规则系统。
- 其他测试命令、包管理器、构建器、lint、Git、源码读取、JSON、HTTP、搜索和日志输出的裁剪。
- 失败输出算法、TUI render-only 视图、session 持久化和 Access Gate。
- 统计、tee、discover 或其他外部 token-saving 包的功能移植。

### Plan

#### Slice 1: 收紧测试成功投影

**Goal:** 只有可验证的测试运行器成功结果进入短成功投影，其他结果保持信息完整。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] 受支持的 Node TAP/Jest/Vitest/Bun 成功摘要可裁剪为短成功消息。
- [ ] 任意成功文本、零测试、skipped、todo、warning 和未识别格式不会产生无条件成功消息。
- [ ] 取消、截断、失败、非测试命令、未关联调用和原始消息不变测试继续通过。
- [ ] `npm test` 全量验证通过，且 D-085 引用与文档校验通过。

**Files and Seams:**
- Modify: `src/context-pruner/index.ts` — `projectTestOutput` / success evidence guard
- Test: `tests/context-pruner/index.test.ts` — `projectTestOutput` and `pruneTestContext` public projections
- Verify: `README.md` / `CONTEXT.md` — success projection wording remains accurate

**Verification:**
- `npm run test:file -- tests/context-pruner/index.test.ts`
- `npm test`

**Steps:**
1. 先为任意成功文本、零测试和 skipped/todo/warning 写失败测试，并确认现有实现错误地裁剪或丢失信息。
2. 增加最小正向运行器摘要守卫，先让新增测试通过。
3. 回归现有成功、失败、取消、截断、边界和原始消息不变测试。
4. 同步 README/CONTEXT（如实际用户可见行为发生变化），执行文档、类型和全量验证。

### Evidence

- 外部实现审查确认：仅凭成功退出状态会产生 false success；通用 diff/read/JSON/HTTP/搜索/日志裁剪会丢失结果必要上下文。
- 当前 AKeel 在 `src/context-pruner/index.ts:31-34` 仅检查退出码和失败标记；现有测试还以 `runner output` 作为成功裁剪输入，需由本 Task 收紧。
- 当前基线：`npm test` 通过，341 项测试全部通过。

### Durable Updates

- [ ] D-085 已记录测试成功投影的正向证据边界；落地后核对 README、CONTEXT 与 D-084 的描述。

## T-095: 收窄 Task Record 覆盖范围

**Kind:** maintenance
**Status:** in-progress

### Goal

让原有 Task Record 只覆盖实质工作，不把极小的局部文案调整另立为新的 Project Record 分类。

### Requirements

- `principles.md` 单独定义 Task 的实质边界和不确定时升级的 fallback。
- 单一 `skills/**/SKILL.md` 的纯文案调整，且不改变能力、授权、职责、跨文件合同、外部事实、安全边界、架构、Decision 或 Project Record 时，不要求新建 Task。
- 其他文件、多个文件、任一上述边界、调查/设计/协调或不确定性都要求 Task。
- 保留 Task checkpoint、清档、Git 追溯和不使用行数/自动分类的规则。
- 删除 `Micro-change` 作为独立术语，避免增加分类和上下文负载。

### Design

重写 `principles.md` Project Record Authority 与 D-028 的 Task 分类结论；`CONTEXT.md` 只保留短事实；相关 skills 仅引用边界。保留并不改动并行的 D-085/T-094 内容。

### Out of Scope

- **Task 生命周期：** checkpoint、清档、Git 可达性和 ID 规则保持不变。
- **自动分类或行数阈值：** 继续采用语义边界，不引入机械放行条件。
- **插件运行时处理：** 不改变工具调用、模型 context 或输出投影。

### Plan

#### Slice 1: 收窄 Task 分类边界

**Goal:** 实质工作进入 Task，极小局部文案调整不被升级为 Task。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] 不再使用 `Micro-change` 作为分类术语。
- [ ] `principles.md` 完整承载边界与 fallback。
- [ ] D-028、CONTEXT 与相关 skills 不重复完整条件列表。
- [ ] 文档、skills 和全量验证通过。

**Files and Seams:**
- Modify: `src/bootstrap/principles.md`、`docs/decisions.md`、`CONTEXT.md`
- Modify: `skills/disciplines/change-preflight/SKILL.md`、`skills/workflows/survey-context/SKILL.md`、`skills/disciplines/implementation-planning/SKILL.md`
- Verify: `npm test`

**Verification:**
- `npm test`

**Steps:**
1. 集中 Task 边界并删除 Micro-change 术语。
2. 收窄各消费者为必要引用。
3. 运行全量验证并清档 Task。

### Evidence

- 用户明确修正方向为“收窄原有 Task”，而不是新增 Micro-change 分类；并行 D-085/T-094 变更保留不改。

### Durable Updates

- [ ] Task 边界与相关读取面同步后清档。

## T-096: 待创建
