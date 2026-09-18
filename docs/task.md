# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0141: 确立自仓管理与用户仓管理的划分与统一管理原则

- **Kind:** maintenance
- **Status:** verified
- **Reversal surface:** engineering

### Background & Goal

在长期开发与之前的候选评估中，仓库存在“自仓开发内务”与“用户项目产品能力”划分不清的思想盲区，曾将 Project Record 容器校验等通用工程治理能力误判为自仓私有脚本，导致自仓采用机器代码严防死守、用户仓全凭模型自律的双重标准。
本任务旨在将深刻反思总结的统一治理原则正式在全套文档体系中正交落位：
1. 在 `packages/guidance/src/bootstrap/principles.md` 确立宿主对称性原则（Host Symmetry Invariant）：自仓与用户仓在工程规范上完全对称，AKeel 无特权方言，所有要求宿主遵循的结构必须由运行时产品能力提供对等的确定性保障；
2. 在 `AGENTS.md` 确立生产车间隔离原则（Dev Factory Isolation）：自仓私有脚本（`scripts/`）严格限定于 AKeel 作为 TS 开源项目的制造构建工序，严禁将通用的工程治理能力扣押在自仓脚本中；
3. 在 `CONTEXT.md` 固化 Host Project 术语与对称治理的架构事实。

### Out of Scope

- 不引入新的运行时代码或修改已有扩展实现（代码已在 T-0140 落地）；
- 不放宽任何自仓编译、测试门禁或安全边界。

### Requirements

- **REQ-1 (`principles.md` 宿主对称性):**
  - 在 Project Records 章节确立 `Host Symmetry Invariant` 锚点；
  - 声明自仓与用户仓同为 Host Projects，共享相同的格式、生命周期与确定性工具保障。
- **REQ-2 (`AGENTS.md` 生产车间隔离与能力下沉):**
  - 在维护约定中确立生产车间隔离原则；
  - 明确严禁将面向宿主项目的通用工程结构校验逻辑私有化在 `scripts/` 中。
- **REQ-3 (`CONTEXT.md` 术语与事实固化):**
  - Glossary 增加 `Host Project` 术语；
  - Architecture 巩固宿主对称性与统一容器服务事实；
  - 严格保持 Context hygiene（字符预算与结构合规）。
- **REQ-4 (验证零破坏与全绿):**
  - `validate-docs.ts`、`validate-skills.ts`、`tsc` 与全部 519+ 测试全量通过。

### Plan

#### Slice 1: 更新 principles.md 确立 Host Symmetry Invariant
- 在 `packages/guidance/src/bootstrap/principles.md` 的 Project Records 章节添加 Host Symmetry Invariant；
- 验证文档结构。

#### Slice 2: 更新 AGENTS.md 确立生产车间隔离原则
- 在 `AGENTS.md` 的维护约定中添加生产车间隔离与通用能力下沉条目；
- 验证文档与引用。

#### Slice 3: 更新 CONTEXT.md 补全术语与架构事实
- 在 `CONTEXT.md` Glossary 增加 `Host Project`；
- 在 Architecture 巩固统一治理事实，确保字数在预算内；
- 跑通 `validate-docs.ts`。

#### Slice 4: 全量回归、checkpoint 与清档
- 运行全量 `npm test`；
- 提交 checkpoint 并清档 `docs/task.md`。

### Durable Updates Checklist
- [x] `packages/guidance/src/bootstrap/principles.md` — Host Symmetry Invariant 锚点
- [x] `AGENTS.md` — 生产车间隔离与能力下沉原则
- [x] `CONTEXT.md` — Host Project 术语与统一治理事实
- [ ] 全量验证通过与 `docs/task.md` 清档

## T-0142: 待创建





