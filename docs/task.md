# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0142: 净化 principles.md 提示词面并确立用户项目非强制主权

- **Kind:** refactor
- **Status:** verified
- **Reversal surface:** engineering

### Background & Goal

当前 `principles.md` 混合了普适工程素养与大量的 AKeel 专有容器哲学、自仓特例、专有路径硬编码与高级多代理底层机制，并被 bootstrap 全局无条件注入，导致普通用户项目被迫感知与自身无关的容器官僚与说教。
本任务旨在按照用户模型不应该感知的清单，对 `principles.md` 进行彻底净化与解耦：
1. 移除自仓私有内务特化语句（`skills/**/SKILL.md` 豁免特例）；
2. 移除元哲学说教（`Host Symmetry Invariant`，已在 AGENTS/CONTEXT 固化）；
3. 泛化专有临时路径硬编码（`/tmp/akeel/`）；
4. 净化 §11 委托机制，剥离 Herdr 专属实现细节，收敛为通用权限与隔离原则；
5. 为 `Project Records` 设立显式适用范围守卫（Scoping Guard），明确未采用此类容器的普通用户项目绝不受其约束且绝不强加；
6. 保持技能与校验规则所需的核心锚点完整，确保全量测试绿灯。

### Out of Scope

- 不破坏已有的技能锚点引用合同（保留所需锚点以保证 validate-skills 通过）；
- 不修改 Access Gate 与 Context Pruner 代码。

### Requirements

- **REQ-1 (自仓特化与哲学说教剥离):**
  - 删除 `skills/**/SKILL.md` 特例文字；
  - 移除 `Host Symmetry Invariant` 小节。
- **REQ-2 (路径与委托机制净化):**
  - 将 `/tmp/akeel/` 泛化为通用隔离临时目录；
  - 净化 §11，去除 Herdr 具体调用/worktree 管理细节，保留通用委托不变量。
- **REQ-3 (Project Records 非强制守卫):**
  - 在 `Project Records` 显式声明仅适用于采用 AKeel 记录的项目，普通项目绝不强加；
  - 保持 `Project Record Authority`、`Document Set`、`Record Lifecycle`、`Next-ID slots`、`Decision Record Format`、`Migration Protocol`、`CONTEXT.md Structure` 等锚点可用。
- **REQ-4 (全量测试与校验全绿):**
  - `validate-docs.ts`、`validate-skills.ts`、`tsc` 与 519+ 测试用例 100% 保持通过。

### Plan

#### Slice 1: 净化 principles.md 剥离特例、说教与专有路径
- 移除 Host Symmetry Invariant、skills/**/SKILL.md 特例与 /tmp/akeel/；
- 净化 §11 委托机制；
- 增加 Project Records 适用范围守卫。

#### Slice 2: 校验技能锚点与文档卫生
- 运行 `validate-skills.ts` 与 `validate-docs.ts`，确保所有锚点引用完美命中。

#### Slice 3: 全量回归、checkpoint 与清档
- 运行全量 `npm test`；
- 提交 checkpoint 并清档 `docs/task.md`。

### Durable Updates Checklist
- [x] `packages/guidance/src/bootstrap/principles.md` — 净化自仓私货并设立非强制守卫
- [ ] 全量验证通过与 `docs/task.md` 清档

## T-0143: 待创建

