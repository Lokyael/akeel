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

## C-013: 子代理基础设施在 Bun 运行时不可用（node:v8.promiseHooks.createHook 未实现）

- **Created:** 2026-08-17
- **Domain:** pi-subagents 子代理编排层 / 宿主运行时（非 pi-keel 仓库代码）
- **Why Not Now:** pi-subagents ≥0.50.0 将 workflow script 的 promise 追踪改为 `node:v8.promiseHooks.createHook`（0.50.0 CHANGELOG 未声明的破坏性变更），Bun 宿主未实现该 API → `subagent` 派发起 worker 即失败（`NotImplementedError`），影响「parallel Axes 独立子代理审查」类工作流；属宿主运行时 × 上游包能力缺口，非 pi-keel 代码缺陷，仓库自身构建/测试不受影响（node 下 `npm test` 全绿）。现用 workaround：钉住 `npm:pi-subagents@0.49.0`（settings.json pinned，`pi update --all` 跳过）；但 **0.49.0 的 workflowScript await 消费检测有假阳性**（`await runs.run/all`、`Promise.all` 误报未消费）——并行审查改用 return 风格 `return runs.all([...])`（实测可用）、链式编排用 `resume` 接力，两条版本线各坏一半。升级 pi 宿主仍为内嵌 Bun，不解决。
- **Trigger（何时可解决）:** ① 向 pi-subagents 上游提 issue：建议 createHook 缺失时回退 0.49.0 式 then-patch（现成实现可作证据）；采纳后解除钉住。② pi 宿主切换到 Node 运行时（若配置支持）。③ Bun 实现 `node:v8.promiseHooks`（上游 open 三年，进度非本项目可控）。④ 本地 patch：移植 0.49.0 worker 至 0.50.0，或为 0.49.0 补 await 消费检测；仅当 await 限制成为实际摩擦时考虑。
- **Review On:** 2027-02-17

## C-014: 待创建
