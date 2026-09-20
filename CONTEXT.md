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
- **Semantic Unit**：Session 连续性中一个已捕获、可独立追踪的 requirement、constraint、assumption、finding、risk、decision candidate、evidence、external effect、work state 或 next action；操作完成状态不决定其 `live` / `closed` / `superseded` 语义生命周期。
- **Continuation Capsule**：由显式 roots 的 live 依赖闭包、durable authority 引用、workspace checkpoint、唯一 next action 与 closure tombstones 构成的结构化 Session Handoff 载荷；规范化 JSON 是语义载荷，Markdown 是确定性投影。
- **Session Handoff**：source session 把 captured semantics 唯一映射到 durable reference、Continuation Capsule、evidence reference 或有依据的 closure tombstone，完全内嵌于 Pi 会话条目中，经原生 replacement 绑定 successor，再由后继核对 workspace 并覆盖每个 live semantic ID 的 authority-context 转交；零外部孤儿目录，随会话清理一并销毁。
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
- **Host Project**：消费 AKeel 插件包的工程项目；AKeel 仓库自身在工程规范与 Project Records 容器维度同样是一个标准的宿主项目，遵循宿主对称性（Host Symmetry Invariant），不设立私有方言或特权门禁。

## Architecture

- **系统分发与组件拓扑（Distribution & Packaging，D-086, D-090）**：AKeel 分为三个可独立安装的 package：`akeel-guidance`（bootstrap、skills、Artifact Exchange、Handoff Store 与 Record Containers 校验工具）、`akeel-access-gate`（Access Gate 准入引擎）和 `akeel-context-pruner`（测试输出上下文裁剪）；根 `akeel` package 提供三者的全量 manifest。外部通过 Pi 宿主标准接口（`pi.extensions` 与 `pi.skills`）集成；各包分发目录归入能力资产域实施防篡改硬拦截，工作区源码 checkout 是唯一合法修改源。
- **提示词面与工程纪律注入（Prompt Surface & Guidance，D-030, D-053, D-073, D-084）**：`packages/guidance/src/bootstrap/` 通过 `before_agent_start` 原生注入包含工程原则的系统提示词 sections，天然具备会话转录持久化与 compaction 继承能力，Project Records 规范遵循宿主对称性（Host Symmetry Invariant），自仓与用户项目平等消费 guidance 提供的确定性容器校验工具；`packages/context-pruner/src/context-pruner/` 在构建模型 context 时无模型介入地将携带受支持运行器正向摘要的 `npm test` 成功输出进行正向证据投影裁剪，用户终端执行（`bashExecution`）与原始会话无损保留，TUI 呈现受限于临时 Human-only 视图（D-084）。Skills 严格按作者职责划分为 `disciplines/`（可复用方法）与 `workflows/`（端到端编排），按需全量加载；Policy Snapshot、配置文件与活动策略状态严格对 LLM 隔离（D-053），模型仅在失败路径接触静态有界的引导文案（D-023）。
- **Access Gate 单一授权信任链（Single Trust Chain Pipeline，D-059, D-060, D-087）**：受管工具（Direct `read`/`write`/`edit`/`find`/`grep`/`ls` 与 Shell `bash`）统一进入单向信任链：`compileManagedCall` facade 封装 Direct 与 Shell 私有语义车道，对请求执行一次权威、有界解释并发行 opaque `CanonicalCompilation`；compiler 内部可在固定预算内采用确定性的多阶段或常数次线性遍历，下游不得从原始请求重建同一事实。同一制品向授权域单次投影 sealed `AdmissionPlan`，依次经 `Mandatory Boundary`（不可放宽的硬安全截断，违规附带 terminate 熔断）与 `Configured Policy`（消费 Admission 与 Policy Snapshot 的纯函数内核）求值发行动作结论；Pi 宿主独占将审批要求映射为确认或静态 no-UI 阻断。未受管工具直通。
- **三域正交路径模型与强制安全硬边界（Three-Tier Path Domain & Mandatory Boundaries，D-070, D-071, D-090）**：路径准入划分为三个正交域：凭据域（实时凭据工件受管读写列搜一律硬阻断，D-070）、能力资产域（插件分发目录隐式只读准入，写删副作用实施不可放宽的防篡改硬拦截，D-090）与工作区主域（绑定会话启动时 `cwd` 的 `accessRoot` 与受管 `stagingRoot`，受 Preset 策略管辖，D-072, D-088）。破坏性删除（`destroy`）默认永久硬拒绝；仅显式非递归且具备完备路径证明的单文件裸 `rm` 接入知情同意（D-071）。
- **Shell 分析器注册表与有界执行流（Shell Analyzers & Execution Flows，D-067, D-087, D-091）**：封闭分析器注册表（`programs/`）为已知程序族（Git、bounded coreutils、解释器、Python、uv、herdr、包管理器、多语言构建工具族与 Java 运行工具）提供专有选项与路径事实提取；分层多命令程序采用共享确定性分段语法与程序私有 Invocation Plan / 语义投影的两阶段解耦架构，平坦命令保留专用有界分析器（D-067）；规范系统路径（`/bin/`、`/usr/bin/`）命中已知程序时复用裸名语义，自定义与非规范路径作为 source 路径事实纳入 Mandatory Boundary 并按 opaque execute 处理；支持字面 `/dev/null` 重定向流丢弃特例、确定性无副作用 inspect 命令（`true`/`false`/`:`），以及深度为 2 的有界静态管道流（上游纯只读 inspect 且零写副作用，下游限定为受支持文本过滤器或受管 `tee` 流式写入器）；多语言构建工具族（`cargo`、`go`、`make/gmake`、`mvn/mvnw`、`gradle/gradlew`）全面实现破坏性清理（`clean`）一票否决硬拦截与工作区变异参数消费（D-091）；未建模语法、无界修改与外部/网络 transport 严格 fail-closed。
- **编译期三层正交预算守卫（Static Resource & Analysis Budget Guard）**：Canonical 编译期实行三层硬预算防御，超限在语法解析层直接拒绝（`resource-limit`）且不进入后续授权内核：POSIX 路径边界管辖 Direct 路径、CWD 与搜索模式（`MAX_PATH_BYTES`）；对称数据载荷信封统筹 Direct `write` 与 `edit` 的内容与全部替换块总量（`MAX_DIRECT_PAYLOAD_BYTES`）；算法复杂度守卫维持命令行长度（`MAX_SHELL_COMMAND_BYTES`）、命令总数、条件流 CWD 状态分支数及 edit 替换块数的紧凑防线。
- **策略预设与会话暂存区生命周期（Policy Presets & Session Lifecycle，D-066, D-069, D-088）**：生产入口仅读取全局 `policy.yaml`，内置 `review`、`guided`、`develop` 并支持自定义 preset；每个 preset 声明独立 path scope，系统硬边界始终优先。`/policy` 提供临时选择面板、动态切换与状态查询；支持显式关闭 Access Gate（`off` 模式，D-066）。每个会话在受管临时资源目录下拥有专属的 `Session Resource Envelope`（含元数据、锁与唯一 `stagingRoot`），正常退出自动清理，异常残留遵循 retention 配额并由新会话异步回收（D-088）。
- **任务权威上下文、Session 接力与委托协作模型（Context Admission & Delegation Runtime，D-075, D-089, D-092）**：Task Owner Session 持有用户意图、需求、架构决策与最终验收的唯一 Authority Context；同一 Owner 的 session 接力通过 Pi custom-entry semantic ledger、no-silent-drop Continuation Capsule、会话内嵌收据状态机、显式 `/handoff [optional-notes]` 原生 replacement 与 successor reconciliation 转移 captured live semantics，零外部文件残留，source 原始 session 保留为冷归档但不整体注入后继 context（D-092）。需要隔离过程探索的工作通过 Herdr 同步子代理执行，有效写能力的委托代理强制进入独立 worktree（D-075）；结果返回原 Owner 时由 `Capability Artifact Exchange` 预留 run、发行单次有时限的 opaque capability，并在核验 binding、receipt、长度与摘要后原子 collect（D-089）。

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
- [D-090 三域正交路径访问模型与能力资产防篡改硬边界](docs/decisions.md#d-090-三域正交路径访问模型与能力资产防篡改硬边界)
- [D-091 多语言构建工具族语义分类与防误删硬边界](docs/decisions.md#d-091-多语言构建工具族语义分类与防误删硬边界)
- [D-092 必要语义保活、会话内嵌 Handoff 与单入口原生 Session 接力](docs/decisions.md#d-092-必要语义保活会话内嵌-handoff-与单入口原生-session-接力)
- [D-093 Session Handoff 采用 source intent 与 successor receipt 的单向两阶段交接](docs/decisions.md#d-093-session-handoff-采用-source-intent-与-successor-receipt-的单向两阶段交接)

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
- Shell 只支持显式定义、可静态证明且资源有界的子集；管道仅支持深度为 2 的有界静态管道（上游纯只读 inspect 且零写副作用，下游受限过滤器或 tee 流式写入），不提供任意多级管道链、后台并发管道（`&`）、管道内目录切换或向未知程序/解释器的数据流管道。设备文件只在 Shell 重定向目标为字面 `/dev/null` 时作为无害丢弃流豁免 target 路径与写入副作用，不向操作系统开放其它设备节点（如 `/dev/sda`、`/dev/zero`、`/dev/pts/*`），作为命令常规操作数的 `/dev/null` 以及向外部非 `/dev/null` 路径的重定向继续受路径边界硬拦截。`core/compilation/shell/programs/` 中的已知程序仍需提供 bounded path 事实；解释器脚本、uv run、npm/pnpm/yarn 执行、npx、pytest 和未知子命令等委托执行继续保持 opaque；内置 `review`/`guided`/`develop` 分别 deny/ask/allow。未建立完备证明的破坏操作（包括递归删除、目录删除、未知选项、未建模破坏命令与路径形式破坏可执行文件）永久 hard-deny；仅显式非递归且通过 Mandatory Boundary 核验的裸 `rm` 命令受管进入 Policy Kernel 评估（在内置 `guided`/`develop` 下为需知情同意的 `ask`，无 UI 时 fail-closed）。`commands.destroy: allow` 仅可作为自定义 preset 的合法配置值，不放宽未证明操作。Git local transport 仅接受可解析的项目内 `file://` path；HTTPS/SSH 等外部 transport、host、alias、间接 config、ext transport 和其他未建模形态继续 hard-boundary。`commands.opaque: allow` 不提供运行期 sandbox、路径强制或网络隔离；未建模的命令副作用不单独建模。
- 不把短期 Task Record、实施过程或审查报告作为永久当前知识；Task checkpoint 留在 Git 历史，正文落地后从当前树清除。
- Continuation Capsule 的固定 wrapper 与 delimiter 拒绝只保护文档结构和 authority 标记，不构成对其中自然语言的提示词注入隔离；reconciliation 证明 captured semantic ID 覆盖而不证明模型理解或遵从。来自外部不可信内容的 provenance/enforcement 仍属 C-038，不能因 Session Handoff 获得可信指令权。
- 不在 T-069 实现 Static Flow Graph、Explanation Replay 或 Runtime Audit Event，也不提供通用 Runtime Content Flow；D-084 仅覆盖模型 `bash` 工具结果行内的人类专用模型视图，不覆盖用户 `!`/`!!` 的 `bashExecution`。
- 不把旧实现结果当作正确性 oracle；旧代码、旧测试和 archive 只提供待重新证明的历史线索。
- Access Root 固定为会话启动时的 `cwd`；不自动向下选择子 Git 仓库，不因 cwd 位于 Git 子目录而向上扩大到 Git root，也不在会话内因 Shell `cd` 改变访问根。用户显式项目选择器、多个 Access Root 和动态切换仍不提供。
- Shell tilde expansion 只把受支持 Shell word 开头的未引用、未转义裸 `~` 或 `~/` 映射到会话初始化时的 `$HOME`；普通文件名、引用/转义形式、`~user`、动态或未建模形式不映射为 home。Direct path 不继承该 Shell 语义。
- 不自动识别或写入用户项目的自有文档体系；非标准体系由用户显式声明。
- 不分发独立 `grill-plan` 或响应自然语言 grill 触发词；grilling 只由用户手动调用 `grill-docs`。
- 不把 Herdr 声明为 AKeel runtime dependency；`grill-docs` 使用 Herdr 固定执行面和 Artifact Exchange verified collect。当前不提供异步 child mailbox、无人值守续跑、结果聚合、run/handoff GC、Task accepted/abandoned 状态或 pane/workspace/worktree 的确定性自动回收；artifact publication receipt 只证明结果完整发布，Session Handoff reconciliation receipt 只证明 captured live semantic ID 覆盖与 workspace 核对，均不证明模型理解、Task 验收、commit 保留或资源可删除。长期独立工作使用用户授权、范围互斥的 Task Owner Session，child 与临时资源仍由存活 Owner 检查并在用户批准后精确清理。
- `assess-modularity` 不提供覆盖数据所有权、运行时拓扑、部署、可靠性、安全和容量的广义 architecture review，也不实施或采纳其 findings。
- 能力资产域（Capability Domain）仅针对宿主已注册扩展与技能分发子目录（`git`、`node_modules`、`skills`、`extensions`）赋予只读准入，不放宽工作区外普通业务文件的读写，不将 `agentDir` 根目录自身纳入能力域，不对 Shell 任意动态或未建模命令开放能力资产执行，也不放宽分发目录的任何写/改/删操作（防篡改硬拦截）。

## Project Documents

- [`docs/candidates.md`](docs/candidates.md)：当前未采纳、未承诺实施的候选事项。
- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务。
