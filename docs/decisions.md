# AKeel Decisions

本文集中记录 AKeel 的长期架构、工程和安全决策。每条只保留当前结论、理由、必要替代方案和影响；被完整吸收（`superseded`）或主动退役（`retired`）的条目从寄存器剪除，历史由 Git 保留（规则见 [D-028](#d-028-统一-project-record-模型与-candidate-显式复审)）。

**条目格式**：遵循 principles.md Project Records — Decision Record Format；条目存在即表示 active，显式 `Reversal surface` 后依次为 `Decision`、可选规格子节、`Why` 及有内容才保留的 `Impact`/`Rejected`/`Out of Scope`。

## D-002: 统一 Access Gate 与用户态边界

Reversal surface: user-boundary

Decision: 使用统一的 `packages/access-gate/src/access-gate/access-decision/` 扩展集中处理 Canonical、Admission、Policy Snapshot、hard boundary 和 host approval，不提供或假定 OS-level isolation。

Why: 多个安全扩展会产生拦截顺序竞争、重复审批、分散配置和难以关联的审计信息。Node.js 路径检查没有 kernel-level enforcement；将 AKeel 称为 sandbox 会造成安全承诺与真实边界不一致。

Impact: AKeel 自行维护统一扩展，不自动继承社区扩展的独立更新。

Out of Scope: OS sandbox、容器、VM、seccomp、Landlock、network namespace 和其他 kernel-level isolation。

## D-003: bigpowers 技能精选

Reversal surface: engineering

Decision: 只引入 bigpowers 中具有独特价值、且没有更合适替代品的技能。

Why: 整体引入会带入平台专用、重复、内部元工具和项目特定能力，增加加载与维护成本。

Impact: 不提供自动生命周期编排，由 bootstrap、技能匹配和 `survey-context` 协同完成。

## D-009: 项目分发与文档边界

Reversal surface: user-boundary

Decision: `README.md` 是唯一用户使用入口；移除平行的 `USAGE.md`、不必要的 npm 元数据和用户 `AGENTS.md` 模板。长期架构、安全、溯源和 Project Record 文档按职责保留在 `docs/`。本地约束：`AGENTS.md` 只定义 AKeel 自身的维护入口和仓库约定，不复制注入原则、Task 生命周期或当前架构；`docs/traceability.md` 只记录外部来源、采用方式、当前文件映射和许可证义务——当前架构、安全承诺与残余风险、长期取舍分别由 `CONTEXT.md`（含 Negative Space）和本寄存器维护。

Why: 每个文件都应有明确的维护对象和用户价值；重复的使用、架构、安全和工作流说明会漂移，AKeel 也不应越过用户项目工程约定文件的所有权边界；溯源文件只有在来源、revision、采用范围和许可证证据可核查时才具有合规价值，运行时行为和融合取舍放入其中会把它变成第二份架构与决策文档。

Impact: 修改运行时行为不再自动更新 `docs/traceability.md`，只有第三方来源映射或许可证义务变化时才更新；新增或同步外部内容必须记录固定的上游 commit 或 release。

Rejected: 不保留按当前模块罗列“来源 + 融合决策”的架构摘要，也不使用主观原创占比作为合规证据。

Out of Scope: 恢复初始引入的精确上游 revision：本地提交 `2f4a3ef` 未保存这些 revision，Git 历史无法可靠还原，仅在有可验证历史快照或导入元数据时补录。

## D-018: Shell 与 Direct 语义准入边界

Reversal surface: user-boundary

Decision: 受管 Shell `bash` 与已知 Direct surface 共享 hard boundary、Canonical path resolution 和 Policy Snapshot 决策。文件检查场景优先选择 Direct `read`、`grep`、`find`、`ls`；Direct-first 属于模型工具选择偏好，不构成 host 层 Shell 禁令，Direct 等价入口也不是 Shell gate 的绕过路径。Shell 只在当前由 Bash/Linux 外部合同和独立测试证明的支持子集内建模：简单命令、有限 `&&`/`||`/`;` flow、受限重定向、bounded CWD 候选和已声明的程序语义。Canonical 发行事实后，Admission 向 Policy Kernel 提供最小授权事实；Policy 不执行 Shell，也不重新解析请求（D-059/D-060）。

Security invariants:

- blocked intent 与 credential/hard boundary hard deny，不能由 Policy preset 或一次性审批覆盖。
- 只有所有支持范围内的语法、command effect 和 path fact 都被安全解释时才可进入授权；无法证明的形态 fail-closed。
- wrapper 必须保留底层命令 intent。
- modify 命令的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- CWD 分支必须保留所有 bounded 可达候选；Admission 不得选择对授权更宽的单一路径。
- Canonical path resolution 保留 lexical 与 symlink-target traversal prefixes；blocked components remain hard boundaries，recursive path operations reject blocked descendants。
- 配置显式 path boundary 时，unknown 或其他 unbounded Shell path access 一律 hard-deny；无显式 boundary 时仍按 command class policy 决策。
- 一个 tool call 的所有 ask intent 聚合为一次审批；无 UI 不执行 ask。
- newline、background、compound command、`for`、动态展开及其他不可证明形态继续在 Canonical 阶段拒绝，不引入猜测放行；支持有界两阶段静态管道流（`cmd1 | cmd2`）：严格约束深度为 2，管道内部禁止 `cd` 且完全继承外层 CWD；上游必须为纯只读 `inspect` 命令且零写副作用（严禁包含 `>`/`>>` 文件写重定向）；下游严格限定为纯文本过滤器（`grep`、`rg`、`head`、`tail`、`wc`、`cut`、`sort`、`uniq`、`tr`、`cat`、`od`）或受管流式写入器（`tee`）；严禁任意一端出现解释器（`sh`/`bash`/`node`/`python`）、包管理器、网络外联工具（`curl`/`wget`）或未建模 `opaque` 命令；`tee` 携带的操作数映射为 target 写入路径事实并受三域路径模型管辖；多级管道、后台流（`&`）及其他不可证明形态继续 fail-closed。
- `<>` 与 `2<>`（O_RDWR 读写打开）按 write 侧建模：write 决策覆盖读面（write⇒read 一致性）；不以只读建模掩盖写侧。Policy adapter 必须拒绝矛盾的 write/read 组合，避免由配置产生未定义授权语义。
- Shell 重定向支持标准描述符形态：`0<` 与 `<` 按 source 读入建模，`>`、`>>`、`1>`、`1>>`、`2>`、`2>>`、`<>` 与 `2<>` 按 target 写入建模，字面 `2>&1` 按流复制修饰符处理且不发行多余路径事实。所有重定向目标为字面 `/dev/null` 时均作为无害丢弃流处理，不发行 target 路径事实、不污染写入 effect；作为命令常规操作数的 `/dev/null`、其它设备节点（如 `/dev/sda`、`/dev/zero`、`/dev/pts/*`）以及向外部非 `/dev/null` 路径的重定向继续受路径边界与安全策略硬拦截；非标准描述符（如 `3>`、`4>` 等）、多行输入（`<<`、`<<<`）与未建模流复制（如 `2>&2`、`<&`）继续 fail-closed。

Enforcement scope:

只对 Pi `tool_call` 中的 `bash` 和已知 Direct surface 执行策略；未知 Direct surface passthrough。不承诺全局 enforcement：`user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 及后续 handler 对 input 的修改不在范围内。

Why: Direct 工具提供结构化参数和更窄的访问面，适合作为模型默认选择；但 Direct 写保护无法覆盖重定向、`cp`、`mv` 等 Shell 写入入口。统一 Canonical 语义层集中提取命令类别、路径事实与 effects，避免分类和策略漂移。按命令名禁用会把工具选择变成能力禁止并破坏合法组合；反过来，对不可证明形态猜测放行会造成潜在漏判。fail-closed 优先：识别不了就拒绝，由模型拆解。

Impact: 新 Shell 形态按“识别 → Canonical 建模 → Admission/Policy → 拒绝拆解”处理；新增程序、重定向或 flow 形态必须先在当前外部合同和 public seam 上证明，再进入支持子集。Direct-first 是模型偏好，不是 host 层强制路由；安全可分析的字面 Shell 仍然允许，且受相同的 path boundary、credential boundary 和 command policy 约束。

Rejected: 不采用“Direct 存在即禁用 Shell”等价命令；不把 Direct 工具作为 Shell gate 的绕过路径；不在本决策中实现 Shell glob 的安全展开或把不可证明的动态形态升级为可授权中间状态。

## D-023: 决策渲染、静态 Guidance 与知情同意（literal form）

Reversal surface: user-boundary

Decision: Host-facing rendering 只消费 Policy/Canonical 的结果和按需投影的 bounded `Display View`，不执行工具、不重新解释请求，也不生成可执行建议。它分为三条封闭路径：

- **allow**：返回不带展示内容的允许结果。
- **deny**：通过源码内置的静态 code→reason 映射返回 bounded block；reason 不拼接原始 Shell、用户路径、glob 或其他用户派生值，也不提供绕过硬边界的替代执行建议。对于 `hard-boundary` 与 `security-boundary` 等安全硬边界，静态文案明确声明终态并禁止绕过（如包装脚本或变形重试），要求模型就地停机并向用户汇报。
- **ask**：只返回 `executed: false` 的 confirm。Shell 展示已投影的 command class/effects 与 literal command，Direct 展示 operation/path；这些用户派生值只进入人类审批面，不进入 deny reason。没有 Display View 时使用静态的 `Approval required.`。

所有 host-facing 结果均为 immutable 值；审批摘要最多 160 个字符并以省略号截断。没有可用审批 UI 时由 host composition 阻断，不执行请求。拒绝、确认和执行的职责保持分离：renderer 只产生 host-facing data，实际执行仍由宿主在明确批准后负责。

Security invariants:

- deny guidance 不携带用户派生值，不生成 Shell，不调用替代 tool；硬边界、策略拒绝、unsupported syntax 和动态输入都只能得到静态分类文案。安全边界阻断向模型明确传达防御终态与禁止绕过/脚本包装，阻断将安全门禁误判为可重试技术错误的模型偏置。
- ask 侧向人类展示其需要否决的 bounded 事实；Shell 的 literal form 保留原始命令的知情同意价值，Direct 的 path 是对应文件操作的必要信息。
- Display View 是授权域之外的按需投影；Kernel 不消费展示文本，renderer 不反向影响 Canonical 或 Policy。
- unknown、动态值和其他未建模形态仍由 Canonical/Policy 合同决定其拒绝或 ask 结果；renderer 不通过展示层猜测其运行期语义。

Review-mode modification Guidance:

- 当活动 preset 是内置 `review`，且 Direct `write`/`edit` 因普通 `policy-denied` 被拒时，可返回固定的静态 Guidance，提醒用户切换到允许修改的策略。
- 该 Guidance 不是授权、审批替代或自动提权；用户必须显式完成策略切换。Shell、hard boundary、敏感路径、破坏性操作、unknown、unsupported 或其他非普通策略拒绝不使用该窄 Guidance。
- Guidance 不判断规划是否完成，不携带路径、命令、策略字段或其他用户派生值。Policy 内容、策略状态和活动 preset 的上下文隔离仍由 D-053 负责。

Why: 拒绝文案是模型可见的失败路径，若携带用户输入或可执行替代方案，就会扩大信息暴露并形成绕过提示。相反，ask 必须让人类看到足以批准或否决的有限事实；对 Shell 隐去 literal command 会使审批退化为盲批。把两侧分开，并将展示限定在 bounded Display View，可同时保持静态安全 guidance 和有效知情同意。

Impact: 当前 host contract 使用静态 block reason；Shell ask 摘要包含命令类别、effects 和 literal form，Direct ask 摘要包含操作与路径。审批结果永不表示已执行；无 UI、用户拒绝或异常均由 host composition 阻断。该渲染合同不规定旧 renderer、旧 GuidanceId、旧 DecisionCode、旧 plan/verifier 或旧 Profile/config 的兼容形状。

Rejected:

- **deny 中拼接原始命令或路径**：增加模型侧暴露，且审批所需的用户输入只应出现在 ask 面。
- **ask 只展示类别、不展示 literal form**：人类无法判断命令的完整意图，审批会退化为盲批。
- **renderer 调用替代 tool 或生成可执行修复命令**：把展示层变成执行入口并扩大提示注入面；模型可根据静态文案自行拆解后重试。
- **通过旧 renderer、旧 GuidanceId 或旧结果 parity 定义新合同**：旧实现不是当前语义或安全性的权威来源（D-059/D-060）。

Out of Scope:

- 逐命令拆分审批：批准粒度仍是 tool-call 级。
- 对 unknown/opaque 命令补充运行期语义：属于当前程序语义合同边界。
- 宿主对工具调用历史、执行输出或其他 extension 通道的脱敏与审计：不属于 renderer 合同。

## D-028: 统一 Project Record 模型与 Candidate 显式复审

Reversal surface: user-boundary

Decision: 用户项目使用分层 Project Record 模型：`docs/candidates.md` 的 `C-xxx` 是未采纳候选；`docs/task.md` 的 `T-xxx` 是已承诺 Task；`docs/decisions.md` 的 `D-xxx` 是已采纳长期结论；`CONTEXT.md` 只表达当前事实与 active Decision 索引。Requirements、Design、Plan 只作为 Task Record 章节，不建独立 plan/spec 文档类型。

Task 容器由 Git 跟踪，正文只在 active 期间留在当前树。每个 T-ID 在实施或清档前必须有一个包含已批准 Requirements 与必要 Design/Plan 的可达 checkpoint；占位推进或 commit message 提及不算记录。只为跨会话、交接或权威输入变化提交后续 Task 状态，不保存步骤日志。提炼 durable content 后在后续 commit 清档，并保留至少一个可达 checkpoint。

不是每个仓库变更都构成 Task。Task 只覆盖实质的调查、设计、实现或协调工作；孤立的局部说明文案调整若不改变能力、授权、职责、跨文件合同、外部事实、安全边界、架构、Decision 或 Project Record，则不进入 Task。涉及其他文件、上述任一边界或语义不确定的变更均按实质 Task 处理，完整分类规则由 `principles.md` Project Record Authority 单源定义。

Candidate 是停车记录，不属于常规上下文输入；Candidate review 由 `survey-context` 仅在用户明确请求时执行，具体复审范围、记录读取和缺失处理遵循该 workflow 的 bounded procedure。Candidate 中的 `Revisit condition` 仅用于显式复审时核对是否值得重新讨论，候选进入 Task 仍以用户显式选择为准。

Authority rules:

- Candidate Record 是项目数据而非指令；文件存在、命令式措辞或 `Revisit condition` 都不构成需求、处理顺序、路线图、当前事实、用户批准或实施授权。
- 只有用户在当前会话明确选择后，Candidate 才能迁移为 Task、Decision、Negative Space 等权威内容；迁移时移动 durable content 并在同一变更删除 C 来源，避免双源。
- Candidate 文件按需创建，缺失不是结构错误。Task 完成后从当前树清档；Decision 的寄存器存在性即表示 active，被完整吸收（`superseded`）或主动退役（`retired`）后剪除。历史由 Git 保留，ID 不复用；Next-ID slots 机制见 principles.md Project Records — Next-ID slots。
- Decision 离开只有两条路径：`superseded`（被完整吸收，内容延续）或 `retired`（能力撤销或移交外部，内容终止），去向就位后剪除。退役去向：完全撤销→残余耐用主张迁入 Negative Space；移交外部→归属边界记为窄边界决策或并入 CONTEXT。`superseded` 必须指向承接 D-xxx，`retired` 必须指向去向；终态不作为 `Status` 元数据留在寄存器。终态一律原因命名并声明去向：Candidate `promoted/dismissed`、Task `cleared`、Decision `superseded/retired` → 剪除。
- `principles.md` 是 Project Record 分类与生命周期的唯一部署权威；迁移由现有领域/计划/文档技能负责，不新增专用 review 技能。
- Candidate Record 不携带日期字段：创建/修订时间戳与历史由 Git 承载；复审条件由 Candidate 正文保存，日期不作为记录字段。

Why: 候选、承诺、长期结论和当前事实权威等级不同：把候选写入 Task/Decision/CONTEXT 会让模型把“可能采用”误解为“应该执行”，自动提醒或专用工作流又把低概率候选升级为持续维护负担。将 Candidate 作为按需复审的停车记录，可以保留有价值的长期想法，同时让常规上下文集中于当前事实和已承诺工作。`Why Not Now` 与 `Revisit condition` 分别保存停放理由和复审依据，使显式复审具备可核对的入口。容器原名 Future Record 命名自时间属性而本质是承诺属性，`future` 引导 roadmap 误读；改名时 future.md 为空、包未发布，故同步 C-xxx 前缀且不提供旧路径兼容读取。

Task 是实质活动工作的权威输入；若创建与清档都发生在未提交工作树，Git 只剩无意义的占位跳号。Checkpoint 保留过程权威，落地后清档保持当前树准确。边界收窄只减少不必要的记录开销，不改变实质 Task 的 Git 追溯要求；不采用行数阈值或自动分类器，因为它们无法可靠表达能力、授权和安全边界。

Impact: `README.md` 是唯一用户使用入口；通用规则经 principles 注入，技能只实现各自职责；常规 `survey-context` 的上下文负载不再包含 Candidate 正文，用户仍可通过显式复审查看完整候选记录。`implement-work` 在实施前建立 Task checkpoint；其他 Task 也必须在清档前 checkpoint，并在最终清档前核对其仍处于可达历史。

Rejected: 不合并 C/T/D 到单一文件；不每记录独立文件；不采用 Proposed Decision；不新增 review 技能、Record Manager、优先级评分、日期到期、自动提醒或 slash command；不把 Candidate 当默认 backlog/roadmap；不为 `retired` 增加永久状态枚举或墓碑文件；不把外部移交所有权边界写入 traceability（所有权属决策，许可证归属才属 traceability）；不提供容器级迁移引导（自有格式需模型自动识别并跨格式校验，产生猜测与格式权威混用；识别负担属用户显式声明而非模型自动探测）；不采用本地创建后直接清档、永久保留完成 Task 或逐步骤提交 Task 的模式；不采用基于行数或自动分类的 Task 豁免。

Out of Scope:

- **容器级迁移引导机制**（自有决策寄存器、ADR、跟踪器、ideas/backlog 文档的用户项目）：不建专用 skill、不建声明/路由系统、不改 CONTEXT.md 契约。二元边界：标准路径容器由 AKeel 管理；非标准体系由用户经 `AGENTS.md` 或显式会话指示声明，AKeel 不自动识别、不写入。迁移非默认，仅用户显式选择时作为一次性 Task 走 Migration Protocol；不可读来源报告缺口并请求中央化进 CONTEXT.md，不盲猜。

## D-030: 提示词体系边界与原则部署（Prompt Surface）

Reversal surface: engineering

Decision: 提示词按注入面分层：`principles.md`（恒定注入，承载原则与唯一格式/规则来源）、Guidance package 中的 `skills/`（按需加载，每个 skill 单一职责、调用时全量消费）、access-gate guidance（失败路径，保持原样不精简）。通用约束经“原则注入 + Quick Reference”部署。两条约束：① skill 单一职责——一个 skill 只做一件事，触发场景互斥的 skill 保持独立，不合并；② 格式/规则单一来源——只在 `principles.md` 参考节（Quick Reference / Project Records）定义一次，技能只文字引用（如 "per principles.md Project Records — Record Lifecycle"）、不重复定义格式和规则、不内嵌副本。

Why: 混合职责会浪费加载内容并模糊触发边界；格式副本会在技能之间漂移。`principles.md` 是每个 session 都可获得的稳定注入面，集中定义可避免规则分叉和引用死链。

Impact: `principles.md` 是通用参考数据的唯一注入来源，不新建承载格式的 skill。Skill description 只描述产出与约束；正文承载执行，用户触发型 workflow 使用用户侧调用指引。

Rejected:

- **新建 `project-records` skill 承载格式**：指针引用依赖模型主动 read，可能被跳过且单次注入可能多于内嵌副本；格式与 principles 恒定注入面天然同层。
- **Quick Reference 下沉到各对应 skill**：破坏格式/规则单一来源，操作手册分散后失去恒定注入的零成本优势。

Out of Scope:

- **guidance 文本精简**：失败路径措辞和支持工具枚举属于可执行安全判据，保持在 guidance 的动作点。
- **合并触发场景互斥的 skill**：各 skill 的全量消费与独立触发边界仍需保持；只有实际触发重合时才重新评估。
- **token 基线和提示词行为测量**：当前没有可重复的理解度评测合同；结构性引用和 skill 检查仍由可执行校验覆盖。

## D-035: 平台边界收窄为仅 Linux

Reversal surface: user-boundary

Decision: 平台支持边界从“仅支持 POSIX”收窄为**仅保证支持 Linux，以 Arch Linux 为基准工具链**：选项解析固定按 Arch Linux 的 GNU 工具链语义处理（GNU coreutils / GNU git / npm 生态常用选项），不提供按平台或发行版检测方言并切换选项表的机制。Windows、macOS、BSD 均不在支持范围，不建模其路径语义与选项方言；其他发行版的工具链版本差异不在保证范围——选项表以 Arch Linux（滚动发布、工具链最新）为准。BSD 工具与 GNU 的选项歧义（`stat -f` 为格式参数、`du -d` 在 BSD 无对应、`df -t` 在 BSD 为 flag）造成的解析差异不承诺消除，BSD 平台上的命令语义不在承诺范围。

Why: 单一 GNU 语义基线可以避免方言检测、双维护和误报，同时使支持边界与实际验证环境一致。

Impact: `CONTEXT.md` 的 Negative Space 明确仅保证 Linux，并列出 Windows、macOS、BSD 的排除范围。代码和策略不提供跨平台命令语义切换。

Rejected:

- **按宿主平台检测方言并切换选项表：** gate 分析宿主不一定是命令执行宿主，并会产生多套方言维护面。
- **保守双解析取并集：** 会引入额外路径意图和误报，对仅支持 Linux 的承诺没有收益。
- **宿主检测加用户配置覆盖：** 会为未声明的跨平台场景增加配置与审计负担。

Out of Scope:

- Windows `\` 路径与 macOS 路径/选项方言：已在 Negative Space，不因 stat/du/df 同为 BSD 方言而把 macOS 纳入支持。
- 跨宿主场景（ssh、容器）的命令语义方言：静态分类不做执行环境探测（同 D-067 无 filesystem 检查边界）。

## D-037: Shell wrapper 链由语义入口统一解析

Reversal surface: engineering

Decision: `core/compilation/shell/invocation.ts` 是当前支持 wrapper 链的单一语义入口。它从命令词首识别有限的 `env`、`timeout`、`command`、`nohup`、`exec` wrapper，消费各自已证明的 wrapper 参数，并发行 `ShellCommandAnalysis`：`executable` 只承载真正要分析的底层命令，`wrappers` 单独记录 wrapper 链，底层命令的 class、effects 和 paths 由同一入口继续计算。wrapper 不进入 Policy 或 host 层重新解包。

支持范围之外的 wrapper option、动态形式、路径形式 wrapper 和不完整 wrapper 链在 Canonical 阶段 fail-closed；当前不把 wrapper 执行期的脚本或子进程行为递归解释为额外语义。

Security invariants:

- wrapper 不能隐藏底层 executable、位置参数、重定向或路径事实；wrapper 后的真实命令必须仍参与同一 command/effect/path 分析。
- wrapper 参数只有在当前语义入口明确消费时才可继续分析；未建模 option 不得滑入 executable 或 positional path。
- 消费方只消费 `ShellCommandAnalysis` 的事实，不各自复制 wrapper 解包、分类或路径提取逻辑。
- wrapper 不扩大底层命令的授权范围；底层命令的 hard boundary、opaque path access 和 Policy Snapshot 决策保持不变。

Why: wrapper 是命令前缀，不是独立授权对象。若 wrapper 与底层命令在不同阶段解析，底层命令可能落入错误的 class，或其参数和路径事实被误当成 wrapper 参数而丢失。把有限 wrapper 识别、参数消费和底层分析放在同一语义入口，可让嵌套 wrapper 与普通命令共享一条 fail-closed 路径。

Impact: 当前分析保持底层命令事实：例如 `env -i cat README.md` 的 executable 是 `cat`、wrapper 链是 `["env"]`、effect 是 `read`；`timeout 5 env cat README.md` 也沿同一链处理。wrapper 分析不改变 Canonical 单次解释、Admission 窄投影或 Policy 决策。

Rejected:

- **消费方各自重新解包 wrapper**：会复制分类和路径知识，导致新增检查遗漏嵌套形态。
- **把 wrapper 保留为 executable、再由后处理猜测底层命令**：会产生 spelling/shape-dependent 分类，并可能丢失底层路径或 effect。
- **遇到未知 wrapper option 仍按位置猜测**：可能把 option/value 当成命令或路径，违反 fail-closed。

Out of Scope:

- 扩展 wrapper 名称或完整 POSIX/Bash wrapper 语义；新增形态需按当前程序语义合同重新证明。
- `env -S` 等未建模 option-with-value 形式。
- wrapper 执行期启动的脚本、子进程和环境副作用的递归解释。

## D-044: 测试组织镜像 src 分层

Reversal surface: engineering

Decision: `tests/access-gate/access-decision/` 按 `packages/access-gate/src/access-gate/access-decision/` 的 `core/`、`adapters/`、`runtime/` 边界镜像分层；extension composition 集成测试保留在 `tests/access-gate/index.test.ts`。`npm test` 使用 `tests/access-gate/**/*.test.ts` 目录 glob，focused `test:index` 覆盖生产入口。行为测试通过当前目录 public seams 验证；同层的结构、密封和 Canonical fact 合同测试可直接读取该层内部 seam，但不导入或复制旧决策链的 helper、fixture 和 expected value。

Why: source 的 `core`、`adapters`、`runtime` 是不同的依赖和职责边界；测试镜像这些目录后，模块到行为测试可以直接导航，且 dependency-boundary 测试能独立守住新边界。目录 glob 不要求每次新增或改名测试时同步维护文件枚举；生产入口仍有独立 focused script，保留快速反馈面而不牺牲全量校验。

Impact: 新增 core、adapter 或 runtime 测试放入对应镜像目录；extension composition 测试放在 `tests/access-gate/index.test.ts`；`npm test` 自动发现 access-decision 测试，`npm run test:index` 单独验证生产入口。测试 fixture 只在实际消费者所属层提供，不把旧实现 helper 带入新 trust path。

Rejected:

- 平铺测试文件再依赖命名约定：模块与行为边界只能靠前缀猜测，降低 locality。
- 删除 focused 入口只保留全量测试：丢失生产入口的快速反馈面。
- 将所有测试并入单一 `access-decision` 目录：掩盖 core/adapters/runtime 的依赖边界，削弱分层可见性。

Out of Scope:

- 测试内容、断言或覆盖范围的重构；本决策只定组织与脚本形态。
- 引入新测试框架；维持 `node:test` + `tsx`。

## D-045: Shell 条件流的有界 CWD 结果集

Reversal surface: user-boundary

Decision: Canonical Shell 对支持子集发行有界的 CWD 候选状态集，而不是选择单一执行路径。每个可建模命令保留其可证明的 success/failure 出口；`&&` 只把 success 送入右侧，`||` 只把 failure 送入右侧，`;` 无条件进入后继命令。被短路的命令（包括 `cd`）不得影响后续状态。

对简单 `cd`，success 分支使用解析后的目标 CWD，failure 分支保留进入该命令时的 CWD。Canonical 不以分析时点的文件存在性或权限检查证明 `cd` 成功；即使目标不存在，目标仍可作为 success 假设候选，失败分支也必须保留。状态按 `(commandIndex, cwd)` 稳定键增量去重，并受固定上限约束；超限返回 typed `resource-limit`，不得先物化无界集合。Admission 必须消费所有可达候选，不得选择对授权更宽的单一路径。

Why: 单一的前后 CWD 近似无法表达混合 `&&`/`||` 的短路与分支汇合，可能让未执行的 `cd` 污染后续路径，也可能丢失真实失败分支。路径授权依赖 CWD 事实；显式保留 success/failure 候选能在不进行执行模拟的前提下覆盖两类路径，并在状态生成处闭合资源预算。

Impact:

- Policy 规则本身不改变，但 CWD 候选集合可能改变最终 allow/ask/deny；验证应证明当前 Shell 合同，而不是追求旧实现 parity。
- 所有可达候选都会进入后续路径事实与边界检查，因此不可证明的路径分支不会因短路近似而被遗漏。
- 当前支持子集只把 `;` 作为顺序运算符；换行、pipeline、background 和其他复合 Shell 语法继续在 Canonical 阶段拒绝。

Rejected:

- **继续使用单一前后 CWD 近似：** 无法表达混合 and-or list 的分支汇合。
- **无条件把 cd 目标替换为当前 CWD：** 会丢失 success 分支的路径事实。
- **只保留 cd 目标候选：** 会丢失 cd 失败后继续执行的真实 CWD。
- **完整 Bash 执行模拟：** 超出静态、有界分析目标；不可证明形态继续 fail-closed。

Out of Scope: 分析到执行之间的 TOCTOU；文件存在性、权限、mount 和并发进程导致的实际 `cd` 失败原因；newline、pipeline、background、compound command 及完整 Bash 语法。

## D-047: 原则优先级与 Reversal surface 申报属性

Reversal surface: engineering

Decision: 恒注入原则面新增 `Rule Status` 规则：原则是默认值而非不可改法律，显式用户指令覆盖原则与 skill；原则或已记录决策与任务冲突时必须报告（不静默遵守、不静默违反），未决冲突并入任务关闭时的 open-proposals 处置（principles.md §9），已记录决策只经生命周期（supersede/retire）变更。每条 Decision Record 必须显式声明 `Reversal surface`：`user-boundary`（安全不变量、归属边界、用户承诺——逆转须用户显式批准，并在同一变更更新安全文档/Negative Space）或 `engineering`（模块内取舍——随模块重构正式 supersede，不静默偏离）；语义和格式单一来源为 principles.md Project Records — Record Lifecycle / Decision Record Format。`CONTEXT.md` 生命周期措辞从 Permanent 调整为 Standing（更新语义不变）。

Why: 恒注入面全祈使 + "DNA/EVERY interaction" 框架且无"用户指令 > 原则"的显式优先级句（文件底部优先级句只管 skills），模型面对原则冲突时没有显式出口，只能盲从或违规——"把一切当铁律、忽视自迭代"的根源是框架缺优先级与报告出口，不是缺分级表。铁律与可改的区分按强制面天然存在（代码 hard deny 无法违反 / 用户中介决策 / 注入原则可覆盖），正确分级是机制分层 + 上报信息，而非逐条贴标签——贴标签迫使模型自裁权威，误标不对称（安全规则标软是真实危害，软规则标铁律阻塞进化）。Reversal surface 是上报信息（改动时申报谁有权批准）非许可（不授权模型自行改 D-xxx）；缺失值无法区分刻意选择与漏分类，而该属性会改变逆转所需批准面，因此不能依赖隐式默认。

Impact: 恒注入面提供 Rule Status、Reversal surface 与 Decision 格式定义，随包分发到所有用户项目；每条存活 Decision 显式分类批准面，`survey-context` 按需读取时可直接申报；AKeel 自仓由轻量文档校验阻止缺失或非法值。

Rejected:

- **两级决策寄存器**（铁律册 + 工程册）：双源漂移，模型自裁权威，与 D-028 单寄存器生命周期冲突。
- **逐原则/逐决策贴强度标签**：恒定注入 token 税；误标方向不对称；D-030 已基于 C-003 拒绝 token 层说服。
- **把 Reversal surface 当作模型自行逆转的许可：** 它只申报批准面，不能绕过正式生命周期。
- **缺失时默认为 user-boundary：** 虽然 fail-safe，但会掩盖漏分类，并迫使读取方依赖不可见默认值。

Out of Scope: access-gate/enforcement 层任何改动（纯提示词与记录面）；为申报属性新增专用 skill 或路由；原则逐条强度分级（Rule Status 是全局优先级 + 报告出口，非 per-rule 强度表）。

## D-052: Git clone 目标路径与选项边界

Reversal surface: engineering

Decision: Canonical Git 语义对 `clone` 只发行可证明的有界路径事实。支持的取值选项先消费其值；两个位置参数 [`<repo>`, `<dir>`] 时，`<dir>` 是 write path intent，local `<repo>` 是 read path intent；没有显式 `<dir>` 时，隐式当前命令局部 cwd 作为 write target。`--template`、`--reference` 和 `--reference-if-able` 的文件值作为 read path intent。外部 remote、未建模的 git-dir/上传程序/配置或递归 submodule 形态发行 hard-boundary，而不是猜测额外路径。所有已发行候选都在 Canonical 阶段进入统一的命令局部 cwd 与 allowed/blocked path boundary。

Rules:

- 位置参数是 fail-closed 门控：超过两个位置参数、取值选项消费异常或无法确定位置时，不发行可放行的 clone 目标；提取只能增加已证明的路径事实，不能放宽决策。零或一个位置参数时的隐式 cwd target 是 Git clone 的已证明默认行为，不是值泄漏。
- 未建模的 equals/attached 选项形式不得把整 token 或其值误当位置参数；选项覆盖不足只允许降低覆盖率，不得产生额外可放行路径。
- `--separate-git-dir` 的值必须被消费；其 command-local git-dir 尚未形成 Canonical 路径事实前，该形态发行 hard-boundary，不得把该值归为普通 clone 目标。
- 没有 `<dir>` 时不得因值泄漏形成 `[<leaked-value>, <repo>]` 的伪位置参数组合；只有真实 local source（若存在）和隐式 cwd target 可发行。未来新增取值选项必须先复核该边界，再扩展提取规则。

Why: clone 目标是静态可析取的位置参数，但其选项值和 repository source 同样可能呈现为位置 token。只有在参数消费和目标位置都能证明时，目标才可进入统一 Canonical path boundary；否则应拒绝而不是猜测。

Impact: 显式或隐式 clone target 都按命令局部 cwd 解析，并遵循当前 allowed roots、blocked roots、blocked paths 和系统 hard boundary；local repository source、模板与引用目录按 read path intent 评估。外部 transport、动态位置、未建模选项和无法确定基准的形态继续 hard-boundary；该决策不增加 network policy 轴。

Rejected: 通用「末个位置参数 = 写目标」规则（会把 `sed -e`、`commit -m` 和 `push` ref 误归因）；把 `--separate-git-dir` 值归为普通目标（会隐藏未建模的 git-dir 写入）；在 Policy 或 host 层重新解析 clone 参数（违反 Canonical 单次解释边界）。

Out of Scope: 完整 git-clone 方言、pathspec、远程 transport 授权和执行期 hook；已解析的 local repository source、模板和引用路径事实属于当前 bounded seam，其他 clone 运行期副作用仍不单独建模。

## D-053: Policy 数据零注入（LLM 上下文隔离）

Reversal surface: engineering

Decision: `Policy Snapshot`、`policy.yaml`、内置或自定义 preset、活动 preset 名称及策略状态永不进入 LLM 上下文：不注入 context 消息、不修改 tool schema/description、不进 system prompt。活动 preset（`/policy` 切换）不改变任何注入内容；恒定注入文本只依赖静态文件（`principles.md`）。模型感知策略的唯一渠道是失败路径的静态 bounded Guidance；Guidance 只给用户可执行的纠正路径（例如请求用户更新 Policy），不描述策略内部、配置值或不存在的绕过通道。

Rules:

- 模型在任何配置、任何活动 preset 下都观察不到 Policy 数据文本（注入消息 / tool description / system prompt 三面皆无）。
- 恒定注入面保持唯一：`packages/guidance/src/bootstrap/index.ts` 是唯一 `context` 注入点；access-gate 只经失败路径产出静态 Guidance。
- Guidance 与实现一致：普通 Policy deny 不提供逐次批准（allow-once 仅存在于 ask 流），因此 Guidance 不出现 "approve the operation" 类描述；硬边界、未知和不可证明形态不因 Guidance 而放宽。
- 未来任何让模型可见活动 preset、Policy 规则或 Policy 状态的需求，必须经本决策生命周期（superseded/retired）显式变更。

Why: Policy 是 Gate 的确定性计算输入而非提示词素材。把策略翻译进上下文会诱导模型自行判断权限、绕过 Gate 消费结果，带来行为漂移、token 税与安全稀释；失败路径 Guidance 是唯一必要的模型可见策略相关面，只提供拒绝后的可行行动路径（D-023）。

Impact: 恒定注入内容与活动 preset 无关；模型在会话中不可见 preset 名称、策略值与状态；新增注入面即违反本决策，由校验脚本与测试承载防回归。

Rejected: 策略感知的动态注入裁剪（注入内容随 `/policy` 切换变化——行为随运行时状态漂移）；在恒定层注入活动 preset（token 税 + 诱导模型自行判定规则）；把 Policy 描述文本放进 tool description（恒定成本扩大）。

Out of Scope: 失败路径 block reason（静态 Guidance + category-only subject）本身属于模型可见面，不在“数据注入”之列；面向人类用户的 `/policy` TUI、状态查询和显式切换不属 LLM 上下文。

## D-054: 提示词面引用可靠性边界（指针化与内嵌的取舍判据）

Reversal surface: engineering

Decision: 提示词面内容的引用化（`per principles.md X` 形态）按总则加四问取舍。总则：引用是共享规则的低频定位手段，不是技能默认形态——操作步骤与守卫留在动作点。四问：① 引用目标须在同一读取/注入面且短而高显著（同文档相邻、guidance 当下渲染）；跨文件引用（技能→其他技能子文件）解析时付一次真实读取，仅在单源收益超过读取成本时使用；长细节段（Next-ID slots、迁移表）接受方必须内嵌。② 执行必需或 do-not-X 守卫（审批否决、分类守卫、防误删）必须留在动作点内嵌。③ 解析失败须可测或有情境兜底（校验器、违反即重现）；否则失败静默。④ 删除量不足指针固定成本（措辞+解析）的短句不指针化。"存量引用存在"不构成映射可靠、常规或正确的证据——本判据约束新改动，存量按同一标准再审计、不自动回退。操作化判据以 AGENTS.md「AKeel Prompt Surface 维护约定 — 引用取舍」为准。

Why: 引用解析依赖模型对注入面文本的回忆——回忆随 session 老化衰减、compaction 重注入不等于可回忆，且无反馈环验证解析成功：失败时模型带着残缺回忆静默继续执行；引用式（citation-style）措辞还降低指令权重。D-030 已按"不可操作化"先例拒斥 token 基线测量——本判据是结构层可靠性标准，正属 D-030 承认的可操作化方向（结构层行为测试）。

Impact: 既有提示词面参考引用不受本判据回溯、不自动回退；后续编辑按四问执行；重试禁令撤出恒定注入面后唯一载体是运行时 guidance——删该句即删禁令，由 gate 防回归断言锁定；本判据不引入 token 度量，与 D-030 的 dismiss 面无冲突。

Rejected: 纯指针化（机制全改引用——回忆失败即静默错误，无反馈环）；全内嵌复刻（多源漂移，D-030 已证）；以 token 量作为取舍判据（"量"不可操作化的 dismiss 先例）；并入 D-030 原地修订（违反 D-047：已记录决策只经生命周期变更）。

Out of Scope: 对存量引用的逐条回退裁定（另立审计）；guidance 文本精简（D-030 dismissed）；用户项目注入面（principles.md）不承载本维护纪律；逐条引用解析的运行时测量。

## D-059: Greenfield Access Decision Pipeline 与原子替换

Reversal surface: engineering

Decision: Access Decision Pipeline 采用 Greenfield Semantic Rebuild，只以 Pi `tool_call` 外部合同、Linux/Bash 行为、明确的政策语义和安全不变量为设计输入。当前实现独立位于 `packages/access-gate/src/access-gate/access-decision/`，物理分为 `core/`、`adapters/`、`runtime/`：core 负责 Pi host/config 无关的语义与决策域，Linux pathname lookup 属于该语义域的外部合同；adapters 单向转换外部合同，runtime 是唯一 Composition Root，依赖只能由 runtime 指向 adapters、再指向 core。旧实现、旧配置合同和旧测试不属于当前依赖边界，也不作为正确性 oracle。

生产入口只连接这条经验证的新信任链并保持单一生产路径；不提供旧 API、旧模块路径、旧 config/Profile schema 或兼容双轨。runtime 只实现 tool-call 决策所需的最小 policy state 与 project/staging 生命周期；其他外围能力独立处理。

Why: 从旧模块迁移、复用或逐字段重建会把旧场景假设、隐藏缺陷和错误边界带入新架构；以旧结果做 parity 又会把未知正确性的行为升级为规格。Greenfield 边界迫使语义依据、预算和信任关系重新证明；原子生产切换避免新旧 parser/compiler/kernel/config 交叉组成第三套未验证系统。

Impact: 新场景必须在当前 core/adapters/runtime public seam 上依据外部行为和安全不变量建立；新增程序、策略或 host 能力不得通过旧决策链接入。Static Flow、Explanation Replay、Runtime Audit 和 Runtime Content Flow 不属于当前 pipeline。

Rejected:

- **复用现有 lexer/parser/semantics/path，再更换 plan：** 直接继承旧语义边界和缺陷，无法证明新 canonical 是独立事实来源。
- **复制旧实现后改名重构：** 物理路径变化不改变设计来源，仍是旧架构的隐式兼容层。
- **新旧 parity shadow：** 旧输出不是权威 oracle；一致只能证明复刻，不能证明语义正确。
- **逐层生产切换：** 新旧 compiler/kernel/config 的混搭没有整体信任证明。

Out of Scope: 旧 API、旧模块路径、旧 config/Profile schema、旧测试 helper 和旧 integration；Static Flow、Explanation Replay、Runtime Audit、Runtime Content Flow；不参与当前决策信任链的 Session 和子代理内部行为。

## D-060: 受保护 Canonical 制品、窄 Admission 投影与有界求值

Reversal surface: engineering

Decision: 新 Canonical Semantic Core 对一个请求执行一次政策无关、资源有界的解释，发行单一 opaque `CanonicalCompilation`。这里的“一次解释”约束单一语义权威与文件系统观察时点，不要求 compiler 内部物理单 pass；compiler 可在固定预算内执行确定性的多阶段或常数次线性遍历，但 Admission、Policy、runtime 与 host 不得从原始请求重建同一事实。编译制品内部持有经过 seal 边界一次结构验证和 deep-freeze 的事实与资源证明，但不公开可枚举 ledger DTO；消费边界只做 O(1) issuance/authenticity 检查。Composition Root 从同一制品按需取得两种互不反向依赖的最小产物：sealed `Admission Plan` 与纯数据 `Display View`。不增加 `CanonicalCompilationHandle` 包装、中间 `CanonicalAdmissionView`、公共全域 operation、冗余 sequence、无消费者的 identity/ref/fingerprint/uncertainty 列表或每个视图的重复深复制。

`Admission Plan` 只包含新 Policy Kernel 决策所需的有序 command/path 事实、每个路径候选在 canonical 时点解析得到的 bounded `ResolvedPath` 值、必要 source anchor 和置信语义；不携带原始 Shell、配置格式、展示坐标、project/staging root（若解析后无消费者）、未来 Flow 数据或自然语言原因。Kernel 只消费 `Admission Plan` 与不可变 `Policy Snapshot`，不得重新调用 Shell parser、Direct schema analyzer 或 path resolver。`Display View` 只保存 renderer 需要的 bounded 展示数据，并只在实际需要展示时投影，不承载旧归约坐标或 Explanation Replay 状态。

Canonical reject 使用本域封闭 code、source anchor 与资源分类；renderer 在外层映射为静态文案，不把 `GateEvidence` 或自然语言 subject 反向注入 compiler。硬资源上限由代码内固定常量拥有，外部只能收紧不能放宽；输入、token、分支候选、operation、归约输出和展示分配都必须在物化前以 checked/saturating arithmetic 计数。预算单位必须显式统一，不能把 JavaScript `.length` 的 code unit 与 byte 混称。

`Policy Snapshot` 是与配置格式无关的深度不可变值，由新授权语义决定字段；Canonical core 不读取它，Policy Kernel 不读取配置 loader。配置 adapter、policy state 与 host adapter 只在 Composition Root 外围单向提供输入。

Why: 一个受保护制品保证事实只解释一次；窄 Admission/Display 投影防止授权、展示和未来领域形成公共大 DTO。去掉 handle/identity/中间 view 可避免隐藏 WeakMap 状态和浅包装；路径在 canonical 阶段解析可阻断 Kernel 二次解释；物化前预算与单次 seal 保持正常路径 O(input + emitted facts) 的有界成本。

Impact:

- 本条拥有“compiler 不接政策、受保护制品只在消费边界廉价验真”的制品合同；按 D-059 的 Greenfield 边界，不复用旧类型、代码、WeakSet 布局或 verifier。
- Display View 与 Admission 的职责分离由本条直接定义；不承载旧归约坐标、`ExpansionData` 或 Explanation Replay 状态。
- Admission 不保存 `operations/commands/paths` 三份平行数组；若 Kernel 需要分类优先级，在同一有序集合上无分配扫描。
- Composition Root 对每个请求只调用每种投影至多一次；该 orchestration 由 service 测试证明，不要求 projector 自带隐藏缓存。已冻结事实可通过窄类型共享，不做无收益 defensive-copy 链。

Rejected:

- **公开 Canonical ledger DTO：** 调用方可遍历并耦合所有领域事实。
- **只有 identity 的 handle + 模块级 ledger WeakMap：** 引入隐藏语义存储、模糊生命周期和 GC 行为。
- **Admission 暴露 CanonicalOperation：** 把未来 flow/display 字段泄漏进 Kernel，名为窄投影实为宽类型。
- **Kernel 再解析路径：** 破坏一次解释并让文件系统观察时点漂移。
- **每个投影独立全量复制和验证：** 增加 O(N) 分配而不增加可达防线。

Out of Scope: Static Flow/OperationRef、Explanation Ticket/Replay、provenance fingerprint、Runtime Audit Event、跨请求缓存或持久化 canonical 制品；这些实体只有在真实消费者和独立生命周期出现后重新设计。

## D-063: Direct edit 独立策略与显式本地配置

Reversal surface: user-boundary

Decision: Direct `edit` 是独立的路径策略轴。外部 flat policy 与自定义 preset 必须使用完整的 `paths` 与 `commands` 定义，其中 `paths.edit` 必须显式声明 `allow`、`ask` 或 `deny`；内置 preset 提供完整的固定语义。`edit` 的授权等级不得宽于 `read`：`edit` 可以独立收紧为 `ask` 或 `deny`，但 `edit: allow` 需要 `read: allow`，`edit: ask` 需要 `read` 至少为 `ask`。Edit 输入只做结构与资源边界校验，不在 Gate 内重演宿主的文本匹配语义。

Why: edit 与 write 是不同的 Pi 工具合同，独立策略轴可以分别表达完整写入和局部编辑的授权意图；但宿主执行 edit 需要读取目标内容，故 edit 不能绕过更窄的 read 边界。外部 policy 使用完整字段定义，内置 preset 使用固定语义。Gate 只负责受管请求的结构、路径和策略决策，文本替换的唯一匹配与不重叠语义由宿主工具执行。

Impact: flat policy 与自定义 preset 的完整定义都必须显式包含 `edit`；内置 preset 的 edit 语义由固定定义提供。配置适配器拒绝 `edit` 宽于 `read` 的策略；README 示例与 policy 文档展示 write/edit 分离。

Rejected:

- **Gate 重复实现 oldText 的唯一匹配和区间不重叠：** 这会把宿主编辑器执行语义复制到纯决策层，增加漂移而不扩大路径安全边界。
- **允许 edit 宽于 read：** 宿主 edit 仍需读取目标内容，会把独立策略轴变成绕过 read 边界的隐式读取通道。

Out of Scope: edit 的实际文件读取、文本替换、唯一匹配和重叠处理；这些仍由 Pi host 的 edit 工具负责。


## D-067: Canonical 程序语义族、可执行文件身份与委托执行边界

Reversal surface: engineering

Decision: Canonical Shell 在词法与 flow 解析之后增加独立的 `core/compilation/shell/programs/` 语义层。该层只把已扫描的程序调用转换为命令分类、effects、路径事实和 bounded/opaque 路径知识；registry 只负责可执行文件分派，Policy、配置和 host 不进入该层。Git、bounded coreutils、解释器、Python 工具、uv、herdr 与 npm/pnpm/yarn/npx 使用各自的声明表和少量专用分析器；已注册程序的未知选项和未声明值形态在 Canonical 阶段保持显式不确定性并 fail-closed：若未知选项的 arity 无法证明，当前参数段余部不得继续发行已证明的 option、operand 或 path 事实；程序专属合同按风险映射为 Canonical reject、hard boundary 或 `opaque`，此前已证明的前缀事实与 source anchor 可以保留。未知程序和未知子命令保持 `unknown + opaque`。`uv run` 与 `herdr agent start/prompt` 分类为 `execute`；uv 与 herdr 的版本/帮助调用、状态查询和只读观测分类为 `inspect`，其他未建模顶层子命令保持 `unknown + opaque`。

已知且路径访问可完整证明、且不依赖仓库或用户配置执行 helper 的命令可进入普通 `inspect`/`modify`/`execute` 策略；其中纯只读审查命令（`git status`、`diff`、`log`、`show`、`blame`、`grep` 等）解耦使用专属的 Inspect 选项契约，完整纳管安全展示标志（`--graph`、`--follow`、`--topo-order`、`--no-merges`、`--summary`、`--decorate`、`-p` 等）、带值过滤标量（`-S`、`-G`、`--grep`、`--author`、`--since`、`--until`、`--format`、`-L`、`--diff-filter` 等）、`diff --check`、`diff --find-renames`、`diff --find-copies` 以及 `rev-parse --show-toplevel`/`--abbrev-ref`/`--symbolic-full-name` 等有界只读查询，以及 `log`/`rev-list` 的纯数字行数限制缩写（`-[1-9][0-9]*`，如 `-5`），选项扫描严格成对原子消费参数值并杜绝伪路径溢出，在未显式声明 `--ext-diff` 或 `--textconv` 的前提下作为 bounded inspect read 进入常规策略求值，在 `review`、`guided`、`develop` 预设下均直接放行；`git branch --show-current` 纳入已知安全选项白名单，在无创建/删除参数时作为 inspect read 放行；非 inspect 子命令（如 `checkout`、`add`、`commit`）隔离不继承该只读选项集；有界本地变更命令 `git add`（无未建模或交互式选项）与 `git commit`（必须显式包含非空 `-m`/`--message` 或 `--file`/`-F`，且无 `-c`、`-e`、`-p` 或外部驱动参数）在 Git 控制面工件（`.git/hooks/**`、`.husky/**`、`.githooks/**`、`.lefthook/**`、`.git/config*`、`.gitattributes`）获得系统级绝对不可变写保护的前提下，归类为 `modify` 并进入常规策略求值。显式声明 external driver（`--ext-diff`、`--textconv`）、无消息或交互式的 commit、涉及外部 transport 或 network helper 的操作（如 `push`、`fetch`、`pull`、`clone`、`init`、`help`、`grep`、`blame`、`gc`、checkout/switch/restore、merge/rebase/tag/reset/cherry-pick/revert/stash/submodule 等已建模操作），以及 `git config`，固定进入 hard boundary。解释器脚本、`uv run`、`pytest`、`npm/pnpm/yarn` 的脚本或安装执行、`npx` 以及含未建模运行期访问的命令标记 opaque；opaque 风险由独立的 `commands.opaque` 策略轴控制，并与命令类别策略同时求值，不因显式 `allowedRoots`、`blockedRoots` 或 `blockedPaths` 自动升级为 hard boundary。`develop` 默认允许 opaque，`guided` 默认要求审批，`review` 默认拒绝；程序语义不递归解释委托的子命令或脚本内容。

路径选项和隐式 repository/project scope 必须进入 Canonical 统一解析；Admission 只消费已解析的路径候选，不重新理解程序参数。Git `-C`、`--git-dir` 和 `--work-tree` 已在 Canonical command-local cwd seam 中按 token 顺序解析，后续 repository、基本 path candidate、output 候选和显式项目内 `file://` remote 使用所得 cwd；完整 Git pathspec 语法、HTTPS/SSH 等外部 transport、hosted `file://`、alias、间接 config remote、`clone --separate-git-dir` 及其他尚未形成 Canonical seam 的 location 选项继续 fail-closed。Git repository discovery 只接受真实 `.git` 目录，拒绝 symlink 或 gitfile metadata，避免隐式 Git scope 指向项目外 repository。当前不增加 network policy 轴；Git helper 的执行期隔离不在本条内提供，未形成安全合同的 helper-capable 操作直接 hard-deny。

Executable identity 与 path-form boundary:

- Canonical 将 executable token 识别为 `bare`、`system`、`system-unmodeled` 或 `path-form` 四类身份，不解析 PATH，也不因文件系统探测或 symlink 解析改变命令身份。
- 对固定的词法系统路径形式（精确以 `/bin/` 或 `/usr/bin/` 开头，且去除前缀后无更多路径分隔符或 `..` 遍历）：
  - 若匹配已注册的程序族（Git、bounded coreutils、解释器、Python 工具、包管理器、uv、herdr），作为已声明的系统程序身份复用对应裸名的完整 analyzer 语义，包括命令类别、effects 和操作数路径事实；其参数路径完全纳入 Mandatory Boundary 与路径策略核查，彻底封堵通过系统绝对路径绕过操作数安全检查的漏洞；
  - 针对破坏性操作（如 `/bin/rm`、`/usr/bin/rm`），根据 D-071 依然保持永久系统 hard boundary，不放宽为单文件知情同意；
  - 若为未注册的系统程序（如 `/usr/bin/whoami`），分类为 `unknown + opaque`。
- 对自定义或非系统路径形式程序（含相对路径 `./script.sh`、其他绝对路径 `/tmp/tool`、包含 `..`、重复斜杠或大小写变体的形式）：
  - 统一将其可执行文件自身提取为 `role: "source"` 的路径事实，强制纳入 Mandatory Boundary（凭据工件保护与 Git 控制面写保护）及路径策略检查，杜绝直接执行受阻或凭据目录下的二进制；
  - 命令类别保持 `execute + opaque`，其未证明访问风险由独立的 `commands.opaque` 策略轴控制，不因 basename 匹配已知程序族而获得 `inspect`/`modify` 语义；支持从该命令提取重定向目标等标准外部路径。
- 裸名 `tsx` 与 Python、Node、Ruby、Perl 属于封闭 interpreter 族：单一 `--version`/`-v`/`--help` 信息调用为 `inspect`，脚本或其他调用为 `execute`，脚本 operand 是 source path；path-form interpreter 统一为 opaque execute。`npx tsx` 保持 `execute + opaque`，即使参数看似信息调用。
- `od` 是封闭的只读检查例外，产生 `inspect + read`，不构成任意工具自动加入内置语义的先例；裸名未知命令保持 `unknown`。

分层子命令两阶段参数解析边界:

- 分层或多子命令程序族（Git、Herdr、uv、Python 工具、包管理器）采用两阶段解耦架构：
  - **Stage 1 (共享分段参数编译器):** 仅负责确定性 CLI 词法与分段语法，包括短选项聚集展开、长短选项带值形式（separated、equals、attached）、`--` 操作数隔离、未知选项与缺失值捕获；不推断路径角色、不合并目录语义、不决定安全映射。
  - **Stage 2 (程序私有 Invocation Plan 与语义投影):** 各程序模块本地消费分段结果，构建私有 Invocation Plan，拥有领域命令层级（如 Herdr 两级路由、uv 委托命令尾部）、Token 顺序 CWD 累积（如 Git `-C`）、路径与选择器分类（区分 npm `--workspace` 选择器与真实文件路径），并本地发行统一的 `ProgramAnalysis`（`complete` 或 `reject`）。
- **未知选项不确定性截断:** 当遇到 arity 未知的不明选项时，parser 停止可靠分区并将当前语法段后续 token 作为 opaque remainder 冻结，严禁基于 flag 假设继续将后续参数识别为子命令或路径事实；程序投影器按所属命令风险映射为 `reject`、`hardBoundary` 或 `opaque`。
- 平坦且严格的单一命令族（如 coreutils、chmod、find）维持专用有界分析器，不强制迁移。

Why: Git、包管理器和语言运行时共享“程序自有参数语言 + 子命令分类 + 路径/委托执行”的结构，但把它们塞进 Shell lexer 或 Policy Kernel 会造成职责泄漏和重复解析。`uv run` 可能同步环境、解析或下载依赖并启动任意子进程，因此不能当作普通只读命令；版本/帮助调用与未建模顶层子命令则需要独立分类。opaque 仍必须保持独立事实，但其风险是否可接受属于用户策略选择：`review`、`guided`、`develop` 分别提供拒绝、审批和便利路径；这不宣称 allowed roots 能限制脚本运行期访问，真实执行仍受操作系统权限约束。分层程序共享机械分段语法可杜绝多遍扫描与集合不同步，同时保持领域语义在各程序模块高内聚，避免大一统框架泄漏抽象。

Impact: 生产入口仍只切换新 Canonical pipeline；新增命令族只需增加 core 语义模块和 public seam 测试，不恢复旧 `command-semantics` 依赖。当前覆盖 Git 常用 inspect/modify/destroy 分类（纯只读审查命令拥有独立的 Inspect 选项契约与严格成对消费的过滤参数集，有界本地 `add` 与 `commit` 接入 modify 策略并受 Git 控制面写保护约束，网络/远程 transport、helper-capable 操作与 `config` 固定 hard-boundary）、bounded coreutils 的封闭 option/value 消费与基础 inspect/modify 语义（涵盖 `cat`、`head`、`tail`、`grep`（含模式标志 `-E`、`-F` 与基础过滤选项，带值模式 `-e` 与 `-f` 维持 fail-closed）、`rg`、`ls`、`od`、`wc`、`cut`、`stat`、`diff`、`file`、`du`、`df` 以及只读流工具 `tr`、白名单排序 `sort`、单操作数排重 `uniq`，破坏性写入与代码执行选项如 `sort -o`、`sort --compress-program` 及双操作数 `uniq` 强制 fail-closed，图灵脚本工具 `sed`/`awk` 维持 `unknown + opaque` 状态并由策略轴与 Direct-first 互补）、有界文件权限修改命令 `chmod` 专用分析器（将目标操作数提取为 `target` 路径事实并映射为 `modify` 与 `write` effect，支持常用无害 flag、标准符号模式与安全八进制，严禁 `-R`/`--recursive` 递归与 SUID/SGID/Sticky 提权位并报 `security-boundary`，使权限修改完全受 Mandatory Boundary 凭据与 Git 控制面硬保护；旧版独立的 `permissionChange` 策略轴明确退役并收敛为 `write` 策略）、裸名 `find` 的 bounded inspect/read 表达式（`-name`、`-iname`、`-path`、`-ipath`、`-type`、`-maxdepth`、`-mindepth`，start path 进入 recursive boundary）、解释器信息命令、Python 质量工具、uv 的 `run`/信息/未知子命令分类、herdr 的 inspect/execute/modify 分类（工作区创建提取 `--cwd`/`--path` 路径事实，worktree remove 与 workspace close 归入 modify）和 npm 族常用分类；Git `-C`、`--git-dir`、`--work-tree` 和项目内显式 `file://` remote 的 command-local location 已覆盖，完整 CLI 方言、完整 Git pathspec 语法、HTTPS/SSH 等外部 transport、hosted `file://`、alias/间接 config remote、`clone --separate-git-dir` 和网络/执行隔离不在本条内。确立了分段语法层（Segment Parser）与程序私有 Plan 的重构边界，平坦与分层程序各自保持清晰分层；Herdr unknown-option 缺口按此边界分诊修复。

Rejected:

- **把所有程序加入 `invocation.ts` 的 basename Set：** 无法表达选项值、子命令和委托执行边界，继续扩大单一解析器。
- **在 adapters/runtime 中解析程序语义：** 违反 core ← adapters ← runtime 依赖方向，并让 Policy/host 重新接触原始命令。
- **递归解析 `uv run`、`npm run`、`npx` 或解释器脚本：** 脚本和依赖内容不是本次 Canonical 输入的可证明静态事实。
- **用 `unknown: allow` 或删除 path boundary 放宽 opaque 命令：** 会把命令类别与未证明访问风险混为一谈，无法分别表达审查、审批和开发便利性。
- **把 opaque 直接并入 `execute`：** 会让已证明的执行与黑盒脚本执行共享一个策略开关，丢失用户对未证明访问风险的独立选择。
- **直接移植旧 command-semantics adapter：** 违反 D-059 的 Greenfield 边界；旧实现仅提供待重新证明的场景线索。
- **恢复旧版独立 `permissionChange` 策略轴与 effect：** 权限变更属于 inode 元数据写入，恢复独立策略轴会导致 PolicySnapshot 与配置 schema 膨胀，且缺乏用户独立区分改权限与写文件的真实配置诉求。
- **将 `chmod` 作为未建模未知命令放任自流：** 未知命令不提取路径事实，导致在 `develop` 预设下静默绕过宿主凭据和 Git 控制面写保护，造成严重安全不变量穿透。
- **大一统跨程序声明式 `SubcommandProgramManifest`（C-046 原方向）：** 强制用通用 schema 统一所有子命令程序会导致 Git 有序 `-C` 累积、npm workspace 的 selector/path 多态、uv 委托命令尾部及复杂条件变异（如 Ruff 标志组合）泄漏进通用引擎，退化为挂满回调与条件树的伪配置解释器，违反浅模块与删除测试。
- **流式 Builder / Combinator DSL：** 增加方法链语法间接层与闭包分配，不解决参数边界与安全判定本质，缺乏独立杠杆。
- **未知选项继续以单标记（flag）假设扫描后续参数：** 选项参数个数（arity）未知时后续 token 的子命令/操作数/路径身份均不可证，继续发行事实会导致伪路径溢出或命令误识别；必须截断为 indeterminate opaque remainder 并按程序合同 fail-closed。

Out of Scope: 网络独立授权、OS sandbox、Git hooks/npm lifecycle 的执行期拦截、完整 Git pathspec、远程/容器工具链方言、命令执行后的审计和旧配置兼容。`commands.opaque` 只表达用户对未证明执行风险的策略选择，不提供运行期沙箱或路径强制。

## D-069: Policy 配置文件、Preset 注册表与用户交互界面

Reversal surface: user-boundary

Decision: Policy Preset 注册表由三个内置 preset 与 `policy.yaml` 中显式声明的自定义 preset 组成。内置 `review`、`guided`、`develop` 始终可用，其操作模式语义固定，不要求用户重复声明；外部 flat policy 与自定义 preset 统一使用完整的 `paths` 与 `commands` 定义，不继承或覆盖内置 preset。自定义 preset 名称必须通过严格的配置名称校验，不得与内置名称或命令保留字 `status` 冲突；配置加载和 runtime 激活均拒绝非法或冲突名称。

每个 preset 可以拥有独立的 `allowedRoots`、`blockedRoots` 与 `blockedPaths`，不要求不同 preset 之间一致。切换 preset 因此可以同时改变操作模式和 preset-specific path scope；这些字段仍属于 Policy Snapshot 的授权输入。`commands.destroy` 仍接受 `allow`、`ask`、`deny` 作为配置值，但 destroy/delete 的系统硬边界见 D-071；内置 preset 的固定值为 `deny`。系统级 hard boundary 始终优先，任何 preset 都不能解除或放宽它。

自定义 preset 与内置 preset 使用同一 Policy Snapshot、Admission 和 Policy Kernel 合同。配置层只发行已加载的合法 registry；preset 名称、策略内容和活动状态不进入模型上下文、tool description 或 system prompt。

Policy file loading: 用户全局 Policy 输入固定为 `$PI_CODING_AGENT_DIR/akeel/policy.yaml`，默认目录为 `~/.pi/agent`。flat `paths`/`commands` 形式表示使用完整定义的单一静态 policy，不提供 preset registry 或会话切换；具名 `presets` 形式以三个内置 preset 为注册表基础，并可增加合法的完整自定义 preset。自定义 preset 允许可选 `badge` 字段自定义 1~4 字符短码，未指定时按 kebab-case 首字母或前缀确定性消歧。外置文件缺失、为空、格式/schema 错误、根非 mapping、必需字段缺失或其他不可用状态时，整体忽略并使用内置 `review` 基线，不部分采用无效内容。唯一合法的 `accessGate: off` 形式及其运行时语义由 D-097 规定。

User interaction surface: 原生 TUI 中，`/policy` 无参数打开临时选择面板，供用户选择已加载的 preset 或 `off`；确认后通过宿主公开的 `ui.setStatus` 同步策略 Badge（如 `🛡️ R`、`🛡️ G`、`🛡️ D`、自定义 badge 或消歧短码，关闭时为 `🛡️ off`），会话结束时清除。取消或无效选择保持不变。`/policy <preset>` 与 `/policy status` 保留；非 TUI 模式不打开面板。交互与状态均为 human-only UI。

Why: 固定的三个内置定位提供稳定、无需配置的默认选择；自定义 preset 支持独立的权限和空间范围。系统 hard boundary 始终优先；无效外置文件整体回退到内置 `review`。使用宿主公开的 `ui.setStatus` 发布 Badge，避免引入额外的宿主 UI 依赖。

Impact: policy adapter 将内置定义与合法用户 preset 合并为注册表并发行 snapshot；schema 接受合法自定义名称和独立 scope。无效外置文件整体回退到内置 `review`；`destroy: allow` 仍受 D-071 的 hard boundary 拒绝。

Rejected:

- **要求所有 preset 共享路径范围：** 无法满足自定义策略表达独立访问空间的需求，不必要地绑定模式与空间范围。
- **允许自定义 preset 覆盖内置 preset：** 破坏稳定内置语义并产生配置来源歧义。
- **让 `status` 成为合法 preset：** 与 `/policy status` 状态命令冲突。
- **通过 preset 解除系统 hard boundary：** 混淆可配置策略与系统安全底线，违反 fail-closed 边界。
- **把无效外置文件部分解析为可用 preset：** 避免产生未经验证的组合状态。
- **把 Policy 文件缺失视为 Gate 缺失：** 配置缺失仍应保持安全门禁启用。
- **在 `/policy` 面板中支持逐项编辑策略：** 扩展为复杂策略编辑器会扩大配置校验与权限变更证明范围。
- **无 UI 时自动选择更宽 preset：** 缺少用户显式授权，违反 fail-closed 边界。

Out of Scope: 多个 Policy 文件、项目级配置和子代理策略；preset 继承、逐项策略编辑、旧 Profile alias、子代理 preset 传播、网络独立授权和 OS sandbox。

## D-070: 宿主凭据工件的系统硬边界与分类规则

Reversal surface: user-boundary

Decision: 将宿主拥有、用于保存实时凭据的凭据工件归入系统 hard boundary；当前确认范围包括 pi host 的 `auth.json` 及其备份或变体，但模板类工件不属于该类别。当前没有可验证的 Pi Host 工件角色 metadata seam，因此以受信任 agent 目录下的路径身份契约识别类别，不读取文件内容、不做值级猜测。对 Canonical 阶段明确识别为该类别的受管路径操作 `read`、`write`、`edit`、`list`、`search` 一律 hard deny，任何 preset 都不得放宽；模板类工件继续由 preset/path policy 管理。递归 `search` 若其候选路径与 credential root 相交——候选位于 credential root 内，或 credential root 位于候选路径内——一律 hard deny，以避免通过父目录或 agent 根递归枚举凭据；这只收紧递归搜索，不把整棵 agent 目录的非递归操作普遍封锁，也不为无法发行具体路径的 opaque Shell access 增加凭据专用拒绝。

`accessGate: off` 时沿用 D-097：AKeel 不提供普通 tool-call、路径或凭据保护保证，但 mandatory host-surface boundary 仍然有效。该边界不扩展为整棵宿主 agent 目录的拒绝，也不宣称 AKeel 能保护所有可能承载凭据的文件。

Why: 实时凭据工件同时承载高敏感性与完整性风险，`ask` 或可切换 preset 都不能构成可靠的保护边界。明确文件路径时按工件职责分类可以保护凭据存储，同时保留模板类文件的正常使用场景；递归搜索无法发行单个后代文件事实，若继续放行就能通过父目录间接读取凭据，因此以 credential root 的路径相交关系作为有界的 fail-closed 判据。把规则置于 preset 之前，也避免用户自定义策略或会话切换解除系统底线。

Impact: 系统 hard boundary 优先于 Policy Snapshot、preset-specific path scope 和审批；凭据工件及与 credential root 相交的递归搜索不因 `develop` 或自定义 preset 放宽。非递归的 agent 目录访问与非凭据工件仍走既有路径策略；Gate 禁用、其他 extension 的直接文件访问、操作系统权限和宿主自身凭据流程不由本决策提供保护。

Rejected:

- **由 preset 管理凭据工件：** 可切换或误配的策略不能作为实时凭据的保护边界。
- **整棵宿主 agent 目录硬拒：** 会误伤模板、配置和会话等合法场景，超出最小边界；本决定只对递归搜索与 credential root 相交时硬拒绝。
- **保持覆盖凭据根的递归搜索放行：** 父目录递归搜索可以枚举并输出实时凭据，无法作为可接受的最小安全边界。
- **按文件内容猜测是否为凭据：** 值级嗅探不稳定且会把授权边界依赖不可靠的内容推断；分类应基于工件职责与所有权。

Out of Scope: 其他文件中的偶然凭据、宿主外部扩展的直接访问、Gate 禁用后的安全保证、模板类工件的具体 preset 配置，以及大小写折叠或大小写不敏感文件系统上的凭据别名保证；AKeel 只保证默认大小写敏感的本地 Linux 文件系统语义。

## D-071: Destroy 操作永久硬拒绝与有界单文件受审批准入

Reversal surface: user-boundary

Decision: 无法建立完备影响范围证明的破坏操作——包括目录删除命令（`rmdir`）、递归删除（`-r`、`-R`、`--recursive`）、目录删除标志（`-d`、`--dir`）、未知选项、未建模破坏命令、路径形式破坏可执行文件（如 `/bin/rm`）、无提取路径的破坏操作，以及任何命中凭据工件（D-070）、Git 控制工件或超出路径策略根的破坏操作——均属于永久系统 hard boundary。Policy Kernel 在路径策略和 UI 审批之前拒绝这些无界破坏操作，结果固定为 `hard-boundary`。

对通过 Canonical 完备证明的单文件/多文件非递归裸 `rm` 命令，且所有目标路径均通过 Mandatory Boundary 核验的操作，解除硬边界短路，受管地进入 Policy Kernel 求值与宿主 UI `ask` 审批。内置 `guided` 与 `develop` 预设将 `commands.destroy` 设为 `ask`，`review` 预设保持 `deny`。无 UI 环境下严格 fail-closed 为无 UI 阻断。自定义 preset 可显式配置 `destroy` 模式；未建立有界证明的操作继续被系统硬边界永久拒绝。

Why: 破坏操作的影响不可逆或难以恢复，递归删除、父目录删除、通配符和未知选项无法在静态分析中排除扩散风险，用户确认不能替代系统边界证明，故无界破坏操作必须保持永久硬拒绝。而对显式指定操作数、禁止递归、路径逐一规范化证明且未触及凭据与 Git 控制工件的单文件 `rm`，其影响范围完全确定且与普通覆盖写入对等；将其接入知情同意（`ask`）机制既满足日常清理构建产物与测试临时文件的真实需要，又确保每次删除均经用户确认与无 UI 保护。

Impact: `rm single_file.txt` 在 `guided` 和 `develop` 下受管触发 `ui.confirm`；无 UI（headless/CI）运行时严格 fail-closed。`rmdir`、`rm -r`、高危 Git 操作（`reset --hard`、`clean -f`、`branch -D`）、`ruff clean`、`/bin/rm` 及未完全证明的破坏命令继续由 hard boundary 永久拒绝。

Rejected:

- **全量无条件放开 `rm` 到 `ask`：** 递归、通配符与未建模选项会把无法证明的系统风险转化为用户盲审。
- **在 `develop` 预设中将 `destroy` 设为 `allow`：** 破坏性操作具有不可逆性，日常开发下仍需每次知情同意，不应静默放行。
- **允许无 UI 环境下静默删除：** 无 UI 下缺少知情同意途径，必须 fail-closed 阻断。

Out of Scope: 目录删除与递归删除支持、Git 破坏性子命令的放宽、通配符静态展开、运行时文件恢复或删除审计；更宽的破坏操作复核继续由 C-028 承载。

## D-072: Session 启动 cwd 作为访问根与 `$HOME` 的受限 tilde 语义

Reversal surface: user-boundary

Decision: AKeel 将 Pi 会话创建时的 `cwd` 固定为本次会话的 Access Root，不要求该目录位于 Git root 内。Access Root 是 AKeel 的访问边界语义，不等同于 Pi 原生的“项目根”概念。会话内的 Shell `cd` 只改变命令局部 cwd，不改变 Access Root；新建或切换到以不同 cwd 建立的 Pi session 时，才重新建立 cwd-bound runtime state。

AKeel 不向下扫描 Access Root 以猜测或选择子 Git 仓库，也不因当前 cwd 位于某个仓库子目录而自动向上扩大到 Git root。多仓库父目录和独立文档目录均可作为 Access Root；`allowedRoots`、`blockedRoots`、`blockedPaths` 及系统 hard boundary 仍优先于该上下文边界。

`~` 的 Shell 展开唯一使用 Pi 进程在会话初始化时的 `$HOME` 值。`$HOME` 缺失、非法或无法作为绝对 home 路径使用时，需要 home-relative 解析的请求 fail-closed；不引入 Pi 原生未提供的额外 `home` 字段，也不使用隐式替代来源。

Tilde expansion 仅适用于受支持 Shell word 中位于开头、未引用、未转义的裸 `~` 或 `~/` 前缀。引号或反斜杠保护的 `~`、非开头的 `~`、`~user`、变量/动态展开和未建模上下文不得映射为 home；复杂或无法证明的形态 fail-closed。Direct 工具的 path 字段不继承 Shell 的 tilde expansion 语义。Canonical 阶段发行一次解析事实，后续不对原始文本做字符串替换。

Why: Pi 的原生工作边界是 session `cwd`；Pi 不要求 cwd 属于 Git 仓库，Git root 主要参与部分资源发现，而不是通用工具授权前置条件。使用启动 cwd 能支持多仓库工作区、独立文档目录和未初始化的项目，同时避免向下选择不确定的子仓库。使用会话启动时的 `$HOME` 与 Linux Shell 的环境语义一致；将 tilde expansion 限制在可证明的词法形式，可避免把普通文件名中的 `~` 错当成 home-relative 路径。

Impact: 运行时不再以 Git-root 作为 Access Root 前置，也不从多仓库父目录向下选择仓库；session-start cwd 固定承载访问范围。Pi tool-call context 的 `home` 不参与 Shell tilde authority，缺少 `$HOME` 只影响需要 home-relative 展开的请求，不自动使所有其他 Access Decision 失效。未建模的 Shell 形态继续 fail-closed。

Rejected:

- **Git root 作为通用 Access Root 前置：** 这不是 Pi 的原生 cwd 合同，会排除独立文档目录和多仓库父目录；Git root 也不是 AKeel 的 OS-level security boundary。
- **从多仓库父目录向下自动选择子仓库：** 当前请求无法可靠表达用户意图，选择错误会把策略锚定到错误项目。
- **找不到 Git root 时任意回退或自动扩大范围：** 会把缺失的项目边界静默变成未声明的访问范围。
- **通过 Pi 额外 `home` 字段或其他环境来源替代 `$HOME`：** 当前 Pi 原生 cwd/session 合同未提供该必要字段；多来源会使 Shell 与 AKeel 的 tilde 语义分叉。
- **按字符串前缀替换所有 `~`：** 会把引号、转义和普通文件名中的字面 `~` 错误解释为 home。

Out of Scope: 用户显式项目选择器、多个 Access Root、会话内动态切换 Access Root、完整 Bash tilde/参数展开兼容、`~user` 展开、Direct path 的 home shorthand、实际文件操作的 TOCTOU 消除，以及 `$HOME` 本身作为安全隔离边界。

## D-073: Skill 作者职责与恒定不变量归属

Reversal surface: engineering

Decision: 在 D-030 定义的 Prompt Surface 内，跨任务恒定不变量归属 `principles.md`，不包装为按需 skill；`packages/guidance/skills/disciplines/` 只承载可复用工程方法，`packages/guidance/skills/workflows/` 只承载端到端编排。两目录表达作者职责，不创造 Pi 运行时加载层；运行时发现服从 package manifest，workflow 调用模型由 D-078 定义。Disciplines 使用名词短语，Workflows 使用动词-名词，复合名称使用 kebab-case，避免非必要缩写和人物名。

通用“完成声明前必须取得 fresh evidence”继续只由 `principles.md §6` 定义。独立 `evidence-first` skill 退役，空 `foundations/` 分发根删除；bug/feature 验证、Requirements 核对和提交前检查等具体操作守卫留在 `fix-validation`、`implement-work`、`change-preflight` 等对应动作点，不复制通用规则正文。

Why: Pi 对 `package.json.pi.skills` 声明的目录统一递归发现，目录名不定义加载时机；把 `foundations/` 描述成常驻层会混淆作者组织与宿主调用合同。`evidence-first` 的通用门禁已经恒定注入，其独立 skill 激活由模型判断、不是可靠 enforcement，并与恒定规则形成双源；只有动作特有的验证步骤具备独立保留价值。

Impact: 当前 skill 分发只有 `disciplines/` 与 `workflows/` 两个作者职责根；README、AGENTS、CONTEXT、validator 和 traceability 不再把 `evidence-first` 或 Foundations 描述为现存能力。被替代的旧目录组织结论从寄存器剪除，历史由 Git 保留。

Rejected:

- **把 `evidence-first` 移入 Disciplines:** 改目录不消除与恒定原则的职责重复。
- **保留为隐藏或手动强化 skill:** 没有证据证明二次加载提高遵守度，且兼容壳会继续维护重复文本和孤立职责根。
- **直接删除全部独特示例语义:** 测试、构建、人工回归、Requirements 核对和提交前检查属于具体动作守卫，应由对应职责自足承载。

Out of Scope:

- **完成声明的运行时强制:** 自然语言回复没有现成的确定性 enforcement seam。Revisit when Pi 提供可验证的 response gate。
- **模型遵守度 A/B 基准:** 当前没有固定模型、数据集和稳定评分合同。Revisit when 项目采纳可重复的 prompt 行为评测体系。
- **`/skill:evidence-first` 兼容别名:** 当前没有已记录的下游兼容承诺，别名会延续双源。Revisit when 出现真实下游依赖证据。
- **其他 skill 内容与调用治理:** 不属于本次职责去重。Revisit when 用户启动完整 skill-governance 重构。

## D-074: 单一 grill-docs 分阶段工作流

Reversal surface: engineering

Decision: 只分发用户手动调用的 `grill-docs`，不再分发独立 `grill-plan`。`grill-docs` 依次执行四段行为：逐项解决未决问题；由用户确认一份候选方案作为核对输入；针对项目事实及适用的外部合同逐条核对候选方案；把核对后的结论更新到现有 Task、CONTEXT 和 Decision 容器。每次只问一个问题，并同时给出基于当前证据的推荐答案。候选方案确认后，只有带具体证据且会改变该方案的矛盾可以请求用户重新打开相关问题；用户不批准重新打开时停止核对，不把矛盾方案记录为定稿。

外部文档核对按实际依赖触发：候选方案涉及外部库、API 或框架时列出这些依赖并读取其实际文档；没有外部合同时，只核对项目记录、源码、测试及可运行实验。核对结果使用 `confirmed`、`corrected` 和 `uncertain` 三类；`uncertain` 必须对应明确的验证实验或未决项。问题处理、候选确认和事实核对期间不实施候选方案，也不提前写入长期结论。

Why: 当前使用场景都要求事实依据和最终落档；原 `grill-docs` 已调用 `grill-plan` 的全部提问流程，独立 `grill-plan` 只增加第二个触发面和跨 skill 依赖。把提问规则放入唯一工作流后，每次调用会使用全部内容；通过候选确认和证据矛盾回退条件，可以区分提出问题与核对事实，而不依赖抽象阶段描述。

Impact: `grill-plan` 目录删除；其一次一问、问题与推荐答案分隔、事实自行查询和用户持有决定权的独特语义迁入 `grill-docs`。`grill-docs` 保持 `disable-model-invocation: true`，自然语言中的 grill 词不再触发独立 workflow；`assess-modularity` 只向用户建议手动运行 `grill-docs`。

Rejected: 保留 `grill-plan` 作为无文档变体（没有实际使用场景，且项目事实仍需核对）；在问题处理期间同步写 Decision（候选尚未确认，会产生反复改写）；以固定措辞测试代替行为验证（只能锁文本，不能证明模型按流程执行）。

Out of Scope: Herdr、worktree、独立会话、子代理路由和其他委托机制；这些执行面边界由 D-075 规定，本条不重复定义。

## D-075: Task Owner 上下文准入、Herdr 同步委托与 Worktree 隔离

Reversal surface: user-boundary

Decision: 委托同时受权威所有权、上下文准入、执行面路由与 checkout 隔离约束。**Task Owner Session** 是对一个 Task 持有用户原始意图、Requirements、已采纳范围/架构/政策裁决、finding disposition、最终验收、发布与 Project Record 更新权的唯一会话；同一 Task 或 Decision 同时只有一个 Owner。用户可把互斥、可独立验收的长期工作明确授权给新的 Task Owner Session；若新会话仍需把结果交回既有 Owner 裁决，它在语义上仍是 delegated child，而不是第二个 Owner。

所有需要隔离过程上下文、且结果返回既有 Task Owner 裁决的委托统一使用 Herdr；AKeel 不维护第二套委托执行面，也不把 Herdr 声明为 runtime dependency。Herdr child 可在已定约束内处理开放问题并形成 verified candidate。当前 child 委托只使用同步 fork-join：Owner 通过 Artifact Exchange 预定 run、packet 与单 child slot，把 slot capability 绑定到确切 Herdr workspace/pane/Agent 后启动 child；child 只通过专用 publisher 发布一次有界文本结果。Owner 等待 child settle 后执行 verified collect；只有 run、binding、receipt、长度与 digest 同时有效才构成正式交接，`idle`、`done`、完成 prompt 或 `herdr agent read` 终端文本均不能替代。Artifact 承载 verified candidate 及理解、审计、质疑或继续结果所必需的上下文：影响结论的推理与被拒方案、引用证据、变更、验证、未决问题和残余风险；搜索轨迹、完整日志、重复失败、未影响结论的假设、工具时间线和中间草稿留在隔离会话或 diagnostic transport。可得的 child session 引用只作按需 forensic 追踪，不自动载入 Owner 上下文。

Routing: 用户未指定执行面时，按以下封闭顺序决定：

1. 不产生隔离过程上下文的工作由当前 Task Owner 直接完成；用户确认、Project Record 更新、finding 裁决和最终验收留在该 Owner。
2. repo-wide/跨模块探索、多来源比较、多假设调查、重复实验、完整日志分析、独立审查、交互式方案讨论、跨项目工作和替代 CLI 等会产生隔离过程上下文、且结果仍需当前 Owner 裁决的工作，通过 Herdr child 同步执行并在预定 artifact 上 join。
3. 长期工作只有在用户明确授予互斥范围和独立验收权时才进入新的 Task Owner Session；多个 Owner 不共同修改同一 Task/Decision 或 checkout，跨 Task 结果由明确的 integration owner 集成。没有该授权时，不把后台运行或新开会话解释为新的 Owner。用户授权的独立 Task Owner Session 可以运行在 Herdr 中，但不因使用 Herdr 而成为 delegated child。

任何 delegated agent 的有效工具只要包含 `write`、`edit` 或可修改文件的 Shell，就必须位于独立 Git worktree；新增的并行 Task Owner 具备这些能力时，也必须拥有不与其他 Owner 共享的 checkout。按能力而非“不要编辑”的提示词承诺分类。真正只读的 delegated agent 可共享 checkout；测试若可能修改源码或生成受跟踪文件，按写能力任务处理。Herdr 只管理自己创建的 worktree，同一 worktree 只有一个生命周期 owner，不跨执行面清理、合并或复用。Child 不删除自身 pane/workspace/worktree；存活的 Owner 只在结果完成导入或汇总、bounded run record 与当前 Herdr/Git 事实共同证明资源归属且用户明确批准后，以 exact-target、non-force 操作清理。归属或成果保留状态异常时 fail-closed 并报告；该手工合同不授权自动或跨重启回收。

具体的 grilling、packet、Agent 生命周期和 verified candidate 交接步骤由 [`packages/guidance/skills/workflows/grill-docs/SKILL.md`](../packages/guidance/skills/workflows/grill-docs/SKILL.md) 承载。

Why: “主 Agent 技术上能完成”不能判断原始探索是否值得污染长期 Owner 上下文；独立 Agent 的价值包括上下文隔离，而不只包括并发。同步 artifact pull 避免 child 自由文本 callback 形成重复 user-role 消息、额外上下文和交付竞态；长期独立工作直接拥有自己的 Owner，则无需把全过程回灌旧会话。唯一 Owner 与互斥范围防止多个会话对 Requirements、验收和权威记录形成 split-brain。当前工作需要可见的 Agent、pane、worktree、状态和人工裁决，Herdr 已直接覆盖这些目标；统一执行面保持上下文、交接和生命周期合同一致。按有效写能力强制 worktree 可避免真实工具权限污染共享 checkout。

Impact: `principles.md`、README、CONTEXT、skills 和委托相关 Decision 统一描述 Herdr 执行面、Task Owner、同步委托路由、正式 Artifact Exchange 和 worktree 不变量；`grill-docs` 通过预定 slot 完成交互式讨论和 verified collect，不发送完成 prompt。Herdr 继续负责 Agent 启动、状态观察和 worktree 管理，Guidance package 的 Artifact Exchange 只负责 bounded result transport，不构成第二套 agent orchestrator。独立 Task Owner Session 是用户授权与记录所有权边界，不是新的 Herdr primitive。

Rejected: 以“可能更快/多一个视角/适合时”触发委托（不可判定且扩大调用）；当前 Owner 可完成即一律直接执行（忽略上下文污染）；维护第二套委托执行面（当前没有真实需求证明其额外编排能力值得承担独立的上下文、结果和生命周期合同）；同步 child 向 Owner prompt 完成状态或结果（重复交付、增加上下文且不是处理 ACK）；把长任务默认变成异步 child（增加 mailbox、恢复和去重状态而无当前需求）；把同一 Task 交给多个 Owner（权威 split-brain）；child literal self-delete（会使 join 失去正常 settle 结果，且 child 无法确认自身清理成功）；所有隔离工作无条件创建 worktree（应按有效写能力与 tracked side effect 判断）；worktree 内“100% 自由/零审批”（隔离不产生授权）；由 Grill Agent 直接写权威记录（跨 worktree 制造第二 writer 与未经 Owner 导入的权威变更）。

Out of Scope:

- **异步 child 与无人值守 orchestration:** mailbox、receipt、跨重启恢复、重复通知去重、自动续跑和聚合由 C-031 保持为未采纳候选；出现真实长周期从属任务后再评估。
- **渐进式、多段或二进制结果协议:** 当前单一 bounded UTF-8 artifact 足以承载 verified candidate；出现不可接受的体积或真实非文本结果后再评估。
- **确定性 child 资源自动回收:** run receipt 只证明结果发布，不证明验收、worktree 可丢弃或 commit 已保留；accepted/abandoned 终态、commit-preservation、跨重启 reconciliation 和无人值守生命周期仍由 C-034 保持为未采纳候选。
- **Access Gate 父子 Policy Snapshot 传播:** 当前没有可验证的宿主策略 seam；相关子代理能力上限与风险边界由 C-009 作为未采纳方向评估，本条不改变准入实现。
- **模型行为基准:** 当前没有固定模型与 consuming-agent 评测 harness，不以字符串存在测试冒充行为证明。Revisit when 项目采纳可重复的 prompt 行为评测。

## D-077: Decision 寄存器的轻量 hygiene 校验

Reversal surface: engineering

Decision: `scripts/validate-docs.ts` 对 AKeel 自仓的 `docs/decisions.md` 执行轻量 Decision hygiene 校验，并静态执行 D-028 的 active-entry 生命周期与 D-047 的 Reversal surface 格式合同。扫描器只解释 fenced code 外的合法 Decision 标题和第 1 列顶层字段（兼容迁移期的粗体字段）：要求 `Reversal surface` → `Decision` → 可选规格子节 → `Why`，并按序接受可选 `Impact`、`Rejected`、`Out of Scope`；拒绝 `Status`、`Origin`、已定义的顶层过程字段、任务引用和明确迁移历史标记。普通正文日期以及 fenced code、列表、引用块中的字段标签不进入结构判断。该检查只报告并以非零状态失败，不自动改写记录。

Why: 生命周期、批准面、顶层字段位置、Markdown fence 和已定义过程标签是可确定的结构合同，适合在提交前自动阻断；任意正文的日期、新颖过程措辞和其他 Markdown 嵌套内容无法由轻量扫描可靠分类，保留人工审计可避免误伤长期结论。

Impact: `npm test` 会通过 `validate-docs` 执行该检查；Decision 的语义压缩、`Impact`/`Out of Scope` 必要性、取舍判断和正文过程历史清理仍由维护者负责。该校验与已有容器槽位和 D-xxx 引用检查共用自仓脚本。

Rejected:

- **完整自然语言过程历史分类器：** 误报风险和维护成本超过轻量静态检查的收益。
- **封闭枚举全部规格子节：** Decision 的领域规格需要开放词汇，只约束其位于 `Decision` 与 `Why` 之间。
- **把 fenced code、列表和引用块当作记录字段：** 会把示例、替代方案和外部引用误判为元数据。
- **自动修复 Decision：** 可能删除限定词、替代方案或安全边界，记录只能由维护者审阅后修改。
- **把自仓检查直接作为用户项目 validator：** 自仓容器和引用合同并不构成用户项目的通用执行合同；用户项目检查保持 `doc-sync` 的显式、只读、定点流程。

Out of Scope:

- **用户项目 Project Record CI 门禁接入：** 会话内已通过 akeel_validate_records 原生扩展工具提供确定性校验，独立 CI/npm 门禁接入待后续按需评估。
- **完整 Decision 语义审查：** 由人工 code/doc review 完成，不把文本启发式当作语义证明。

## D-078: Workflows 触发模型（手动调用与即时介入）

Reversal surface: engineering

Decision: workflows 按所需介入方式选择触发模型。需要用户明确意图的 workflow 设置 `disable-model-invocation: true`，并以 `Use /skill:<name>` 作为 description 的调用指引；需要模型即时响应任务状态的 workflow 使用 trigger-first description。当前手动 workflows 包括 assess-modularity、brainstorm-design、grill-docs 和 implement-work；survey-context 响应任务启动与状态恢复。文件恢复遵循 `principles.md §10`，宿主会话导航遵循 Pi 自身合同。

Why: 显式调用为方案处理、实施和交接提供清晰的用户意图；模型调用适合由当前任务状态直接判定的即时介入。沿用 Pi 的 skill command 与 discovery 合同，可以保持触发描述、实际入口和用户预期一致。

Impact: `validate-skills.ts` 校验手动 workflow 的调用指引和模型可调用 workflow 的 trigger-first description。skill 作者职责与目录边界由 D-073 定义，具体 workflow 持有各自的执行合同。

## D-079: 模块设计方法与模块化评估工作流分界

Reversal surface: engineering

Decision: 保持模块设计方法与仓库级模块化评估为两个 skill，不合并。`module-design` 是可由模型按需加载的 discipline，只处理已知模块或接口问题，以 depth、leverage、locality、testability 和 implementation cost 评估具体设计，并使用 test seam、Deletion Test 和 Design Twice 组织判断；`assess-modularity` 是用户手动调用的 workflow，只扫描指定仓库或子系统中的 shallow module、weak seam 与 scattered responsibility，生成临时、证据化的 findings 和高层 remediation directions，不实施或采纳变更。

`assess-modularity` 的临时报告使用 `finding`，用户选择后才形成供 `grill-docs` 处理的 proposal；只有按 Project Record 生命周期写入 `docs/candidates.md` 的 `C-xxx` 才称为 Candidate Record。评估动作所需的观察问题留在 workflow 动作点，不把 `module-design` 全文作为隐式运行时依赖；具体接口方案才使用 `module-design`。

`module-design` 的方法语义以边界判断为起点：适配器数量是抽取决策的证据而非固定阈值；公共接口是首选测试面，但本质上依赖集成的行为可以使用更高层接缝；无效状态在可行时应不可表示，其余失败必须由明确的失败契约处理。这些取舍属于该 discipline 的统一方法，不是对原有规则逐条追加例外。

Why: 模块设计方法集中于模块和接口，而非数据所有权、部署拓扑、可靠性或安全等广义架构；模块化评估工作流只发现并报告结构摩擦，不直接改善架构。按真实对象和产物命名，使已知问题设计与未知问题发现各自全量消费，同时保留 discipline 与手动 workflow 的触发边界。

Impact: `module-design` 使用 discipline 的名词短语命名，`assess-modularity` 使用 workflow 的动词—名词命名并保持 `disable-model-invocation: true`。引用、调用指引、临时报告名称和第三方概念映射统一使用新名称。

Rejected:

- **合并为单一 architecture skill：** 局部接口设计与仓库扫描具有不同输入、产物和调用模型，合并会形成按模式跳过正文的浅接口。
- **保留 `codebase-design`：** 名称把实际的模块与接口方法扩大为整个 codebase 的设计。
- **保留 `improve-architecture`：** 名称暗示实施结果，但工作流只交付评估报告和后续 proposal。
- **使用 `review-architecture`：** 当前方法只评估模块化结构，广义 architecture 会错误承诺数据、运行时、部署、可靠性和安全维度。
- **保留旧名兼容别名：** 当前没有已记录的下游依赖证据，别名会延续双重触发面；出现真实兼容需求时再评估。

Out of Scope:

- **广义架构评估：** 当前没有覆盖数据所有权、运行时拓扑、部署、可靠性、安全和容量的完整方法。Revisit when 用户采纳这些维度及其证据和输出合同。

## D-080: 当前变更预检、独立代码审查与显式深度清理分界

Reversal surface: engineering

Decision: 提交前准备、独立 finding 生成与深度维护保持为三个职责，不合并。`change-preflight` 是模型可按需加载的 discipline，默认以只读方式固定当前变更、核对 scope、文档、最终验证和适用的专项门禁，并交付 `READY` 或 `BLOCKED`。它不得触碰未知或用户拥有的内容；仅在外层流程提供当前运行的 `run-id` 与创建记录，且残留非敏感、非语义、可恢复时，才可安全自治处理：专用临时目录中的本次运行残留可清理，仓库内残留只能移入仓外 quarantine。它不扫描或修复历史代码卫生与架构问题。

`code-review` 保持独立、只读的 discipline。明确提交目标可直接以目标与基准 OID 固定不可变 Review Surface，不因范围外的脏工作区阻断；mutable task surface 则消费未过期的只读 `READY` 结果，并把 branch commits、staged、unstaged 与范围内 untracked 内容固定为同一不可变 Review Surface。两种 surface 都分别执行 Engineering 与 Requirements 审查；reviewer 只交付证据化 findings，Task Owner 持有 finding disposition，审查期间或修复后 Review Surface 变化会使旧结果失效。

`code-cleanup` 只在用户明确指定范围或已批准 maintenance scope 时执行行为保持型深度维护；阶段结束本身不授予扫描或修改历史代码的权限。它以绿色基线开始，无法证明外部 export 不可达时只报告不删除，测试合并保留场景诊断与追踪语义，公共接口或模块职责变化转入模块设计流程。清理完成后重新同步文档、验证并进入 preflight/review；commit 由外层 workflow 或 Task Owner 决定。

Why: 三者分别拥有 current-change preparation、independent finding generation 和 approved-scope mutation 三种不同输入、权限与产物。原设计把当前变更卫生收敛进 preflight，是为了保留低成本提交门禁并避免浪费独立审查上下文；但模型可调用 skill 没有天然事务、备份或 provenance hook，自动删除 untracked 内容会把恢复风险和认知负担转给用户。只读优先、强 provenance 的安全自治和分层 Review Surface 保留自动化收益，同时把不可逆或归属不明的动作挡在用户确认之外。

Impact: `change-preflight` 承载只读优先的提交前守卫和受限安全自治；quarantine 是当前 AKeel run 内的仓外临时恢复工件，保留到验证与 Code Review 完成、Review Surface 接受、Task 完成或运行明确放弃，非空 quarantine 阻止自动 run 清理，初版由用户批准后精确清理。通用 fresh-evidence 规则仍只由 `principles.md §6` 定义，动作特有核对留在 preflight。`implement-work` 在最终 commit 前编排文档同步、验证、适用的专项审查、preflight 与独立 code review；明确提交可由固定 OID 直接进入只读 code review。任何相关修改重新进入该闭环。技能来源映射、调用引用和 validator 合同统一使用现行名称。

Rejected:

- **合并为 `review-work`：** 会混合作者侧修改、独立只读审查和显式深度维护，并形成互斥模式与不完整正文消费。
- **保留 `code-audit` 名称：** 名称暗示宽泛或独立审计，不能准确表达当前变更限定的作者侧 readiness gate。
- **提交前自动运行完整 `code-cleanup`：** 当前 Task 不授权修改历史 dead code、既有测试或模块边界，且广泛清理会扩大并重置 Review Surface。
- **工作区一脏就阻断所有审查：** 明确提交的 OID 已提供不可变审查面，范围外脏内容不应把整理负担转给用户；只有可能影响范围的归属不明内容才阻断。
- **让 Preflight 默认可写：** 模型缺少天然事务和 provenance hook，默认写入会使只读审查前置阶段承担不可逆风险；安全自治必须是满足全部条件的窄例外。
- **把所有清理都交给用户：** 会牺牲低成本自动化；当前运行明确拥有的非敏感可恢复残留可安全自治处理。
- **新增 `change-cleanup`：** 当前变更卫生仍是 preflight 的必要检查，不产生独立触发或交付物；深度清理继续由 `code-cleanup` 承载。
- **把 `code-cleanup` 改为手动 workflow：** 明确自然语言请求或已批准 maintenance scope 已提供可判定触发；当前没有必须增加 `/skill:` 调用摩擦的证据。

Out of Scope:

- **模型行为 A/B 基准：** 当前没有固定模型与 consuming-agent harness。Revisit when 项目采纳可重复的 prompt 行为评测。
- **确定性 commit hook：** Pi 当前没有由本任务采用的 commit lifecycle enforcement seam。Revisit when 宿主提供可测试 hook，或真实工作流证明 skill 编排不足。

## D-081: 复现信号与系统化根因调试分界

Reversal surface: engineering

Decision: 调试能力由两个模型可按需加载的 discipline 承载。`bug-reproduction` 面向缺少可靠反馈信号的 bug、failure 与 performance regression，构造并缩小忠实于用户症状的确定性或可测概率性复现，交付 `reliable`、`probabilistic` 或 `blocked` Reproduction Result 并返回调用方。`systematic-debugging` 面向技术问题的根因调查，在可用信号上追踪故障机制，以能够区分替代解释的实验支持根因结论，并只从 `Confirmed` 根因和用户授权进入 TDD，实施一个连贯的因果修复后进入 fix validation。

Bug Task 的创建和更新直接遵循 `principles.md` Project Record 生命周期：用户已承诺调查时建立或复用 `Kind: bug` Task，格式继续由恒定注入面单源定义。仅记录请求由该生命周期直接处理；`systematic-debugging` 消费现有 Task 或在承诺成立时建立最小 Task，`bug-reproduction` 发行供调用方消费的复现结果。

Reproduction Result 以症状判定的忠实度、特异性、迭代成本、最小条件和实测复现率描述反馈质量。概率性复现只要能在明确预算内支持区分性实验即可成为可用信号；固定运行次数或失败率不作为统一完成阈值。临时 harness 与 instrumentation 保持可识别，适合公共 seam 的复现才成为永久 regression-test 候选。

Why: 复现工程和根因调试具有不同输入与交付物：前者把难以观察的症状转成实验 seam，后者利用该 seam 证明因果机制。Project Record 生命周期承载 Bug intake，系统化调试方法承载证据收集和候选假设，使格式、调查步骤和路由各有唯一所有者。两项能力按结果命名后，每次调用都能全量消费其方法，并由原调用方持有后续流程。

Impact: `survey-context` 将已承诺的 bug 调查或修复导向 `systematic-debugging`，缺少可用信号时先使用 `bug-reproduction`；仅记录请求直接更新 Bug Task。调试正文保留动作点所需的根因与授权门禁，TDD、fix validation、change preflight 和模块设计继续拥有各自流程。

Rejected:

- **单一 debugging skill：** 可靠复现问题不会消费难复现构造方法，而只构造反馈信号的任务也不需要根因和实施阶段，合并会形成条件模式。
- **独立 bug intake skill：** 其产物是既有 Project Record，所需技术调查已属于系统化调试；额外入口会复制格式和证据流程。

## D-082: 单一实施规划能力与 Plan Slice

Reversal surface: engineering

Decision: `implementation-planning` 是模型按需加载的实施规划 discipline。它在 Requirements 与必要 Design 已批准、工作需要多步实施时创建或复用对应 Task Record，将规划输入组织为 implementation-ready Plan，并保持 Task 为 `draft`；`implement-work` 持有实施启动、状态推进、验证闭环与 commit。

Plan 使用 `Plan Slice` 作为内部执行单元。每个 Slice 承载目标、Requirements 覆盖、前置依赖、验收标准、文件与公共接缝、验证命令和有序实施步骤；Slice 可独立验证，并共享所属 Task 的 T-ID、生命周期与 Task Owner。依赖只记录 `Depends on`，反向关系按需推导；切分依据是可观察行为、测试闭环和稳定接口，跨层不确定性需要尽早证明时使用 tracer slice。

规划开始时，当前对话或唯一匹配的 Task Record 提供已批准输入；缺少 Task Record 时，明确的用户承诺允许在同一流程建立记录。需求或设计仍需形成时使用 `brainstorm-design`，仅需记录已承诺工作时直接遵循 `principles.md` Project Record 生命周期。

Why: 实施规划只有一个稳定产物和下游：可由 `implement-work` 消费的 Task Plan。统一的 Plan 结构集中承载 Requirements 覆盖、垂直切片、依赖、验收与验证，并为内部工作单元提供明确术语，使名称、触发条件、内容与交付物保持一致。

Impact: `survey-context` 将明确的多步实施需求导向 `implementation-planning`；`brainstorm-design` 在设计批准后按任务复杂度衔接规划或实施。规划规则、来源映射和技能校验统一使用该能力名称。

## D-083: Instruction Editing discipline 与仓库 overlay

Reversal surface: engineering

Decision: `instruction-editing` 是模型按需加载的语义保持型编辑 discipline，面向 agent-facing prompts、skills 和 operational instructions。它先建立主体、触发、动作、结果、限定词、安全守卫、排除边界与引用的语义清单，再以当前合同、统一术语、连贯结构、可靠引用和直接措辞组织内容，并通过修改前后映射核对语义完整性。

正向行为合同是常规表达；安全门禁、禁止项、排除边界、铁律和防循环使用明确否定。同一主语、阶段和行为合同形成完整段落，新条件进入既有的条件—动作—结果结构。历史背景只在理解当前兼容、迁移或决策理由所需时进入正文。

`AGENTS.md` 承载 AKeel 专属 overlay：适用的 Prompt Surface、`principles.md` 锚点、D-054 引用取舍、动作点安全守卫，以及 Access Gate 中 `literal form` 与 `fixed text` 的术语归属。`doc-sync` 核对文档与当前事实，`domain-modeling` 维护领域术语和长期裁决，三项能力通过各自产物分界。

Why: 用户项目中的 agent instructions 与 AKeel Prompt Surface 都需要在压缩、合并和重写时保持行为语义。通用编辑方法按需分发，使不同项目共享一个完整流程；仓库 overlay 集中本地路径、安全合同和领域词汇，使通用方法与项目约束各有唯一所有者。

Impact: package skill 分发包含 `instruction-editing`；AKeel prompt 内容修改从 `AGENTS.md` 进入该方法，并应用本地 overlay。README、CONTEXT 和结构校验公开并锁定现行能力。

## D-084: 测试输出投影、正向运行器证据与会话持久化边界

Reversal surface: user-boundary

Decision: 测试输出维持三种相互独立的表示：session file 保存原始 `bash` tool result；模型 context 使用裁剪后的投影；TUI 在同一条模型 `bash` 工具结果中并列显示原始输出和裁剪后的模型视图。模型视图只在渲染时由纯投影函数生成，不成为 session entry、message 或 tool result details。用户 `!`/`!!` 产生的 `bashExecution` 保持既有行为，不裁剪、不生成模型视图。

模型调用的独立 `npm test` / `npm run test` 结果只有在宿主结果明确成功、且输出包含受支持测试运行器的正向成功摘要时，才可把逐条通过输出投影为短成功消息。仅有命令返回成功（如 `exitCode === 0` 或 `isError === false`）不足以证明测试实际运行并通过；零测试、跳过、todo、警告和未识别格式保持原始结果。测试失败、取消、截断和无法可靠归类的结果继续沿用原始或失败保留路径。

Display contract:

- 仅对模型调用内置 `bash` 工具、且实际发生裁剪的独立 `npm test` / `npm run test` 结果显示模型视图，并明确标记为发送给模型的版本。
- 原始输出保持现有工具结果展示；取消、截断、非测试命令和不确定失败不产生模型视图。
- 用户 `!`/`!!` 的 `bashExecution` 不裁剪、不生成模型视图，保持既有 TUI、session 和 context 行为。
- 模型视图属于人类 TUI 展示，不通过命令打开，不追加自定义会话消息，不写入 session file，也不进入 system prompt、tool description 或模型 context。
- `context` handler 与 TUI renderer 消费同一个纯裁剪投影，保证展示内容与模型实际收到的内容一致。

Data boundaries:

- 恢复会话时从原始 `toolResult` 和关联的 `bash` tool call 重新计算模型视图，不读取或保存裁剪副本。
- 正常模型请求只接收裁剪后的 context projection。
- 模型另行通过 `read` 或 `bash` 读取 session file 时读取的是原始内容，该视图不提供额外文件权限保护。

Why: 用户需要在模型测试结果所在位置核对完整过程与模型实际收到的信息，而不是浏览整轮上下文。保留原文、临时派生模型视图可避免会话文件膨胀，同时使对照内容准确对应本次请求。同时，`npm test` 可能是 no-op 或在退出码为 0 时包含跳过和警告；正向运行器摘要兼顾了成功裁剪收益与“不得把未知结果说成成功”的安全不变量。

Impact: `context-pruner` 从关联的 `bash` tool call 与 `toolResult` 适配输入，由纯投影函数完成裁剪，并增加成功投影的正向证据守卫，不引入通用工具输出过滤器。通过项和普通成功噪声可以删除，但模型仍会看到明确的成功结论。测试覆盖受支持摘要、任意成功文本、零测试、跳过/todo/警告和原始消息不变性。

Rejected:

- **裁剪用户 `!`/`!!` 的 `bashExecution`：** 改变用户命令既有显示与 context 语义。
- **仅以 `exitCode === 0` 或 `isError === false` 判定测试通过：** 忽略跳过、未执行测试或警告。
- **全会话 context 预览命令：** 超出局部测试结果对照需求。
- **把原文和裁剪版同时放进模型 context：** 失去裁剪收益并造成两份并列事实。
- **持久化裁剪版：** 造成重复事实与会话膨胀。
- **TUI 只显示裁剪版：** 无法核对裁剪是否误删测试过程或诊断。
- **将非测试命令纳入默认裁剪：** 扩大不确定语义修剪面。

Out of Scope:

- 用户 `!`/`!!` `bashExecution` 的输出裁剪或模型视图。
- 通用的每轮 system prompt、tool description、provider payload 或 context message 审计器。
- 阻止模型主动读取 session file 的新安全边界。
- 失败输出保留算法的具体调优。
- 通用 Runtime Content Flow。

## D-086: 三个可独立安装能力包与全量分发入口

Reversal surface: user-boundary

Decision: AKeel 的分发面由三个可独立安装的 Pi package 组成：`akeel-guidance`（bootstrap、skills 与 workflow artifact/handoff transport）、`akeel-access-gate`（Access Gate）和 `akeel-context-pruner`（测试输出上下文裁剪）。仓库根 `akeel` 保留为全量分发入口，一次加载三类能力且不重复加载资源。运行时职责可以继续在包内保持独立，但不因此增加额外的可安装包边界；`principles.md` 继续只有 Guidance package 中的单一来源。

Why: Guidance 中的 bootstrap、skills 与其正式 artifact/handoff transport 共同构成可执行工程工作流；拆开会使委托 skill 在 `review` 下缺少正式结果通道。Artifact Exchange 自行验证 narrow capability，不进入 Access Gate Policy；Access Gate 和 context-pruner 的触发事件、风险边界和依赖仍独立。保留全量入口维持现有一条命令安装体验。

Impact: 每个 package root 必须拥有自己的 `pi` manifest 和运行时依赖声明；根 manifest 负责全量组合。资源过滤仍可作为 Pi 原生的高级加载方式，但不替代独立 package。未安装 Access Gate 时，AKeel 不提供工具调用准入保证；未安装 context-pruner 时，不提供测试输出上下文裁剪。

Rejected:

- **将 bootstrap 与 skills 发布为两个包：** 会把同一 Guidance 能力拆散，并使 skills 缺少其引用的原则来源。
- **把 context-pruner 合并进 Access Gate：** 两者没有代码依赖，触发点和职责不同，合并只会扩大安装耦合。
- **只保留一个包并要求用户使用 resource filtering：** 能选择加载内容，但不能提供独立的包身份、依赖和版本边界。

Out of Scope:

- **发布流水线与版本联动：** 当前先建立可发布 package root 和 manifest 合同；接入真实 registry 发布时再定义自动化策略。
- **各能力的领域语义变更：** 本决策只定义分发边界；Access Gate、Artifact Exchange、bootstrap 或 context-pruner 的行为分别由其领域决策拥有。

## D-087: Access Gate 双语义车道与单一授权信任链

Reversal surface: engineering

Decision: Access Gate 在 D-059 的 `core ← adapters ← runtime` 外层依赖方向和 D-060 的单次 Canonical 解释边界内，采用“私有 Direct/Shell 语义车道 + 单一授权信任链”。Direct 与 Shell 保留各自的输入语言、编译器和局部语义，但生产调用只进入一个 Canonical facade；该 facade 对每个 managed call 发行一个 opaque、不可伪造、内部以封闭变体区分车道的 `CanonicalCompilation`。同一制品只经一个 Admission facade 投影为 sealed `AdmissionPlan`，其中以判别变体保存 Direct 与 Shell 的最小授权事实，不建立含大量可选字段的公共通用 operation DTO。

Admission 后固定经过不可配置放宽的 Mandatory Boundary Stage，再进入 Configured Policy Kernel；credential、destroy/delete、blocked traversal 和 recursive blocked descendant 等系统边界由前者集中拥有，opaque access 的未证明风险由后者消费 `AdmissionPlan + PolicySnapshot` 中独立的 `commands.opaque` 策略决定。两阶段通过一个 Authorization facade 发行统一的 `allow | approval-required | deny` verdict，共享路径事实语义、决策优先级和 tool-call 粒度聚合。`hasUI`、confirm 能力和 `no-ui` 映射属于 Pi host composition，不进入 managed request 的领域事实、Canonical compilation、Admission 或 Policy Kernel；`approval-required` 本身不执行工具。

Canonical compiler 通过受信任、不可由 policy 或用户配置替换的 Linux Path Evidence port 获取 pathname facts；同一 CWD 状态与 source token 对应的语义路径事实只解析一次，后续 CWD 转移、Admission 和 Display 复用已发行结果。Shell program registry 保持封闭且只负责 dispatch；Git、解释器、Python 工具、uv 和 package manager 分别拥有局部 analyzer，并以显式不可变事实表达 path base、cwd change、recursive、opaque 和 hard-boundary 语义，不再以多个 WeakMap/WeakSet sidecar 隐藏同一阶段元数据。

配置 adapter 对一个外部输入只执行一次严格 decode，发行 disabled 或 enabled 的不可变配置结果；enabled 结果包含完整 preset registry、活动 snapshot 和当前 path/command policy（包括独立 `commands.opaque`），不再为 Direct/Shell 重复构造独立 policy snapshot。Runtime 以单一 session aggregate 拥有固定 Access Root、session-start `$HOME`、policy state、credential boundary 和生命周期资源；策略切换原子替换活动 snapshot。`akeel-access-gate` 的稳定外部表面保持 Pi extension，compiler、parser、resolver、fact accessor 和测试辅助 seam 不从 package root 作为并列产品 API 暴露。

Why: 当前实现虽有正确的分层方向，却在层内形成 Direct/Shell 双 Canonical、双 Admission、双 Policy Snapshot/Kernel 和 runtime 双分支；系统硬边界又分散在 service 与不同 evaluator 中。新增共同安全规则因此容易发生只修改一个车道的 shotgun surgery。私有语义车道保留 Direct 结构化合同与 Shell 语言复杂度的 locality，单一信任链则把共同的路径事实、强制边界、政策优先级和结果合同集中到高 leverage seam。将 UI 能力移出授权域，可使同一授权结论不依赖宿主展示能力；一次配置 decode、一次 pathname fact acquisition 和显式 analyzer facts 则减少重复解释与隐藏状态。

Impact: Access Gate 的结构重构以新信任链旁路构建、依据当前 Decisions 和外部合同验证，并在完整链路就绪后原子切换生产入口；迁移期间不让新旧 compiler、Admission、Kernel 或 config 交叉组成生产路径。现有 managed/passthrough surface、Policy schema 与 preset、hard boundary、Access Root、tilde、Guidance、disabled mode 和 host-visible allow/confirm/block 行为保持不变。内部测试改为围绕 Canonical facade、Admission facade、Authorization facade、program-family seam 和 Pi composition 验证；无生产消费者的浅层转发与宽 barrel export 可删除。

Rejected:

- **把 Direct 与 Shell 压成开放的通用 operation IR：** 两种输入语言与授权轴并不相同；大量可选字段会形成宽 DTO，并把 Shell 的 CWD/opaque 语义泄漏给所有调用方。
- **Direct 与 Shell 各自保留完整垂直 Policy Kernel：** locality 收益不足以抵消共同 hard boundary、路径优先级和 verdict 继续双源的风险。
- **让 Policy Kernel 读取 `hasUI` 或直接执行确认：** 宿主能力会污染授权事实，同一请求会因展示环境而得到不同的领域 verdict。
- **通过用户可配置规则 DSL 或动态 analyzer plugin 扩展系统边界：** 会使 hard-boundary 单调性和 analyzer 信任来源无法由封闭代码合同证明。
- **在现有 Access Gate 内顺带加入 OS broker/sandbox：** 这会改变执行所有权和安全承诺，不是本模块结构重构。

Out of Scope: 新增或放宽 Shell 语法、程序族、destroy/delete、网络或路径能力；改变 `policy.yaml` 用户 schema、内置 preset、凭据分类、Access Root、staging lifecycle 或 D-097 定义的 `accessGate: off` 语义；OS sandbox、fd broker、TOCTOU 消除、执行期子进程/网络隔离；Static Flow、Explanation Replay、Runtime Audit、Runtime Content Flow 和 delegated child policy。

## D-088: Session-owned Staging 生命周期与保留策略

Reversal surface: engineering

Decision: Access Gate runtime 为每个 Pi session 创建 `/tmp/akeel/sessions/session-<random>/` envelope，其中 `session.json` 声明受管身份，`lock.json` 记录进程，`staging/` 是该 session 唯一的 `stagingRoot`。Session 正常 shutdown 删除整个 envelope；异常退出留下的合法、无主 session envelope 由后续 session 启动时非阻塞回收。

回收只认领 `sessions/` 中 manifest 身份匹配、非活跃、非当前且 provenance 可验证的 `session-*` 目录；未知、malformed、symlink 或归属不明内容保留。合法 crash residue 默认保留 7 天，并受 200 个目录和 500MB 总量配额约束，超额时按最后修改时间优先淘汰最旧项；调度每日至多一次。

Why: Staging 没有独立生命周期，属于创建它的 Pi session；session envelope 使 metadata、lock、staging 和回收 owner 保持局部一致。Workflow run 与 handoff 具有不同 owner 和保留条件，不能进入同一回收扫描。TTL 与双配额兼顾异常排查和磁盘边界，manifest/provenance 守卫防止按前缀认领未知内容。

Impact: GateSession 继续把实际 `stagingRoot` 加入默认允许根；其路径为 `/tmp/akeel/sessions/session-<random>/staging/`。Access Gate package 只拥有 `sessions/`，不扫描或清理 Guidance package 的 workflow run 与 handoff。

Rejected:

- **独立顶层 `staging/` 目录：** 隐藏了真实 lifecycle owner，并使 metadata 与暂存内容缺乏统一 envelope。
- **把 staging 放入 workflow run：** 一个 session 可创建多个 run，一个 run 也可包含多个 child session；错误的一对一关系会造成过早删除或无限保留。
- **按名称认领或同步删除全部历史目录：** 无法证明未知目录归属，且会破坏 crash 现场。
- **无配额上限的纯时间保留：** 短期大量暂存数据仍可耗尽磁盘。

Out of Scope: Workflow run、handoff、跨机器同步和操作系统全局临时文件系统调度；这些资源不进入 session retention。

## D-089: Capability Artifact Exchange 与临时资源分类

Reversal surface: user-boundary

Decision: Guidance package 提供独立于 Access Gate Policy 的 Artifact Exchange 与 Session Handoff。Artifact Exchange 为结果返回同一 Task Owner 的 bounded workflow 创建 `/tmp/akeel/runs/run-<random>/`：可信 `control/` 保存 immutable manifest、Herdr binding 与 publication receipt，`packet/` 保存 Owner 输入，`artifacts/` 保存 child 结果，`quarantine/` 保存不可自动消费的恢复残留，`transport/herdr/` 只保存 bounded 执行诊断。Session Handoff 完全采用会话内嵌存储（D-092），不再在 `/tmp/akeel/` 创建独立的 `handoffs/` 物理目录，彻底消除孤儿目录与跨重启易失风险。

Child artifact slot 使用预定、单 slot、单次、24 小时有效的 opaque capability；raw capability 不落盘，manifest 只保存 digest。Owner 把 slot 绑定到确切 Herdr workspace、pane 和 Agent，child Pi 通过 `--akeel-artifact-capability` 激活唯一 publisher，参数封闭为单一 `content` 字符串。每 slot 上限 1 MiB、每 run 最多 4 slots、每 Owner session 最多 8 runs。Publisher 在校验 capability、binding、Pi/Herdr identity 和预算后 no-clobber 发布 artifact，最后发行包含 digest 与长度的 receipt；Owner collect 在同一次调用中重新核验并返回内容。Herdr settle、完成文本或 terminal read 不是 receipt。

生产临时资源按 lifecycle owner 分为两类顶级命名空间：Access Gate 拥有 `sessions/`，Artifact Exchange 拥有 `runs/`。新目录默认 `0700`、文件 `0600`；受控 root 必须为当前用户所有、非 symlink 且不可由 group/other 写入。生产临时资源严格限定在上述两类顶级命名空间；未建模目录或未知内容不自动认领与清理，测试 fixture 与第三方工具缓存不占用生产命名空间。

Artifact tools 是独立自授权的 Pi custom tool surfaces，不改变 Access Gate 的 path/command Policy，也不扩展普通文件访问权限。Run 不执行自动 GC，保留至用户批准清理。Session Handoff 与会话文件（JSONL）生命周期 100% 绑定，随会话清理一并销毁。

Why: 普通 `write` 的 Gate 只拥有执行前准入，不能保证单次 capability、原子 no-clobber、receipt 或 verified collect；放宽 `review` 会扩大所有写权限。Herdr 0.9.0 只提供 Agent 状态和终端读取，没有结构化 artifact API。Pi custom tool 与 custom flag 可把复杂度封装在窄接口内，同时保持 Herdr 负责执行拓扑、AKeel 负责结果 transport。按 owner/lifecycle 分类避免 staging GC 删除未裁决结果，也避免把跨 session handoff 的 authority transfer 泄漏进普通 run。

Impact: Guidance package 除 bootstrap/skills 外加载 Artifact Exchange extension；正式 delegation 使用 reserve→packet→bind→capability start→publish→status/collect。Session Handoff 按 D-092 完全内嵌于 Pi 会话条目，不占用 `/tmp/akeel` 外部目录，状态由会话 append-only entries 表达，不进入普通 workflow run，也不等同于 Task acceptance。Quarantine 归所属 run 且非空时阻止未来自动清理；transport diagnostics 和 `herdr agent read` 不能进入 result authority。

Rejected:

- **允许普通 write 写特定 `/tmp` 路径：** host write 不由 AKeel 执行，无法提供发布与 receipt 原子性。
- **复用 session staging：** session 与 workflow 是多对多关系且 retention 不同。
- **抓取 terminal output 或 Herdr plugin 作为结果协议：** 终端可能截断或混入 UI，plugin 又引入额外 runtime dependency 和宽系统权限。
- **单一全局 TemporaryResourceManager：** 会耦合三个独立安装 package，并把不同 owner/lifecycle 变成浅 dispatcher。
- **把 handoff 作为普通 run kind：** successor ownership transfer 会迫使所有 run 承担 adoption 状态和跨 session authority。

Out of Scope: 自动 run/handoff/Herdr resource GC、Task accepted/abandoned 状态、无人值守跨 Owner adoption、异步 mailbox、binary/streaming/multipart artifact、多用户或恶意同 uid 隔离、OS sandbox、fd broker 和完整 filesystem TOCTOU 消除。D-092 的用户显式原生 session replacement 只转移同一 Task 的唯一 Owner authority，不构成后台或并行 adoption。

## D-090: 三域正交路径访问模型与能力资产防篡改硬边界

Reversal surface: user-boundary

Decision: Access Gate 路径准入采用三域正交模型（Three-Tier Path Domain Model）：
1. **凭据域（Credential Domain，D-070）**：宿主拥有且保存实时凭据的工件（`auth.json` 及其衍生变体）与相交递归搜索，享有绝对最高优先级拦截权，任何其他域不可豁免，一律永久 hard-deny。
2. **能力资产域（Capability Domain）**：只覆盖 Pi 的已安装分发存储与全局分发资源，不覆盖所有被 Pi 加载的项目源码。标准根包括全局 `agentDir/git`、`agentDir/npm`、`agentDir/node_modules`、`agentDir/extensions`、`agentDir/skills`、全局 `$HOME/.agents/skills`，以及当前 session 项目的 `.pi/git` 与 `.pi/npm`。这些根由 `pi-composition` 按 session cwd 计算；对该域下的 Direct `read` 与非递归 Direct `ls` 赋予隐式只读准入，不要求路径位于工作区 `allowedRoots` 内；对 Direct `write`、`edit` 以及 Shell 中带有写或删除副作用（`write`/`delete`）的变异操作，一律触发系统级防篡改硬拒绝（`hard-boundary`），任何 preset 不得放宽。严禁将 `agentDir` 根自身纳入能力资产根，防止凭据与会话隐私泛化。
3. **工作区主域（Workspace Domain，D-072 / D-069）**：覆盖会话 `accessRoot (cwd)`、stagingRoot、`/tmp/akeel` 与项目源码资源（包括 `.pi/extensions`、`.pi/skills`、`.agents/skills`），完整受内置与自定义 Preset（`review`、`guided`、`develop`）管辖。

`createMandatoryBoundaries` 接收并密封冻结 `capabilityRoots`；`createGateSession` 校验并传递该集合，工作区 `defaultRoots` 保持纯净；能力根按 session cwd 重新装配，不实现动态包扫描器。Pi 资源发现规则之外的宿主自定义资源路径继续由显式宿主集成提供 capability roots。

Why: 能力资产的安全属性来自安装副本的所有权与生命周期，而不是来自“曾被 Pi 加载”这一事实。全局与项目 package store 是 Pi 管理的分发副本，模型修改后可通过 reload 改变执行面，必须默认只读；项目 `.pi/extensions`、`.pi/skills` 与 `.agents/skills` 是宿主项目源码，自动升级为系统只读边界会阻碍用户合法开发。按 installed store 与 project source 分域，既保护 package supply chain，又保持宿主对称性与项目源码可维护性。按 session cwd 计算项目安装根，避免 session replacement 或不同项目复用过期能力根。

Impact: 模型在任何工作区中可直接读取全局与项目安装副本，无需在 `policy.yaml` 配置白名单；任何对 Pi 安装存储的修改（写、改、删）即使在 `develop` 下也被硬阻断；项目源码形式的 extension、skill 与配置仍按工作区策略处理；`agentDir/auth.json` 维持绝对不可读硬边界。

Rejected:

- **将所有 Pi 可加载目录都纳入能力域：** 会把项目自有 `.pi/extensions`、`.pi/skills` 与 `.agents/skills` 错误升级为不可修改的系统资产，破坏宿主源码所有权。
- **只增加全局 `agentDir/npm`：** 无法保护项目 `.pi/npm`、`.pi/git` 安装副本，且能力根仍与 session cwd 脱钩。
- **在工作区 `allowedRoots` 中手动配置安装存储：** 破坏 Zero-Config UX，且在 `develop` 下向模型暴露分发代码写权限，存在写穿透风险。
- **将 `agentDir` 根目录直接作为能力资产根：** 会将 `auth.json`、`settings.json` 及会话日志置于能力域之下，扩大暴露面。
- **允许对能力资产进行受审批的修改（`ask`）：** Pi 安装副本在工作区会话中必须是严格只读的，修改必须通过 Pi 包管理器或源 checkout 完成，不提供审批放宽通道。

Out of Scope: 工作区外普通业务文件的读写放宽、对未注册第三方文件的特例放行、任意自定义资源路径的自动扫描、Shell 任意动态或未建模命令对能力资产的执行，以及项目源码资源的自动只读化。

## D-091: 多语言构建工具族语义分类与防误删硬边界

Reversal surface: engineering

Decision: Access Gate Shell 程序分析器注册表（`programs/`）新增多语言构建工具族语义模型（`build-tools.ts`），覆盖 Rust（`cargo`）、Go（`go`）、通用 Make（`make`/`gmake`）、Java/JVM 构建工具（`mvn`/`mvnw`/`gradle`/`gradlew`）及 Java 运行时工具（`java`/`javac`）：
1. **破坏性清理一票否决硬拦截**：`cargo clean`、`make clean/distclean/mrproper/clobber`、`go clean`（含 `-cache` 等）、`mvn clean`（含 `clean:clean`）、`gradle clean`（含 `cleanTest` 等前缀目标）统一裁决为 `commandClass: "destroy"`, `effects: ["delete"]`, `hardBoundary: true`。即使命令行混合常规构建目标（如 `mvn clean install` 或 `gradle clean build`），破坏性效果享有绝对最高优先级裁决权，坚决触发防误删硬拒绝。
2. **元数据与只读检查精准识别**：纯版本与帮助标志（`--version`, `-v`, `--help`, `-h` 等）裁决为 `inspect`（0 effects）；专有只读查询（如 `cargo metadata/tree`、`go env/list/doc`、`make -p/-q/-n`、`mvn dependency:tree/help:*`、`gradle tasks/dependencies/--dry-run`、`java/javac -version`）裁决为 `commandClass: "inspect"`, `effects: ["read"]`。
3. **关键工作区参数与 CWD 变更消费**：`-C`（Go, Make）提取为 `cwdChanges`；工作区构建与配置选项（`cargo --manifest-path`、`make -f`、`mvn -f/-s`、`gradle -p/-b/-c`、`java -jar`、`javac *.java`）提取为 `role: "source"` 路径；输出目标选项（`go -o`、`cargo --target-dir`、`javac -d`）提取为 `role: "target"` 路径。
4. **有界委托构建执行**：常规构建、编译与测试目标统一保持 `commandClass: "execute"`, `effects: ["execute"]`, `opaque: true`，不伪造构建无副作用的假象，受策略预设与工作区路径管辖；本地 Wrapper（`./mvnw`, `./gradlew`）保持 path-form 契约：destroy 穿透硬拦截，非 destroy 降级为 opaque execute。

Why: 现代工程项目重度依赖多语言构建工具链，此前因缺乏建模直接落入 `unknown`，导致 `clean` 破坏性删除逃脱 Mandatory Boundary 防误删防线（在 develop 下被误放行），同时无副作用查询被过度拦截，且丢失工作区路径事实。分层语义模型以极简、统一的选项契约封闭支持上述核心工具，在提供多语言开发流畅体验的同时筑牢系统防误删底线。

Impact: 开发者在 Rust、Go、C/C++、Java/Kotlin 仓库中可原生使用常用构建、测试与诊断命令，且不会被误拦截；任何带有 `clean` 批处理删除的命令均被系统强制拦截，杜绝误抹除 target/build/cache 的事故。

Rejected:

- **对 Makefile、build.rs 或 Gradle 脚本进行深度 AST 语法分析：** 编译期构建行为图灵完备，AST 解释复杂度高且无法形成完备证明，统一如实声明为 `opaque: true`。
- **允许混合命令（如 `mvn clean install`）降级为普通 execute：** 会让破坏性删除借构建之名穿透防线，必须执行一票否决。
- **将 Java 本地 Wrapper 脚本视为系统级 inspect 命令：** 本地工作区脚本可能被篡改，执行脚本代码本身具有任意执行属性，必须在 path-form 下降级为 opaque execute。

Out of Scope: 语言构建工具内部的网络依赖下载拦截（由网络策略独立管辖）、非标准或已废弃构建系统的特定方言。

## D-092: 必要语义保活、会话内嵌 Handoff 与单入口原生 Session 接力

Reversal surface: user-boundary

Decision: Session Handoff 不再把自由文本摘要视为完整性证明，而采用三层语义保留与 no-silent-drop 合同：Project Records、代码、测试和受管 artifact 持有 durable authority；Pi custom session entries 持有不进入模型 context 的 live semantic delta；source Pi session 作为冷归档保留至 successor reconciliation。一个 Semantic Unit 的操作状态与语义生命周期正交；只有删除后不再改变合法下一动作、authority、安全边界、当前状态判断或验证义务，且具有明确 closure disposition 与依据时，才可从 live set 淘汰。

Handoff 彻底消除外部 `/tmp/akeel/handoffs/` 孤儿目录，将胶囊数据与生命周期状态 100% 内嵌至 Pi 原生会话文件（JSONL）：source 会话追加 `akeel:prepared-capsule` 与 `akeel:switch-intent`（取消时为 `akeel:switch-cancelled`），successor 会话追加 `akeel:continuation-capsule`（承载源会话转交与胶囊事实）与 `akeel:reconciliation`；生命周期随会话文件一并清理，跨系统重启自然免疫。规范化 JSON 是 capsule 的语义载荷，Markdown 只作确定性投影与终端展示；successor reconciliation 必须把每个 live semantic ID 唯一分类为 imported、conflict 或 unresolved，并核对当前 workspace，receipt 只证明 captured semantics 的覆盖和传输完整性，不证明模型理解、未表达意图或未捕获隐含语义。

用户端统一为 `/handoff [optional-next-action|view]` 单一交互入口，废除独立的 `handoff-session` 技能与 `akeel-` 命名空间前缀。`/handoff view` 仅在终端打印当前活动胶囊，不切换会话亦不产生磁盘文件；直接运行 `/handoff` 时，支持带参数覆盖/声明下一步，未预制胶囊时由命令内部自动完成深度推理合成并在当前会话写入胶囊，随后调用 Pi 原生公开 `ctx.newSession({ parentSession, withSession })` 替换会话。replacement 后只使用 fresh context，绑定唯一 successor，向新会话发送带 HUD 看板的有界 kickoff，并将旧会话工具永久冻结防裂脑。普通 event/tool handler 不调用 command-only replacement API，不通过 Shell 启动 Pi、扫描外部 session JSONL、自动 commit/stash/revert 或把 compaction 当作 handoff receipt。

Why: 对话末端摘要无法完备识别未来必要信息；“工作已完成”也不表示其结论、外部副作用或防重复价值已经失效。把 load-bearing 语义在产生时外部化、对已捕获单元建立 source-to-destination 映射，并在 successor 继续前重新核对现实，可以把静默遗漏转化为可检测的 fail-closed 状态。将会话交接内嵌至宿主 JSONL 文件，彻底消除了外部孤儿文件泄漏与手动清理负担，使交接天然具备抗机器重启能力。Pi 原生 replacement 保留 parent lineage 并避免第二套进程编排；统一收敛为单一 `/handoff` 原生命令彻底消除了技能与命令双重入口的认知割裂，以及先跑 skill 后敲命令的两步摩擦，同时通过参数直接传递断点意图。

Impact: Guidance package 增加 semantic handoff document、session-embedded ledger、状态收据机与单命令 replacement composition；移除冗余的独立 `handoff-session` 技能，入口全面归一为 `/handoff`。D-075 的唯一 Task Owner 不变：source 在 transfer 前持有 authority，绑定 successor 后由后继持有；D-078 的 handoff 保持用户显式意图；D-089 的临时资源收敛为 `sessions/` 与 `runs/` 两类，不再创建 `handoffs/` 外部目录。

Rejected: 维护技能与命令并行的双重交互入口（造成认知割裂与“跑完技能再敲命令”的两步摩擦）；仅扩大摘要长度（仍会静默漏掉隐含必要语义）；以操作 complete 直接判定语义可删（会丢失结论、风险和外部副作用）；把全量历史注入 successor（复制噪声、秘密与注意力退化）；每轮写 Project Record（把过程日志污染为长期权威）；事件 handler 直接调用 session replacement 或 Shell 启动新 Pi（违反公开宿主边界并产生死锁或 split-brain）；要求 handoff 前 tests green 或 Git clean（排除合法的 TDD Red、blocked 与准确描述的 incomplete checkpoint）；把 reconciliation receipt 宣称为模型理解或零损失证明。

Out of Scope: 未表达或未捕获语义的绝对完备性、跨未加载 AKeel 的进程实施全局 Owner 锁、无人值守异步 orchestration、跨 Agent session 文件扫描、自动 Git/发布副作用、handoff GC、OS sandbox，以及替换 Pi compaction。Source 冷归档与 unknown-live fallback 提供恢复面，但不消除自然语言理解的理论边界。

## D-093: Session Handoff 采用 source intent 与 successor receipt 的单向两阶段交接

Reversal surface: engineering

Decision: Pi 原生 Session Handoff 采用单向两阶段协议：source session 在 replacement 前追加 `akeel:prepared-capsule` 与 `akeel:switch-intent`，以 source intent 进入冻结状态；successor session 通过 `newSession({ setup })` 的 successor `SessionManager` 追加唯一 `akeel:continuation-capsule`，再通过 `withSession` 的 fresh context 以 Pi custom message 发送隐藏 kickoff 并触发 successor turn。replacement 成功后不再使用旧 `pi`、旧 command context、旧 `SessionManager` 或旧 UI，也不向 source 追加 transfer entry。新流程不发行 `akeel:handoff-switched`，读取逻辑继续兼容历史 entry；取消仅在 `newSession()` 明确返回 `cancelled: true` 且未发生 replacement 时追加 `akeel:switch-cancelled`。

Why: Pi 在成功 session replacement 后使旧 extension instance 与 session-bound handles 失效；source 在 replacement 后无法安全完成第二次提交。将 source intent 作为切换前的冻结承诺、successor continuation 作为切换后的交接收据，可以避免 entry 写错 session、保留 fail-closed 的 source 状态，并使 `setup` 在 successor 启动前完成持久化初始化。`withSession` 只承担 fresh context 上的消息投递，不承担跨 session 状态写入。

Impact: HandoffStore 的新发行接口只生成 successor receipt，历史 `handoff-switched` 仍可读取；Pi 类型声明补齐 `newSession.setup` 与 successor `SessionManager.appendCustomEntry`；kickoff 使用 `sendMessage({ customType, display: false, details })` 保留 extension provenance 与 digest 元数据，但仍以有界 content 进入模型 context；composition 测试使用隔离的 source/successor session seam，并验证旧 handle 在 replacement 后不可用。

Rejected: replacement 后继续使用捕获的 `pi` 或 command context；在 `withSession` 中追加 successor entry；把 source transfer entry 写入 successor；直接操作 JSONL session 文件；删除切换前 `switch-intent` 以规避取消清理。

Out of Scope: Pi runtime 本身的 replacement/cancellation 实现、跨 Owner handoff、异步 mailbox、外部 handoff 文件和 source session 在 replacement 成功后的二次写入机制。

## D-094: `which` PATH 查询的未界定根硬边界

Reversal surface: engineering

Decision: 裸名 `which <bare-command-name>` 可以在 Canonical 层表达为 `inspect`、`read` 且不发行路径事实，但由于 PATH 搜索根与运行期查找范围尚未形成可证明的 bounded contract，该语义继续由 Mandatory Boundary 发行 `hard-boundary` 拒绝，不进入 preset 的普通 inspect 策略求值。选项、多目标、空目标、动态值和路径形式不因该语义获得放行；系统路径形式继续遵循 D-067 的 opaque execute 边界。

Why: `which` 的结果依赖进程 PATH 和执行期文件系统搜索。没有受管的 PATH authority、根集合与 lookup 事实时，“不发行路径事实”不能证明没有越界读取；仅以 `inspect: allow` 放行会把未证明的运行期访问隐藏在静态分类之后。hard-boundary 保持 D-018 的 fail-closed 和 D-072 的 Access Root 不扩张不变量。

Impact: `which <bare-command-name>` 在所有 preset 下保持安全拒绝，直到未来建立独立的 bounded PATH lookup 合同；当前不恢复 T-0149 原先的普通 inspect 放行目标。现有选项/多目标/路径形式负例和无路径事实测试继续作为边界证据。

Rejected:

- **仅因 Canonical 没有 path fact 就放行：** 忽略 PATH 搜索的隐含文件系统访问范围。
- **用当前进程 PATH 或 PATH 字符串前缀猜测安全根：** 环境值和运行期解析不是当前 Gate 可验证的静态授权事实。
- **把 system path-form `which` 透明映射为裸名 inspect：** 会绕过既有 path-form opaque 边界。

Out of Scope: PATH 受管发现、别名/函数解析、多个目标、选项扩展、Shell 动态展开和对执行后 `which` 输出的内容过滤。

## D-095: Task 生命周期收敛为验证证据与原子清档

Reversal surface: engineering

Decision: Task 的持久化 Status 只保留 `draft` 与 `in-progress`；`verified` 不再作为新记录状态。验证由 Verification Evidence、审查结论和 durable-update checklist 表达，Task 在完成 durable updates 的最终落地提交中直接清档；`cleared` 由当前树中不存在 Task Record 表达，不写入状态字段。

Why: `verified` 与清档之间没有独立的权威行为，反而形成容易滞留的中间记录，并允许历史流程跳过或重复状态而不被 validator 证明。保留 `draft` 可维护规划到实施的入口边界，保留 `in-progress` 可覆盖实施、测试、文档同步和审查；把验证保留在证据与最终提交门禁中，可以降低状态复杂度而不削弱 checkpoint、审查或清档要求。

Impact: principles、survey-context、implement-work、doc-sync、record validator 与测试统一使用 `draft → in-progress → cleared`。历史 Git checkpoint 不改写；旧历史中的 `verified` 只作为审计事实存在，当前新记录不再生成该状态。

Rejected:

- **保留 `verified` 作为强制中间提交状态：** 增加一次持久化转换，却不能阻止已验证记录滞留或生命周期跳转。
- **删除 `draft`：** 会丢失 implementation-planning 与 implementation start 之间的明确边界。
- **新增 `blocked`、`abandoned` 等状态：** 当前没有独立的权威语义、清理责任或恢复合同，应用状态章节和开放风险即可表达。

Out of Scope: Candidate、Decision、Artifact Exchange verified collect、Session Handoff reconciliation 与 Git 历史中的既有 Task 状态。

## D-096: Linux-only host boundary rejects Pi PowerShell

Reversal surface: user-boundary

Decision: AKeel explicitly rejects Pi's `powershell` tool as an unsupported host surface on the Linux-only product boundary. It does not implement a PowerShell semantic lane or treat PowerShell as an unknown passthrough surface. Other genuinely unknown Direct surfaces retain the existing passthrough contract.

Why: Pi 0.86 exposes PowerShell as a first-class built-in execution tool, so leaving it in the generic unknown-tool passthrough would create a new file and process execution path outside AKeel's Canonical → Admission → Policy chain. Implementing a second shell-language analyzer would expand the supported platform and semantic contract beyond the Linux/Bash boundary. Explicit static rejection preserves fail-closed behavior without pretending to authorize or analyze PowerShell.

Impact: The host adapter and production integration tests must classify `powershell` as an unsupported governed surface and return bounded static rejection. README, CONTEXT Negative Space, and the Access Gate boundary documentation must distinguish this explicit rejection from passthrough of genuinely unknown tools. The change does not alter `user_bash`, custom tool backends, or the Linux Bash semantic lane.

Rejected: Implementing a PowerShell parser and policy lane; allowing PowerShell through `commands.opaque`; disabling it only through active-tool selection; treating it as an ordinary unknown passthrough.

Out of Scope: Windows or PowerShell support, PowerShell path/command semantics, PowerShell script analysis, and enforcement of user-entered `!`/`!!` commands.

## D-097: Access Gate off mode retains mandatory host boundaries

Reversal surface: user-boundary

Decision: `accessGate: off` and `/policy off` disable AKeel's configurable Operation Admission, path policy, and credential checks for ordinary model `tool_call` surfaces, while mandatory host-surface boundaries remain active. In particular, Pi `powershell` remains an explicitly unsupported surface on AKeel's Linux-only boundary and is statically blocked even when Access Gate is off. Principles and skills continue to operate; genuinely unknown tools and ordinary managed calls passthrough in off mode.

Why: D-096 establishes PowerShell as a host-surface boundary rather than a configurable policy decision. Allowing the off switch to bypass that boundary would contradict the Linux-only product contract and make the newly explicit unsupported surface behave as an accidental capability. Separating mandatory host admission from configurable operation/path policy preserves the intended off-mode flexibility without converting an unsupported execution path into an allowed one.

Impact: Runtime composition must evaluate the explicit unsupported-host surface before the off-mode passthrough branch. User documentation must say that off removes ordinary Access Gate guarantees but does not enable unsupported Pi execution surfaces. D-096 remains the PowerShell-specific boundary; future mandatory host boundaries must state whether they survive off mode.

Rejected:

- **Make off passthrough every tool call:** would bypass the explicit Linux-only PowerShell boundary.
- **Treat PowerShell as ordinary unknown passthrough in off mode:** would make host classification depend on policy state and violate D-096.
- **Disable only through active-tool selection:** active tool loadout is not an authorization boundary.

Out of Scope: OS sandbox, container isolation, user-entered `!`/`!!` commands, custom tool backends, later extension input mutation, and configurable policy/path/credential checks while off.

## D-098: 待创建

