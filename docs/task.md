# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-094: 测试成功输出的正向证据门槛

**Kind:** maintenance
**Status:** in-progress

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

## T-096: 待创建
