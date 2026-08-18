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
- **Why Not Now:** pi 的 subagent async workflow runtime 跑在内嵌 Bun 上，workflow worker 依赖 Node 兼容层 `node:v8.promiseHooks.createHook`——`NotImplementedError: node:v8 createHook is not yet implemented in Bun`（at internal:shared + blob bundle）。Bun 兼容层未实现该 API，因此本环境中 `subagent` 派发不可用（起 worker 即失败），影响「parallel Axes 独立子代理审查」类工作流。仓库本身构建/测试/审查不受影响（shell Node v24 下 `npm test` 全绿）；这是宿主运行时 × 上游包能力缺口，非 pi-keel 代码缺陷。精确根源（版本级，2026-08-18 定位）：pi-subagents **0.50.0** 将 `scripted-workflow.ts` 的 promise 追踪从 `Promise.prototype.then/catch/finally` 补丁重写为 `node:v8.promiseHooks.createHook`（worker 源码 759→916 行；0.46.0–0.49.0 该文件 createHook 出现 0 次，0.50.0 为 2 次——第 11 行硬 throw + 第 414 行实际调用）；0.50.0 CHANGELOG 未声明此破坏性变更。0.43.0 起 workflowScript 是唯一派发面，连单子代理 `{ agent, task }` 也走 worker，无绕过路径（external-runs 仅显示注册外部运行）。升级 pi 宿主仍为内嵌 Bun（BUN_1.2 ELF），不解决。
- **Evidence:** 时间线——pi 0.83.0 二进制（/opt/pi-coding-agent/pi）7/31 安装后未变；`run-history.jsonl` 33 条成功派发（scout/reviewer，`status:"ok"`）+ 1 条 transient error（8/13，exit 1，前后均成功），覆盖 2026-08-11–08-15，产物在 0.47.0 迁移前的旧存储 `.pi-subagents/`（无 `.pi/subagents/` 目录 → 成功期运行版本 ≤0.46.x）；`~/.pi/agent/npm/node_modules/pi-subagents` mtime 2026-08-17 18:00（升级到 0.50.0）后派发开始失败（C-013 首记）。官方 tarball 逐版比对（0.46.0/0.47.0/0.48.0/0.49.0 vs 0.50.0）证实 createHook 依赖仅 0.50.0 引入。2026-08-18 实测：0.50.0 下最小单子代理与并行均以同一错误失败；`pi install npm:pi-subagents@0.49.0` 钉住 + `/reload` 后派发恢复（单子代理与 `return runs.all([...])` 双路验证通过，后者两轴真并行）。Bun 上游 oven-sh/bun#6136（node:v8 promiseHooks）open 三年未实现，最近 #30832 仅部分实现 async_hooks timer 事件，非 promiseHooks。
- **Workaround（现用）:** 钉住 `npm:pi-subagents@0.49.0`（settings.json 已 pinned，`pi update --all` 跳过；2026-08-18 起生效）。**0.49.0 附带回归**：workflowScript 内 `await runs.run(...)` / `await runs.all(...)` / `await Promise.all(...)` 被消费检测误判为未消费（"workflowScript completed with unawaited runs.run launch(es)"，子代理本身跑完但宿主报失败；0.50.0 #1082 修复了该计数但与 createHook 绑定，两条版本线各坏一半）——并行审查改用 return 风格 `return runs.all([...])`（实测可用）；需数据流的链式编排用 `resume` 接力。手动两轴独立执行降为兜底。
- **Trigger（何时可解决）:** ① 向 pi-subagents 上游提 issue：0.50.0 createHook 依赖破坏 Bun 宿主 + 0.49.0 await 假阳性；建议 createHook 缺失时回退 0.49.0 式 then-patch（现成实现可作证据）；上游采纳后解除钉住。② pi 宿主切换到 Node 运行时（若配置支持）。③ Bun 实现 `node:v8.promiseHooks`（上游进度，非本项目可控）。④ 本地 patch：移植 0.49.0 worker 至 0.50.0，或为 0.49.0 补 await 消费检测；仅当 0.49.0 的 await 限制成为工作流摩擦时考虑。
- **Review On:** 2027-02-17

## C-014: 待创建
