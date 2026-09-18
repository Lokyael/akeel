# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0135: 比较分层程序参数解析的最优模块边界

- **Kind:** investigation
- **Status:** in-progress
- **Origin:** C-046
- **Reversal surface:** engineering

### Background & Goal

现有程序语义层同时使用宽松的 `option-scanner.ts`、严格的 `bounded-options.ts` 与各程序本地分析器。Git 存在重复扫描和多组选项集合的同步压力，Python 工具与包管理器共享跨程序选项集合，Herdr 仍有独立 positional 扫描；但各程序对 cwd、project scope、selector、path role、opaque、hard boundary 与 Canonical reject 的合同并不相同。C-046 曾预设以 `SubcommandProgramManifest` 统一这些职责，尚未证明该边界足够深且不会把领域差异泄漏进通用 schema。

本 Task 开展有界模块设计比较，判断在 AKeel 当前安全与 Canonical 合同下是否存在占优设计；若不存在脱离约束的“终极最优”，则明确条件化选择及停止判据。调查不以代码行数或抽象统一度为目标，也不预设必须采用 Manifest。

### Out of Scope

- 不修改现有程序分析器、Canonical、Admission、Mandatory Boundary 或 Policy 行为。
- 不顺带修复 Herdr unknown-option 等具体缺陷；缺陷只作为模块边界证据，后续独立分诊。
- 不新增 cargo、go、make 或其他程序族，不恢复动态 CLI AST、运行期 CLI 元数据或外部命令 schema。
- 不用旧实现、现有测试结果或第三方 parser 作为正确性 oracle。

### Requirements

- **REQ-1（事实模型）:** 核对 Git、uv、Python 工具、包管理器与 Herdr 的现有参数解析、失败合同、路径事实、上下文变化和测试接缝，区分机械语法重复与程序领域语义。
- **REQ-2（至少三案比较）:** 至少比较局部分析器加定点 helper、共享两阶段参数分区器加本地语义投影、完整声明式 `SubcommandProgramManifest` 三种不同边界；必要时加入第四种设计，但不得只优化预选方案。
- **REQ-3（模块质量）:** 按 depth、leverage、locality、testability、implementation/migration cost 与 deletion test 评价每案，并检查接口是否使无效状态不可表示、失败结果是否显式。
- **REQ-4（安全保持）:** 每案必须保持 unknown/missing/dangerous option 的 `opaque`、`hardBoundary` 与 Canonical reject 差异，保持 token-order cwd、动态 path base、transport/selector/path 区分和 D-060/D-067 的单次 Canonical 解释边界。
- **REQ-5（压力测试）:** 用代表性 Git、uv、npm/pnpm/yarn、Python 工具与 Herdr 场景压力测试方案，覆盖前置全局选项、子命令路由、`--`、选项值原子消费、输出路径、重复选项、未知选项与程序特异验证。
- **REQ-6（结论）:** 明确回答是否存在当前约束下的占优方案；若推荐新边界，给出最小接口形状、责任归属、迁移顺序、测试策略、停止条件与被拒方案；若不推荐变化，说明重新触发设计的客观证据。

### Design Constraints

- 程序 registry 只负责 executable 分派；Policy、配置与 host 不进入程序语义层。
- 共享语法模块不得直接假定所有 option value 都是路径，不得把 cwd、project root、prefix 或 workspace selector 合并为单一无类型 context。
- 程序本地语义必须继续拥有 command class、effects、程序特异值验证以及无法通用证明的安全边界，除非比较证明更深且同样局部的替代边界。
- 新接口不得要求调用方理解内部 token 下标或重复扫描同一参数序列才能正确使用。
- 主要消费者若依赖大量通用 hook 才能表达正常行为，视为抽象泄漏证据而非成功复用。

### Plan

#### Slice 1: 当前事实与不变量矩阵

- 建立各分析器的语法、上下文、路径、失败和测试 seam 矩阵。
- 核对代表性官方 CLI 合同，并将当前缺陷与架构压力分开。

#### Slice 2: 独立设计与接口草图

- 为至少三个方案分别写出调用方视角的最小接口。
- 对每案执行 deletion test，并标注无效状态、失败合同与领域逃生面。

#### Slice 3: 场景压力测试与比较

- 将同一组代表性调用映射到各方案。
- 比较安全保持、变更局部性、迁移风险和新增程序族时的成本。

#### Slice 4: 结论与权威更新

- 形成推荐结论及被拒方案，提交用户裁决。
- 只有结论被采纳时才更新 D-067 或新增/修订 Decision；具体 bug 另行分诊。
- 保留可达 Task checkpoint，完成 durable update 后清档。

### Evidence

- C-046 复审已确认 Git 多次扫描与集合同步压力真实存在，但原记录对 `uv.ts`、`package-managers.ts` 的本地循环描述不准确，并遗漏 Herdr。
- C-046 创建后的程序层变更仍主要局限于 Git、option scanner 与 coreutils，尚未出现跨多个分层程序的同步迁移。
- 官方 CLI 合同表明 `git -C`、uv `--directory`/`--project` 与 npm prefix/workspace 不共享单一 cwd 语义。
- `herdr.ts` 当前丢弃未知 option token 而不产生 fail-closed 信号，是需独立验证的合同缺口，不自动证明完整 Manifest 合理。

### Durable Updates Checklist

- [ ] `docs/decisions.md` — 仅在用户采纳模块边界结论后更新 D-067 或记录吸收结论
- [ ] `CONTEXT.md` — 仅在采用后同步当前架构描述
- [ ] `docs/task.md` — 验证并完成 durable updates 后清档

## T-0136: 待创建

