# ADR-012: Pipeline 拆解与 Bootstrap 简化（历史）

> 本 ADR 描述的旧 pipeline 结构已由 ADR-017 的统一 Gate 取代。

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | (1) `index.ts` 混合配置加载、命令注册、管道编排和 bash 分段评估。(2) `bootstrap/index.ts` 注入状态机使用多个变量和 handler，实际语义只是"是否已注入"。 |
| **决策** | (1) 管道拆为 `pipeline/` 子目录：`plan-gate.ts`、`bash.ts`、`permission.ts`，由 `index.ts` 负责事件注册和组装。(2) 注入内容外化到 `principles.md`。(3) 注入状态收敛为单一 boolean，删除不必要的 handler。 |
| **理由** | 1. 管道层独立可测——每层输入/输出明确定义，不依赖主入口。2. 内容外化——改原则不需改 TypeScript 源码。3. 状态机简化是严格等价变换：`bootstrapAlreadyPresent()` 阻止重复注入，`needsInjection` boolean 在 session_start/compact 时设为 true，首次 context 触发注入后设为 false，与旧逻辑无行为差异。 |
| **后果** | 管道、配置加载和规则构建可以独立测试；`policy/permission.ts` 集中负责 ruleset 构建，`principles.md` 可独立编辑。 |
| **Out of Scope** | 管道层的进一步拆分；当前三层粒度已匹配实际使用复杂度。 |
