# AKeel Decisions

本文集中记录 AKeel 的长期架构、工程和安全决策。每条只保留当前结论、理由、必要替代方案和影响；被完整吸收（`superseded`）或主动退役（`retired`）的条目从寄存器剪除，历史由 Git 保留（规则见 [D-028](#d-028-统一-project-record-模型与-candidate-显式复审)）。

**条目格式**：遵循 principles.md Project Records — Decision Record Format；条目存在即表示 active，显式 `Reversal surface` 后依次为 `Decision`、可选规格子节、`Why` 及有内容才保留的 `Impact`/`Rejected`/`Out of Scope`。

## D-002: 统一 Access Gate 与用户态边界

**Reversal surface:** user-boundary

**Decision:** 使用统一的 `src/access-gate/access-decision/` 扩展集中处理 Canonical、Admission、Policy Snapshot、hard boundary 和 host approval，不提供或假定 OS-level isolation。

**Why:** 多个安全扩展会产生拦截顺序竞争、重复审批、分散配置和难以关联的审计信息。Node.js 路径检查没有 kernel-level enforcement；将 AKeel 称为 sandbox 会造成安全承诺与真实边界不一致。

**Impact:** AKeel 自行维护统一扩展，不自动继承社区扩展的独立更新。

**Out of Scope:** OS sandbox、容器、VM、seccomp、Landlock、network namespace 和其他 kernel-level isolation。

## D-003: bigpowers 技能精选

**Reversal surface:** engineering

**Decision:** 只引入 bigpowers 中具有独特价值、且没有更合适替代品的技能。

**Why:** 整体引入会带入平台专用、重复、内部元工具和项目特定能力，增加加载与维护成本。

**Impact:** 不提供自动生命周期编排，由 bootstrap、技能匹配和 `survey-context` 协同完成。

## D-009: 项目分发与文档边界

**Reversal surface:** user-boundary

**Decision:** `README.md` 是唯一用户使用入口；移除平行的 `USAGE.md`、不必要的 npm 元数据和用户 `AGENTS.md` 模板。长期架构、安全、溯源和 Project Record 文档按职责保留在 `docs/`。本地约束：`AGENTS.md` 只定义 AKeel 自身的维护入口和仓库约定，不复制注入原则、Task 生命周期或当前架构；`docs/traceability.md` 只记录外部来源、采用方式、当前文件映射和许可证义务——当前架构、安全承诺与残余风险、长期取舍分别由 `CONTEXT.md`（含 Negative Space）和本寄存器维护。

**Why:** 每个文件都应有明确的维护对象和用户价值；重复的使用、架构、安全和工作流说明会漂移，AKeel 也不应越过用户项目工程约定文件的所有权边界；溯源文件只有在来源、revision、采用范围和许可证证据可核查时才具有合规价值，运行时行为和融合取舍放入其中会把它变成第二份架构与决策文档。

**Impact:** 修改运行时行为不再自动更新 `docs/traceability.md`，只有第三方来源映射或许可证义务变化时才更新；新增或同步外部内容必须记录固定的上游 commit 或 release。

**Rejected:** 不保留按当前模块罗列“来源 + 融合决策”的架构摘要，也不使用主观原创占比作为合规证据。

**Out of Scope:** 恢复初始引入的精确上游 revision：本地提交 `2f4a3ef` 未保存这些 revision，Git 历史无法可靠还原，仅在有可验证历史快照或导入元数据时补录。

## D-018: Shell 语义与 Access Gate

**Reversal surface:** user-boundary

**Decision:** 受管 Shell `bash` 与已知 Direct surface 共享 hard boundary、Canonical path resolution 和 Policy Snapshot 决策。Shell 只在当前由 Bash/Linux 外部合同和独立测试证明的支持子集内建模：简单命令、有限 `&&`/`||`/`;` flow、受限重定向、bounded CWD 候选和已声明的程序语义。Canonical 发行事实后，Admission 向 Policy Kernel 提供最小授权事实；Policy 不执行 Shell，也不重新解析请求（D-059/D-060）。

**Security invariants:**

- blocked intent 与 credential/hard boundary hard deny，不能由 Policy preset 或一次性审批覆盖。
- 只有所有支持范围内的语法、command effect 和 path fact 都被安全解释时才可进入授权；无法证明的形态 fail-closed。
- wrapper 必须保留底层命令 intent。
- modify 命令的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- CWD 分支必须保留所有 bounded 可达候选；Admission 不得选择对授权更宽的单一路径。
- Canonical path resolution 保留 lexical 与 symlink-target traversal prefixes；blocked components remain hard boundaries，recursive path operations reject blocked descendants。
- 配置显式 path boundary 时，unknown 或其他 unbounded Shell path access 一律 hard-deny；无显式 boundary 时仍按 command class policy 决策。
- 一个 tool call 的所有 ask intent 聚合为一次审批；无 UI 不执行 ask。
- newline、pipeline、background、compound command、`for`、动态展开及其他不可证明形态继续在 Canonical 阶段拒绝，不引入猜测放行。
- `<>`（O_RDWR 读写打开）按 write 侧建模：write 决策覆盖读面（write⇒read 一致性）；不以只读建模掩盖写侧。Policy adapter 必须拒绝矛盾的 write/read 组合，避免由配置产生未定义授权语义。

**Enforcement scope:**

只对 Pi `tool_call` 中的 `bash` 和已知 Direct surface 执行策略；未知 Direct surface passthrough。不承诺全局 enforcement：`user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 及后续 handler 对 input 的修改不在范围内。

**Why:** Direct 写保护无法覆盖重定向、`cp`、`mv` 等 Shell 写入入口；统一 Canonical 语义层集中提取命令类别、路径事实与 effects，避免分类和策略漂移。fail-closed 优先：识别不了就拒绝，由模型拆解，而不是猜测语义造成潜在漏判。

**Impact:** 新 Shell 形态按“识别 → Canonical 建模 → Admission/Policy → 拒绝拆解”处理；新增程序、重定向或 flow 形态必须先在当前外部合同和 public seam 上证明，再进入支持子集。

## D-023: 决策渲染、静态 Guidance 与知情同意（literal form）

**Reversal surface:** user-boundary

**Decision:** Host-facing rendering 只消费 Policy/Canonical 的结果和按需投影的 bounded `Display View`，不执行工具、不重新解释请求，也不生成可执行建议。它分为三条封闭路径：

- **allow**：返回不带展示内容的允许结果。
- **deny**：通过源码内置的静态 code→reason 映射返回 bounded block；reason 不拼接原始 Shell、用户路径、glob 或其他用户派生值，也不提供绕过硬边界的替代执行建议。
- **ask**：只返回 `executed: false` 的 confirm。Shell 展示已投影的 command class/effects 与 literal command，Direct 展示 operation/path；这些用户派生值只进入人类审批面，不进入 deny reason。没有 Display View 时使用静态的 `Approval required.`。

所有 host-facing 结果均为 immutable 值；审批摘要最多 160 个字符并以省略号截断。没有可用审批 UI 时由 host composition 阻断，不执行请求。拒绝、确认和执行的职责保持分离：renderer 只产生 host-facing data，实际执行仍由宿主在明确批准后负责。

**Security invariants:**

- deny guidance 不携带用户派生值，不生成 Shell，不调用替代 tool；硬边界、策略拒绝、unsupported syntax 和动态输入都只能得到静态分类文案。
- ask 侧向人类展示其需要否决的 bounded 事实；Shell 的 literal form 保留原始命令的知情同意价值，Direct 的 path 是对应文件操作的必要信息。
- Display View 是授权域之外的按需投影；Kernel 不消费展示文本，renderer 不反向影响 Canonical 或 Policy。
- unknown、动态值和其他未建模形态仍由 Canonical/Policy 合同决定其拒绝或 ask 结果；renderer 不通过展示层猜测其运行期语义。

**Review-mode modification Guidance:**

- 当活动 preset 是内置 `review`，且 Direct `write`/`edit` 因普通 `policy-denied` 被拒时，可返回固定的静态 Guidance，提醒用户通过 `/policy` 切换到允许修改的策略后重试。
- 该 Guidance 不是授权、审批替代或自动提权；用户必须显式完成策略切换。Shell、hard boundary、敏感路径、破坏性操作、unknown、unsupported 或其他非普通策略拒绝不使用该窄 Guidance。
- Guidance 不判断规划是否完成，不携带路径、命令、策略字段或其他用户派生值。Policy 内容、策略状态和活动 preset 的上下文隔离仍由 D-053 负责。

**Why:** 拒绝文案是模型可见的失败路径，若携带用户输入或可执行替代方案，就会扩大信息暴露并形成绕过提示。相反，ask 必须让人类看到足以批准或否决的有限事实；对 Shell 隐去 literal command 会使审批退化为盲批。把两侧分开，并将展示限定在 bounded Display View，可同时保持静态安全 guidance 和有效知情同意。

**Impact:** 当前 host contract 使用静态 block reason；Shell ask 摘要包含命令类别、effects 和 literal form，Direct ask 摘要包含操作与路径。审批结果永不表示已执行；无 UI、用户拒绝或异常均由 host composition 阻断。该渲染合同不规定旧 renderer、旧 GuidanceId、旧 DecisionCode、旧 plan/verifier 或旧 Profile/config 的兼容形状。

**Rejected:**

- **deny 中拼接原始命令或路径**：增加模型侧暴露，且审批所需的用户输入只应出现在 ask 面。
- **ask 只展示类别、不展示 literal form**：人类无法判断命令的完整意图，审批会退化为盲批。
- **renderer 调用替代 tool 或生成可执行修复命令**：把展示层变成执行入口并扩大提示注入面；模型可根据静态文案自行拆解后重试。
- **通过旧 renderer、旧 GuidanceId 或旧结果 parity 定义新合同**：旧实现不是当前语义或安全性的权威来源（D-059/D-060）。

**Out of Scope:**

- 逐命令拆分审批：批准粒度仍是 tool-call 级。
- 对 unknown/opaque 命令补充运行期语义：属于当前程序语义候选边界（C-027）。
- 宿主对工具调用历史、执行输出或其他 extension 通道的脱敏与审计：不属于 renderer 合同。

## D-025: Direct 优先与 Shell 安全子集

**Reversal surface:** user-boundary

**Decision:** 文件检查场景优先选择 Direct `read`、`grep`、`find`、`ls` 工具，但不因为存在 Direct 等价入口而全局禁用 Shell。Direct 请求和 Shell 请求都必须经过同一条 Canonical → Admission → Policy 边界；Shell 只有在当前支持子集内能静态证明命令、效果、路径和 bounded CWD 候选时才进入授权，无法证明的语法或明确的硬安全边界 fail-closed。已证明的 Shell inspect/modify 命令仍按 Policy Snapshot 的 command、path 和 hard-boundary 语义决策。

**Deny feedback:** renderer 对 dynamic、unsafe、opaque、unsupported、blocked-path、symlink escape、destroy 和其他硬边界统一使用静态 bounded host-facing 文案，不拼接用户命令、路径或 glob，也不生成替代命令。模型可在失败后自行选择 Direct 工具或拆成支持的字面 Shell；文案本身不是绕过建议（D-023）。

**Why:** Direct 工具提供结构化参数和更窄的访问面，适合作为模型默认选择；Shell 仍承载 pipeline 之外的已证明组合、命令特有选项和有限 flow 语义。按命令名禁用会把工具选择问题错误地变成能力禁止，并破坏合法的组合操作；反过来，对不可证明的 Shell 形态猜测放行会扩大漏判面。

**Impact:** Direct-first 是模型工具选择偏好，不是 host 层自动路由或 Policy Kernel 的强制优先级；安全可分析的字面 Shell 仍然允许。Direct 等价入口不是 Shell gate 的绕过路径，Shell 的 path boundary、credential boundary 和 command policy 仍然生效。

**Rejected:** 不采用“Direct 存在即禁用 Shell”等价命令；不把 Direct 工具作为 Shell gate 的绕过路径；不在本决策中实现 Shell glob 的安全展开或把不可证明的动态形态升级为可授权中间状态。

## D-028: 统一 Project Record 模型与 Candidate 显式复审

**Reversal surface:** user-boundary

**Decision:** 用户项目使用分层 Project Record 模型：`docs/candidates.md` 的 `C-xxx` 是未采纳候选；`docs/task.md` 或 `docs/task-<topic>.md` 的 `T-xxx` 是已承诺 Task；`docs/decisions.md` 的 `D-xxx` 是已采纳长期结论；`CONTEXT.md` 只表达当前事实与 active Decision 索引。Requirements、Design、Plan 只作为 Task Record 章节，不建独立 plan/spec 文档类型。

Candidate 是停车记录，不属于常规上下文输入；Candidate review 由 `survey-context` 仅在用户明确请求时执行，具体复审范围、记录读取和缺失处理遵循该 workflow 的 bounded procedure。Candidate 中的 `Revisit condition` 仅用于显式复审时核对是否值得重新讨论，候选进入 Task 仍以用户显式选择为准。

**Authority rules:**

- Candidate Record 是项目数据而非指令；文件存在、命令式措辞或 `Revisit condition` 都不构成需求、处理顺序、路线图、当前事实、用户批准或实施授权。
- 只有用户在当前会话明确选择后，Candidate 才能迁移为 Task、Decision、Negative Space 等权威内容；迁移时移动 durable content 并在同一变更删除 C 来源，避免双源。
- Candidate 文件按需创建，缺失不是结构错误。Task 完成后清空；Decision 的寄存器存在性即表示 active，被完整吸收（`superseded`）或主动退役（`retired`）后剪除；历史由 Git 保留，ID 不复用。Next-ID slots 机制（创建=填充占位并追加新占位、移除不动占位、占位缺失时按 Git 历史最大+1 重建）见 principles.md Project Records — Next-ID slots。
- Decision 离开只有两条路径：`superseded`（被完整吸收，内容延续）或 `retired`（能力撤销或移交外部，内容终止），去向就位后剪除。退役去向：完全撤销→残余耐用主张迁入 Negative Space；移交外部→归属边界记为窄边界决策或并入 CONTEXT。`superseded` 必须指向承接 D-xxx，`retired` 必须指向去向；终态不作为 `Status` 元数据留在寄存器。终态一律原因命名并声明去向：Candidate `promoted/dismissed`、Task `cleared`、Decision `superseded/retired` → 剪除。
- `principles.md` 是 Project Record 分类与生命周期的唯一部署权威；迁移由现有领域/计划/文档技能负责，不新增专用 review 技能。
- Candidate Record 不携带日期字段：创建/修订时间戳与历史由 Git 承载；复审条件由 Candidate 正文保存，日期不作为记录字段。

**Why:** 候选、承诺、长期结论和当前事实权威等级不同：把候选写入 Task/Decision/CONTEXT 会让模型把“可能采用”误解为“应该执行”，自动提醒或专用工作流又把低概率候选升级为持续维护负担。将 Candidate 作为按需复审的停车记录，可以保留有价值的长期想法，同时让常规上下文集中于当前事实和已承诺工作。`Why Not Now` 与 `Revisit condition` 分别保存停放理由和复审依据，使显式复审具备可核对的入口。容器原名 Future Record 命名自时间属性而本质是承诺属性，`future` 引导 roadmap 误读；改名时 future.md 为空、包未发布，故同步 C-xxx 前缀且不提供旧路径兼容读取。

**Impact:** `README.md` 是唯一用户使用入口；通用规则经 principles 注入，技能只实现各自职责；常规 `survey-context` 的上下文负载不再包含 Candidate 正文，用户仍可通过显式复审查看完整候选记录。

**Rejected:** 不合并 C/T/D 到单一文件；不每记录独立文件；不采用 Proposed Decision；不新增 review 技能、Record Manager、优先级评分、日期到期、自动提醒或 slash command；不把 Candidate 当默认 backlog/roadmap；不为 `retired` 增加永久状态枚举或墓碑文件；不把外部移交所有权边界写入 traceability（所有权属决策，许可证归属才属 traceability）；不提供容器级迁移引导（自有格式需模型自动识别并跨格式校验，产生猜测与格式权威混用；识别负担属用户显式声明而非模型自动探测）。

**Out of Scope:**

- **容器级迁移引导机制**（自有决策寄存器、ADR、跟踪器、ideas/backlog 文档的用户项目）：不建专用 skill、不建声明/路由系统、不改 CONTEXT.md 契约。二元边界：标准路径容器由 AKeel 管理；非标准体系由用户经 `AGENTS.md` 或显式会话指示声明，AKeel 不自动识别、不写入。迁移非默认，仅用户显式选择时作为一次性 Task 走 Migration Protocol；不可读来源报告缺口并请求中央化进 CONTEXT.md，不盲猜。

## D-030: 提示词体系边界与原则部署（Prompt Surface）

**Reversal surface:** engineering

**Decision:** 提示词按注入面分层：`principles.md`（恒定注入，承载原则与唯一格式/规则来源）、`skills/`（按需加载，每个 skill 单一职责、调用时全量消费）、access-gate guidance（失败路径，保持原样不精简）。通用约束经“原则注入 + Quick Reference”部署。两条约束：① skill 单一职责——一个 skill 只做一件事，触发场景互斥的 skill 保持独立，不合并；② 格式/规则单一来源——只在 `principles.md` 参考节（Quick Reference / Project Records）定义一次，技能只文字引用（如 "per principles.md Project Records — Record Lifecycle"）、不重复定义格式和规则、不内嵌副本。

**Why:** 混合职责会浪费加载内容并模糊触发边界；格式副本会在技能之间漂移。`principles.md` 是每个 session 都可获得的稳定注入面，集中定义可避免规则分叉和引用死链。

**Impact:** `principles.md` 是通用参考数据的唯一注入来源，不新建承载格式的 skill。Skill description 只描述产出与约束；正文承载执行，用户触发型 workflow 使用用户侧调用指引。

**Rejected:**

- **新建 `project-records` skill 承载格式**：指针引用依赖模型主动 read，可能被跳过且单次注入可能多于内嵌副本；格式与 principles 恒定注入面天然同层。
- **Quick Reference 下沉到各对应 skill**：破坏格式/规则单一来源，操作手册分散后失去恒定注入的零成本优势。

**Out of Scope:**

- **guidance 文本精简**：失败路径措辞和支持工具枚举属于可执行安全判据，保持在 guidance 的动作点。
- **合并触发场景互斥的 skill**：各 skill 的全量消费与独立触发边界仍需保持；只有实际触发重合时才重新评估。
- **token 基线和提示词行为测量**：当前没有可重复的理解度评测合同；结构性引用和 skill 检查仍由可执行校验覆盖。

## D-035: 平台边界收窄为仅 Linux

**Reversal surface:** user-boundary

**Decision:** 平台支持边界从“仅支持 POSIX”收窄为**仅保证支持 Linux，以 Arch Linux 为基准工具链**：选项解析固定按 Arch Linux 的 GNU 工具链语义处理（GNU coreutils / GNU git / npm 生态常用选项），不提供按平台或发行版检测方言并切换选项表的机制。Windows、macOS、BSD 均不在支持范围，不建模其路径语义与选项方言；其他发行版的工具链版本差异不在保证范围——选项表以 Arch Linux（滚动发布、工具链最新）为准。BSD 工具与 GNU 的选项歧义（`stat -f` 为格式参数、`du -d` 在 BSD 无对应、`df -t` 在 BSD 为 flag）造成的解析差异不承诺消除，BSD 平台上的命令语义不在承诺范围。

**Why:** 单一 GNU 语义基线可以避免方言检测、双维护和误报，同时使支持边界与实际验证环境一致。

**Impact:** `CONTEXT.md` 的 Negative Space 明确仅保证 Linux，并列出 Windows、macOS、BSD 的排除范围。代码和策略不提供跨平台命令语义切换。

**Rejected:**

- **按宿主平台检测方言并切换选项表：** gate 分析宿主不一定是命令执行宿主，并会产生多套方言维护面。
- **保守双解析取并集：** 会引入额外路径意图和误报，对仅支持 Linux 的承诺没有收益。
- **宿主检测加用户配置覆盖：** 会为未声明的跨平台场景增加配置与审计负担。

**Out of Scope:**

- Windows `\` 路径与 macOS 路径/选项方言：已在 Negative Space，不因 stat/du/df 同为 BSD 方言而把 macOS 纳入支持。
- 跨宿主场景（ssh、容器）的命令语义方言：静态分类不做执行环境探测（同 D-067 无 filesystem 检查边界）。

## D-037: Shell wrapper 链由语义入口统一解析

**Reversal surface:** engineering

**Decision:** `core/shell-words.ts` 是当前支持 wrapper 链的单一语义入口。它从命令词首识别有限的 `env`、`timeout`、`command`、`nohup`、`exec` wrapper，消费各自已证明的 wrapper 参数，并发行 `ShellCommandAnalysis`：`executable` 只承载真正要分析的底层命令，`wrappers` 单独记录 wrapper 链，底层命令的 class、effects 和 paths 由同一入口继续计算。wrapper 不进入 Policy 或 host 层重新解包。

支持范围之外的 wrapper option、动态形式、路径形式 wrapper 和不完整 wrapper 链在 Canonical 阶段 fail-closed；当前不把 wrapper 执行期的脚本或子进程行为递归解释为额外语义。

**Security invariants:**

- wrapper 不能隐藏底层 executable、位置参数、重定向或路径事实；wrapper 后的真实命令必须仍参与同一 command/effect/path 分析。
- wrapper 参数只有在当前语义入口明确消费时才可继续分析；未建模 option 不得滑入 executable 或 positional path。
- 消费方只消费 `ShellCommandAnalysis` 的事实，不各自复制 wrapper 解包、分类或路径提取逻辑。
- wrapper 不扩大底层命令的授权范围；底层命令的 hard boundary、opaque path access 和 Policy Snapshot 决策保持不变。

**Why:** wrapper 是命令前缀，不是独立授权对象。若 wrapper 与底层命令在不同阶段解析，底层命令可能落入错误的 class，或其参数和路径事实被误当成 wrapper 参数而丢失。把有限 wrapper 识别、参数消费和底层分析放在同一语义入口，可让嵌套 wrapper 与普通命令共享一条 fail-closed 路径。

**Impact:** 当前分析保持底层命令事实：例如 `env -i cat README.md` 的 executable 是 `cat`、wrapper 链是 `["env"]`、effect 是 `read`；`timeout 5 env cat README.md` 也沿同一链处理。wrapper 分析不改变 Canonical 单次解释、Admission 窄投影或 Policy 决策。

**Rejected:**

- **消费方各自重新解包 wrapper**：会复制分类和路径知识，导致新增检查遗漏嵌套形态。
- **把 wrapper 保留为 executable、再由后处理猜测底层命令**：会产生 spelling/shape-dependent 分类，并可能丢失底层路径或 effect。
- **遇到未知 wrapper option 仍按位置猜测**：可能把 option/value 当成命令或路径，违反 fail-closed。

**Out of Scope:**

- 扩展 wrapper 名称或完整 POSIX/Bash wrapper 语义；新增形态需按 C-027 重新证明。
- `env -S` 等未建模 option-with-value 形式。
- wrapper 执行期启动的脚本、子进程和环境副作用的递归解释。

## D-044: 测试组织镜像 src 分层

**Reversal surface:** engineering

**Decision:** `tests/access-gate/access-decision/` 按 `src/access-gate/access-decision/` 的 `core/`、`adapters/`、`runtime/` 边界镜像分层；extension composition 集成测试保留在 `tests/access-gate/index.test.ts`。`npm test` 使用 `tests/access-gate/**/*.test.ts` 目录 glob，focused `test:index` 覆盖生产入口。行为测试通过当前目录 public seams 验证；同层的结构、密封和 Canonical fact 合同测试可直接读取该层内部 seam，但不导入或复制旧决策链的 helper、fixture 和 expected value。

**Why:** source 的 `core`、`adapters`、`runtime` 是不同的依赖和职责边界；测试镜像这些目录后，模块到行为测试可以直接导航，且 dependency-boundary 测试能独立守住新边界。目录 glob 不要求每次新增或改名测试时同步维护文件枚举；生产入口仍有独立 focused script，保留快速反馈面而不牺牲全量校验。

**Impact:** 新增 core、adapter 或 runtime 测试放入对应镜像目录；extension composition 测试放在 `tests/access-gate/index.test.ts`；`npm test` 自动发现 access-decision 测试，`npm run test:index` 单独验证生产入口。测试 fixture 只在实际消费者所属层提供，不把旧实现 helper 带入新 trust path。

**Rejected:**

- 平铺测试文件再依赖命名约定：模块与行为边界只能靠前缀猜测，降低 locality。
- 删除 focused 入口只保留全量测试：丢失生产入口的快速反馈面。
- 将所有测试并入单一 `access-decision` 目录：掩盖 core/adapters/runtime 的依赖边界，削弱分层可见性。

**Out of Scope:**

- 测试内容、断言或覆盖范围的重构；本决策只定组织与脚本形态。
- 引入新测试框架；维持 `node:test` + `tsx`。

## D-045: Shell 条件流的有界 CWD 结果集

**Reversal surface:** user-boundary

**Decision:** Canonical Shell 对支持子集发行有界的 CWD 候选状态集，而不是选择单一执行路径。每个可建模命令保留其可证明的 success/failure 出口；`&&` 只把 success 送入右侧，`||` 只把 failure 送入右侧，`;` 无条件进入后继命令。被短路的命令（包括 `cd`）不得影响后续状态。

对简单 `cd`，success 分支使用解析后的目标 CWD，failure 分支保留进入该命令时的 CWD。Canonical 不以分析时点的文件存在性或权限检查证明 `cd` 成功；即使目标不存在，目标仍可作为 success 假设候选，失败分支也必须保留。状态按 `(commandIndex, cwd)` 稳定键增量去重，并受固定上限约束；超限返回 typed `resource-limit`，不得先物化无界集合。Admission 必须消费所有可达候选，不得选择对授权更宽的单一路径。

**Why:** 单一的前后 CWD 近似无法表达混合 `&&`/`||` 的短路与分支汇合，可能让未执行的 `cd` 污染后续路径，也可能丢失真实失败分支。路径授权依赖 CWD 事实；显式保留 success/failure 候选能在不进行执行模拟的前提下覆盖两类路径，并在状态生成处闭合资源预算。

**Impact:**

- Policy 规则本身不改变，但 CWD 候选集合可能改变最终 allow/ask/deny；验证应证明当前 Shell 合同，而不是追求旧实现 parity。
- 所有可达候选都会进入后续路径事实与边界检查，因此不可证明的路径分支不会因短路近似而被遗漏。
- 当前支持子集只把 `;` 作为顺序运算符；换行、pipeline、background 和其他复合 Shell 语法继续在 Canonical 阶段拒绝。

**Rejected:**

- **继续使用单一前后 CWD 近似：** 无法表达混合 and-or list 的分支汇合。
- **无条件把 cd 目标替换为当前 CWD：** 会丢失 success 分支的路径事实。
- **只保留 cd 目标候选：** 会丢失 cd 失败后继续执行的真实 CWD。
- **完整 Bash 执行模拟：** 超出静态、有界分析目标；不可证明形态继续 fail-closed。

**Out of Scope:** 分析到执行之间的 TOCTOU；文件存在性、权限、mount 和并发进程导致的实际 `cd` 失败原因；newline、pipeline、background、compound command 及完整 Bash 语法。

## D-047: 原则优先级与 Reversal surface 申报属性

**Reversal surface:** engineering

**Decision:** 恒注入原则面新增 `Rule Status` 规则：原则是默认值而非不可改法律，显式用户指令覆盖原则与 skill；原则或已记录决策与任务冲突时必须报告（不静默遵守、不静默违反），未决冲突并入任务关闭时的 open-proposals 处置（principles.md §9），已记录决策只经生命周期（supersede/retire）变更。每条 Decision Record 必须显式声明 `Reversal surface`：`user-boundary`（安全不变量、归属边界、用户承诺——逆转须用户显式批准，并在同一变更更新安全文档/Negative Space）或 `engineering`（模块内取舍——随模块重构正式 supersede，不静默偏离）；语义和格式单一来源为 principles.md Project Records — Record Lifecycle / Decision Record Format。`CONTEXT.md` 生命周期措辞从 Permanent 调整为 Standing（更新语义不变）。

**Why:** 恒注入面全祈使 + "DNA/EVERY interaction" 框架且无"用户指令 > 原则"的显式优先级句（文件底部优先级句只管 skills），模型面对原则冲突时没有显式出口，只能盲从或违规——"把一切当铁律、忽视自迭代"的根源是框架缺优先级与报告出口，不是缺分级表。铁律与可改的区分按强制面天然存在（代码 hard deny 无法违反 / 用户中介决策 / 注入原则可覆盖），正确分级是机制分层 + 上报信息，而非逐条贴标签——贴标签迫使模型自裁权威，误标不对称（安全规则标软是真实危害，软规则标铁律阻塞进化）。Reversal surface 是上报信息（改动时申报谁有权批准）非许可（不授权模型自行改 D-xxx）；缺失值无法区分刻意选择与漏分类，而该属性会改变逆转所需批准面，因此不能依赖隐式默认。

**Impact:** 恒注入面提供 Rule Status、Reversal surface 与 Decision 格式定义，随包分发到所有用户项目；每条存活 Decision 显式分类批准面，`survey-context` 按需读取时可直接申报；AKeel 自仓由轻量文档校验阻止缺失或非法值。

**Rejected:**

- **两级决策寄存器**（铁律册 + 工程册）：双源漂移，模型自裁权威，与 D-028 单寄存器生命周期冲突。
- **逐原则/逐决策贴强度标签**：恒定注入 token 税；误标方向不对称；D-030 已基于 C-003 拒绝 token 层说服。
- **把 Reversal surface 当作模型自行逆转的许可：** 它只申报批准面，不能绕过正式生命周期。
- **缺失时默认为 user-boundary：** 虽然 fail-safe，但会掩盖漏分类，并迫使读取方依赖不可见默认值。

**Out of Scope:** access-gate/enforcement 层任何改动（纯提示词与记录面）；为申报属性新增专用 skill 或路由；原则逐条强度分级（Rule Status 是全局优先级 + 报告出口，非 per-rule 强度表）。

## D-052: Git clone 目标路径与选项边界

**Reversal surface:** engineering

**Decision:** Canonical Git 语义对 `clone` 只发行可证明的有界路径事实。支持的取值选项先消费其值；两个位置参数 [`<repo>`, `<dir>`] 时，`<dir>` 是 write path intent，local `<repo>` 是 read path intent；没有显式 `<dir>` 时，隐式当前命令局部 cwd 作为 write target。`--template`、`--reference` 和 `--reference-if-able` 的文件值作为 read path intent。外部 remote、未建模的 git-dir/上传程序/配置或递归 submodule 形态发行 hard-boundary，而不是猜测额外路径。所有已发行候选都在 Canonical 阶段进入统一的命令局部 cwd 与 allowed/blocked path boundary。

**Rules:**

- 位置参数是 fail-closed 门控：超过两个位置参数、取值选项消费异常或无法确定位置时，不发行可放行的 clone 目标；提取只能增加已证明的路径事实，不能放宽决策。零或一个位置参数时的隐式 cwd target 是 Git clone 的已证明默认行为，不是值泄漏。
- 未建模的 equals/attached 选项形式不得把整 token 或其值误当位置参数；选项覆盖不足只允许降低覆盖率，不得产生额外可放行路径。
- `--separate-git-dir` 的值必须被消费；其 command-local git-dir 尚未形成 Canonical 路径事实前，该形态发行 hard-boundary，不得把该值归为普通 clone 目标。
- 没有 `<dir>` 时不得因值泄漏形成 `[<leaked-value>, <repo>]` 的伪位置参数组合；只有真实 local source（若存在）和隐式 cwd target 可发行。未来新增取值选项必须先复核该边界，再扩展提取规则。

**Why:** clone 目标是静态可析取的位置参数，但其选项值和 repository source 同样可能呈现为位置 token。只有在参数消费和目标位置都能证明时，目标才可进入统一 Canonical path boundary；否则应拒绝而不是猜测。

**Impact:** 显式或隐式 clone target 都按命令局部 cwd 解析，并遵循当前 allowed roots、blocked roots、blocked paths 和系统 hard boundary；local repository source、模板与引用目录按 read path intent 评估。外部 transport、动态位置、未建模选项和无法确定基准的形态继续 hard-boundary；该决策不增加 network policy 轴。

**Rejected:** 通用「末个位置参数 = 写目标」规则（会把 `sed -e`、`commit -m` 和 `push` ref 误归因）；把 `--separate-git-dir` 值归为普通目标（会隐藏未建模的 git-dir 写入）；在 Policy 或 host 层重新解析 clone 参数（违反 Canonical 单次解释边界）。

**Out of Scope:** 完整 git-clone 方言、pathspec、远程 transport 授权和执行期 hook；已解析的 local repository source、模板和引用路径事实属于当前 bounded seam，其他 clone 运行期副作用仍不单独建模。

## D-053: Policy 数据零注入（LLM 上下文隔离）

**Reversal surface:** engineering

**Decision:** `Policy Snapshot`、`policy.yaml`、内置或自定义 preset、活动 preset 名称及策略状态永不进入 LLM 上下文：不注入 context 消息、不修改 tool schema/description、不进 system prompt。活动 preset（`/policy` 切换）不改变任何注入内容；恒定注入文本只依赖静态文件（`principles.md`）。模型感知策略的唯一渠道是失败路径的静态 bounded Guidance；Guidance 只给用户可执行的纠正路径（例如请求用户更新 Policy），不描述策略内部、配置值或不存在的绕过通道。

**Rules:**

- 模型在任何配置、任何活动 preset 下都观察不到 Policy 数据文本（注入消息 / tool description / system prompt 三面皆无）。
- 恒定注入面保持唯一：`src/bootstrap/index.ts` 是唯一 `context` 注入点；access-gate 只经失败路径产出静态 Guidance。
- Guidance 与实现一致：普通 Policy deny 不提供逐次批准（allow-once 仅存在于 ask 流），因此 Guidance 不出现 "approve the operation" 类描述；硬边界、未知和不可证明形态不因 Guidance 而放宽。
- 未来任何让模型可见活动 preset、Policy 规则或 Policy 状态的需求，必须经本决策生命周期（superseded/retired）显式变更。

**Why:** Policy 是 Gate 的确定性计算输入而非提示词素材。把策略翻译进上下文会诱导模型自行判断权限、绕过 Gate 消费结果，带来行为漂移、token 税与安全稀释；失败路径 Guidance 是唯一必要的模型可见策略相关面，只提供拒绝后的可行行动路径（D-023）。

**Impact:** 恒定注入内容与活动 preset 无关；模型在会话中不可见 preset 名称、策略值与状态；新增注入面即违反本决策，由校验脚本与测试承载防回归。

**Rejected:** 策略感知的动态注入裁剪（注入内容随 `/policy` 切换变化——行为随运行时状态漂移）；在恒定层注入活动 preset（token 税 + 诱导模型自行判定规则）；把 Policy 描述文本放进 tool description（恒定成本扩大）。

**Out of Scope:** 失败路径 block reason（静态 Guidance + category-only subject）本身属于模型可见面，不在“数据注入”之列；面向人类用户的 `/policy` TUI、状态查询和显式切换不属 LLM 上下文。

## D-054: 提示词面引用可靠性边界（指针化与内嵌的取舍判据）

**Reversal surface:** engineering

**Decision:** 提示词面内容的引用化（`per principles.md X` 形态）按总则加四问取舍。总则：引用是共享规则的低频定位手段，不是技能默认形态——操作步骤与守卫留在动作点。四问：① 引用目标须在同一读取/注入面且短而高显著（同文档相邻、guidance 当下渲染）；跨文件引用（技能→其他技能子文件）解析时付一次真实读取，仅在单源收益超过读取成本时使用；长细节段（Next-ID slots、迁移表）接受方必须内嵌。② 执行必需或 do-not-X 守卫（审批否决、分类守卫、防误删）必须留在动作点内嵌。③ 解析失败须可测或有情境兜底（校验器、违反即重现）；否则失败静默。④ 删除量不足指针固定成本（措辞+解析）的短句不指针化。"存量引用存在"不构成映射可靠、常规或正确的证据——本判据约束新改动，存量按同一标准再审计、不自动回退。操作化判据以 AGENTS.md「提示词内容改动约定 — 引用与内嵌取舍」为准。

**Why:** 引用解析依赖模型对注入面文本的回忆——回忆随 session 老化衰减、compaction 重注入不等于可回忆，且无反馈环验证解析成功：失败时模型带着残缺回忆静默继续执行；引用式（citation-style）措辞还降低指令权重。D-030 已按"不可操作化"先例拒斥 token 基线测量——本判据是结构层可靠性标准，正属 D-030 承认的可操作化方向（结构层行为测试）。

**Impact:** 既有提示词面参考引用不受本判据回溯、不自动回退；后续编辑按四问执行；重试禁令撤出恒定注入面后唯一载体是运行时 guidance——删该句即删禁令，由 gate 防回归断言锁定；本判据不引入 token 度量，与 D-030 的 dismiss 面无冲突。

**Rejected:** 纯指针化（机制全改引用——回忆失败即静默错误，无反馈环）；全内嵌复刻（多源漂移，D-030 已证）；以 token 量作为取舍判据（"量"不可操作化的 dismiss 先例）；并入 D-030 原地修订（违反 D-047：已记录决策只经生命周期变更）。

**Out of Scope:** 对存量引用的逐条回退裁定（另立审计）；guidance 文本精简（D-030 dismissed）；用户项目注入面（principles.md）不承载本维护纪律；逐条引用解析的运行时测量。

## D-059: Greenfield Access Decision Pipeline 与原子替换

**Reversal surface:** engineering

**Decision:** Access Decision Pipeline 采用 Greenfield Semantic Rebuild，只以 Pi `tool_call` 外部合同、Linux/Bash 行为、明确的政策语义和安全不变量为设计输入。当前实现独立位于 `src/access-gate/access-decision/`，物理分为 `core/`、`adapters/`、`runtime/`：core 负责 Pi host/config 无关的语义与决策域，Linux pathname lookup 属于该语义域的外部合同；adapters 单向转换外部合同，runtime 是唯一 Composition Root，依赖只能由 runtime 指向 adapters、再指向 core。旧实现、旧配置合同和旧测试不属于当前依赖边界，也不作为正确性 oracle。

生产入口只在完整的新信任链通过验证后切换，并保持单一生产路径；不提供旧 API、旧模块路径、旧 config/Profile schema 或兼容双轨。runtime 只实现 tool-call 决策所需的最小 policy state 与 project/staging 生命周期；其他外围能力独立处理。

**Why:** 从旧模块迁移、复用或逐字段重建会把旧场景假设、隐藏缺陷和错误边界带入新架构；以旧结果做 parity 又会把未知正确性的行为升级为规格。Greenfield 边界迫使语义依据、预算和信任关系重新证明；原子生产切换避免新旧 parser/compiler/kernel/config 交叉组成第三套未验证系统。

**Impact:** 新场景必须在当前 core/adapters/runtime public seam 上依据外部行为和安全不变量建立；新增程序、策略或 host 能力不得通过旧决策链接入。Static Flow、Explanation Replay、Runtime Audit 和 Runtime Content Flow 不属于当前 pipeline。

**Rejected:**

- **复用现有 lexer/parser/semantics/path，再更换 plan：** 直接继承旧语义边界和缺陷，无法证明新 canonical 是独立事实来源。
- **复制旧实现后改名重构：** 物理路径变化不改变设计来源，仍是旧架构的隐式兼容层。
- **新旧 parity shadow：** 旧输出不是权威 oracle；一致只能证明复刻，不能证明语义正确。
- **逐层生产切换：** 新旧 compiler/kernel/config 的混搭没有整体信任证明。

**Out of Scope:** 旧 API、旧模块路径、旧 config/Profile schema、旧测试 helper 和旧 integration；Static Flow、Explanation Replay、Runtime Audit、Runtime Content Flow；不参与当前决策信任链的 Footer、Session 和子代理内部行为。

## D-060: 受保护 Canonical 制品、窄 Admission 投影与有界求值

**Reversal surface:** engineering

**Decision:** 新 Canonical Semantic Core 对一个请求执行一次政策无关、资源有界的解释，发行单一 opaque `CanonicalCompilation`。编译制品内部持有经过 seal 边界一次结构验证和 deep-freeze 的事实与资源证明，但不公开可枚举 ledger DTO；消费边界只做 O(1) issuance/authenticity 检查。Composition Root 从同一制品按需取得两种互不反向依赖的最小产物：sealed `Admission Plan` 与纯数据 `Display View`。不增加 `CanonicalCompilationHandle` 包装、中间 `CanonicalAdmissionView`、公共全域 operation、冗余 sequence、无消费者的 identity/ref/fingerprint/uncertainty 列表或每个视图的重复深复制。

`Admission Plan` 只包含新 Policy Kernel 决策所需的有序 command/path 事实、每个路径候选在 canonical 时点解析得到的 bounded `ResolvedPath` 值、必要 source anchor 和置信语义；不携带原始 Shell、配置格式、展示坐标、project/staging root（若解析后无消费者）、未来 Flow 数据或自然语言原因。Kernel 只消费 `Admission Plan` 与不可变 `Policy Snapshot`，不得重新调用 Shell parser、Direct schema analyzer 或 path resolver。`Display View` 只保存 renderer 需要的 bounded 展示数据，并只在实际需要展示时投影，不承载旧归约坐标或 Explanation Replay 状态。

Canonical reject 使用本域封闭 code、source anchor 与资源分类；renderer 在外层映射为静态文案，不把 `GateEvidence` 或自然语言 subject 反向注入 compiler。硬资源上限由代码内固定常量拥有，外部只能收紧不能放宽；输入、token、分支候选、operation、归约输出和展示分配都必须在物化前以 checked/saturating arithmetic 计数。预算单位必须显式统一，不能把 JavaScript `.length` 的 code unit 与 byte 混称。

`Policy Snapshot` 是与配置格式无关的深度不可变值，由新授权语义决定字段；Canonical core 不读取它，Policy Kernel 不读取配置 loader。配置 adapter、policy state 与 host adapter 只在 Composition Root 外围单向提供输入。

**Why:** 一个受保护制品保证事实只解释一次；窄 Admission/Display 投影防止授权、展示和未来领域形成公共大 DTO。去掉 handle/identity/中间 view 可避免隐藏 WeakMap 状态和浅包装；路径在 canonical 阶段解析可阻断 Kernel 二次解释；物化前预算与单次 seal 保持正常路径 O(input + emitted facts) 的有界成本。

**Impact:**

- 旧架构中“compiler 不接政策、受保护制品只在消费边界廉价验真”的安全意图由 D-060 重新定义；当前不复用旧类型、代码、WeakSet 布局或 verifier。
- Display View 与 Admission 的职责分离由本条直接定义；不承载旧归约坐标、`ExpansionData` 或 Explanation Replay 状态。
- Admission 不保存 `operations/commands/paths` 三份平行数组；若 Kernel 需要分类优先级，在同一有序集合上无分配扫描。
- Composition Root 对每个请求只调用每种投影至多一次；该 orchestration 由 service 测试证明，不要求 projector 自带隐藏缓存。已冻结事实可通过窄类型共享，不做无收益 defensive-copy 链。

**Rejected:**

- **公开 Canonical ledger DTO：** 调用方可遍历并耦合所有领域事实。
- **只有 identity 的 handle + 模块级 ledger WeakMap：** 引入隐藏语义存储、模糊生命周期和 GC 行为。
- **Admission 暴露 CanonicalOperation：** 把未来 flow/display 字段泄漏进 Kernel，名为窄投影实为宽类型。
- **Kernel 再解析路径：** 破坏一次解释并让文件系统观察时点漂移。
- **每个投影独立全量复制和验证：** 增加 O(N) 分配而不增加可达防线。

**Out of Scope:** Static Flow/OperationRef、Explanation Ticket/Replay、provenance fingerprint、Runtime Audit Event、跨请求缓存或持久化 canonical 制品；这些实体只有在真实消费者和独立生命周期出现后重新设计。

## D-063: Direct edit 独立策略与显式本地配置

**Reversal surface:** user-boundary

**Decision:** Direct `edit` 是独立的路径策略轴。外部 flat policy 与自定义 preset 必须使用完整的 `paths` 与 `commands` 定义，其中 `paths.edit` 必须显式声明 `allow`、`ask` 或 `deny`；内置 preset 提供完整的固定语义。Edit 输入只做结构与资源边界校验，不在 Gate 内重演宿主的文本匹配语义。

**Why:** edit 与 write 是不同的 Pi 工具合同，独立策略轴可以分别表达完整写入和局部编辑的授权意图。外部 policy 使用完整字段定义，内置 preset 使用固定语义。Gate 只负责受管请求的结构、路径和策略决策，文本替换的唯一匹配与不重叠语义由宿主工具执行。

**Impact:** flat policy 与自定义 preset 的完整定义都必须显式包含 `edit`；内置 preset 的 edit 语义由固定定义提供。README 示例与 policy 文档展示 write/edit 分离。

**Rejected:**

- **Gate 重复实现 oldText 的唯一匹配和区间不重叠：** 这会把宿主编辑器执行语义复制到纯决策层，增加漂移而不扩大路径安全边界。

**Out of Scope:** edit 的实际文件读取、文本替换、唯一匹配和重叠处理；这些仍由 Pi host 的 edit 工具负责。

## D-066: Access Gate 显式禁用与仅技能运行模式

**Reversal surface:** user-boundary

**Decision:** 用户可在新的 `policy.yaml` 中以唯一配置 `accessGate: disabled` 显式关闭 AKeel Access Gate。该模式不建立或执行 Operation Admission 决策，所有 Pi `tool_call` 直接 passthrough；`src/bootstrap/` 注入的原则与已声明 `skills/` 继续可用。缺失该字段时 Gate 默认启用；禁用形式不得与 `paths`、`commands` 或 `presets` 混用。未知值、损坏配置和其他不可用外置文件不进入禁用模式，而按 D-069 整体忽略并使用内置 `review` 基线，Gate 继续启用。

**Why:** 某些工作流需要保留工程原则与按需技能，但不希望 AKeel 对工具调用施加操作准入。将选择放在用户明确管理的全局 `policy.yaml` 中，避免异常阻断时依赖隐式环境变量或临时绕过。

**Impact:** Access Gate 禁用期间，AKeel 不提供 Direct/Shell 操作授权、路径边界或确认门禁；这不是更宽的 Policy Preset，也不绕过后再声称安全边界仍受保护。重新启用需移除 `accessGate: disabled` 并重启会话；本决策不改变 bootstrap、skills、Pi host 自身或其他 extension 的行为。

**Rejected:**

- **只绕过 `policy-denied`：** 无法覆盖异常阻断的其他 Gate 拒绝路径，且会制造未声明的部分安全保证。
- **把禁用状态建成 `unrestricted` preset：** 会与 Policy Preset 的授权语义混淆，并破坏 D-069 对硬边界的约束。
- **隐式环境变量或命令开关：** 不属于 policy.yaml 单一配置来源，难以审计且容易误用。

**Out of Scope:** OS sandbox、容器、按工具/路径粒度的开关、会话内热切换、子代理策略传播和替代性安全审计层。

## D-067: Canonical 程序语义族、可执行文件身份与委托执行边界

**Reversal surface:** engineering

**Decision:** Canonical Shell 在词法与 flow 解析之后增加独立的 `core/program-semantics/` 语义层。该层只把已扫描的程序调用转换为命令分类、effects、路径事实和 bounded/opaque 路径知识；registry 只负责可执行文件分派，Policy、配置和 host 不进入该层。Git、解释器、Python 工具、uv 与 npm/pnpm/yarn/npx 使用各自的声明表和少量专用分析器；未知程序和未知子命令保持 `unknown + opaque`。`uv run` 明确分类为 `execute`；uv 的版本/帮助调用和 `uv help` 分类为 `inspect`，其他未建模顶层子命令保持 `unknown + opaque`。

已知且路径访问可完整证明、且不依赖仓库或用户配置执行 helper 的命令可进入普通 `inspect`/`modify`/`execute` 策略。会调用或可能调用 external diff、textconv、filters、hooks、receive hooks、merge drivers 或其他 Git helper 的命令固定进入 hard boundary；当前包括 `git status`、`diff`、`log`、`show`、`add`、`commit`、`push`、`fetch`、`pull`、`clone`、`init`、`help`、`grep`、`blame`、`gc`、checkout/switch/restore、merge/rebase/tag/reset/cherry-pick/revert/stash/submodule 等已建模操作。`git config` 也固定进入 hard boundary，避免隐式配置源暴露凭据或改变后续 helper 语义。解释器脚本、`uv run`、`pytest`、`npm/pnpm/yarn` 的脚本或安装执行、`npx` 以及含未建模运行期访问的命令标记 opaque；配置了显式 `allowedRoots`、`blockedRoots` 或 `blockedPaths` 时由 hard boundary 优先拒绝。`develop` 的 command mode 不扩大该边界。程序语义不递归解释委托的子命令或脚本内容。

路径选项和隐式 repository/project scope 必须进入 Canonical 统一解析；Admission 只消费已解析的路径候选，不重新理解程序参数。Git `-C`、`--git-dir` 和 `--work-tree` 已在 Canonical command-local cwd seam 中按 token 顺序解析，后续 repository、基本 path candidate、output 候选和显式项目内 `file://` remote 使用所得 cwd；完整 Git pathspec 语法、HTTPS/SSH 等外部 transport、hosted `file://`、alias、间接 config remote、`clone --separate-git-dir` 及其他尚未形成 Canonical seam 的 location 选项继续 fail-closed。Git repository discovery 只接受真实 `.git` 目录，拒绝 symlink 或 gitfile metadata，避免隐式 Git scope 指向项目外 repository。当前不增加 network policy 轴；Git helper 的执行期隔离不在本条内提供，未形成安全合同的 helper-capable 操作直接 hard-deny。

**Executable identity 与 path-form boundary:**

- Canonical 将 executable token 中包含 `/` 的形式识别为 path-form executable，不解析 PATH，也不因文件系统探测改变命令身份。
- path-form executable 默认归类为 `execute`；已声明的破坏性 basename 或已证明的破坏性子命令仍归类为 `destroy`。非破坏性 path-form 程序统一为 opaque execute，不因 basename 匹配已知程序族获得 `inspect`/`modify` 语义，也不伪造额外 path operand；显式 path boundary 下 opaque path access 继续 hard-deny。
- 裸名 `tsx` 与 Python、Node、Ruby、Perl 属于封闭 interpreter 族：单一 `--version`/`-v`/`--help` 信息调用为 `inspect`，脚本或其他调用为 `execute`，脚本 operand 是 source path；path-form interpreter 统一为 opaque execute。`npx tsx` 保持 `execute + opaque`，即使参数看似信息调用。
- `od` 是封闭的只读检查例外，产生 `inspect + read`，不构成任意工具自动加入内置语义的先例；裸名未知命令保持 `unknown`。

**Why:** Git、包管理器和语言运行时共享“程序自有参数语言 + 子命令分类 + 路径/委托执行”的结构，但把它们塞进 Shell lexer 或 Policy Kernel 会造成职责泄漏和重复解析。`uv run` 可能同步环境、解析或下载依赖并启动任意子进程，因此不能当作普通只读命令；版本/帮助调用与未建模顶层子命令则需要独立分类。统一的 bounded/opaque 事实同时允许安全的高频检查命令恢复可用性，并阻止 `develop` 把脚本、下载和未知行为误当成项目内安全操作。

**Impact:** 生产入口仍只切换新 Canonical pipeline；新增命令族只需增加 core 语义模块和 public seam 测试，不恢复旧 `command-semantics` 依赖。当前覆盖 Git 常用 inspect/modify/destroy 分类（helper-capable 操作与 `config` 固定 hard-boundary）、解释器信息命令、Python 质量工具、uv 的 `run`/信息/未知子命令分类和 npm 族常用分类；Git `-C`、`--git-dir`、`--work-tree` 和项目内显式 `file://` remote 的 command-local location 已覆盖，完整 CLI 方言、完整 Git pathspec 语法、HTTPS/SSH 等外部 transport、hosted `file://`、alias/间接 config remote、`clone --separate-git-dir` 和网络/执行隔离不在本条内。

**Rejected:**

- **把所有程序加入 `shell-words.ts` 的 Set：** 无法表达选项值、子命令和委托执行边界，继续扩大单一解析器。
- **在 adapters/runtime 中解析程序语义：** 违反 core ← adapters ← runtime 依赖方向，并让 Policy/host 重新接触原始命令。
- **递归解析 `uv run`、`npm run`、`npx` 或解释器脚本：** 脚本和依赖内容不是本次 Canonical 输入的可证明静态事实。
- **用 `unknown: allow` 或删除 path boundary 放宽 opaque 命令：** 会把不可证明访问变成未声明的安全保证。
- **直接移植旧 command-semantics adapter：** 违反 D-059 的 Greenfield 边界；旧实现仅提供待重新证明的场景线索。

**Out of Scope:** 网络独立授权、OS sandbox、Git hooks/npm lifecycle 的执行期拦截、完整 Git pathspec、远程/容器工具链方言、命令执行后的审计和旧配置兼容。

## D-068: Policy preset 临时 TUI 选择面板，不恢复常驻 Footer

**Reversal surface:** user-boundary

**Decision:** 在原生 TUI 模式下，`/policy` 无参数打开临时的 Policy Preset 选择面板，供用户选择当前已加载的内置或自定义 preset。内置 `review`、`guided`、`develop` 显示固定用途摘要；自定义 preset 至少显示其合法名称。用户完成选择并确认后，runtime 按既有会话边界原子替换当前不可变 Policy Snapshot；取消、关闭或无效选择不改变当前策略。面板不提供逐项编辑路径、命令权限或创建自定义 preset 的入口。

`/policy <preset>` 显式命令式入口继续保留。非 TUI 模式不尝试打开原生选择面板：`/policy` 不自动切换策略，仍提供当前 preset 的查询或静态使用提示，显式 preset 命令按既有会话切换规则处理。策略名称、策略内容和活动状态不进入模型上下文、tool description 或 system prompt。

**Why:** 临时选择面板比常驻 Footer 更适合会话级策略切换：它保留用户可发现性和选择效率，同时不持续占用 TUI 空间，也不引入旧 Profile Footer 的生命周期和渲染合同。保留显式命令保证无 TUI、自动化和 RPC 客户端可以使用不依赖原生终端的入口。

**Impact:** `/policy` 在原生 TUI 中由无参数查询变为选择入口；需要查看状态时使用 `/policy status` 或等价的查询路径。面板是一次性 human-only UI，不持久显示，不生成 LLM 消息，不通过策略信息改变 Gate 决策。原生 TUI 选择面板依赖 `ctx.mode === "tui"`；`ctx.hasUI` 不能单独代表可用的原生 TUI，因为 RPC 也可能提供 UI 协议但不支持原生 custom panel。

**Rejected:**

- **恢复旧 Profile Footer：** 产生常驻 UI 状态和旧 Profile 展示合同，收益不足以抵消生命周期与提示词隔离边界的耦合。
- **让 `/policy` 面板编辑完整策略：** 会把 preset 选择扩展为新的策略编辑器，扩大配置验证、权限变更和安全证明范围。
- **无 UI 时自动选择或改用更宽 preset：** 无法构成用户显式授权，且会破坏 fail-closed 边界。

**Out of Scope:** 完整 Policy human-only 展示、逐项权限编辑、自定义 preset 创建、旧 Profile alias、常驻 Footer、RPC 客户端自有面板设计和子代理 preset 管理。

## D-069: Policy 文件、内置与自定义 Preset 及独立路径范围

**Reversal surface:** user-boundary

**Decision:** Policy Preset 注册表由三个内置 preset 与 `policy.yaml` 中显式声明的自定义 preset 组成。内置 `review`、`guided`、`develop` 始终可用，其操作模式语义固定，不要求用户重复声明；外部 flat policy 与自定义 preset 统一使用完整的 `paths` 与 `commands` 定义，不继承或覆盖内置 preset。自定义 preset 名称必须通过严格的配置名称校验，不得与内置名称或命令保留字 `status` 冲突；配置加载和 runtime 激活均拒绝非法或冲突名称。

每个 preset 可以拥有独立的 `allowedRoots`、`blockedRoots` 与 `blockedPaths`，不要求不同 preset 之间一致。切换 preset 因此可以同时改变操作模式和 preset-specific path scope；这些字段仍属于 Policy Snapshot 的授权输入。`commands.destroy` 仍接受 `allow`、`ask`、`deny` 作为配置值，但 destroy/delete 的系统硬边界见 D-071；内置 preset 的固定值为 `deny`。系统级 hard boundary 始终优先，任何 preset 都不能解除或放宽它。

自定义 preset 与内置 preset 使用同一 Policy Snapshot、Admission 和 Policy Kernel 合同；`/policy` 的临时原生 TUI 选择面板和 `/policy <preset>` 显式命令均可选择已加载的合法 preset，`/policy status` 保留为状态查询。preset 名称、策略内容和活动状态不进入模型上下文、tool description 或 system prompt。

**Policy file loading:** 用户全局 Policy 输入固定为 `$PI_CODING_AGENT_DIR/akeel/policy.yaml`，默认目录为 `~/.pi/agent`。flat `paths`/`commands` 形式表示使用完整定义的单一静态 policy，不提供 preset registry 或会话切换；具名 `presets` 形式以三个内置 preset 为注册表基础，并可增加合法的完整自定义 preset。外置文件缺失、为空、格式/schema 错误、根非 mapping、必需字段缺失或其他不可用状态时，整体忽略并使用内置 `review` 基线，不部分采用无效内容。唯一合法的 `accessGate: disabled` 形式及其运行时语义由 D-066 规定。

**Why:** 固定的三个内置定位提供稳定、无需配置的默认选择；自定义 preset 支持真实工作流的权限和空间差异，而不迫使用户修改内置语义。允许 preset-specific scope 是显式产品需求；将系统 hard boundary 与 preset scope 分层，避免该灵活性被误解为可解除不可覆盖的安全底线。对不可用外置文件整体回退到内置 `review`，可以避免配置损坏产生半配置状态或关闭 Gate。

**Impact:** policy adapter 将内置定义与合法的用户 preset 合并为一个注册表，并为每个 preset 发行独立 snapshot；flat policy 与自定义 preset 使用相同的完整 `paths`/`commands` schema，schema 接受合法自定义名称和独立 scope，同时保留现有三项内置声明的兼容形式。Policy loader 对外置文件采用整体有效性判定，文件无效时不产生部分 Policy Snapshot，也不激活 `accessGate: disabled`。`destroy: allow` 对自定义 preset 是合法配置值，但不产生授权；实际 destroy/delete 操作仍由 D-071 的 hard boundary 拒绝。选择面板选项不再是固定三项，命令保留字 `status` 不进入注册表。新增或变更 preset 名称时必须保持配置校验、TUI 选项、显式命令和状态查询的一致性。

**Rejected:**

- **要求所有 preset 共享路径范围：** 不满足自定义策略表达独立访问空间的需求，并把操作模式与空间 scope 不必要地绑定。
- **允许自定义 preset 覆盖内置 preset：** 会改变稳定内置语义并制造配置来源歧义。
- **让 `status` 成为合法 preset：** 与 `/policy status` 状态命令冲突，且会使命令解析依赖额外消歧。
- **通过 preset 解除系统 hard boundary：** 会把可配置策略误作 OS 级隔离或安全底线，违反 fail-closed 边界。
- **把无效外置文件部分解析为可用 preset：** 会产生半配置状态和不可审计的策略组合；无效文件必须整体回退到内置 `review`。
- **把 Policy 文件缺失视为 Gate 缺失：** 配置损坏不应关闭安全门禁，缺失或不可用文件仍保持 Gate 启用。

**Out of Scope:** 多个 Policy 文件、项目级配置和子代理策略；preset 继承、逐项策略编辑、旧 Profile 命令与 alias、常驻 Footer、子代理 preset 传播、网络独立授权和 OS sandbox。

## D-070: 宿主凭据工件的系统硬边界与分类规则

**Reversal surface:** user-boundary

**Decision:** 将宿主拥有、用于保存实时凭据的凭据工件归入系统 hard boundary；当前确认范围包括 pi host 的 `auth.json` 及其备份或变体，但模板类工件不属于该类别。当前没有可验证的 Pi Host 工件角色 metadata seam，因此以受信任 agent 目录下的路径身份契约识别类别，不读取文件内容、不做值级猜测。对 Canonical 阶段明确识别为该类别的受管路径操作 `read`、`write`、`edit`、`list`、`search` 一律 hard deny，任何 preset 都不得放宽；模板类工件继续由 preset/path policy 管理。保护范围是路径证据驱动的尽力覆盖，不递归扩展到父目录后代，也不为无法发行具体路径的 opaque Shell access 增加凭据专用拒绝。

`accessGate: disabled` 时沿用 D-066：AKeel 不提供任何 tool-call、路径或凭据保护保证。该边界不扩展为整棵宿主 agent 目录的拒绝，也不宣称 AKeel 能保护所有可能承载凭据的文件。

**Why:** 实时凭据工件同时承载高敏感性与完整性风险，`ask` 或可切换 preset 都不能构成可靠的保护边界。按工件职责分类可以保护凭据存储，同时保留模板类文件的正常使用场景；把规则置于 preset 之前，也避免用户自定义策略或会话切换解除系统底线。

**Impact:** 系统 hard boundary 优先于 Policy Snapshot、preset-specific path scope 和审批；凭据工件的拒绝不因 `develop` 或自定义 preset 放宽。非凭据工件仍走既有路径策略；Gate 禁用、其他 extension 的直接文件访问、操作系统权限和宿主自身凭据流程不由本决策提供保护。

**Rejected:**

- **由 preset 管理凭据工件：** 可切换或误配的策略不能作为实时凭据的保护边界。
- **整棵宿主 agent 目录硬拒：** 会误伤模板、配置和会话等合法场景，超出最小边界。
- **按文件内容猜测是否为凭据：** 值级嗅探不稳定且会把授权边界依赖不可靠的内容推断；分类应基于工件职责与所有权。

**Out of Scope:** 其他文件中的偶然凭据、宿主外部扩展的直接访问、Gate 禁用后的安全保证，以及模板类工件的具体 preset 配置。

## D-071: Destroy 操作永久硬拒绝

**Reversal surface:** user-boundary

**Decision:** 所有 Canonical 阶段识别为 `destroy` 的命令，以及带有 `delete` effect 的操作，均属于永久系统 hard boundary。Policy Kernel 在路径策略、命令模式和 UI 审批之前拒绝这些操作，结果固定为 `hard-boundary`；它们不会因 `commands.destroy: allow` 或 `ask`、路径范围、preset 切换或用户确认而放行。`policy.yaml` 的 flat policy 和自定义 preset 仍允许 `commands.destroy: allow`、`ask` 或 `deny`，该值保留在 Policy Snapshot 中但不授予 destroy/delete 操作权限；内置 preset 使用 `destroy: deny`。

**Why:** 破坏操作的影响不可逆或难以恢复，现有 Canonical 语义尚未能对递归删除、父目录删除和未知删除选项建立足够完整的边界证明；将其交给 `ask` 会把不完整的静态证明转化为用户审批风险。保留配置值的合法性与既有命令策略 schema 一致，但不把无效的授权期待变成安全承诺。

**Impact:** `rm`、`rmdir -p`、危险 Git 操作、`ruff clean` 及其他 Canonical destroy/delete 事实继续 fail-closed；混合 Shell flow 只要包含此类操作即由 hard boundary 聚合拒绝。运行时不生成 destroy 的 ask，也不因有 UI 而改变结果。自定义 preset 可声明 `destroy: allow`，但该字段不会解除系统边界。

**Rejected:**

- **将有界 destroy 改为每次 ask：** 当前无法完整证明递归、父级删除和未知 option 的影响范围；用户确认不能替代 Canonical 边界证明。
- **拒绝 `destroy: allow` 配置：** 会把配置 schema 的合法值与实际授权边界混为一谈；保留该值可表达配置输入，但运行时仍固定 hard deny。
- **由用户确认覆盖 hard boundary：** 审批不是系统安全边界，不能放宽永久拒绝。

**Out of Scope:** 新增破坏操作支持、递归删除边界的扩大、运行时文件恢复或删除审计；只有建立独立、完整的 Canonical 证明并经新的 user-boundary Decision，才重新评估 destroy。

## D-072: Session 启动 cwd 作为访问根与 `$HOME` 的受限 tilde 语义

**Reversal surface:** user-boundary

**Decision:** AKeel 将 Pi 会话创建时的 `cwd` 固定为本次会话的 Access Root，不要求该目录位于 Git root 内。Access Root 是 AKeel 的访问边界语义，不等同于 Pi 原生的“项目根”概念。会话内的 Shell `cd` 只改变命令局部 cwd，不改变 Access Root；新建或切换到以不同 cwd 建立的 Pi session 时，才重新建立 cwd-bound runtime state。

AKeel 不向下扫描 Access Root 以猜测或选择子 Git 仓库，也不因当前 cwd 位于某个仓库子目录而自动向上扩大到 Git root。多仓库父目录和独立文档目录均可作为 Access Root；`allowedRoots`、`blockedRoots`、`blockedPaths` 及系统 hard boundary 仍优先于该上下文边界。

`~` 的 Shell 展开唯一使用 Pi 进程在会话初始化时的 `$HOME` 值。`$HOME` 缺失、非法或无法作为绝对 home 路径使用时，需要 home-relative 解析的请求 fail-closed；不引入 Pi 原生未提供的额外 `home` 字段，也不使用隐式替代来源。

Tilde expansion 仅适用于受支持 Shell word 中位于开头、未引用、未转义的裸 `~` 或 `~/` 前缀。引号或反斜杠保护的 `~`、非开头的 `~`、`~user`、变量/动态展开和未建模上下文不得映射为 home；复杂或无法证明的形态 fail-closed。Direct 工具的 path 字段不继承 Shell 的 tilde expansion 语义。Canonical 阶段发行一次解析事实，后续不对原始文本做字符串替换。

**Why:** Pi 的原生工作边界是 session `cwd`；Pi 不要求 cwd 属于 Git 仓库，Git root 主要参与部分资源发现，而不是通用工具授权前置条件。使用启动 cwd 能支持多仓库工作区、独立文档目录和未初始化的项目，同时避免向下选择不确定的子仓库。使用会话启动时的 `$HOME` 与 Linux Shell 的环境语义一致；将 tilde expansion 限制在可证明的词法形式，可避免把普通文件名中的 `~` 错当成 home-relative 路径。

**Impact:** 运行时不再以 Git-root 作为 Access Root 前置，也不从多仓库父目录向下选择仓库；session-start cwd 固定承载访问范围。Pi tool-call context 的 `home` 不参与 Shell tilde authority，缺少 `$HOME` 只影响需要 home-relative 展开的请求，不自动使所有其他 Access Decision 失效。未建模的 Shell 形态继续 fail-closed。

**Rejected:**

- **Git root 作为通用 Access Root 前置：** 这不是 Pi 的原生 cwd 合同，会排除独立文档目录和多仓库父目录；Git root 也不是 AKeel 的 OS-level security boundary。
- **从多仓库父目录向下自动选择子仓库：** 当前请求无法可靠表达用户意图，选择错误会把策略锚定到错误项目。
- **找不到 Git root 时任意回退或自动扩大范围：** 会把缺失的项目边界静默变成未声明的访问范围。
- **通过 Pi 额外 `home` 字段或其他环境来源替代 `$HOME`：** 当前 Pi 原生 cwd/session 合同未提供该必要字段；多来源会使 Shell 与 AKeel 的 tilde 语义分叉。
- **按字符串前缀替换所有 `~`：** 会把引号、转义和普通文件名中的字面 `~` 错误解释为 home。

**Out of Scope:** 用户显式项目选择器、多个 Access Root、会话内动态切换 Access Root、完整 Bash tilde/参数展开兼容、`~user` 展开、Direct path 的 home shorthand、实际文件操作的 TOCTOU 消除，以及 `$HOME` 本身作为安全隔离边界。

## D-073: Skill 作者职责与恒定不变量归属

**Reversal surface:** engineering

**Decision:** `principles.md` 承载跨任务恒定注入的不变量；`skills/disciplines/` 承载可复用工程方法，`skills/workflows/` 承载端到端编排。目录只表达作者职责，不创造 Pi 运行时加载层；运行时发现服从 package manifest，workflow 调用模型由 D-078 定义。Disciplines 使用名词短语，Workflows 使用动词-名词，复合名称使用 kebab-case，避免非必要缩写和人物名。

通用“完成声明前必须取得 fresh evidence”继续只由 `principles.md §6` 定义。独立 `evidence-first` skill 退役，空 `foundations/` 分发根删除；bug/feature 验证、Requirements 核对和提交前检查等具体操作守卫留在 `fix-validation`、`implement-work`、`change-preflight` 等对应动作点，不复制通用规则正文。

**Why:** Pi 对 `package.json.pi.skills` 声明的目录统一递归发现，目录名不定义加载时机；把 `foundations/` 描述成常驻层会混淆作者组织与宿主调用合同。`evidence-first` 的通用门禁已经恒定注入，其独立 skill 激活由模型判断、不是可靠 enforcement，并与恒定规则形成双源；只有动作特有的验证步骤具备独立保留价值。

**Impact:** 当前 skill 分发只有 `disciplines/` 与 `workflows/` 两个作者职责根；README、AGENTS、CONTEXT、validator 和 traceability 不再把 `evidence-first` 或 Foundations 描述为现存能力。被替代的旧目录组织结论从寄存器剪除，历史由 Git 保留。

**Rejected:**

- **把 `evidence-first` 移入 Disciplines:** 改目录不消除与恒定原则的职责重复。
- **保留为隐藏或手动强化 skill:** 没有证据证明二次加载提高遵守度，且兼容壳会继续维护重复文本和孤立职责根。
- **直接删除全部独特示例语义:** 测试、构建、人工回归、Requirements 核对和提交前检查属于具体动作守卫，应由对应职责自足承载。

**Out of Scope:**

- **完成声明的运行时强制:** 自然语言回复没有现成的确定性 enforcement seam。Revisit when Pi 提供可验证的 response gate。
- **模型遵守度 A/B 基准:** 当前没有固定模型、数据集和稳定评分合同。Revisit when 项目采纳可重复的 prompt 行为评测体系。
- **`/skill:evidence-first` 兼容别名:** 当前没有已记录的下游兼容承诺，别名会延续双源。Revisit when 出现真实下游依赖证据。
- **其他 skill 内容与调用治理:** 不属于本次职责去重。Revisit when 用户启动完整 skill-governance 重构。

## D-074: 单一 grill-docs 分阶段工作流

**Reversal surface:** engineering

**Decision:** 只分发用户手动调用的 `grill-docs`，不再分发独立 `grill-plan`。`grill-docs` 依次执行四段行为：逐项解决未决问题；由用户确认一份候选方案作为核对输入；针对项目事实及适用的外部合同逐条核对候选方案；把核对后的结论更新到现有 Task、CONTEXT 和 Decision 容器。每次只问一个问题，并同时给出基于当前证据的推荐答案。候选方案确认后，只有带具体证据且会改变该方案的矛盾可以请求用户重新打开相关问题；用户不批准重新打开时停止核对，不把矛盾方案记录为定稿。

外部文档核对按实际依赖触发：候选方案涉及外部库、API 或框架时列出这些依赖并读取其实际文档；没有外部合同时，只核对项目记录、源码、测试及可运行实验。核对结果使用 `confirmed`、`corrected` 和 `uncertain` 三类；`uncertain` 必须对应明确的验证实验或未决项。问题处理、候选确认和事实核对期间不实施候选方案，也不提前写入长期结论。

**Why:** 当前使用场景都要求事实依据和最终落档；原 `grill-docs` 已调用 `grill-plan` 的全部提问流程，独立 `grill-plan` 只增加第二个触发面和跨 skill 依赖。把提问规则放入唯一工作流后，每次调用会使用全部内容；通过候选确认和证据矛盾回退条件，可以区分提出问题与核对事实，而不依赖抽象阶段描述。

**Impact:** `grill-plan` 目录删除；其一次一问、问题与推荐答案分隔、事实自行查询和用户持有决定权的独特语义迁入 `grill-docs`。`grill-docs` 保持 `disable-model-invocation: true`，自然语言中的 grill 词不再触发独立 workflow；`assess-modularity` 只向用户建议手动运行 `grill-docs`。

**Rejected:** 保留 `grill-plan` 作为无文档变体（没有实际使用场景，且项目事实仍需核对）；在问题处理期间同步写 Decision（候选尚未确认，会产生反复改写）；以固定措辞测试代替行为验证（只能锁文本，不能证明模型按流程执行）。

**Out of Scope:** Herdr、worktree、独立会话、子代理路由和其他委托机制；这些执行面边界由 D-075/D-076 独立规定，本条不重复定义。

## D-075: Task Owner 上下文准入、Herdr 同步委托与 Worktree 隔离

**Reversal surface:** user-boundary

**Decision:** 委托同时受权威所有权、上下文准入、执行面路由与 checkout 隔离约束。**Task Owner Session** 是对一个 Task 持有用户原始意图、Requirements、已采纳范围/架构/政策裁决、finding disposition、最终验收、发布与 Project Record 更新权的唯一会话；同一 Task 或 Decision 同时只有一个 Owner。用户可把互斥、可独立验收的长期工作明确授权给新的 Task Owner Session；若新会话仍需把结果交回既有 Owner 裁决，它在语义上仍是 delegated child，而不是第二个 Owner。

Herdr child 可在已定约束内处理开放问题并形成 verified candidate。当前 child 委托只使用同步 fork-join：Owner 预定结果 artifact，等待 child settle 后按路径拉取，不要求 child 通过 prompt 把完成状态或结果推回 Owner。Artifact 承载 verified candidate 及理解、审计、质疑或继续结果所必需的上下文：影响结论的推理与被拒方案、引用证据、变更、验证、未决问题和残余风险；搜索轨迹、完整日志、重复失败、未影响结论的假设、工具时间线和中间草稿留在隔离会话或 artifact。可得的 child session 引用只作按需 forensic 追踪，不自动载入 Owner 上下文。

**Routing:** 用户未指定执行面时，按以下封闭顺序决定：

1. 不产生隔离过程上下文的工作由当前 Task Owner 直接完成；用户确认、Project Record 更新、finding 裁决和最终验收留在该 Owner。
2. repo-wide/跨模块探索、多来源比较、多假设调查、重复实验、完整日志分析、独立审查、交互式方案讨论、跨项目工作和替代 CLI 等会产生隔离过程上下文、且结果仍需当前 Owner 裁决的工作，通过 Herdr child 同步执行并在预定 artifact 上 join。
3. 长期工作只有在用户明确授予互斥范围和独立验收权时才进入新的 Task Owner Session；多个 Owner 不共同修改同一 Task/Decision 或 checkout，跨 Task 结果由明确的 integration owner 集成。没有该授权时，不把后台运行或新开会话解释为新的 Owner。

任何 delegated agent 的有效工具只要包含 `write`、`edit` 或可修改文件的 Shell，就必须位于独立 Git worktree；新增的并行 Task Owner 具备这些能力时，也必须拥有不与其他 Owner 共享的 checkout。按能力而非“不要编辑”的提示词承诺分类。真正只读的 delegated agent 可共享 checkout；测试若可能修改源码或生成受跟踪文件，按写能力任务处理。Herdr 只管理自己创建的 worktree，同一 worktree 只有一个生命周期 owner，不跨执行面清理、合并或复用。Child 不删除自身 pane/workspace/worktree；存活的 Owner 负责检查、导入、合并和经明确批准的清理。

具体的 grilling、packet、Agent 生命周期和 verified candidate 交接步骤由 [`skills/workflows/grill-docs/SKILL.md`](../skills/workflows/grill-docs/SKILL.md) 承载。

**Why:** “主 Agent 技术上能完成”不能判断原始探索是否值得污染长期 Owner 上下文；独立 Agent 的价值包括上下文隔离，而不只包括并发。同步 artifact pull 避免 child 自由文本 callback 形成重复 user-role 消息、额外上下文和交付竞态；长期独立工作直接拥有自己的 Owner，则无需把全过程回灌旧会话。唯一 Owner 与互斥范围防止多个会话对 Requirements、验收和权威记录形成 split-brain。Herdr 已提供可见、可接管的 Agent、pane、worktree 和 focus 合同；按有效写能力强制 worktree 可避免真实工具权限污染共享 checkout。

**Impact:** `principles.md` 恒定注入 Task Owner、同步委托路由和 worktree 不变量；`grill-docs` 通过预定 verified candidate 完成交互式讨论和结果拉取，不发送完成 prompt。AKeel 不把 Herdr 声明为 runtime dependency，也不新增自动编排运行时。独立 Task Owner Session 是用户授权与记录所有权边界，不是新的 Herdr primitive。

**Rejected:** 以“可能更快/多一个视角/适合时”触发委托（不可判定且扩大调用）；当前 Owner 可完成即一律直接执行（忽略上下文污染）；同步 child 向 Owner prompt 完成状态或结果（重复交付、增加上下文且不是处理 ACK）；把长任务默认变成异步 child（增加 mailbox、恢复和去重状态而无当前需求）；把同一 Task 交给多个 Owner（权威 split-brain）；child literal self-delete（会使 join 失去正常 settle 结果，且 child 无法确认自身清理成功）；所有隔离工作无条件创建 worktree（应按有效写能力与 tracked side effect 判断）；worktree 内“100% 自由/零审批”（隔离不产生授权）；由 Grill Agent 直接写权威记录（跨 worktree 制造第二 writer 与未经 Owner 导入的权威变更）。

**Out of Scope:**

- **异步 child 与无人值守 orchestration:** mailbox、receipt、跨重启恢复、重复通知去重、自动续跑、聚合和自动回收由 C-031 保持为未采纳候选；出现真实长周期从属任务后再评估。
- **渐进式多文件结果协议与确定性 Herdr extension:** 当前单一 verified candidate 没有可复现的体积或协议偏差，不新增 TypeScript 自动化层；出现不可接受的上下文负载或可复现执行偏差时再评估。
- **自动 worktree 回收:** 当前不把结果保存和破坏边界委托给无人值守清理；只有独立证明 clean/non-force 生命周期合同并获得用户批准后再评估。
- **Access Gate 父子 Policy Snapshot 传播:** 当前只定义 workflow 与 checkout 边界，不改变准入实现。Revisit when 独立任务验证 child-runtime policy seam。
- **模型行为基准:** 当前没有固定模型与 consuming-agent 评测 harness，不以字符串存在测试冒充行为证明。Revisit when 项目采纳可重复的 prompt 行为评测。

## D-076: Herdr 统一委托执行面

**Reversal surface:** user-boundary

**Decision:** AKeel 将所有需要隔离过程上下文、且结果返回既有 Task Owner 裁决的委托统一交给 Herdr；Task Owner Session 保留用户意图、Requirements、finding disposition、最终验收、发布和 Project Record 更新。

**Why:** 当前工作需要可见的 Agent、pane、worktree、状态和人工裁决，Herdr 已直接覆盖这些目标。统一执行面可以保持上下文、交接和生命周期合同的一致性。

**Impact:** `src/bootstrap/principles.md`、README、CONTEXT、skills 和委托相关 Decision 统一描述 Herdr 执行面；当前委托通过 Herdr 完成 Agent 启动、状态观察、worktree 管理和同步 artifact 交接。用户授权的独立 Task Owner Session 仍可运行在 Herdr 中，但不因使用 Herdr 而成为 delegated child。

**Rejected:** 维护第二套委托执行面（当前没有真实需求证明其额外编排能力值得承担独立的上下文、结果和生命周期合同）。

**Out of Scope:**

- **无人值守自动多代理流水线**：当前由 C-031 独立记录，只有真实长周期后台需求出现后才重新评估。
- **子代理父子策略传播**：当前没有可验证的宿主策略 seam，由 C-024 保持为未采纳候选。

## D-077: Decision 寄存器的轻量 hygiene 校验

**Reversal surface:** engineering

**Decision:** `scripts/validate-docs.ts` 对 AKeel 自仓的 `docs/decisions.md` 执行轻量 Decision hygiene 校验。扫描器只解释 fenced code 外的合法 Decision 标题和第 1 列顶层粗体字段：要求 `Reversal surface` → `Decision` → 可选规格子节 → `Why`，并按序接受可选 `Impact`、`Rejected`、`Out of Scope`。条目存在即表示 active，不保存 `Status` 或 `Origin`；已定义的顶层过程字段、任务引用和明确迁移历史标记被拒绝。普通正文日期以及 fenced code、列表、引用块中的粗体标签不进入结构判断。该检查只报告并以非零状态失败，不自动改写记录。

**Why:** 生命周期、批准面、顶层字段位置、Markdown fence 和已定义过程标签是可确定的结构合同，适合在提交前自动阻断；任意正文的日期、新颖过程措辞和其他 Markdown 嵌套内容无法由轻量扫描可靠分类，保留人工审计可避免误伤长期结论。

**Impact:** `npm test` 会通过 `validate-docs` 执行该检查；Decision 的语义压缩、`Impact`/`Out of Scope` 必要性、取舍判断和正文过程历史清理仍由维护者负责。该校验与已有容器槽位和 D-xxx 引用检查共用自仓脚本。

**Rejected:**

- **完整自然语言过程历史分类器：** 误报风险和维护成本超过轻量静态检查的收益。
- **封闭枚举全部规格子节：** Decision 的领域规格需要开放词汇，只约束其位于 `Decision` 与 `Why` 之间。
- **把 fenced code、列表和引用块当作记录字段：** 会把示例、替代方案和外部引用误判为元数据。
- **自动修复 Decision：** 可能删除限定词、替代方案或安全边界，记录只能由维护者审阅后修改。
- **把自仓检查直接作为用户项目 validator：** 自仓容器和引用合同并不构成用户项目的通用执行合同；用户项目检查保持 `doc-sync` 的显式、只读、定点流程。

**Out of Scope:**

- **用户项目 Project Record 自动校验或 CI 接入：** 保持为 C-032，直到出现多个真实项目或明确的确定性复用需求。
- **完整 Decision 语义审查：** 由人工 code/doc review 完成，不把文本启发式当作语义证明。

## D-078: Workflows 触发模型（手动调用与即时介入）

**Reversal surface:** engineering

**Decision:** workflows 按所需介入方式选择触发模型。需要用户明确意图的 workflow 设置 `disable-model-invocation: true`，并以 `Use /skill:<name>` 作为 description 的调用指引；需要模型即时响应任务状态的 workflow 使用 trigger-first description。当前手动 workflows 包括 assess-modularity、brainstorm-design、grill-docs、handoff-session 和 implement-work；survey-context 响应任务启动与状态恢复。文件恢复遵循 `principles.md §10`，宿主会话导航遵循 Pi 自身合同。

**Why:** 显式调用为方案处理、实施和交接提供清晰的用户意图；模型调用适合由当前任务状态直接判定的即时介入。沿用 Pi 的 skill command 与 discovery 合同，可以保持触发描述、实际入口和用户预期一致。

**Impact:** `validate-skills.ts` 校验手动 workflow 的调用指引和模型可调用 workflow 的 trigger-first description。skill 作者职责与目录边界由 D-073 定义，具体 workflow 持有各自的执行合同。

**Out of Scope:** `handoff-session` 的交接内容和安全边界由该 workflow 自身承载。

## D-079: 模块设计方法与模块化评估工作流分界

**Reversal surface:** engineering

**Decision:** 保持模块设计方法与仓库级模块化评估为两个 skill，不合并。`module-design` 是可由模型按需加载的 discipline，只处理已知模块或接口问题，以 depth、leverage、locality、testability 和 implementation cost 评估具体设计，并使用 test seam、Deletion Test 和 Design Twice 组织判断；`assess-modularity` 是用户手动调用的 workflow，只扫描指定仓库或子系统中的 shallow module、weak seam 与 scattered responsibility，生成临时、证据化的 findings 和高层 remediation directions，不实施或采纳变更。

`assess-modularity` 的临时报告使用 `finding`，用户选择后才形成供 `grill-docs` 处理的 proposal；只有按 Project Record 生命周期写入 `docs/candidates.md` 的 `C-xxx` 才称为 Candidate Record。评估动作所需的观察问题留在 workflow 动作点，不把 `module-design` 全文作为隐式运行时依赖；具体接口方案才使用 `module-design`。

`module-design` 的方法语义以边界判断为起点：适配器数量是抽取决策的证据而非固定阈值；公共接口是首选测试面，但本质上依赖集成的行为可以使用更高层接缝；无效状态在可行时应不可表示，其余失败必须由明确的失败契约处理。这些取舍属于该 discipline 的统一方法，不是对原有规则逐条追加例外。

**Why:** 模块设计方法集中于模块和接口，而非数据所有权、部署拓扑、可靠性或安全等广义架构；模块化评估工作流只发现并报告结构摩擦，不直接改善架构。按真实对象和产物命名，使已知问题设计与未知问题发现各自全量消费，同时保留 discipline 与手动 workflow 的触发边界。

**Impact:** `module-design` 使用 discipline 的名词短语命名，`assess-modularity` 使用 workflow 的动词—名词命名并保持 `disable-model-invocation: true`。引用、调用指引、临时报告名称和第三方概念映射统一使用新名称。

**Rejected:**

- **合并为单一 architecture skill：** 局部接口设计与仓库扫描具有不同输入、产物和调用模型，合并会形成按模式跳过正文的浅接口。
- **保留 `codebase-design`：** 名称把实际的模块与接口方法扩大为整个 codebase 的设计。
- **保留 `improve-architecture`：** 名称暗示实施结果，但工作流只交付评估报告和后续 proposal。
- **使用 `review-architecture`：** 当前方法只评估模块化结构，广义 architecture 会错误承诺数据、运行时、部署、可靠性和安全维度。
- **保留旧名兼容别名：** 当前没有已记录的下游依赖证据，别名会延续双重触发面；出现真实兼容需求时再评估。

**Out of Scope:**

- **广义架构评估：** 当前没有覆盖数据所有权、运行时拓扑、部署、可靠性、安全和容量的完整方法。Revisit when 用户采纳这些维度及其证据和输出合同。

## D-080: 当前变更预检、独立代码审查与显式深度清理分界

**Reversal surface:** engineering

**Decision:** 提交前准备、独立 finding 生成与深度维护保持为三个职责，不合并。`change-preflight` 是模型可按需加载的 discipline，收敛宽泛的提交前自审：它只处理当前 Task 的活动变更，自动移除该变更产生的临时文件、调试残留与 orphan，核对 scope、文档、最终验证和适用的专项门禁，并交付 review-ready 或 blocked 状态；它不扫描或修复历史代码卫生与架构问题。

`code-review` 保持独立、只读的 discipline。它把 branch commits、staged、unstaged 与范围内 untracked 内容固定为同一不可变 Review Surface，分别执行 Engineering 与 Requirements 审查；reviewer 只交付证据化 findings，Task Owner 持有 finding disposition，审查期间或修复后 Review Surface 变化会使旧结果失效。

`code-cleanup` 只在用户明确指定范围或已批准 maintenance scope 时执行行为保持型深度维护；阶段结束本身不授予扫描或修改历史代码的权限。它以绿色基线开始，无法证明外部 export 不可达时只报告不删除，测试合并保留场景诊断与追踪语义，公共接口或模块职责变化转入模块设计流程。清理完成后重新同步文档、验证并进入 preflight/review；commit 由外层 workflow 或 Task Owner 决定。

**Why:** 三者分别拥有 current-change preparation、independent finding generation 和 approved-scope mutation 三种不同输入、权限与产物。提交前自动清理是必要守卫，但其授权只来自当前已批准变更；把仓库级 dead-code、重复、测试与模块调整同时自动化会扩大 scope 并使既有验证和审查失效。将自动卫生收敛进 preflight，可保留低成本提交门禁而不新增第四个 skill；固定 Review Surface 与只读 reviewer 则防止审查对象漂移和审查/修复角色混合。

**Impact:** `change-preflight` 承载独特的提交前守卫；通用 fresh-evidence 规则仍只由 `principles.md §6` 定义，动作特有核对留在 preflight。`implement-work` 在最终 commit 前编排文档同步、验证、适用的专项审查、preflight 与独立 code review，任何后续修改重新进入该闭环。技能来源映射、调用引用和 validator 合同统一使用现行名称。

**Rejected:**

- **合并为 `review-work`：** 会混合作者侧修改、独立只读审查和显式深度维护，并形成互斥模式与不完整正文消费。
- **保留 `code-audit` 名称：** 名称暗示宽泛或独立审计，不能准确表达当前变更限定的作者侧 readiness gate。
- **提交前自动运行完整 `code-cleanup`：** 当前 Task 不授权修改历史 dead code、既有测试或模块边界，且广泛清理会扩大并重置 Review Surface。
- **直接删除提交前独立守卫：** `implement-work` 与独立提交准备都需要低成本 readiness gate；把所有卫生问题留给 Herdr reviewer 会浪费独立审查上下文。
- **新增 `change-cleanup`：** 当前变更卫生是 preflight 的必要阶段，不产生独立触发或交付物，拆出会增加浅 skill。
- **把 `code-cleanup` 改为手动 workflow：** 明确自然语言请求或已批准 maintenance scope 已提供可判定触发；当前没有必须增加 `/skill:` 调用摩擦的证据。

**Out of Scope:**

- **模型行为 A/B 基准：** 当前没有固定模型与 consuming-agent harness。Revisit when 项目采纳可重复的 prompt 行为评测。
- **确定性 commit hook：** Pi 当前没有由本任务采用的 commit lifecycle enforcement seam。Revisit when 宿主提供可测试 hook，或真实工作流证明 skill 编排不足。

## D-081: 复现信号与系统化根因调试分界

**Reversal surface:** engineering

**Decision:** 调试能力由两个模型可按需加载的 discipline 承载。`bug-reproduction` 面向缺少可靠反馈信号的 bug、failure 与 performance regression，构造并缩小忠实于用户症状的确定性或可测概率性复现，交付 `reliable`、`probabilistic` 或 `blocked` Reproduction Result 并返回调用方。`systematic-debugging` 面向技术问题的根因调查，在可用信号上追踪故障机制，以能够区分替代解释的实验支持根因结论，并只从 `Confirmed` 根因和用户授权进入 TDD，实施一个连贯的因果修复后进入 fix validation。

Bug Task 的创建和更新直接遵循 `principles.md` Project Record 生命周期：用户已承诺调查时建立或复用 `Kind: bug` Task，格式继续由恒定注入面单源定义。仅记录请求由该生命周期直接处理；`systematic-debugging` 消费现有 Task 或在承诺成立时建立最小 Task，`bug-reproduction` 发行供调用方消费的复现结果。

Reproduction Result 以症状判定的忠实度、特异性、迭代成本、最小条件和实测复现率描述反馈质量。概率性复现只要能在明确预算内支持区分性实验即可成为可用信号；固定运行次数或失败率不作为统一完成阈值。临时 harness 与 instrumentation 保持可识别，适合公共 seam 的复现才成为永久 regression-test 候选。

**Why:** 复现工程和根因调试具有不同输入与交付物：前者把难以观察的症状转成实验 seam，后者利用该 seam 证明因果机制。Project Record 生命周期承载 Bug intake，系统化调试方法承载证据收集和候选假设，使格式、调查步骤和路由各有唯一所有者。两项能力按结果命名后，每次调用都能全量消费其方法，并由原调用方持有后续流程。

**Impact:** `survey-context` 将已承诺的 bug 调查或修复导向 `systematic-debugging`，缺少可用信号时先使用 `bug-reproduction`；仅记录请求直接更新 Bug Task。调试正文保留动作点所需的根因与授权门禁，TDD、fix validation、change preflight 和模块设计继续拥有各自流程。

**Rejected:**

- **单一 debugging skill：** 可靠复现问题不会消费难复现构造方法，而只构造反馈信号的任务也不需要根因和实施阶段，合并会形成条件模式。
- **独立 bug intake skill：** 其产物是既有 Project Record，所需技术调查已属于系统化调试；额外入口会复制格式和证据流程。

## D-082: 单一实施规划能力与 Plan Slice

**Reversal surface:** engineering

**Decision:** `implementation-planning` 是模型按需加载的实施规划 discipline。它在 Requirements 与必要 Design 已批准、工作需要多步实施时创建或复用对应 Task Record，将规划输入组织为 implementation-ready Plan，并保持 Task 为 `draft`；`implement-work` 持有实施启动、状态推进、验证闭环与 commit。

Plan 使用 `Plan Slice` 作为内部执行单元。每个 Slice 承载目标、Requirements 覆盖、前置依赖、验收标准、文件与公共接缝、验证命令和有序实施步骤；Slice 可独立验证，并共享所属 Task 的 T-ID、生命周期与 Task Owner。依赖只记录 `Depends on`，反向关系按需推导；切分依据是可观察行为、测试闭环和稳定接口，跨层不确定性需要尽早证明时使用 tracer slice。

规划开始时，当前对话或唯一匹配的 Task Record 提供已批准输入；缺少 Task Record 时，明确的用户承诺允许在同一流程建立记录。需求或设计仍需形成时使用 `brainstorm-design`，仅需记录已承诺工作时直接遵循 `principles.md` Project Record 生命周期。

**Why:** 实施规划只有一个稳定产物和下游：可由 `implement-work` 消费的 Task Plan。统一的 Plan 结构集中承载 Requirements 覆盖、垂直切片、依赖、验收与验证，并为内部工作单元提供明确术语，使名称、触发条件、内容与交付物保持一致。

**Impact:** `survey-context` 将明确的多步实施需求导向 `implementation-planning`；`brainstorm-design` 在设计批准后按任务复杂度衔接规划或实施。规划规则、来源映射和技能校验统一使用该能力名称。

## D-083: 待创建
