# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Review On` 和 `Trigger` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。
>
> 编号取末尾最大 `C-xxx` + 1，不复用历史 ID。

## C-001: guidance 文本精简（提示词体系观察）

- **来源:** [D-030](decisions.md#d-030-提示词体系边界prompt-surface) Revisit when ①
- **Trigger:** guidance 文本总量显著增长
- **Review On:** 2026-09-07（条件触发，随显式 context survey 复审）
- **内容:** 失败路径与高压力场景的 guidance 措辞精度要求最高；总量增长时评估精简。不构成维护承诺。

## C-002: 合并触发场景互斥的 skill

- **来源:** [D-030](decisions.md#d-030-提示词体系边界prompt-surface) Revisit when ②
- **Trigger:** 实测两个 skill 触发场景重合
- **Review On:** 2026-09-07（条件触发，随显式 context survey 复审）
- **内容:** 全量消费约束（D-030）的必然推论；场景重合时评估合并。不构成维护承诺。

## C-003: token 基线测量与提示词行为测试

- **来源:** [D-030](decisions.md#d-030-提示词体系边界prompt-surface) Revisit when ③
- **Trigger:** 出现可观察的遵守度问题
- **Review On:** 2026-09-07（条件触发，随显式 context survey 复审）
- **内容:** "理解认知"无法可靠操作化；出现遵守度问题时评估测量方案。不构成维护承诺。

## C-004: 容器级迁移引导机制

- **来源:** [D-028](decisions.md#d-028-统一-project-record-模型) Out of Scope（Revisit when）
- **Trigger:** 出现以自有方式管理文档（自有决策寄存器、ADR、跟踪器、ideas/backlog）的真实用户项目
- **Review On:** 2026-09-07（条件触发，随显式 context survey 复审）
- **内容:** 不建专用 skill、声明/路由系统，不改 CONTEXT.md 契约；offer 时刻防双源两子句已就位；迁移 = 非默认，仅用户显式选择时作为一次性 Task 走 Migration Protocol。不构成维护承诺。

