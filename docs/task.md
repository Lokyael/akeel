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
- 不新增 cargo、go、make 或其他程序族；不把运行期 `--help` 输出、远程 metadata、用户项目 schema 或未审查生成物升级为授权语义权威。开发期生成且提交审查的声明可作为设计替代方案评价，但本 Task 不实现它。
- 不用旧实现、现有测试结果或第三方 parser 作为正确性 oracle。

### Requirements

- **REQ-1（事实模型）:** 核对 Git、uv、Python 工具、包管理器与 Herdr 的现有参数解析、失败合同、路径事实、上下文变化和测试接缝，区分机械语法重复与程序领域语义。
- **REQ-2（至少三案比较）:** 至少比较局部分析器加定点 helper、共享两阶段参数分区器加本地语义投影、完整声明式 `SubcommandProgramManifest` 三种不同边界；必要时加入第四种设计，但不得只优化预选方案。
- **REQ-3（模块质量）:** 按 depth、leverage、locality、testability、implementation/migration cost 与 deletion test 评价每案，并检查接口是否使无效状态不可表示、失败结果是否显式。
- **REQ-4（安全保持）:** 每案必须显式保存 unknown/missing/dangerous option 的不确定性与 `opaque`、`hardBoundary`、Canonical reject 等差异，不得静默把未证明事实升级为 bounded facts；保持 token-order cwd、动态 path base、transport/selector/path 区分，以及 D-060 的单一 Canonical 语义权威。内部允许确定、资源有界的多阶段或常数次线性遍历；任何建议的行为变化必须与行为保持型迁移分开声明。
- **REQ-5（压力测试）:** 用代表性 Git、uv、npm/pnpm/yarn、Python 工具与 Herdr 场景压力测试方案，覆盖前置全局选项、子命令路由、`--`、选项值原子消费、输出路径、重复选项、未知选项与程序特异验证。
- **REQ-6（结论）:** 明确回答是否存在当前约束下的占优方案；若推荐新边界，给出最小接口形状、责任归属、迁移顺序、测试策略、停止条件与被拒方案；若不推荐变化，说明重新触发设计的客观证据。

### Design Constraints

- **Authority:** Canonical 编译是程序语义事实的唯一权威；Admission、Policy、runtime 与 host 不得重新解析原始 CLI。内部实现不受单 pass 限制，但同一 executable 在任一生产时点只有一个权威 analyzer。
- **Honesty:** 只发行已证明事实；未知 option arity、未声明值形态与其他不确定性必须显式保存。未知发生后的当前语法 segment 不得继续发行已证明分区，但可保留此前已证明的前缀事实、source anchor 与 opaque remainder。
- **Safety preservation:** 任何方案都不得削弱 Mandatory Boundary 或现有 user-boundary Decisions；通用 parser 不直接承担凭据、能力资产、destroy 或路径策略裁决，但必须为其提供诚实且足够的事实与不确定性。
- **Boundedness:** 解释必须确定、政策无关且资源有界；禁止无界 backtracking、运行目标程序完成解析，或依赖运行期、远程、用户项目提供的未受信任 schema。固定常数次线性遍历和有界多阶段解析合法。
- **Separation and locality:** Policy、配置与 host 不进入程序语义层。共享模块只拥有可跨程序证明的机械语法；command class、effects、程序特异值验证与无法通用证明的安全语义由对应程序模块拥有，模块内部可选择声明表、纯函数 reducer 或二者组合。
- **Traceability:** 设计必须保留语义所需的 token 顺序、source anchor、动态 path base 与稳定测试 seam；接口不得迫使调用方理解内部 token 下标才能正确使用。共享 parser 不得自行推断 option value 是 path、selector、cwd 或 transport，但程序本地 contract 可以通过稳定 key 显式映射这些含义。
- **Explicit evolution:** 模块迁移与行为变化必须分开；任何安全收紧、放宽或缺陷修复都需显式需求与回归证据。内部 `ProgramAnalysis`/`ProgramSemantic` 形状、registry 绑定形式和迁移粒度可以调整，只要不创建宽泛跨域 DTO、不出现双权威结果，并保持下游信任链单向。

### Evaluation Preferences（非硬约束）

- 优先减少调用方重复解释和 option 集合同步负担，但不以单 pass、统一 parser、代码行数减少或固定消费者数量作为成功条件。
- 平坦命令可继续使用专用或 strict bounded parser；只有存在独立收益时才迁移。
- 少量局部、强类型 hook 或开发期生成声明可以参与比较；主要消费者依赖大量通用 hook、条件 DSL 或运行期 schema 才能表达正常行为时，视为抽象泄漏证据。
- 渐进迁移是默认风险控制策略而非架构不变量；无论采用渐进或原子迁移，每个 executable 在生产路径中都只能有一个权威 analyzer。

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

- 用户已采纳最小约束集：D-060 的“一次解释”表示单一 Canonical 语义权威而非内部单 pass；D-067 的 fail-closed 表示保存未知 arity 造成的不确定余部，不把它静默升级为 bounded facts，具体结果仍由程序专属合同映射。
- C-046 复审已确认 Git 多次扫描与集合同步压力真实存在，但原记录对 `uv.ts`、`package-managers.ts` 的本地循环描述不准确，并遗漏 Herdr。
- C-046 创建后的程序层变更仍主要局限于 Git、option scanner 与 coreutils，尚未出现跨多个分层程序的同步迁移。
- 官方 CLI 合同表明 `git -C`、uv `--directory`/`--project` 与 npm prefix/workspace 不共享单一 cwd 语义。
- `herdr.ts` 当前丢弃未知 option token 而不产生 fail-closed 信号，是需独立验证的合同缺口，不自动证明完整 Manifest 合理。

### Durable Updates Checklist

- [x] `docs/decisions.md` — 澄清 D-060 单一权威而非单 pass，并澄清 D-067 unknown arity 的显式不确定性合同
- [x] `CONTEXT.md` — 同步单一 Canonical 权威与有界内部遍历
- [ ] `docs/decisions.md` — 仅在用户采纳最终模块边界后更新 D-067 的程序层结构结论
- [ ] `CONTEXT.md` — 仅在最终模块边界落地后同步程序层当前架构
- [ ] `docs/task.md` — 验证并完成 durable updates 后清档

## T-0136: 待创建

