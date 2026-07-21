# ADR-021: Task Record 作为用户项目短期产物术语

**分类：** 文档架构

> 本 ADR 取代 ADR-020 中关于用户项目术语和路径的决策；ADR-020 仅保留用于历史追溯。

## 问题

`Work` 和 `Work Item` 的语义范围过大，既可能表示整个项目工作，也可能表示单个 feature、bug、refactor 或调查任务；`Work review`、`Work source` 等表达无法准确说明审查对象。

## 决策

将用户项目的短期产物统一称为 **Task Record**，简称 **Task**：

- `docs/task.md`：默认的 Task Record 文件。
- `docs/task-<topic>.md`：只有需要独立生命周期的并行任务才使用的扁平文件。
- `T-xxx`：Task Record 的条目 ID。
- `Kind`：`feature`、`bug`、`refactor`、`investigation` 或 `maintenance`。

Task Record 内部使用 `Requirements`、`Design`、`Plan`、`Evidence` 和 `Durable Updates` 等章节。`Requirements` 保留为内容概念，不再作为独立文件类型。

长期决策仍记录在 `docs/decisions.md`，当前项目知识仍记录在 `CONTEXT.md`。

## 理由

Task 具有明确的目标、范围、验收边界和验证结果，比 Work 更容易表达单个有限任务，同时可以覆盖实现、修复、重构和调查。将任务性质放入 `Kind`，可以保持单一文件模型而不重新引入类型目录。

## 不采用的方案

- **Work / Work Item**：语义过宽，无法准确表达 review 的需求来源和生命周期对象。
- **Change Record**：不适合没有最终代码变更的调查或设计评估。
- **Change Request**：带有额外的审批和变更管理含义，超出当前维护模型。
- **Specification**：只表达需求内容，不能覆盖 bug、调查、重构和维护任务。

## 影响

所有用户项目技能使用 `Task Record`、`docs/task*` 和 `T-xxx`；审查使用 `Requirements` 作为需求轴。`docs/work*`、`W-xxx` 和 `Work Item` 不作为用户项目标准或兼容读取路径。pi-keel 自身的 `docs/adr/` 仍遵循项目 `AGENTS.md` 的永久 ADR 规则。
