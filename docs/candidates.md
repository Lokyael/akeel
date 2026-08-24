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

## C-014: 控制流复合命令建模（for 循环的识别与可判定子集建模）

- **Created:** 2026-08-24
- **Why Not Now:** 现状是 fail-closed 的正确分类，非安全缺陷。全字面可判定循环（如 `for f in a b c; do echo x; done`）被 parser 按 `;` 切分为三条独立命令，`for`/`do`/`done` 无 adapter → 归类 `unknown` → 按 `shellPolicy.unknown`=ask 聚合为一次审批，展示三个无意义的 `unknown command — literal form`（keyword 不可能是命令，批准无信息量）；而使用循环变量（`do echo $f`）的形态已被 lexer 的 dynamic 检测 hard deny，fail-closed 正确。一期只改 parser 保留字识别 + 新增 `compound-command` decision code + 专门 guidance（Level 1）不引入新安全语义，收益是修正错误分类与知情同意表述；二期（Level 2）对可判定子集真正建模（无 `$var` 使用、无动态/glob 词表、体内无 `cd`、非位置参数形态 → 等价于把 body 重复 N 次，gate 检查 intent 而非次数，判定与展开一致）。改动面涉及 parser 复合语法与可判定性证明，暂无用户摩擦的量化证据。
- **Trigger:** 字面 for 循环（无动态 token、无 `$var` 使用、无体内 `cd`）在真实工作流中造成频繁或误导性审批；或用户明确提出希望在 gate 内支持此类循环（而不仅是拆分/Direct 工具规避）。
- **Review On:** 2027-02-24

## C-015: 待创建
