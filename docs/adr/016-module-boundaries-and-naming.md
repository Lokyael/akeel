# ADR-016: 安全门控模块边界与统一命名（历史）

> 本 ADR 描述的旧 phase/pipeline 结构已由 ADR-017 的 Profile access-gate 架构取代。

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | `security-gate/` 根目录的路径策略、权限规则、威胁检测和模式状态混在一起；taxonomy 单文件同时承担规则数据、shell 解析、类型和公共 API；文件名存在 `rules`、`utils`、`detection` 等泛化命名，无法直接表达模块职责。测试文件名也无法准确区分 PLAN gate、权限引擎和工具权限管道。 |
| **决策** | 按职责将安全门控划分为 `config/`、`taxonomy/`、`security/`、`policy/`、`shared/`、`phase.ts` 和 `pipeline/`。`taxonomy/commands.ts` 是命令规则数据唯一来源，`taxonomy/index.ts` 是公共入口；`phase.ts` 只管理 PLAN/BUILD 状态，PLAN 约束集中在 `pipeline/plan-gate.ts`；路径与权限分别由 `policy/path.ts`、`policy/permission.ts` 负责；测试继续放在源码外的 `tests/security-gate/`，保持平铺并按被测职责命名。 |
| **命名原则** | 文件名表达领域概念，不表达模糊实现机制；原子概念使用单词，复合概念使用 kebab-case；目录提供上下文而不重复文件名；测试使用明确的职责名；TypeScript 类型使用 PascalCase，函数使用 camelCase，常量使用 CONSTANT_CASE；避免非必要缩写。 |
| **理由** | 目录结构直接表达依赖方向和职责边界，降低入口层与策略层之间的耦合；taxonomy 内部仍保持单一真相源，但规则、解析和公共 API 可以独立理解和测试；测试不混入源码，也不机械复制源码目录。 |
| **后果** | 本次变更只调整模块边界、文件名、导入路径和文档，不改变安全策略、事件顺序或公共行为。旧模块文件被移除，测试脚本和文档路径同步更新。`parser.ts` 保持为单一 shell 解析模块，避免为了满足文件大小而增加低价值边界。 |
| **Out of Scope** | 不改变 PLAN/BUILD 语义、命令规则、路径策略、配置格式、测试框架或用户项目文件；不新增 OS sandbox 能力。 |
