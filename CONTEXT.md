# AKeel Context

## Glossary

- **Access Gate**：拦截受管辖的 Pi `tool_call`，执行 Canonical → Admission → Mandatory Boundary → Configured Policy → host composition；未受管辖的工具 passthrough。
- **Access Root**：AKeel 绑定到 Pi 会话创建时 `cwd` 的固定访问边界；不要求 Git root，不因 Shell `cd` 改变，也不向下猜测子仓库。
- **Tilde Expansion Authority**：Shell 中受限 tilde expansion 使用的唯一 home 来源；当前为会话初始化时 Pi 进程的 `$HOME`，不是额外的 Pi `home` 字段。
- **Greenfield Semantic Rebuild**：新决策链只从 Pi/Bash/Linux 外部合同、明确政策语义和安全不变量设计；旧实现仅保留为 Git 历史参考。
- **Canonical Compilation**：对一个请求执行一次有界解释后发行的 opaque、不可变、可验真的编译制品；内部事实不作为公共 DTO 暴露。
- **Verified Candidate**：Herdr 讨论完成问题处理与事实核对后生成、等待 Task Owner Session 导入确认的临时候选制品。
- **Admission Plan**：Canonical Compilation 向授权域投影的最小 sealed 输入；以私有 Direct/Shell 判别变体保存 Mandatory Boundary 与 Configured Policy 实际消费的事实，不包含 host UI、配置格式或展示数据。
- **Mandatory Boundary Stage**：先于可配置 Policy 的不可放宽授权阶段，集中处理 credential、destroy/delete、blocked traversal 与 recursive blocked descendant；opaque access 的未证明风险由独立 policy 轴决定。
- **Authorization Verdict**：Authorization facade 发行的 `allow`、`approval-required` 或 `deny`；UI availability 与确认结果不属于该领域结论。
- **Policy Snapshot**：与配置格式无关、不可变的授权值；只由新 policy.yaml adapter 发行。
- **Policy Preset**：会话可绑定的完整策略定位；内置 `review`、`guided`、`develop`，并可加载合法的自定义 preset；不使用继承式 Profile，`status` 是命令保留字。
- **Human-only Status**：只面向用户显示、不会进入 LLM context、tool description 或 system prompt 的策略状态或选择界面。
- **Access Gate Off Mode**：用户在 `policy.yaml` 中显式设置 `accessGate: off` 或会话内 `/policy off` 后，仅保留 bootstrap 与 skills，Access Gate 不执行 tool-call 准入。
- **Policy Kernel**：Configured Policy 阶段中只消费 Admission Plan 与 Policy Snapshot 的同步纯函数，不读取原始请求、配置 loader、Shell parser 或 host UI。
- **Gate Session**：绑定单次 Pi session 的 runtime aggregate，拥有固定 Access Root、session-start `$HOME`、活动 Policy Snapshot、credential boundary 与 lifecycle。
- **Session Resource Envelope**：Access Gate 为一个 Pi session 在 `/tmp/akeel/sessions/session-*/` 创建的受管临时资源，包含 metadata、lock 与唯一 stagingRoot；正常 shutdown 删除，异常 residue 进入 D-088 retention。
- **Workflow Run**：同一 Task Owner 拥有的一次 bounded 临时 workflow attempt，位于 `/tmp/akeel/runs/run-*/`；它不是 Task Record，可包含 packet、child artifacts、control receipts、quarantine 与 transport diagnostics。
- **Artifact Capability**：Artifact Exchange 为一个 child result slot 发行的 opaque、单次、有时限有界文本发布权。
- **Formal Artifact Handoff**：child publication 经 binding、receipt、长度与 digest 核验后由原 Task Owner collect 的结果交接；Herdr settled state 与 terminal read 不构成该结果。
- **Session Handoff**：source session 通过 Handoff Store 发布、由 successor session 按 receipt 核验的 authority-context 转交；其 consumer 与 owner 会转移，不属于普通 Workflow Run。
- **Guidance**：从决策代码到静态 bounded host-facing 文案的封闭映射，不携带可执行 Shell。
- **Project Record**：项目文档中的受控记录总称，分为 Candidate、Task 和 Decision。
- **Candidate Record**：未采纳、未承诺实施的 `C-xxx` 停车记录，不构成指令或路线图。
- **Task Record**：用户已承诺实质调查、设计或实施的 `T-xxx` 工作记录；实施开始前或清档前以完整批准输入进入至少一个 Git 可达 checkpoint，落地后从当前树清除。
- **Slot（待创建占位）**：承载 C/T/D 序列下一可用编号的非记录占位。
- **Decision**：需要长期保留的架构、领域或安全取舍，记录在 `docs/decisions.md`。
- **Reversal surface**：每条 Decision 显式声明的逆转批准面；`user-boundary` 需用户显式批准，`engineering` 可经正式生命周期 supersede。
- **Durable Content**：工作结束后仍成立且承载约束的事实、取舍与承诺；过程产物不进入权威容器。
- **Task Owner Session**：对一个 Task 的用户意图、Requirements、已采纳裁决、finding disposition、最终验收、发布和 Project Record 更新持有唯一权威的会话；多个 Owner 只承载互斥、可独立验收的范围。
- **Authority Context**：由 Task Owner Session 持有的用户原始意图、Requirements、已采纳的范围/架构/政策决策、finding disposition、最终验收、发布决定与 Project Record 更新。
- **Result-Necessary Context**：理解、审计、质疑或继续 child 定稿所必需的推理、实质被拒方案、引用证据、变更、验证、未决问题和残余风险。
- **Quarantined Process Context**：探索期有用但不具结果准入资格的搜索轨迹、完整日志、重复失败、无影响假设、工具时间线和中间草稿；留在隔离会话或 artifact。
- **Direct-first**：文件检查优先使用 Direct `read`、`grep`、`find`、`ls`；新 pipeline 不因存在 Direct 等价入口自动拒绝安全可分析的 Shell。
- **Prompt Surface**：`packages/guidance/src/bootstrap/principles.md` 恒定注入、`packages/guidance/skills/` 按需加载，以及失败路径 guidance 三类 LLM 交互面。
- **Human-only Test Context View**：同一模型 `bash` 工具结果中面向人类 TUI 显示的裁剪后模型视图；用户 `!`/`!!` 产生的 `bashExecution` 不在范围内。该视图由纯投影临时生成，不是 session entry、模型消息或持久化内容。
- **Constant Invariant**：跨任务持续成立且需恒定可见的行为约束，由 `principles.md` 承载，不包装为按需 skill。
- **Skill Responsibility**：`disciplines/` 承载可复用工程方法，`workflows/` 承载端到端编排；目录表达作者职责，不定义 Pi 加载机制。
- **Skill Single Responsibility**：每个 skill 只做一件事，调用时全量消费；触发场景互斥的 skill 保持独立。
- **Single Source of Format**：格式与规则只在 `principles.md` 参考节定义一次，技能只引用不复制。
- **Module Design**：针对已知模块或接口问题，以 depth、leverage、locality、testability、implementation cost 与 test seam 评估具体设计的 discipline。
- **Modularity Assessment**：用户明确调用后，在指定仓库或子系统中发现 shallow module、weak seam 与 scattered responsibility，并交付临时 findings 的 workflow。
- **Change Preflight**：提交或独立审查前，以只读固定与验证为主、仅安全自治处理当前运行明确拥有的非敏感可恢复残留，并将当前 Task 活动变更收敛为 review-ready 或 blocked 的作者侧 discipline；不处理历史代码卫生或架构问题。
- **Review Surface**：独立代码审查开始时固定的不可变输入，覆盖适用的 branch commits、staged、unstaged、范围内 untracked 内容及其 Requirements；内容变化使旧审查结果失效。
- **Code Cleanup**：只在用户明确范围或已批准 maintenance scope 内执行的行为保持型深度维护；完成后重新进入文档同步、验证、preflight 与 review。
- **Reproduction Result**：`bug-reproduction` 交付的反馈信号结果，以 `reliable`、`probabilistic` 或 `blocked` 表示可用性，并携带 runner、症状判定、迭代成本、实测复现率、最小条件、调查工件与下一证据。
- **Implementation Planning**：把已批准的 Requirements 与 Design 转换为 implementation-ready Task Plan 的 discipline；Task 保持 `draft`，实施生命周期由 `implement-work` 持有。
- **Plan Slice**：Task Plan 内有序、可独立验证的实施单元，承载 Requirements 覆盖、前置依赖、验收标准、文件与接缝、验证和实施步骤，并共享所属 Task 的权威与生命周期。
- **Instruction Editing**：面向 agent-facing prompts、skills 与 operational instructions 的语义保持型编辑 discipline，以当前合同、统一术语、连贯结构、可靠引用和直接措辞表达已批准行为。
- **Prompt Surface Overlay**：项目对通用 Instruction Editing 方法追加的本地路径、运行时读取面、安全动作点和领域术语合同；AKeel overlay 由 `AGENTS.md` 承载。

