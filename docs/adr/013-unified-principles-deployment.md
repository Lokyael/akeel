# ADR-013: 原则向用户项目的统一部署

**分类：** 文档架构

| 维度 | 内容 |
|------|------|
| **问题** | pi-keel 的核心机制（Out of Scope、Design Twice、产物生命周期）最初被分散到多个技能文件中重复定义，且部分参考数据（产物路径、状态转换）以 pi-keel CONTEXT.md 为载体——模型在用户项目中无法访问，形成死链。 |
| **决策** | (1) 采用"原则注入 + Quick Reference"双层架构：行为约束（Out of Scope 格式）写入 `principles.md` §7，全会话注入；操作必需数据（产物路径、状态转换、用户项目 CONTEXT.md 结构）写入 `principles.md` 末尾 Quick Reference，同样注入。(2) 技能文件只做一行引用（"per principles.md §7" 或 "per principles.md Quick Reference"），不嵌入格式或规则细节。(3) 删除 File Handoff Protocol（pi 无子智能体，前提不存在）、Leading Words 锚定表（ADR 体系已足够）、安全三层语义（pipeline 目录结构已自文档化）、pi-keel CONTEXT.md（ADR + TRACEABILITY + SKILL.md 已构成完整文档体系）、测试接口导出（核心函数已 public export，覆盖率充分）。 |
| **决策要点** | |
| | 1. **Quick Reference 作为模型唯一数据源**：统一提供产物路径、状态转换和用户项目 CONTEXT.md 结构。模型不需要读取其他 pi-keel 特有文件即可在用户项目中操作。 |
| | 2. **保留的 4 条机制**：Design Twice（codebase-design）、Negative Space（principles.md §7 + 5 种产物模板）、Health Checks（validate-skills.ts）、Quick Reference（principles.md）。每条都有真实的行为约束价值。 |
| | 3. **移除的 5 条机制**：File Handoff Protocol（无子智能体前提）、Leading Words 锚定表（ADR 足够）、安全三层语义（pipeline 目录自文档化）、测试接口导出（已充分）、pi-keel CONTEXT.md（ADR + TRACEABILITY 已覆盖）。 |
| **理由** | 1. 模型在用户项目中唯一能依赖的是注入的 principles.md 和按需加载的技能文件。所有参考数据必须在这两个渠道内。2. 减少维护点——每个概念只在一处定义。3. 删除冗余机制降低认知负载——pi-keel 开发者只需知道 ADR + TRACEABILITY + SKILL.md 三件套。 |
| **后果** | `principles.md` 保留 8 条原则和 Quick Reference；技能只引用集中定义，不重复嵌入格式规则。`CONTEXT.md` 和无效的 handoff/leading-words 机制已删除。 |
| **Out of Scope** | (1) 模型路由/选择——不在 pi-keel 职责范围。(2) 子智能体或多 agent 协作——pi 目前不支持。(3) 技能生命周期自动编排——手动编排（bootstrap + survey-context）已满足需求。 |
