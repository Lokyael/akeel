# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Review On` 和 `Trigger` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。

## C-008: staging scope scratch（子代理 scratch 真隔离）

- **Created:** 2026-08-09
- **Why Not Now:** `/tmp/pi-work` 约定已够用（Direct write 自动建父目录、与 principles.md 既有约定一致）；staging 需向模型暴露随机路径，提示词面/API 改动面大。
- **Trigger:** 子代理场景出现 `/tmp` 共享目录 symlink 攻击实证，或用户要求子代理 scratch 内容不可被本机其他用户读取。
- **Review On:** 2027-02-09

## C-009: execute 档 T2（子代理验证能力）

- **Created:** 2026-08-09
- **Why Not Now:** Q3 冻结 execute=deny（非交互子代理内 execute=allow = 任意代码执行空白支票，node -e 绕过命令语义建模）；无证据表明 worker 验证摩擦不可接受。
- **Trigger:** 真实工作流 prototype 显示 worker 无法自证"测试通过"导致验证闭环不可用（跑一轮 worker 实测后）。
- **Review On:** 2027-02-09

## C-010: docs/CONTEXT.md 子代理写保护

- **Created:** 2026-08-09
- **Why Not Now:** git diff 是既有防线；默认拒绝会破坏合法文档更新工作流（worker 任务常含文档更新）。
- **Trigger:** 出现子代理污染 durable 内容（CONTEXT.md/docs）的事例。
- **Review On:** 2027-02-09

## C-011: pi-guard 共存说明

- **Created:** 2026-08-09
- **Why Not Now:** 装了 pi-keel 再装 pi-guard 会双重拦截同一 tool_call（两者都拦 bash/read/write）；当前无此用户反馈。pi-keel 即 pi-subagents 官方期望的 bash guard 角色（permissions.ts 硬编码外包），且语义更强。
- **Trigger:** 出现 pi-guard + pi-keel 双重拦截的用户报告。
- **Review On:** 2027-02-09

## C-012: shell effects 不裁剪（D-048 关联）

- **Created:** 2026-08-17
- **Why Not Now:** shell 命令的 effects 在 kernel 无直接决策消费（D-022 已记录「effects 只在 Direct-origin 被消费」），但它们是 D-022「effect 被安全解释」安全不变量的承载体、plan 完整性/审计数据、以及 50+ 测试断言锁定的语义提取契约。裁剪会让领域知识（如 git rm→delete）无处安放（deletion test 平移失败）；惰性视图违背 sealed 不可变 plan（deep-freeze/D-046 品牌化）。已由 D-048 的 requires 证明侧强化（effects 覆盖其类要求获 seal 边界运行时证明）。
- **Trigger:** 未来 kernel 出现按 effect 决策的真实需求，或 plan 体积成为可测性能问题。
- **Review On:** 2027-02-17

## C-013: 子代理基础设施在 Bun 运行时不可用（node:v8.createHook 未实现）

- **Created:** 2026-08-17
- **Domain:** pi-subagents 子代理编排层 / 宿主运行时（非 pi-keel 仓库代码）
- **Why Not Now:** pi 的 subagent async workflow runtime 跑在内嵌 Bun 上，初始化时调用 Node 兼容层 `node:v8.createHook`——`NotImplementedError: node:v8 createHook is not yet implemented in Bun`（at internal:shared + blob bundle）。该 API 用于 async resource / GC / Promise 生命周期内省，Bun 兼容层尚未实现。因此本环境中 `subagent` 派发不可用（起 worker 即失败），影响「parallel Axes 独立子代理审查」类工作流。仓库本身构建/测试/审查不受影响（shell Node v24 下 `npm test` 全绿）；这是宿主运行时能力缺口，非 pi-keel 代码缺陷。精确根源：pi-subagents（0.50.0，npm 最新版）所有派发统一走 `scripted-workflow.ts` 的 worker_threads worker，worker 内硬检查 `node:v8 promiseHooks.createHook`（失败即 throw）；无绕过该 worker 的备选派发路径（external-runs 仅显示注册外部运行）。升级 pi 宿主仍为内嵌 Bun（BUN_1.2 ELF），不解决。
- **Evidence:** 环境——shell `node --version` = v24.18.1；`bun --version` 无（未安装）；但 workflow runtime 为 Bun（blob bundle）→ 证明是 pi 宿主内嵌 Bun 而非用户 shell。报错堆栈：`NotImplementedError ... at node:v8:4:22 createHook ... at blob:... workflow runtime`。已受影响的场景：本会话 code-review 尝试用两个独立子代理（standards 轴 + requirements 轴）并行派发，均以该错误失败，改为手动两轴独立执行。2026-08-18 复核：最小单子代理派发实测仍以同一错误失败；pi 0.83.0→latest 0.84.2 宿主仍 Bun（CHANGELOG 无相关修复）；Bun 上游 oven-sh/bun#6136（node:v8 promiseHooks）open 三年未实现，最近 #30832 仅部分实现 async_hooks timer 事件，非 promiseHooks。
- **Workaround（现用）:** 不用 subagent 派发，由父会话手动完成独立两轴审查（先各自整理再聚合，不合并两轴结论）；已用该方式完成 code-review，证据来自完整 diff + 全源码读取 + 全测试实跑。
- **Trigger（何时可解决）:** ① pi 宿主切换到 Node 运行时（若配置支持）；② Bun 补 `node:v8.createHook`（上游进度，非本项目可控）；③ 用户环境确认后，于允许的运行时下重跑并行子代理审查；④ pi-subagents 降级——仿 Temporal SDK 先例（oven-sh/bun#6136 评论）：createHook 注册失败时 try/catch 忽略并降级运行，牺牲 promise 生命周期追踪能力；属本项目可控（可向 pi-subagents 上游提 issue），若被采纳则 subagent 派发可恢复。
- **Review On:** 2027-02-17

## C-014: 待创建
