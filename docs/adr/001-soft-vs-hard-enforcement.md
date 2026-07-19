# ADR-001: Soft vs Hard 技能强制执行

**分类：** 技能哲学

| 维度 | 内容 |
|------|------|
| **问题** | superpowers 使用"IF A SKILL APPLIES, YOU MUST USE IT. This is not negotiable."的强制性语言。是否采用？ |
| **决策** | 不采用。改为"use skills when they match, user instructions take precedence"。 |
| **理由** | 1. superpowers 的强制语气在实测中常被模型无视或产生抗拒。2. Pi 哲学强调"user control over agent"。3. 技能是工具，不是枷锁。 |
| **后果** | 模型可能在某些场景跳过技能。通过提高 description 质量和 bootstrap 中的引导语言来补偿。 |
