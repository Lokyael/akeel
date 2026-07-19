# ADR-003: bigpowers 72→10 技能精选

**分类：** 技能策展

| 维度 | 内容 |
|------|------|
| **问题** | bigpowers 有 72 个技能。为什么精选到 ~10 个并融合进其他来源的技能？ |
| **决策** | 只保留 bigpowers 独有的、且质量超过其他仓库对应物的技能。 |
| **理由** | 1. ~36 个是 Claude Code 专用的（orchestrate-project, build-epic, execute-plan 等）。2. ~8 个被 mattpocock/superpowers 更好版本替代。3. ~10 个是内部元工具（craft-skill, evolve-skill 等）。4. ~8 个是项目特定（publish-package, wire-ci 等）。 |
| **后果** | 失去 bigpowers 的 lifecycle 自动编排能力。通过 bootstrap + survey-context 手动编排来补偿。 |
