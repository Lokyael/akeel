# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0136: 实现分段参数解析原语并在 Herdr 与 Python 工具试点（D-067 架构演进）

- **Kind:** refactor
- **Status:** in-progress
- **Reversal surface:** engineering

### Background & Goal

D-067 确立了分层多子命令程序的两阶段解耦架构：Stage 1 共享纯语法的确定性分段参数解析原语（Segment Parser），负责选项形态、原子值消费、`--` 操作数隔离与未知选项不确定性截断；Stage 2 由各程序模块本地编译私有 Invocation Plan 并投影为统一语义。此外，当前 `herdr.ts` 在手写参数提取中存在静默丢弃未知选项、导致未 fail-closed 的安全缺口。

本任务目标：
1. 构建轻量、纯语法的确定性分段参数解析器 `segment-parser.ts` 及其独立单元测试；
2. 以 `herdr.ts` 作为首个 Pilot 接入，重塑为两阶段解析并彻底修复未知选项 fail-closed 缺口；
3. 以 `python-tools.ts` 作为第二个 Pilot 接入，消灭手写 positional 循环与命令类别判断样板；
4. 保持 `git.ts`、`package-managers.ts` 及 coreutils 现状，确保全量测试无回归。

### Out of Scope

- 不在本任务中重构 `git.ts` 或 `package-managers.ts`（留待后续独立阶段）。
- 不修改 `bounded-options.ts` 及 coreutils、chmod、find 等平坦命令分析器。
- 不修改 Canonical 编译、Admission 投影、Mandatory Boundary 或 Policy Kernel 外部合同。

### Requirements

- **REQ-1 (确定性分段参数解析原语):**
  - 在 `programs/segment-parser.ts` 中实现纯语法参数解析，支持 flag、required value (`separate`、`equals`、`attached`) 及短选项 cluster；
  - 正确识别并隔离 `--` 之后的路径操作数（pathspec）；
  - 显式捕获缺失值（`missing-value`）与非法形态；
  - 遇到未知选项时停止当前段分区，生成 `indeterminate` 状态，捕获未知 token 及后续 remainder，严禁基于 flag 假设将后续 token 误解析为命令或操作数。
- **REQ-2 (Herdr Pilot 与 Fail-Closed 修复):**
  - 重构 `herdr.ts` 消费分段解析器，建立两级子命令路由契约；
  - 修复未知选项漏洞：未知选项（如 `herdr --unknown workspace create`）必须导致结果标记为 `opaque: true`（若为已知 inspect 命令）或触发安全防御，严禁静默丢弃；
  - 保持所有现有合法 Herdr 命令（`status`, `agent start/prompt`, `workspace create/close`, `worktree create/remove` 等）的命令类别、effects 和路径事实完全不变。
- **REQ-3 (Python 工具 Pilot 迁移):**
  - 重构 `python-tools.ts` 消费分段解析器；
  - 消除手写 positional 索引跳跃，统一从分段结果中提取 `--config`（source path）、`--output-file`（target path）与目标文件 operands；
  - 严格保持 `black`/`isort`（modify）、`pytest`（execute）、`ruff`（check/format/clean 多态）的所有现有语义与测试判定。
- **REQ-4 (安全保持与零回归):**
  - 保持依赖方向内聚（`programs/` 不反向依赖 adapter 或 runtime）；
  - 全量测试（496+ 用例）全绿，无功能回归。

### Plan

#### Slice 1: 分段参数解析原语实现与单元测试 (TDD)
- 新建 `tests/access-gate/access-decision/core/segment-parser.test.ts`，覆盖选项形态、原子值消费、`--` 分隔与未知选项截断；
- 实现 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/segment-parser.ts`；
- 验证单元测试通过。

#### Slice 2: Herdr 接入与未知选项 Fail-Closed 修复 (TDD)
- 在 `shell-semantics.test.ts` 中增加 Herdr 未知选项必须 fail-closed（`opaquePathAccess: true` / `unknown`）的回归测试；
- 重构 `herdr.ts` 接入 `segment-parser.ts`；
- 验证 Herdr 测试全量绿灯。

#### Slice 3: Python 工具试点接入 (TDD)
- 重构 `python-tools.ts` 接入 `segment-parser.ts`；
- 验证 Python 工具全部用例绿灯无回归。

#### Slice 4: 全量回归、文档检查与清档
- 运行全量 `npm test`；
- 清档 `docs/task.md`。

### Durable Updates Checklist
- [ ] 代码层 — `herdr.ts` 与 `python-tools.ts` 完成两阶段解耦
- [ ] 测试层 — 包含独立的 segment-parser 测试与 Herdr fail-closed 测试
- [ ] `docs/task.md` — 验证全绿后清档

## T-0137: 待创建

