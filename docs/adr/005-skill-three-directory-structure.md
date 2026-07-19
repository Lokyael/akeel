# ADR-005: 技能三目录结构

**分类：** 项目组织

| 维度 | 内容 |
|------|------|
| **问题** | mattpocock 用 `engineering/` 和 `productivity/`，superpowers 用扁平目录，bigpowers 按 lifecycle phase 分。如何组织？ |
| **决策** | 三个目录：`foundations/`（始终激活）、`disciplines/`（模型自动匹配）、`workflows/`（仅用户触发）。 |
| **理由** | 1. 按加载机制分类（而非按 domain 或 phase）最大化 pi 的配置灵活性。2. 用户可以 `settings.json` 中按目录禁用。3. 清晰的加载预期——看目录名就知道技能何时触发。 |
| **后果** | 跨领域技能的归属不完全精确。通过 description 描述来补偿。 |