## Architecture

- `packages/guidance/src/bootstrap/` 在 Session 启动和 compaction 后注入工程原则；`packages/context-pruner/src/context-pruner/` 在构建模型 context 时无模型参与地裁剪模型调用 `bash` 工具产生的、具备受支持测试运行器正向摘要的 `npm test`/`npm run test` 成功输出。任意成功文本、零测试、skipped/todo、warning 和未识别格式保持原样。用户 `!`/`!!` 产生的 `bashExecution` 保持不变；测试结果的原始 session 内容保持不变。D-084 将同一模型 bash 工具结果的 TUI 展示限定为原始输出与临时 Human-only Test Context View，后者不写入 session，也不改变模型 context 边界。通用 fresh-evidence 门禁属于该恒定面。Skills 只保留 `packages/guidance/skills/disciplines/` 可复用方法与 `packages/guidance/skills/workflows/` 端到端编排两个作者职责根。`module-design` 处理已知模块或接口设计；手动 `assess-modularity` 只发现仓库或子系统级结构摩擦并交付临时 findings。`implementation-planning` 把已批准的 Requirements 与 Design 组织为由 Plan Slices 构成的 implementation-ready Task Plan。`instruction-editing` 为用户项目提供语义保持型 instruction 编辑方法，`AGENTS.md` 为 AKeel Prompt Surface 提供本地 overlay。`implement-work` 持有实施生命周期，并在提交前编排 `change-preflight` 以只读方式核对当前活动变更、按安全自治合同处理有限残留；`code-review` 对固定 Review Surface 做独立只读审查，明确提交可直接固定 OID，`code-cleanup` 只处理明确批准范围内的行为保持型深度维护。`bug-reproduction` 为难以稳定观察的技术问题建立 Reproduction Result，`systematic-debugging` 消费可用信号并以区分性实验确认根因，在授权范围内衔接 TDD 与 fix validation。Grilling 只由用户手动调用的 `grill-docs` 承载，按未决问题处理、候选方案确认、事实核对、verified candidate 交接和 Task Owner 导入的固定顺序执行。
- AKeel 分为三个可独立安装的 package：`akeel-guidance`（bootstrap、skills、Artifact Exchange 与 Handoff Store）、`akeel-access-gate`（Access Gate）和 `akeel-context-pruner`（测试输出上下文裁剪）；根 `akeel` package 提供三者的全量 manifest。
- 委托按 D-075/D-089 执行上下文准入和封闭路由：Task Owner Session 保留 Authority Context；需要隔离过程上下文且结果仍由该 Owner 裁决的工作统一通过 Herdr child 同步执行。Owner reserve run、发布 packet、绑定 child slot，以 opaque capability 启动 child；child 通过专用 tool 发布一次 bounded artifact，Owner 只在 status/collect 验证 binding、receipt、长度与 digest 后导入。Herdr settle 与 `agent read` 仅属执行状态和诊断。AKeel 不维护第二套 agent 执行面，也不把 Herdr 声明为 runtime dependency。可独立验收的长期工作只有经用户明确授权才进入范围互斥的新 Task Owner Session。有效能力含写入或文件修改 Shell 的 delegated agent 强制进入独立 worktree；child 不自清理，由存活 Owner 负责检查、集成与明确批准后的回收。
- `packages/access-gate/src/access-gate/access-decision/` 是当前唯一决策实现：`core/compilation/` 以一个 facade 封装私有 Direct/Shell 语义车道并发行 opaque Canonical Compilation，Shell 的 Git、bounded coreutils、解释器、Python 工具、uv、herdr 和 npm 族 analyzer 位于 `core/compilation/shell/programs/`；`core/authorization/` 发行 sealed Admission，并集中执行 Mandatory Boundary 与 Configured Policy。Git `-C`、`--git-dir` 和 `--work-tree` 通过 Canonical command-local cwd seam 解析，安全只读 Git 命令（`status`、`log`、`diff`、`show` 等）按 inspect 准入，有界本地变更命令 `add` 与 `commit -m` 在 Git 控制面写保护下按 modify 准入，远程/网络 transport、helper-capable Git 操作、显式 external driver 及 `git config` hard-deny。`adapters/` 单次转换 Pi 与 policy.yaml 输入，`runtime/gate-session.ts` 聚合固定 Access Root、session-start `$HOME`、Policy、credential boundary 和 project/staging lifecycle，Pi host composition 独占 UI approval/no-UI 映射。每个 session 在 `/tmp/akeel/sessions/session-*/` envelope 内拥有 metadata、lock 与 `staging/`；正常 shutdown 删除，异常 residue 保留 7 天并受 200 目录与 500MB 配额约束，session 启动时只对 provenance 可验证的无主 envelope 异步回收。
- Access Decision Pipeline（D-059/D-060/D-087）已完成单一授权信任链的原子生产切换。一个 `compileManagedCall` facade 对每个请求只解释一次并发行内部判别车道的 opaque Compilation；同一制品只投影一次 sealed Admission，Display 仅在 `approval-required` 时按需投影。Mandatory Boundary 先于只消费 Admission + 单一 Policy Snapshot 的 Configured Policy，Authorization verdict 不读取 UI；Pi host 再把 approval requirement 映射为 confirm 或静态 no-UI block。Canonical pathname evidence 在同一 CWD 状态/source token 上只获取一次并保留 lexical 与 symlink-target traversal prefixes；Direct search 与 Shell recursive path 均在 blocked descendants 上 fail-closed，有显式 path boundary 时 unknown/unbounded Shell path access 也不得放行。path-form executable 默认不因已知 basename 获得 inspect/modify 语义；仅 `/bin/git` 与 `/usr/bin/git` 复用裸名 Git 语义，其他非破坏性形式统一按 opaque execute 处理；裸名 `find` 发行 inspect/read、recursive 与 start-path facts，仅支持 bounded `-name`/`-iname`/`-path`/`-ipath`/`-type`/`-maxdepth`/`-mindepth` 表达式，未知、复合、symlink-following、外部执行和副作用形式继续 fail-closed；Git 显式项目内 `file://` remote 转为 path fact，远程/网络 transport、helper-capable Git 操作、显式 external driver、`git config`、host、alias 和间接 config remote 继续 fail-closed。
- 受管辖 surface 为 Direct `read`、`write`、`edit`、`find`、`grep`、`ls` 与 Shell `bash`。无效 host context、unsupported syntax 和硬安全边界 fail-closed；外置 `policy.yaml` 缺失、为空或不可用时整体忽略并使用内置 `review` 基线，不部分采用无效内容；未拥有的工具 passthrough。
- 生产入口只读取 `$PI_CODING_AGENT_DIR/akeel/policy.yaml`（默认 `~/.pi/agent/akeel/policy.yaml`）。内置 `review`、`guided`、`develop` 不依赖外置文件；文件缺失、为空、格式/schema/legacy 不可用时整体忽略并使用内置 `review`，不部分采用、不读取旧 config/Profile schema，也不使用旧 fallback。
- Policy Preset 当前由 D-069 规定为内置 `review`、`guided`、`develop` 和 `policy.yaml` 自定义 preset；每个 preset 可拥有独立 path scope，系统 hard boundary 始终优先。自定义 badge 由配置声明或自动消歧。内置 `guided` 与 `develop` 将 `commands.destroy` 设为 `ask`，`review` 为 `deny`；D-071 仅对已建立完备路径证明的单文件非递归裸 `rm` 解除硬边界短路并接入知情同意（`ask`，无 UI 时 fail-closed），递归删除、目录删除及未证明破坏操作继续永久 hard-deny。`/policy` 提供临时 preset 选择面板、显式切换和状态查询；策略 Badge 通过宿主 `ui.setStatus` 同步，会话结束时清除。Delegated child 按任务类型的能力分层与风险边界仍属 C-009 候选范围。
- 宿主拥有且用于保存实时凭据的凭据工件由 D-070 归入系统 hard boundary：对 Canonical 阶段明确识别的受管路径操作 `read`、`write`、`edit`、`list`、`search` 一律拒绝，preset 不得放宽；模板类工件不属于该类别。分类依据是受信任 agent 目录下的路径身份契约，不读取内容；递归 search 若候选路径与 credential root 相交则硬拒绝，非递归的 agent 目录访问仍按既有路径策略处理，也不为无法发行具体路径的 opaque Shell access 增加凭据专用拒绝。
- Access Gate 默认启用；D-066 允许用户在 `policy.yaml` 中以 `accessGate: off` 或在会话内通过 `/policy off` 进入关闭模式（仅保留 bootstrap/skills，tool-call 直通）；off 模式下可随时通过 `/policy <preset>` 动态启用 Access Gate。
- Prompt Surface（D-030/D-053/D-023）：Policy Snapshot、policy.yaml 和活动 policy 状态不进入 context 消息、tool description 或 system prompt；模型可见的政策相关文本只有受 D-023 限定的静态失败 Guidance。
- 旧决策实现、旧测试与 archive 不属于当前依赖边界，也不是 parity oracle。Static Flow、Explanation Replay 与 Runtime Content Flow 不属于 T-069。

