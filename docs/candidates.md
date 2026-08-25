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

## C-015: 复杂特性验证方法收敛（评审停用标准 + bash 差分语料仲裁）

- **Created:** 2026-08-25
- **Why Not Now:** T-062（for 归约建模）纸面评审已历多轮且仍能发现新边角——bash 语义无穷、纸面阅读的边际发现率不归零；且归约产生的语法合法但语义偏离类问题（如双引号内 `\$` 误替换）**只有对照真 bash 才能仲裁**，纸面审查结构性盲区。议题内容为验证方法论候选，未与当前架构决策绑定，采用与否待用户在当前会话明确选择。
- **Proposal:** ①评审停用标准——连续两轮无架构级/下近似级发现，且所有语义存疑均可落成语料用例，即停止纸面评审；②**bash oracle 差分语料**提升为独立仲裁任务（排 T-062 Task 6 归约器之后）：`(input → 期望归约文本 → 期望 gate 判定)` 语料表每条经真 bash 核过、单测锁表，dev 侧 bash -c 交叉核对；③**新守卫准入规则**——任何新守卫必须带一条语料条目才能进计划，防“纸面猜边角→加标记”的无限循环；④**垂直切片先行 + 架构冻结**——优先跑通 A0-1 + region pass + compound-command（风险最高新代码）并以差分测试收敛，剩余发现由测试驱动。
- **Trigger:** 实施阶段出现"纸面评审未覆盖的语义分歧"实证，或用户决定启用差分语料仲裁。
- **Review On:** 2027-02-25

## C-016: 待创建
