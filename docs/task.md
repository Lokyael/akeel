# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-097: 测试成功摘要的完整证据判断

**Kind:** maintenance
**Status:** in-progress

### Goal

避免把包含多个测试运行结果、后续零测试摘要或冲突证据的 `npm test` / `npm run test` 输出错误投影为 `All tests passed`，同时保留已验证成功结果的 context 压缩能力。

### Requirements

- 独立的模型 `npm test` / `npm run test` 只有在宿主成功且完整输出中的所有可识别 top-level 测试摘要均为非零、完整且全通过时，才可投影为 `All tests passed`。
- 后续零测试、失败、不完整、冲突或无法确定层级的摘要不得被投影为无条件成功。
- Node TAP 的嵌套摘要需与 top-level 最终摘要区分；无法可靠区分时保留原始输出。
- 取消、截断、非测试命令、未关联 tool call 和多内容不确定结果继续保持原有行为。
- 原始 `toolResult` 对象和 session 内容不得修改；未验证成功的模型 context 投影保留原始输出。

### Design

将成功判断分为证据提取和投影决策两层。各受支持 runner 的解析器扫描完整输出并返回结构化摘要集合，而不是使用第一个匹配项。Node TAP 按缩进层级识别嵌套与 top-level 摘要；层级不明时返回不确定。只有宿主成功、存在完整权威摘要、所有 top-level 摘要的 `total > 0`、通过数等于总数、失败/跳过/todo/取消均为零，且没有 warning、失败或冲突证据时，才返回短成功消息；否则返回原始输出或现有失败保留路径。

### Out of Scope

- **失败输出保留算法**：本 Task 只修正成功投影的证据判定，不重写现有失败裁剪。
- **新的 runner 或通用输出过滤框架**：仅覆盖当前已支持的 Node TAP、Jest、Vitest 和 Bun 摘要。
- **用户 `!`/`!!` `bashExecution`、TUI、session 持久化和其他命令类型**：均不改变既有边界。

### Plan

#### Slice 1: 防止多摘要和零测试误报成功

**Goal:** 完整扫描并验证测试摘要，任何不确定结果保持原文。
**Requirements covered:** 全部 Requirements
**Depends on:** none

**Acceptance Criteria:**
- [ ] 单个受支持的非零全通过摘要仍可投影为短成功消息。
- [ ] 后续零测试、失败、不完整、冲突或层级不明摘要不会投影为无条件成功。
- [ ] Node TAP 嵌套摘要不会被错误当作多个 top-level 运行；无法判断时保留原文。
- [ ] 原始消息不被修改，取消、截断、非测试命令及未关联调用回归测试继续通过。
- [ ] `npm test` 全量验证、文档校验和 TypeScript 检查通过。

**Files and Seams:**
- Modify: `src/context-pruner/index.ts` — `projectTestOutput` 的成功证据投影
- Test: `tests/context-pruner/index.test.ts` — `projectTestOutput` 和 `pruneTestContext` 公共投影
- Verify: `README.md` / `CONTEXT.md` — 成功投影描述与实际行为一致

**Verification:**
- `npm run test:file -- tests/context-pruner/index.test.ts`
- `npm test`

**Steps:**
1. 先增加多摘要、后续零测试和冲突摘要的失败测试，并确认当前实现错误地压缩。
2. 增加完整摘要证据提取与保守决策，使新增测试通过。
3. 增加 Node TAP 层级和不确定输入测试，回归现有 runner、失败、取消、截断和原始消息不变性。
4. 同步必要的 README/CONTEXT 描述，执行文档、类型和全量验证。

### Evidence

- b54f768 的独立审查发现四种 runner 都只检查第一个摘要；多摘要输出中后续零测试摘要会被错误压缩。
- 直接调用当前 `projectTestOutput` 已复现 TAP、Jest、Vitest、Bun 四种多摘要输入均返回 `All tests passed`。
- 用户已接受“完整证据提取 + 保守投影”的设计并授权实施。

### Durable Updates

- [ ] 核对 D-085、README 与 CONTEXT 对完整摘要证据边界的描述；如无新长期结论则不新增 Decision。

## T-098: 待创建