## Active Decisions

- [D-002 统一 Access Gate 与用户态边界](docs/decisions.md#d-002-统一-access-gate-与用户态边界)
- [D-003 bigpowers 技能精选](docs/decisions.md#d-003-bigpowers-技能精选)
- [D-009 项目分发与文档边界](docs/decisions.md#d-009-项目分发与文档边界)
- [D-018 Shell 与 Direct 语义准入边界](docs/decisions.md#d-018-shell-与-direct-语义准入边界)
- [D-023 决策渲染、静态 Guidance 与知情同意（literal form）](docs/decisions.md#d-023-决策渲染静态-guidance-与知情同意literal-form)
- [D-028 统一 Project Record 模型与 Candidate 显式复审](docs/decisions.md#d-028-统一-project-record-模型与-candidate-显式复审)
- [D-030 提示词体系边界与原则部署（Prompt Surface）](docs/decisions.md#d-030-提示词体系边界与原则部署prompt-surface)
- [D-035 平台边界收窄为仅 Linux](docs/decisions.md#d-035-平台边界收窄为仅-linux)
- [D-037 Shell wrapper 链由语义入口统一解析](docs/decisions.md#d-037-shell-wrapper-链由语义入口统一解析)
- [D-044 测试组织镜像 src 分层](docs/decisions.md#d-044-测试组织镜像-src-分层)
- [D-045 Shell 条件流的有界 CWD 结果集](docs/decisions.md#d-045-shell-条件流的有界-cwd-结果集)
- [D-047 原则优先级与 Reversal surface 申报属性](docs/decisions.md#d-047-原则优先级与-reversal-surface-申报属性)
- [D-052 Git clone 目标路径与选项边界](docs/decisions.md#d-052-git-clone-目标路径与选项边界)
- [D-053 Policy 数据零注入](docs/decisions.md#d-053-policy-数据零注入llm-上下文隔离)
- [D-054 提示词面引用可靠性边界](docs/decisions.md#d-054-提示词面引用可靠性边界指针化与内嵌的取舍判据)
- [D-059 Greenfield Access Decision Pipeline 与原子替换](docs/decisions.md#d-059-greenfield-access-decision-pipeline-与原子替换)
- [D-060 受保护 Canonical 制品、窄 Admission 投影与有界求值](docs/decisions.md#d-060-受保护-canonical-制品窄-admission-投影与有界求值)
- [D-063 Direct edit 独立策略与显式本地配置](docs/decisions.md#d-063-direct-edit-独立策略与显式本地配置)
- [D-066 Access Gate 显式关闭与仅技能运行模式（off）](docs/decisions.md#d-066-access-gate-显式关闭与仅技能运行模式off)
- [D-067 Canonical 程序语义族、可执行文件身份与委托执行边界](docs/decisions.md#d-067-canonical-程序语义族可执行文件身份与委托执行边界)
- [D-069 Policy 配置文件、Preset 注册表与用户交互界面](docs/decisions.md#d-069-policy-配置文件preset-注册表与用户交互界面)
- [D-070 宿主凭据工件的系统硬边界与分类规则](docs/decisions.md#d-070-宿主凭据工件的系统硬边界与分类规则)
- [D-071 Destroy 操作永久硬拒绝与有界单文件受审批准入](docs/decisions.md#d-071-destroy-操作永久硬拒绝与有界单文件受审批准入)
- [D-072 Session 启动 cwd 作为访问根与 `$HOME` 的受限 tilde 语义](docs/decisions.md#d-072-session-启动-cwd-作为访问根与-home-的受限-tilde-语义)
- [D-073 Skill 作者职责与恒定不变量归属](docs/decisions.md#d-073-skill-作者职责与恒定不变量归属)
- [D-074 单一 grill-docs 分阶段工作流](docs/decisions.md#d-074-单一-grill-docs-分阶段工作流)
- [D-075 Task Owner 上下文准入、Herdr 同步委托与 Worktree 隔离](docs/decisions.md#d-075-task-owner-上下文准入herdr-同步委托与-worktree-隔离)
- [D-077 Decision 寄存器的轻量 hygiene 校验](docs/decisions.md#d-077-decision-寄存器的轻量-hygiene-校验)
- [D-078 Workflows 触发模型](docs/decisions.md#d-078-workflows-触发模型手动调用与即时介入)
- [D-079 模块设计方法与模块化评估工作流分界](docs/decisions.md#d-079-模块设计方法与模块化评估工作流分界)
- [D-080 当前变更预检、独立代码审查与显式深度清理分界](docs/decisions.md#d-080-当前变更预检独立代码审查与显式深度清理分界)
- [D-081 复现信号与系统化根因调试分界](docs/decisions.md#d-081-复现信号与系统化根因调试分界)
- [D-082 单一实施规划能力与 Plan Slice](docs/decisions.md#d-082-单一实施规划能力与-plan-slice)
- [D-083 Instruction Editing discipline 与仓库 overlay](docs/decisions.md#d-083-instruction-editing-discipline-与仓库-overlay)
- [D-084 测试输出投影、正向运行器证据与会话持久化边界](docs/decisions.md#d-084-测试输出投影正向运行器证据与会话持久化边界)
- [D-086 三个可独立安装能力包与全量分发入口](docs/decisions.md#d-086-三个可独立安装能力包与全量分发入口)
- [D-087 Access Gate 双语义车道与单一授权信任链](docs/decisions.md#d-087-access-gate-双语义车道与单一授权信任链)
- [D-088 Session-owned Staging 生命周期与保留策略](docs/decisions.md#d-088-session-owned-staging-生命周期与保留策略)
- [D-089 Capability Artifact Exchange 与临时资源分类](docs/decisions.md#d-089-capability-artifact-exchange-与临时资源分类)

## Negative Space

- 不提供 OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或独立 network policy 轴。
- 仅保证支持 Linux 平台及默认大小写敏感的本地文件系统语义；不提供 Windows、macOS、BSD 支持，不建模其路径和选项方言，也不覆盖 casefold 目录或 CIFS/VFAT/NTFS 挂载点上的大小写别名语义。
- 不承诺 pathname check 与实际文件操作之间的 TOCTOU 消除；gate 只做纯决策，不执行文件操作或传递 fd。
- 不拦截 `user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend、未知 Direct tool surface 或其他 Extension 的直接操作。
- 审批后的实际文件操作由操作系统权限决定；gate 不控制执行后的行为，也不提供完整 security log scrubbing。
- Policy Preset 只通过 `/policy` 的临时 human-only 选择面板、显式命令和状态查询使用；自定义 preset 不通过 UI 创建或编辑。
- 不提供 AKeel 管理的 delegated child 能力分层、父子权限钳制或子代理 preset 继承；按任务类型的能力与风险边界仍属 C-009 候选范围。
- Access Gate 可由用户显式禁用；禁用时不拦截 managed tool call，故不提供路径、Shell 或操作准入保证。bootstrap 与 skills 仍然分发和运行。
- 旧 `config.yaml`、Profile、命令覆盖、继承和子代理字段不属于新 Policy Snapshot 输入；当前只读取全局 `policy.yaml` 的静态策略字段、preset 绑定或显式 `accessGate` 禁用标志。
- Shell 只支持显式定义、可静态证明且资源有界的子集；不可证明形态保持 opaque，但其风险由独立 `commands.opaque` 策略决定。`core/compilation/shell/programs/` 中的已知程序仍需提供 bounded path 事实；解释器脚本、uv run、npm/pnpm/yarn 执行、npx、pytest 和未知子命令等委托执行继续保持 opaque；内置 `review`/`guided`/`develop` 分别 deny/ask/allow。未建立完备证明的破坏操作（包括递归删除、目录删除、未知选项、未建模破坏命令与路径形式破坏可执行文件）永久 hard-deny；仅显式非递归且通过 Mandatory Boundary 核验的裸 `rm` 命令受管进入 Policy Kernel 评估（在内置 `guided`/`develop` 下为需知情同意的 `ask`，无 UI 时 fail-closed）。`commands.destroy: allow` 仅可作为自定义 preset 的合法配置值，不放宽未证明操作。Git local transport 仅接受可解析的项目内 `file://` path；HTTPS/SSH 等外部 transport、host、alias、间接 config、ext transport 和其他未建模形态继续 hard-boundary。`commands.opaque: allow` 不提供运行期 sandbox、路径强制或网络隔离；未建模的命令副作用不单独建模。
- 不把短期 Task Record、实施过程或审查报告作为永久当前知识；Task checkpoint 留在 Git 历史，正文落地后从当前树清除。
- 不在 T-069 实现 Static Flow Graph、Explanation Replay 或 Runtime Audit Event，也不提供通用 Runtime Content Flow；D-084 仅覆盖模型 `bash` 工具结果行内的人类专用模型视图，不覆盖用户 `!`/`!!` 的 `bashExecution`。
- 不把旧实现结果当作正确性 oracle；旧代码、旧测试和 archive 只提供待重新证明的历史线索。
- Access Root 固定为会话启动时的 `cwd`；不自动向下选择子 Git 仓库，不因 cwd 位于 Git 子目录而向上扩大到 Git root，也不在会话内因 Shell `cd` 改变访问根。用户显式项目选择器、多个 Access Root 和动态切换仍不提供。
- Shell tilde expansion 只把受支持 Shell word 开头的未引用、未转义裸 `~` 或 `~/` 映射到会话初始化时的 `$HOME`；普通文件名、引用/转义形式、`~user`、动态或未建模形式不映射为 home。Direct path 不继承该 Shell 语义。
- 不自动识别或写入用户项目的自有文档体系；非标准体系由用户显式声明。
- 不分发独立 `grill-plan` 或响应自然语言 grill 触发词；grilling 只由用户手动调用 `grill-docs`。
- 不把 Herdr 声明为 AKeel runtime dependency；`grill-docs` 使用 Herdr 固定执行面和 Artifact Exchange verified collect。当前不提供异步 child mailbox、自动续跑、结果聚合、run/handoff GC、accepted/abandoned 状态或 pane/workspace/worktree 的确定性自动回收；publication receipt 只证明 artifact 完整发布，不证明验收、commit 保留或资源可删除。长期独立工作使用用户授权、范围互斥的 Task Owner Session，child 与临时资源仍由存活 Owner 检查并在用户批准后精确清理。
- `assess-modularity` 不提供覆盖数据所有权、运行时拓扑、部署、可靠性、安全和容量的广义 architecture review，也不实施或采纳其 findings。

## Project Documents

- [`docs/candidates.md`](docs/candidates.md)：当前未采纳、未承诺实施的候选事项。
- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务。
