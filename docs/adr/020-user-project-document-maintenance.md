# ADR-020: 用户项目文档统一维护模型

**分类：** 文档架构

## 问题

用户项目的 spec、plan、design、ticket、bug 分别使用目录和文件，导致短期过程文档数量膨胀；日期型文件名还会把过程时间固化为路径，增加重复文件和失效引用。

## 决策

用户项目统一维护三个文档入口：

- `CONTEXT.md`：当前术语、架构、不变量、安全边界、活跃决策和 Negative Space。
- `docs/decisions.md`：长期有效的负载决策，使用 `D-xxx` 条目记录决策、理由、拒绝的替代方案和影响。
- `docs/work.md`：当前 feature、bug、refactor、design-review、maintenance 等工作项，使用 `W-xxx` 条目记录范围、验收、设计、计划、证据和持久化更新。

只有需要独立生命周期的并行工作才使用扁平的 `docs/work-<topic>.md`。不创建按文档类型划分的子目录，不使用日期型路径或旧路径兼容读取。

## 生命周期

- Work item：`draft` → `in-progress` → `verified` → 删除
- Decision：`active` → `superseded`
- Context：只维护当前事实，不记录过程历史

完成工作项后，先将持久信息提炼到 `CONTEXT.md` 或 `docs/decisions.md`，再删除工作项。Git、PR 或外部 issue 负责过程追溯，不默认建立 archive 目录。

## 理由

当前知识、长期决策和临时过程是三种不同的维护责任，分别集中后可以避免重复定义和过期文档堆积。稳定文件名便于持续更新和交叉引用；将工作类型放在 `Kind` 字段而不是目录中，可以减少目录层级和小文件数量。

## 不采用的方案

不继续维护 `docs/specs/`、`docs/plans/`、`docs/designs/`、`docs/tickets/`、`docs/bugs/` 等类型目录，因为它们只区分过程类型，没有提供长期维护价值。不保留日期型路径作为读取 fallback，避免新旧两套文档模型并存。

## 影响

所有产出和消费用户项目文档的技能必须以三文件模型为准。`survey-context` 只读取 `CONTEXT.md`、`docs/decisions.md` 和 `docs/work*`；`doc-sync` 负责检查工作项是否已完成持久化并清理。pi-keel 自身仍按项目 `AGENTS.md` 使用独立的 ADR、安全边界和溯源文档体系。
