# Pi Keel Decisions

本文集中记录 pi-keel 的长期架构、工程和安全决策。每条只保留当前结论、理由、必要替代方案和影响；被完整吸收（`superseded`）或主动退役（`retired`）的条目从寄存器剪除，历史由 Git 保留（规则见 [D-028](#d-028-统一-project-record-模型)）。

**条目模板**：每条的段落顺序固定为 `Status` → `Decision`（可选规格子节紧随其后，如 `Rules`/`Security invariants`/`Guidance mapping`/`Enforcement scope`/`格式`/`延伸`）→ `Why` → `Impact` → `Rejected` → `Out of Scope`；无内容的段落省略，不留空标题。可选 `Reversal surface` 元数据行紧跟 `Status`（值 `user-boundary`/`engineering`，缺省 `user-boundary`；语义见 principles.md Project Records — Record Lifecycle）。

## D-002: 统一 Access Gate 与用户态边界

**Status:** active

**Decision:** 使用统一的 `src/access-gate/access-decision/` 扩展集中处理 Canonical、Admission、Policy Snapshot、hard boundary 和 host approval，不提供或假定 OS-level isolation。

**Why:** 多个安全扩展会产生拦截顺序竞争、重复审批、分散配置和难以关联的审计信息。Node.js 路径检查没有 kernel-level enforcement；将 pi-keel 称为 sandbox 会造成安全承诺与真实边界不一致。

**Impact:** pi-keel 自行维护统一扩展，不自动继承社区扩展的独立更新。

**Out of Scope:** OS sandbox、容器、VM、seccomp、Landlock、network namespace 和其他 kernel-level isolation。

## D-003: bigpowers 技能精选

**Status:** active

**Decision:** 只引入 bigpowers 中具有独特价值、且没有更合适替代品的技能。

**Why:** 整体引入会带入平台专用、重复、内部元工具和项目特定能力，增加加载与维护成本。

**Impact:** 不提供自动生命周期编排，由 bootstrap、技能匹配和 `survey-context` 协同完成。

## D-005: 技能组织

**Status:** active

**Decision:** 技能按加载方式分为 `foundations/`、`disciplines/` 和 `workflows/`；命名约定：Foundations 用简短描述名，Disciplines 用名词短语，Workflows 用动词-名词，复合名称用 kebab-case，避免非必要缩写和人物名。

**Why:** 目录名直接表达技能何时生效，比按领域或生命周期阶段组织更符合实际加载机制；名称帮助模型和维护者推断用途、加载机制和技能职责。

## D-009: 项目分发与文档边界

**Status:** active

**Decision:** `README.md` 是唯一用户使用入口；移除平行的 `USAGE.md`、不必要的 npm 元数据和用户 `AGENTS.md` 模板。长期架构、安全、溯源和 Project Record 文档按职责保留在 `docs/`。本地约束：`AGENTS.md` 只定义 pi-keel 自身的维护入口和仓库约定，不复制注入原则、Task 生命周期或当前架构；`docs/traceability.md` 只记录外部来源、采用方式、当前文件映射和许可证义务——当前架构、安全承诺与残余风险、长期取舍分别由 `CONTEXT.md`（含 Negative Space）和本寄存器维护。

**Why:** 每个文件都应有明确的维护对象和用户价值；重复的使用、架构、安全和工作流说明会漂移，pi-keel 也不应越过用户项目工程约定文件的所有权边界；溯源文件只有在来源、revision、采用范围和许可证证据可核查时才具有合规价值，运行时行为和融合取舍放入其中会把它变成第二份架构与决策文档。

**Impact:** 修改运行时行为不再自动更新 `docs/traceability.md`，只有第三方来源映射或许可证义务变化时才更新；新增或同步外部内容必须记录固定的上游 commit 或 release。

**Rejected:** 不保留按当前模块罗列“来源 + 融合决策”的架构摘要，也不使用主观原创占比作为合规证据。

**Out of Scope:** 恢复初始引入的精确上游 revision：本地提交 `2f4a3ef` 未保存这些 revision，Git 历史无法可靠还原，仅在有可验证历史快照或导入元数据时补录。

## D-018: Shell IR 与 Access Gate

**Status:** active

**Decision:** **当前基线（T-069 完成前）：** 采用 `shell-parse/`、`command-semantics/`、`gate/` 三层架构，以不可执行的 Shell IR 传递结构化结果。Shell 文件修改与其他路径操作使用同一套 hard boundary、canonical path policy 和 Profile gate。T-069 只继承下列安全不变量作为待独立证明的合同，不继承三层目录、IR/AST/intent 类型、算法、支持子集或测试预期；新语义前端按 D-059 从外部 Bash/Direct 合同重新设计。

**Security invariants:**

- blocked intent hard deny，不能由 Profile 或 `Allow once` 覆盖。
- 只有所有语法节点和 effect 都被安全解释时才可 allow。
- wrapper 必须保留底层命令 intent。
- modify 命令的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- 无法确定分支 cwd 时不得 allow。
- Canonical path resolution retains lexical and symlink-target traversal prefixes; blocked components remain hard boundaries, and recursive path operations reject blocked descendants.
- Unknown or otherwise unbounded Shell path access is hard-denied whenever an explicit path boundary is configured; without such a boundary, the command-class policy still applies.
- 一个 tool call 的所有 ask intent 聚合为一次审批。
- 复杂形态可拒绝：无法精确建模的形态编译期拒绝并引导拆解（heredoc/hereString 已如此；`unsupported-redirection` + split-supported-commands guidance 让 AI 拆成可识别的简单形态或 Direct 工具）——“尽量识别，但不是必要项”；识别不足时拒绝优先于猜测建模（fail-closed），不再引入无法建模的中间状态，拒绝路径必须携带拆解 guidance。**例外：可静态归约的 `for` 循环建模（T-062 归约前端）**——`verifyLoopScope` strict 守卫（字面词表 + 双引号区内未修饰 `$f` 绑定、常量拼接；非循环变量引用/裸 `$f`/变异内建/早期退出/循环变量重赋值/loop 级 `|` 与 `&`/动态或 `~user` 词表/redirection 目标含 `$f` 或未静态/heredoc → 拒）→ `reduceToFlat` 以原始 raw 切片合成扁平文本（值经转义；loop 级截断类重定向首条 `>` 后续 `>>`；重定向 fd 前缀与引号原样；重 lex/parse 自校验失败 → fail-closed）→ 重喂既有管线（compileFlat）；归约构造等价即“判定==展开”——每条展开命令 `span` 为唯一归约坐标（对账与 kernel 证据共用）；原始坐标只存于 plan `expansion` 段数据（命令级），由渲染层映射（D-056），ask 附 `expanded form`。其余复合结构与不可静态求值的展开一律 `compound-command`（含嵌套 for、C 风格 `for ((…))`、body 含 if/while）。tilde 词级处理为单一来源（`expandTildeArg`：cd/重定向/归约词表；quoted 不展开），路径层 string-mode tilde 保持不变（既有文档化边界，扩张偏 deny、安全向无害）。
- `<>`（O_RDWR 读写打开）按 write 侧建模（`<>`→stdout、`2<>`→stderr）：write 决策允许即覆盖读面（write⇒read 一致性），只建模 read 会漏写侧；自定义矛盾 profile 下 `<>` 的读侧行为不保证（配置责任）。Rejected：`readwrite` 独立 kind（+ read+write 双 intent / 编译期拒绝）——为“read-deny + write-allow”矛盾配置付建模成本职责外，且 verifier/coverage 对账需配套改动；write 建模已语义完整，拒绝引入不必要的可用性损失；profile 验证层强制 write⇒read（矛盾配置报错）与“不负责自定义 profile”裁定矛盾。

**Enforcement scope:**

只对 Pi `tool_call` 中的 `bash` 和 `TOOL_SCHEMAS` 已知 Direct surface 执行策略；未知 Direct surface passthrough。不承诺全局 enforcement：`user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 及后续 handler 对 input 的修改不在范围内。

**Why:** Direct 写保护无法覆盖重定向、`tee`、`cp`、`mv` 等 Shell 写入入口，secret 扫描也不承担访问控制职责；统一 IR 和语义层集中提取命令类别、路径 intent 与 effect，避免分类和策略漂移。fail-closed 优先：识别不了就拒绝，由 AI 拆解（agent 可重试），而不是猜测语义（猜测 = 潜在漏判）。

**Impact:** 新形态处理顺序：识别 → 建模（write⇒read 下语义完整）→ 拒绝拆解；新增 adapter/重定向形态时按此顺序评估。

## D-022: Compiler-Kernel 分层与请求真实性

**Status:** active

**Decision:** **当前基线（T-069 完成前）：** enforcement pipeline 为 compiler → compiler-entry sealing boundary/verifier → Policy Kernel → host adapter。Compiler 只生成经过 brand 和 coverage 证明的 `CompleteAccessPlan` 或带 category 的 typed outcome，不接 Profile 或审批。Policy Kernel 是同步纯函数，只消费 compiler-entry 发行、verifier 验证的 plan 和 Profile，验证 authenticity（WeakSet issuance）后执行封闭 policy evaluation。

**Security invariants:**

- plan 只能由 `compiler-entry.ts` 私有 sealing boundary 发行：defensive-copy、deep-freeze 后加入进程级私有 WeakSet，不跨调用缓存或持久化；`isCompleteAccessPlan()` 是唯一公开完整性 predicate，`access-plan-verifier.ts` 只做无副作用的完整性与 budget proof。
- Kernel 不接收原始 Shell 或未验证 plan；compiler outcome 将 dynamic/unsafe/opaque/threat 分为 typed unsupported 或 security category，renderer 不通过 DecisionCode 反推 failure kind。
- coverage 逐项对应 command/redirection span 与 operation、顶层 cwd 与 path candidates 去重集合；effect 只以 `command.effects` 承载（verifier 隐含证明覆盖），并独立复核 `maxCommands`/`maxOperations`/`maxCwdCandidates`/`maxInputLength`。
- Effect policy axis 是封闭映射：`read/search/write/delete/permissionChange/cwdChange → path`，`execute/network → shell`；Shell 命令按 `commandClass` 决策，effects 只在 Direct-origin 操作被消费（shell-only effect 硬拒）。

**当前结构（T-069 完成前）：**

- `gate/` 物理分两层 + 共享根：`gate/plan/`（编译器与验证：compiler-entry、shell/direct-tool compiler、preflight、access-plan-verifier 等）、`gate/decision/`（evaluate、evaluate-request、decision-builder、render-decision）、根留（`host`/`decision-types`/`decision-code-catalog`——被两层共用，避免循环依赖）。`gate/index.ts` 公共表面不变。
- 当前 gate 内部 import 边界：plan 组不引用 decision 组；decision 组单向引用 plan 组；共享根被两层引用且不依赖子组。该物理布局随 D-059/T-069 的旧 plan 删除而退役；目标布局、投影和独立 sealing 以 D-059/D-060 为准。
- Rejected：gate 强行分 compiler/kernel/render 三组——共享根被三组共用造成跨组循环，物理边界与依赖图不符（虚假分层）；删除既有 index 改全深层引用——与“目录边界单一入口”方向相反，且 path/gate/config 的 index 均被真实消费。上述取舍只约束当前布局，不阻止 T-069 以新领域边界重建 public index。

**Why:** 分层保证分析证据（request）和授权结果（GateDecision）不混淆；compiler 可独立证明 fail-closed 边界，Kernel 可独立证明 monotonic policy。

## D-023: 决策渲染与知情同意（静态 Guidance + literal form）

**Status:** active

**Decision:** **当前基线（T-069 完成前）：** 渲染层覆盖 deny 与 ask 两侧，均只消费静态产物、不生成可执行内容。T-069 从零重建 renderer 与决策类型，不复用 catalog、code、函数或数值预算；但“deny 不生成可执行建议、不携用户派生值，ask 向人类提供完整知情信息，展示有硬上限”的安全意图继续作为独立证明合同（D-059/D-060）：

- **deny 侧（静态 Guidance）**：拒绝结果的 guidance 只能引用源码内置的静态 `GuidanceId` catalog，不能拼接可执行 Shell、原始 glob 或用户输入；renderer 不调用替代 tool、不生成可执行命令。`renderDecision()` 处理 Policy Kernel 的 `GateDecision`，`renderCompilationFailure()` 处理 typed compiler outcome；两者都执行长度预算（subject ≤ 1,024，reason ≤ 2,048），且 deny 侧 subject 不携带用户派生值（类别化，见下）。
- **ask 侧（知情同意）**：`evaluate.ts` 把原始命令文本顺着 `adaptDecision` 传给 renderer；`renderDecision` 的 ask 分支对 `kind === "command"` 证据按 span 从原文切片，追加 `— literal form: <完整命令>`（仅长度截断，不脱敏）。原始路径只存在于 ask 侧（人类同意面）与命令 literal form。
- **类别化（deny 侧不携带用户派生值）**：path 证据在 deny 侧只渲染操作类型（`read path denied`/`write path denied`），模型侧（block reason/编译失败）不重复命令、不携带用户派生值——命令由模型提出，原文已是 toolCall 参数。`redactSubject` 全套移除，类别化取代掩码脱敏。语义层不变：xargs、`sh -c` 等运行期构造命令族保持 `unknown`→ask，不做建模。

**Guidance mapping:**

| DecisionCode | GuidanceId |
|---|---|
| `dynamic-shell` | `batch-inspection-tools` |
| `opaque-command` | `literal-command-or-direct-tool` |
| `unsafe-syntax` | `split-supported-commands` |
| `unsupported-redirection` | `split-supported-commands` |
| `uncertain-cwd` | `literal-command-or-direct-tool` |
| `shell-policy-denied` | `profile-restriction` |
| `path-denied` | `profile-restriction` |
| `unknown-tool` | `check-tool-input` |
| `invalid-tool-input` | `check-tool-input` |
| `resource-limit` | `split-supported-commands` |
| 其他 deny code | 无（避免诱导绕过）|

**Why:** guidance 不能成为间接 code injection 通道：blocked path/threat 不提供绕过建议；deny 侧 subject 只含分类信息，不携带用户派生值（命令由模型提出，原文已是 toolCall 参数，类别化）；文本必须给出可验证判据，且不得建议模型无法自行完成的动作——profile 类 deny 只能请求用户更新或批准。unknown 命令没有可提取的路径/效果语义，人类批准是唯一针对该命令本身的防线——审批框只显示 `unknown command: xargs` 时人类无从判断要批准什么，同意层变成橡皮图章；字面文本是门禁对该命令唯一诚实可知的完整信息：span 是 lexer/parser 算出的真实字符偏移（verifier 校验过对应），渲染是展示事实而非推断；语义建模把运行期 stdin 数据驱动的命令构造猜成静态 class，是伪精确（D-024/D-025 诚实分类）。覆盖是结构性的：只依赖 "command 证据 + span" 这对每条命令都存在的产物，所有 unknown 及 profile 下 ask 的 modeled 命令经同一漏斗出口受益。审批框（TUI 覆盖层，不落 session）脱敏保护不了任何未暴露信息，反而削弱人类否决所需的完整信息；ask 侧保留完整 path 证据（Direct 工具无 literal form，路径是人类同意的唯一信息）。

**Impact:** 审批提示从 `unknown command: xargs` 变为 `unknown command — literal form: xargs sed -i 's/…'`（subject 只保留类别，literal form 由渲染器纯追加）；`sh -c 'rm -rf /'` 显示完整负载，批准从盲批变为知情可完整否决。deny 侧 path 证据为 `read path denied`/`write path denied`，固定诊断词原样展示；`redactSubject`/`SENSITIVE_PREFIXES`/边界启发式全套删除。不改 plan 形状、`access-plan-verifier`、profile/path policy。

**Rejected:**

- **给 xargs 建模**：xargs 与 `sh -c`、`bash -c` 同属运行期构造命令族，静态 class/路径是猜测；单独建模双标（`xargs rm -rf /` 硬拒而 `sh -c 'rm -rf /'` 盲批说不通），keel-build 会放行错误 class。
- **把 raw command 存入 plan / block reason 附加 literal form**：plan 形状变更需同步 verifier 与 coverage proof，收益与渲染层传参相同；block reason 重复命令浪费上下文并双倍持久化，且模型已持有自己的参数。
- **审批展示脱敏**：命令原文已是 toolCall 参数，审批框（不落 session）脱敏是无效剧场——不减少暴露，却让人否决时看不到完整命令（如嵌入的 token 值）。
- **掩码脱敏（redactSubject 前缀表）**：掩码是“嵌入原始值再打码”的补丁，需前缀表维护与边界启发式，且误伤固定诊断词（`dynamic shell token` → `*** *** ***`）；类别化让 deny 侧根本不产生用户派生值，掩码从设计上消失。

**Out of Scope:**

- 逐命令拆分审批：批准粒度仍是 tool-call 级，本决策只让审批看到全文。
- xargs 的 stdin 目标静态提取：运行期数据，静态不可知（D-031 同款边界）。
- 其他 unknown 命令的语义扩充：属 D-024 用户 `config.yaml`。

## D-024: 命令覆盖层

**Status:** active

**Decision:** **当前基线（T-069 完成前）：** 不将内置 adapter 的分类规则迁移到声明式文件。用户全局旧 `config.yaml` 的 `commands` 段曾是 Shell 命令扩展入口，支持别名映射、新命令定义和分类微调；Direct 工具继续由源码 `TOOL_SCHEMAS` 管理。T-069 不兼容该配置段、解析顺序、adapter 表或 `TOOL_SCHEMAS`；新命令扩展面只有在 Greenfield semantic core 的真实需求出现后重新设计，不能把本条实现当作迁移输入（D-059）。

**格式：** 完整 schema 与带注释示例见 [README](../README.md#configuration) 的 Command Semantics Overrides 小节。

**解析顺序：** `commands 定义 → aliases 别名解析 → commands（别名目标）→ 内置 adapter → reclassify 覆盖`。

**作用域键：** 覆盖层键为显式作用域匹配——精确键优先（裸名或完整路径字符串，`./` 归一化对称生效），路径形式按最长路径前缀键匹配（键以 `/` 结尾）；**移除隐式 basename 回退**。别名目标可为 `commands` 定义（复用 class/effects/subcommands，reason 用原始调用名），alias 单步解析不链式；`reclassify` 按 basename 对齐 adapter 身份（路径形式下分类微调不静默失效）。

**加载：** 只读取用户全局 `~/.pi/agent/pi-keel/config.yaml` 的 `commands` 段（`PI_CODING_AGENT_DIR` 可改变 agent 目录）；TypeScript adapter 是内置权威来源。本配置不改变 Profile、PathPolicy、Gate、Shell IR 或 Direct/passthrough 行为。

**已知局限：** `reclassify` 的子命令提取（`fullSubcommand`）不跳过取值选项的值（如 `cargo --manifest-path Cargo.toml build` 得子命令 `"Cargo.toml build"`）；实际影响极小，pattern 用 substring 匹配即可规避，实现细节见 `args.ts`。

**Why:** 分类、路径提取和效果推断共享同一趟参数解析，是同一个分析的输出——拆成声明式 YAML 与 TS 双源会产生双源真理；内置分类是权威语义知识，覆盖层只用于用户主动补充本机 Shell 命令语义；Direct 工具需要精确参数 schema、路径字段和 effect 证明，继续通过源码和测试扩展。显式作用域取代隐式 basename 回退，因为回退把工具身份与调用拼写混为一谈——一个裸名键同时覆盖 `./bin/mytool` 与 `./vendor/mytool`，gate 不做 filesystem 解析（D-031），同名不同工具无法区分；想覆盖两种拼写就写两条声明（`mytool: cat` + `"bin/": cat`），声明取代猜测。

**Rejected:** 保留 basename 兜底（冲突休眠而非消除）；realpath/filesystem 消歧（D-031 静态分类不做 filesystem 检查）；alias→alias 链式（语义需沿解析图追多跳才能确定，commands 链式已覆盖“复用语义定义”需求）。

**Out of Scope:** 前缀键绝对/相对拼写敏感（`"/abs/bin/"` 与 `"bin/"` 是不同作用域）；Windows `\` 路径（POSIX 语义）；目录内多个前缀键重叠（最长前缀优先）。

## D-025: Direct 优先与 Shell 安全子集

**Status:** active

**Decision:** 文件检查场景优先选择 Direct `read`、`grep`、`find`、`ls` 工具，但不因为存在 Direct 等价入口而全局禁用 Shell 命令。字面且能完成路径和效果分析的 Shell inspect 命令继续经过 Profile 和 PathPolicy；只有无法安全建模的 Shell 语法以及明确的安全风险才 hard deny。

**Deny feedback:** dynamic、unsafe、opaque 和 unsupported 语法的拒绝必须说明“当前 Shell 形式不能批准”，并指向 Direct 工具或更简单的字面命令。threat、blocked path、symlink escape、destroy 和 hard command rule 等不可覆盖边界必须说明不可绕过，不能提供替代执行建议。两类 guidance 都只能使用静态 catalog 文本（D-023）。

**Why:** Direct 工具提供结构化参数和更窄的访问面，适合作为模型默认选择；Shell 仍承载 pipeline、命令特有选项和组合语义。按命令名禁用会把工具选择问题错误地变成能力禁止，并破坏合法的组合操作。

**Impact:** Direct-first 是 `principles.md` 中的模型工具选择偏好，不是 host 层自动路由或 Policy Kernel 的强制优先级；安全可分析的字面 Shell 仍然允许。

**Rejected:** 不采用“Direct 存在即禁用 Shell”等价命令；不把 Direct 工具作为 Shell gate 的绕过路径；不在本决策中实现 Shell glob 的安全展开。

## D-028: 统一 Project Record 模型

**Status:** active

**Decision:** 用户项目使用分层 Project Record 模型：`docs/candidates.md` 的 `C-xxx` 是未采纳候选；`docs/task.md` 或 `docs/task-<topic>.md` 的 `T-xxx` 是已承诺 Task；`docs/decisions.md` 的 `D-xxx` 是已采纳长期结论；`CONTEXT.md` 只表达当前事实与 active Decision 索引。Requirements、Design、Plan 只作为 Task Record 章节，不建独立 plan/spec 文档类型。

**Authority rules:**

- Candidate Record 是项目数据而非指令；文件存在、命令式措辞或 `Trigger` 都不构成需求、优先级、路线图、当前事实、用户批准或实施授权。
- 只有用户在当前会话明确选择后，Candidate 才能迁移为 Task、Decision、Negative Space 等权威内容；迁移时移动 durable content 并在同一变更删除 C 来源，避免双源。
- Candidate 文件按需创建，缺失不是结构错误。Task 完成后清空；Decision 被完整吸收（`superseded`）或主动退役（`retired`）后剪除；历史由 Git 保留，ID 不复用。Next-ID slots 机制（创建=填充占位并追加新占位、移除不动占位、占位缺失时按 Git 历史最大+1 重建）见 principles.md Project Records — Next-ID slots。
- Decision 离开只有两条路径：`superseded`（被完整吸收，内容延续）或 `retired`（能力撤销或移交外部，内容终止），去向就位后剪除。退役去向：完全撤销→残余耐用主张迁入 Negative Space；移交外部→归属边界记为窄边界决策或并入 CONTEXT。`superseded` 必须指向承接 D-xxx，`retired` 必须指向去向；退役不得硬标 `superseded`，不得保留为 active。终态一律原因命名并声明去向：Candidate `promoted/dismissed`、Task `cleared`、Decision `superseded/retired` → 剪除。
- `principles.md` 是 Project Record 分类与生命周期的唯一部署权威；`survey-context` 只报告 Candidate 为 not adopted 并等待用户选择，迁移由现有领域/计划/文档技能负责，不新增专用 review 技能。
- Candidate Record 不携带日期字段：创建/修订时间戳与历史由 Git 承载，不手工维护派生日期；复审只由 `Trigger`（证据型）与显式 context survey 驱动，日期不作为触发条件。

**Why:** 候选、承诺、长期结论和当前事实权威等级不同：把候选写入 Task/Decision/CONTEXT 会让模型把“可能采用”误解为“应该执行”，自动提醒或专用工作流又把低概率候选升级为持续维护负担；统一协议与类型化容器在保留想法的同时让非采纳状态明确。容器原名 Future Record 命名自时间属性而本质是承诺属性，`future` 引导 roadmap 误读；改名时 future.md 为空、包未发布，故同步 C-xxx 前缀且不提供旧路径兼容读取。

**Impact:** `README.md` 是唯一用户使用入口；通用规则经 principles 注入，技能只实现各自职责。

**Rejected:** 不合并 C/T/D 到单一文件；不每记录独立文件；不采用 Proposed Decision；不新增 review 技能、Record Manager、到期提醒扩展或 slash command；不把 Candidate 当默认 backlog/roadmap；不为 `retired` 增加永久状态枚举或墓碑文件；不把外部移交所有权边界写入 traceability（所有权属决策，许可证归属才属 traceability）；不提供容器级迁移引导（自有格式需模型自动识别并跨格式校验，产生猜测与格式权威混用；识别负担属用户显式声明而非模型自动探测）。

**Out of Scope:**

- **容器级迁移引导机制**（自有决策寄存器、ADR、跟踪器、ideas/backlog 文档的用户项目）：不建专用 skill、不建声明/路由系统、不改 CONTEXT.md 契约。二元边界：标准路径容器由 pi-keel 管理；非标准体系由用户经 `AGENTS.md` 或显式会话指示声明，pi-keel 不自动识别、不写入。迁移非默认，仅用户显式选择时作为一次性 Task 走 Migration Protocol；不可读来源报告缺口并请求中央化进 CONTEXT.md，不盲猜。

## D-030: 提示词体系边界与原则部署（Prompt Surface）

**Status:** active

**Decision:** 提示词按注入面分层：`principles.md`（恒定注入，承载原则与唯一格式/规则来源）、`skills/`（按需加载，每个 skill 单一职责、调用时全量消费）、access-gate guidance（失败路径，保持原样不精简）。通用约束经“原则注入 + Quick Reference”部署。两条约束：① skill 单一职责——一个 skill 只做一件事，触发场景互斥的 skill 保持独立，不合并；② 格式/规则单一来源——只在 `principles.md` 参考节（Quick Reference / Project Records）定义一次，技能只文字引用（如 "per principles.md Project Records — Record Lifecycle"）、不重复定义格式和规则、不内嵌副本。

**Why:** 混合职责的 skill 调用时部分内容永远用不到，浪费 token、稀释注意力并使触发匹配模糊；内嵌格式副本在多个 skill 间漂移（survey-context 与 principles 的 Candidate Record 措辞已出现分歧）。用户项目中可稳定获得的渠道是会话注入内容和按需加载的技能；principles 每 session 恒定注入，格式放此处零额外注入成本，模型无需额外 read 即获权威定义——集中定义可以避免规则分叉和死链。

**Impact:** `principles.md` 是通用参考数据的唯一注入来源；不新建承载格式的 skill。**触发面与替代机制无关（2026-08-25）**：description 是触发前注入面（available_skills，`disable-model-invocation` 只禁调用不禁注入），只描述技能产出与约束，不做与其他机制的替代比较——采用何种交接（全量恢复 vs 蒸馏文档）由用户在对话中决定，替代判断不属技能内容；正文只承载执行（用户触发型 skill 不设 When to Use 段），场景边界权威在决策记录（D-036）。When to Use 段仅保留给需要模型强制/例外判别的技能（TDD、systematic-debugging 反 rationalization）。执行：handoff-session 全文不出现 /resume 替代提示。

**Rejected:**

- **新建 `project-records` skill 承载格式**：指针引用依赖模型主动 read，可能被跳过且单次注入可能多于内嵌副本；格式与 principles 恒定注入面天然同层。
- **Quick Reference 下沉到各对应 skill**：破坏格式/规则单一来源，操作手册分散后失去恒定注入的零成本优势。

**Out of Scope:**

- **guidance 文本精简**：失败路径措辞精度要求最高。**dismiss（C-001，2026-08-08）**：压缩无法满足语义零损失且与总量无关——guidance 已是可执行判据，短句形态被否决，Direct 工具枚举（read/grep/find/ls）是模型无法从自身 tool schema 推导的 gate 支持子集，其余限定子句均为判据或安全祈使；增长哨兵前提随 dismiss 撤销。
- **合并触发场景互斥的 skill**（draft-spec→brainstorm-design、draft-tickets→plan-writing、grill-docs→grill-plan）：全量消费约束的必然推论——配对触发场景互斥，各自全量使用。Revisit when 实测两 skill 触发场景重合。
- **token 基线测量与提示词行为测试**：无法可靠操作化“理解认知”，用户不做额外验证。**dismiss（C-003，2026-08-08）**：遵守度问题实际出现一次——D-036 中 8 个 workflows skill 的 description 与 `disable-model-invocation` 矛盾，属结构矛盾而非 token 消耗；可操作化的测量是结构层行为测试（validate-skills 强制 `Use /skill:<name>` 开头 + 负向自检）；token 基线级测量维持拒绝。

## D-031: 路径可执行与 tsx 解释器归类

**Status:** active

**Decision:** 无 adapter 的路径形式可执行文件（executable 含 `/`：`./x`、`../x`、绝对路径、`scripts/x.sh`）分类为 `execute`；其运行期文件访问无法由静态 Shell 分析证明，配置了显式 path boundary 时按 unbounded path access hard-deny。`tsx` 作为语言运行时纳入 interpreter adapter（与 node/python 同规则：`--version`/`-v`/`--help` → inspect，其余 → execute）；无路径的裸名未知命令保持 `unknown`，配置了显式 path boundary 时同样不得以未建模路径访问放行。内置注册仅限两个封闭范畴：语言运行时（node/python/ruby/perl/tsx）与 POSIX 只读检查工具（od；判据：静态可证仅读输入→写 stdout，无 modify/execute/network/destroy 副作用）；两者都是静态可界属性，不构成“任意工具进内置”的先例。

**Why:** 同一操作（运行本地二进制）此前因拼写不同落入不同 Profile 决策——`npx tsx` 为 execute（plan deny/build allow），`./node_modules/.bin/tsx` 为 unknown（plan ask）——spelling-based 分类偏差。含 `/` 的裸词在 POSIX 下即文件路径，“运行二进制”是事实而非假设；裸名可能是 alias/函数/PATH 工具，静态分析无法确定语义，`unknown`→ask 是诚实分类与同意层。路径形式与未知命令的运行期文件访问仍不可静态证明，因此显式 path boundary 下必须先于 command policy hard-deny；无该边界时，语义扩充权留给 D-024。

**Impact:** 脚本执行三形态（`npx tsx foo.ts`、`./node_modules/.bin/tsx foo.ts`、裸名 `tsx foo.ts`）全为 execute；裸名无 adapter 命令保持 unknown。版本探测有意不对称：`npx tsx --version` 为 execute（npx 语义＝下载+运行包），本地解释器 `tsx --version`/`./node_modules/.bin/tsx --version` 为 inspect（与 node/python 同规则）——门禁建模命令本身而非目标包。路径形式与未知命令不新增具体 path intent；显式 path boundary 下由 unbounded path access hard-deny 兜底，D-024 覆盖层优先级不变。

**Rejected:**

- **仅禁 `./node_modules/.bin/*`**：误伤 npm scripts 全部本地二进制，且不解决绝对路径与项目脚本。
- **为任意裸名工具新增内置 adapter（eslint/prettier/vitest → execute）**：whack-a-mole——execute 类工具运行任意代码，静态不可界，与 D-024（用户覆盖层是语义扩充唯一入口）冲突；封闭范畴例外仅限语言运行时与只读检查工具，不构成先例。
- **保持 unknown、仅改 guidance**：不消除 deny/ask 拼写分歧；**引入新 commandClass** 破坏 D-022 的封闭类集合与 effect axis；**按项目根判定**引入 cwd/path 上下文耦合，绝对路径与 `/usr/local/bin` 分类不一致。

**Out of Scope:**

- Windows `\` 路径（POSIX 语义）。
- 裸名经 PATH 到达的路径（unknown→ask；显式 path boundary 下先 hard-deny）；裸名语义扩充属用户 `config.yaml`（D-024），只读检查封闭范畴（od）除外。
- 路径形式的 alias 匹配：覆盖层键为显式作用域（精确键 + 路径前缀键，D-024），路径形式需显式声明语义。
- PATH 中的命令身份解析与文件是否为可执行的分类探测：静态分类不做 filesystem 检查；Canonical path resolution may follow existing filesystem components for path-policy enforcement。

## D-035: 平台边界收窄为仅 Linux（dismiss C-007）

**Status:** active

**Decision:** 平台支持边界从“仅支持 POSIX”收窄为**仅保证支持 Linux，以 Arch Linux 为基准工具链**：选项解析固定按 Arch Linux 的 GNU 工具链语义处理（GNU coreutils / GNU git / npm 生态常用选项），不提供按平台或发行版检测方言并切换选项表的机制。Windows、macOS、BSD 均不在支持范围，不建模其路径语义与选项方言；其他发行版的工具链版本差异不在保证范围——选项表以 Arch Linux（滚动发布、工具链最新）为准。BSD 工具与 GNU 的选项歧义（`stat -f` 为格式参数、`du -d` 在 BSD 无对应、`df -t` 在 BSD 为 flag）造成的解析差异不承诺消除，BSD 平台上的命令语义不在承诺范围。

**Why:** 候选 C-007（BSD 选项方言检测）评估确认：触发条件（用户项目实际运行于 BSD 工具链）无现实样本，方言检测收益不抵成本（错配/双维护/误报，见 Rejected）；开发与验证环境即 Arch，选项表以该环境 GNU 工具链为准。GNU 语义成为唯一且无条件的解析基线，消除“POSIX 范围内 BSD 行为未定义”的悬空承诺。

**Impact:** CONTEXT.md Negative Space 平台边界条目同步（仅保证 Arch Linux，Windows/macOS/BSD 显式列出）；C-007 dismissed（durable content 迁入本决策与 Negative Space，同一变更删除候选来源）。代码零改动——选项解析本就固定 GNU 语义。D-031/D-024 的“POSIX 语义”指路径分隔符（`/`），与平台支持范围正交。

**Rejected:**

- **按宿主平台检测方言切换选项表（`process.platform`）**：gate 分析宿主 ≠ 命令执行宿主（ssh/容器内 BSD 工具链会错配）；每张选项表需 GNU/BSD 双维护。拒绝。
- **保守双解析取并集**：两方言下都产生额外误报（如 BSD 下 `stat -c %s f` 带出 `%s` 路径意图）；对仅支持 Linux 的承诺无意义。拒绝。
- **宿主检测 + 用户配置覆盖**：为无现实样本的触发场景引入配置面与文档负担。拒绝。

**Out of Scope:**

- Windows `\` 路径与 macOS 路径/选项方言：已在 Negative Space，不因 stat/du/df 同为 BSD 方言而把 macOS 纳入支持。
- 跨宿主场景（ssh、容器）的命令语义方言：静态分类不做执行环境探测（同 D-031 无 filesystem 检查边界）。

## D-036: Workflows 触发模型（手动调用与即时介入）

**Status:** active

**Decision:** workflows 层按“是否需要即时介入”划分触发模型：**用户显式 `/skill` 触发**（`disable-model-invocation: true`，description 以 `Use /skill:<name>` 开头）——brainstorm-design、draft-spec、draft-tickets、grill-docs、implement-work、improve-architecture、rollback-session、handoff-session；**模型可响应触发词**（无禁用）——survey-context（任务启动）、grill-plan（grill 触发词）。validate-skills.ts 强制校验：workflows 层带 `disable-model-invocation` 的 skill，description 必须以 `Use /skill:<name>` 开头，防触发承诺失效回归。

**Why:** 8 个流程型 skill 的 description 原为模型指令式措辞，但 `disable-model-invocation` 使模型永远看不到 description——触发承诺与实际触发机制矛盾，承诺的自动响应永不发生；description 统一改写为用户侧调用指引（`Use /skill:<name> when...`），语义保留、仅改写触发面。rollback-session 保持手动调用：“undo/rollback” 语义有歧义（可能是会话导航 `/tree`、小修改或大规模撤销），且恢复涉及 `git reset --hard`/`checkout --`/`clean` 等破坏性操作，用户显式发起才具备明确撤销意图；触发词 "go back" 删除（与 `/tree` 导航语义重叠）。

**Impact:** handoff-session 保留禁用并重构（见 Out of Scope）；README 的 workflows 概览现并入 “What's Inside” 首条 bullet，不再有独立 “User workflows” 段落；D-005 三目录不变；触发场景互斥的 skill 保持独立（D-030）；校验脚本新增防回归检查。

**Rejected:**

- **移除 rollback-session 的 `disable-model-invocation` 让模型响应 “undo”**：用户说 “undo” 可能是会话导航或小修改，模型自动进入恢复指导会误判与打断；破坏性操作需要用户显式发起。拒绝。
- **为 workflows 触发模型新增专用配置面或路由系统**：`/skill:` 是 pi 宿主既有机制，自建即重复。拒绝。

**Out of Scope:**

- **handoff-session 定位**（跨环境交接 + 本地蒸馏交接）：不可替代价值是向“无法获得、或不想全量重放本会话上下文的接收方”提供状态摘要——跨环境（非 pi、跨机器）读不到 session 文件；本地开新会话且原会话过长时，`/resume` 全量重放不合用、`/compact` 只在同一会话内压缩，蒸馏 handoff 是合法路径。同 pi 且会话可用时仍由 `/resume`/`/tree` 与 `survey-context` 覆盖，摘要不增加保真度。**交接自足判据（2026-08-25）**：文档 + 仓库内容必须足以让接收方完全继续；**提前中止语义（2026-08-26）**——仓库是自足载体，handoff 文档不弥补未落档内容，交接前必须完成未落档决策落档（domain-modeling 入 `docs/decisions.md`）与未决工作；识别到自足缺口（未落档决策/未落代码/上下文依赖）即**中止 handoff 流程**返回本会话解决——不产出半成品交接文档（提前中止而非写残再补），也避免 handoff 处理到中途才发现缺口导致的上下文污染。**不采用“先 /compact 收尾再 handoff 交接”的接力设计（2026-08-26 否决）**：handoff 是一次性完整交接，缺什么先在本会话补齐，不以部分交接/接力方式交付。**交付规则与场景无关**：默认写约定路径 `/tmp/pi-work/handoffs/handoff-<时间戳>.md` 并向用户显示，用户可覆盖为任意路径或拒绝文件，无用户同意不落盘（`/tmp` 根在默认 keel-plan 写面之外，`/tmp/pi-work/**` 全 profile 放行，D-049）——原实现默认写 `$TMPDIR` 是缺陷（重启即清理、跨机器不可达、默认落盘未经用户选择）。未沉淀决策不写入 handoff，先经 domain-modeling 入 `docs/decisions.md` 再引用路径（防双源，D-028）。**Revisit 已满足（2026-08-25：原会话过长→本地新会话为真实高频场景）。**

## D-037: 解析器拥有 wrapper 链（IR 契约：executable 永不承载 wrapper）

**Status:** active

**Decision:** `shell-parse/parser.ts` 在 wrapper-args 状态下识别嵌套 wrapper 并入栈；wrapper 的 positional 参数（`timeout <duration>`）由 parser 消费后保留在 `node.wrapperPositionals` 供 token 级扫描，`node.args` 只含真实命令参数。`ShellCommandNode.executable` 只承载真正要运行的命令，**永不可能是 wrapper**。`normalize.ts` 退化为纯出栈：循环弹出 wrapper 链与 wrapperPositionals，删除 `promotion`/`guessExecutable`/`removeFromArgs`/unwrap slice 逻辑/`MAX_UNWRAP_DEPTH`。

**Why:**

- 旧设计仅在嵌套形态下把 wrapper 放 executable 槽（如 `timeout 5 env python` → executable=env），真实命令沉入 args，normalize 用 promotion + guess 恢复——猜测逻辑脆弱，且产生两个已实证盲点：preflight `download→pipe→interpreter` 硬规则与 `analyzeCd` 只查 raw executable，嵌套 wrapper 形态下前者整体绕过、后者 cwd 追踪错误。
- 修复放在生产者（parser）：不变量“executable = 真实命令”由构造保证，消费方按构造正确，不在消费方复制 wrapper 解包知识（Centralize，D-030 同源）。

**Impact:**

- 解析后 `node.args` 只含真实命令参数；wrapper positional 保留在 `node.wrapperPositionals`，threatScan 的 token 覆盖不变（时长槽由 wrapperPositionals 扫描，防威胁词藏匿）。
- preflight 硬规则对嵌套 wrapper 形态按构造闭合（实证绕过形态由 PASS 变拦截）；`analyzeCd` 正确追踪嵌套 wrapper 下的 cd（fail-closed 方向）。
- 深嵌套统一正确；既有单层 wrapper 行为零变化。

**Rejected:**

- **消费方各自 normalize**：不变量落在每个消费方，未来新增检查会重蹈覆辙，且安全修复不彻底；违反 Centralize。拒绝。
- **保持 parser 不动、仅独立修 preflight**：目标形态免费闭合安全面（零额外 preflight 代码）；独立修复需在 preflight 复制 wrapper 解包知识，产生双源。拒绝。

**Out of Scope:**

- **wrapper 名单位扩充**（仍为 env/command/nohup/exec/timeout）：语义扩充属用户 `config.yaml`（D-024），不内置。
- **非 wrapper 的 option-with-value 建模**（如 `env -S`）：维持 fail-closed 现状。
- **POSIX `>&file` 双流语义修正**：当前建模为 stdout write，路径检查不受影响，无安全差异；只把回退分支显式化，不改语义。

## D-040: 命令语义分类与统一选项引擎

**Status:** active

**Decision:** 取值选项按 `kind` 分类——`file`（值是文件路径，产生 read/write 路径 intent）与 `expression`（值是程序/表达式，消费但不产生 intent），sed `-e`/`--expression`、awk `-e` 为 expression，`-f`/`--file` 为 file；inline 后缀（`sed -i.bak`、`--in-place=.bak`）视为与 `-i` 相同的 conservative write intent，不降级为 opaque。位置参数是输入文件，必须产生路径 intent：sed/awk 出现写选项（-i）时 positional 升级为 write，否则为 read。实现分三项：

1. **GIT_CLASSIFY 表（token 级）**：git.ts 的正则 pattern 改为声明式数据表——首 token 匹配 + 选项调节（升级优先，fail-closed），负前瞻/锚定/`-c` 跳过删除；finder 保留 `-C`/`-c`/`--git-dir` 跳过（token 正确性必需）；调节 flag 支持 `prefix` 匹配（`-o` 命中 `-oFILE`）；多 class 子命令族（stash/bundle）入 `GIT_SUBCOMMAND_PARSERS` 注册表，表与注册表边界由数据形状决定。
2. **统一选项引擎 option-parse**：`parseOptions(args, schema)` 深模块收敛四套选项遍历，schema 制度化值性质分类（`kind: file|expression|flag`，见上）与位置参数性质（`positional: file|program-first|set`），并表达四形态 `forms` 与 `-exec` 终止符 `consumeUntil`；opaque 策略由命令级 `opaqueOnUnknown` 显式声明——text-transform/search/filesystem/read 收紧为 true（未知选项 opaque 硬拒），git 的 `-o` 提取为 false（合法选项静默），并补全高频 flag 建模防误拒。
3. **config-parse 独立**：读写轴 + 配置目标解析是分类策略领域（非值消费遍历），不并入引擎。

**延伸（T-059，D-040 补记）：**

- **opaqueOnUnknown 判据**：未知选项漏判后命令是否可能落入 shellPolicy 允许类（inspect）且具未建模破坏性/写行为——是则 true（fail-closed，第一层防线：fs/read/search/text-transform/date），否则 false（分类是大类 + catch-all 保守兜底，第二层 shellPolicy 兜底：build/package/python-tools/interpreters/git）。判据取代“选项面大小”的经验理由。
- **收敛**：子命令提取统一走 option-parse 输出投影——`semanticsFromRules` 吃 positional 数组（查表首词 = `positional[0]`）；git 经引擎定位子命令，复杂子命令族（config/branch/stash/bundle）入 `GIT_SUBCOMMAND_PARSERS` 注册表，`GIT_CLASSIFY` 表兜底；`fullSubcommand` 保留（reclassify 含选项 raw 契约，D-024）。
- **valueOpts → Opt(expression)**：覆盖层/适配器的取值选项列表提升为 Opt 声明时一律 `kind: "expression"`（只消费不产生 intent，行为零损失）；路径建模（如 `--manifest-path` 实为路径）另立决策，不在收敛中混入。
- **class 调节原语**：Opt 增加 `upgradeTo: "modify"|"destroy"` / `downgradeTo: "inspect"`，引擎输出命中的调节集合并按风险优先（destroy > modify > inspect，fail-closed）给默认裁决，adapter 可覆盖；date `-s/--set`、search/text-transform 写选项升级、python-tools `--check/--fix`、git GIT_CLASSIFY upgrade/downgrade 全部声明化，删除手写 flag 检查。

**Why:** 表达式不是文件，当 read 路径检查会把表达式字符串交给 PathPolicy 产生无意义拦截；此前 positional 被完全忽略导致 PathPolicy 被整体绕过（`sed 's/x/y/' /etc/passwd` 无任何路径检查）。旧实现的缺陷：

- git 子命令分类用「join 成字符串 + 正则」匹配：丢失 token 边界，`-oFILE` 附着形式曾因 `\b` 失配落 inspect（写出路径绕过路径策略的安全漏洞）；「选项取值消费」被多个模块各自实现，边界语义分裂（未知选项有的置 opaque 有的静默，`-name "-delete"` 曾误升级 modify）；值性质（expression vs file）词汇已定但分散在各 walker 内。

**Impact:**

- 行为收紧（有意）：fs/read/search 的未知选项从静默 → opaque 拒（如 `cp -z`、`wc --bogus`、`grep --bogus-flag`）；`-ne` 类 cluster 从 opaque → 正确解析（尾随带值语义）。
- overrides 层（reclassify 的 `fullSubcommand` 字符串匹配）不动（D-024 已知局限，独立表面）。

**Rejected:**

- 不把 `-e` 移除出 schema（导致 opaque 降级）；awk `-i`（gawk include 与 in-place 语义冲突）不纳入，保持保守 write 分类；不因程序/文件位置歧义放弃 positional 检查（宁可误判为额外 read，不漏掉输入文件）。
- 谓词函数 pattern / 声明式迷你语言 / 全解析器化：闭包各写样板且形态趋同诱发合并冲动；fields 化不区分升级/降级/子命令族语义，组合规则模糊；token 解析器太碎。
- config-parse 并入引擎（引擎需输出每 token 分类的复杂结构，收益不抵）。

**Out of Scope:**

- `git -c`/`-C` 之外的 git 全局选项（`--no-pager` 等）token 化；现行为不变。
- overrides 层 reclassify 的字符串 pattern 迁移到 token 级（用户 YAML 兼容性，D-024）。
- `git stash --help` 类分类修正（过拒方向，fail-safe，未立项）。

## D-044: 测试组织镜像 src 分层

**Status:** active

**Decision:** `tests/access-gate/access-decision/` 按 `src/access-gate/access-decision/` 的 `core/`、`adapters/`、`runtime/` 边界镜像分层，根层保留 extension composition 集成测试；`npm test` 使用目录 glob，focused `test:index` 覆盖生产入口。测试通过新 public seams 验证行为，不导入或复制旧决策链的 helper、fixture 和 expected value。

**Why:** 平铺 40 个测试文件与 `src/` 的 10 个子目录是两张并行地图（模块→测试靠命名前缀猜）；`test:gate` 手写枚举 9 个文件，新增/改名内核测试必须同步编辑 `package.json`（shotgun surgery）；`helpers.ts` 混装 fixtures / 表格驱动 DSL / 编译器工具三责，且三者的消费者集合不相交（command-semantics 测试 vs gate/plan 测试），镜像后共享 helper 无处安放，拆分是镜像的必然推论。

**Impact:** 新增测试放镜像路径（模块→测试同路径导航）；组脚本永久稳定（目录 glob 对文件增删不敏感）；`helpers.ts` 拆三后 DSL 演进不再牵动 gate 侧 fixtures。

**Rejected:**

- 平铺 + 重命名文件成共享前缀再 glob 化：为 glob 而命名，加 git 历史噪音，locality 零提升。
- 删除全部组脚本只留全量：丢失开发迭代的快速反馈面（全量含 validate + tsc）。
- 镜像只到 `gate/` 一层（plan/decision 并入）：组=目录严格对齐但丢失 D-022 物理分层的测试可见性。

**Out of Scope:**

- 测试内容重构（用例、断言、覆盖范围）；本决策只定组织与脚本形态。
- 引入新测试框架；维持 node:test + tsx。

## D-045: cd 目标存在性与条件 CWD 结果集

**Status:** active
**Reversal surface:** user-boundary

**Decision:** **当前基线（T-069 完成前）**继续使用分析时点存在性与立即后继操作符近似：目标存在时取目标候选；目标不存在且后继为 `;`/newline 时合并目标与 cd 前 cwd；立即后继为 `&&` 时只保留目标分支。

T-069 的 Greenfield Semantic Rebuild 不继承该算法，而重新建立条件命令的成功/失败 CWD 结果集：每个可建模命令产生有界的 success/failure 出口，`&&` 只把 success 送入右侧、`||` 只把 failure 送入右侧，`;`/newline 合并两个出口；被短路的 `cd` 不得污染后续命令。候选在插入前按稳定键增量去重并受固定硬上限约束，超限返回 typed resource reject，不得先物化无界集合。分析时点不存在的 cd 目标仍是合法假设候选，以覆盖链内先创建后进入的路径；真实 cwd 的失败分支不得因幻影目标而消失。

**Why:** 当前 `previousBefore/previousAfter` 近似只能描述立即相邻的简单链，混合 `&&`/`||` 会丢失短路分支或让未执行的 cd 改写后续 cwd。路径授权依赖 CWD 事实；错误分支既可能漏检真实写入，也可能产生错误拒绝。成功/失败结果集直接表达 and-or list 的控制语义，并让预算在状态生成处闭合。

**Impact:**

- Policy 规则本身不改变，但事实分析修正可能改变最终 allow/ask/deny；T-069 必须用独立语义用例证明这些变化，而非追求旧实现 parity。
- 新实现覆盖 `A && B || C`、`A || B && C`、短路 cd、`;`/newline join、连续相对 cd 和候选上限。
- 旧 `resolveCdTarget`、候选结构、branch 字符串和 `ANALYSIS_LIMITS` 数值不是新实现合同，只作历史参考。

**Rejected:**

- **继续使用单一 previousBefore/previousAfter：** 无法表达混合 and-or list 的分支汇合。
- **无条件合并 cd 前 cwd：** 在 `&&` 成功路径虚构不会执行的旧 cwd 分支。
- **只保留目标候选：** cd 失败后继续执行的链会遗漏真实 cwd。
- **完整 Bash 执行模拟：** 超出静态下近似与有界分析目标；不可证明形态继续 fail-closed。

**Out of Scope:** 消除分析到执行之间的 TOCTOU；建模权限、mount、并发进程等所有 cd 失败原因；支持完整 Bash 复合语法。

## D-046: plan 验证收敛到 seal 边界（kernel 品牌检查）

**Status:** active

**Decision:** **当前基线（T-069 完成前）：** CompleteAccessPlan 的结构验证只在 seal 边界（compiler-entry finalize）运行一次；Policy Kernel（evaluate-request）改用 O(1) 品牌检查 hasPlanBrand（REQUEST_BRAND + ISSUED_PLANS WeakSet 成员），不再全量深验。validateCompleteAccessPlan 保留为公开 type guard 与测试 seam。

**Why:** 每次受管辖 tool_call 原双重完整验证（seal + kernel 各一遍）；「拒绝未发行 plan」契约由 WeakSet 成员判定承载（结构复制丢失成员即拒绝），深验在 kernel 边界冗余——brand 模块私有、finalize 是唯一构造点、deep-freeze 阻断变更。

**Impact:** 在当前基线中，每受管辖 tool_call 少一次全量深验；copied-plan 拒绝契约不变（hasPlanBrand 含成员判定）；isCompleteAccessPlan 对外行为不变。T-069 完成后，本条的 seal 一次、消费廉价原则迁移到 D-060 定义的独立编译产物和领域投影，不保留这些旧名称。

**Rejected:** **保持双重验证（kernel 独立信任闸）**：防御线只对「未来绕过 compileToolCall 的构造路径」有效，而该路径需摸到模块私有 WeakSet，结构性不可达。拒绝。

**Out of Scope:** 在当前基线之外继续拆分/裁剪 verifier；新 Canonical 与 Admission 的类型形状由 D-059/D-060 与 T-069 从零设计。

## D-047: 原则优先级与 Reversal surface 申报属性

**Status:** active
**Reversal surface:** engineering

**Decision:** 恒注入原则面新增 `Rule Status` 规则：原则是默认值而非不可改法律，显式用户指令覆盖原则与 skill；原则或已记录决策与任务冲突时必须报告（不静默遵守、不静默违反），未决冲突并入任务关闭时的 open-proposals 处置（principles.md §9），已记录决策只经生命周期（supersede/retire）变更。Decision Record 新增可选元数据 `Reversal surface`：`user-boundary`（安全不变量、归属边界、用户承诺——逆转须用户显式批准，并在同一变更更新安全文档/Negative Space）或 `engineering`（模块内取舍——随模块重构正式 supersede，不静默偏离）；缺省 `user-boundary`；语义单一来源为 principles.md Project Records — Record Lifecycle。`CONTEXT.md` 生命周期措辞从 Permanent 调整为 Standing（更新语义不变）。现有 D 条目不批量背填属性，触达时补。

**Why:** 恒注入面全祈使 + "DNA/EVERY interaction" 框架且无"用户指令 > 原则"的显式优先级句（文件底部优先级句只管 skills），模型面对原则冲突时没有显式出口，只能盲从或违规——"把一切当铁律、忽视自迭代"的根源是框架缺优先级与报告出口，不是缺分级表。铁律与可改的区分按强制面天然存在（代码 hard deny 无法违反 / 用户中介决策 / 注入原则可覆盖），正确分级是机制分层 + 上报信息，而非逐条贴标签——贴标签迫使模型自裁权威，误标不对称（安全规则标软是真实危害，软规则标铁律阻塞进化）。Reversal surface 是上报信息（改动时申报谁有权批准）非许可（不授权模型自行改 D-xxx），D-028 权威规则不变；缺省 user-boundary 是 fail-safe 方向（未标注即保守申报）。

**Impact:** 恒注入面新增 Rule Status 与 Reversal surface 定义，随包分发到所有用户项目（属全局提示词改动约定审计范围）；decisions.md 模板头注明可选属性行位置；survey-context 按需读 D-xxx 时可区分申报类别；任务触碰 user-boundary 决策时向用户申报而非静默偏离；现有条目未标注时按 user-boundary 对待。

**Rejected:**

- **两级决策寄存器**（铁律册 + 工程册）：双源漂移，模型自裁权威，与 D-028 单寄存器生命周期冲突。
- **逐原则/逐决策贴强度标签**：恒定注入 token 税；误标方向不对称；D-030 已基于 C-003 拒绝 token 层说服。
- **对 Reversal surface 做自动化结构校验**：正则可伪造；违背 C-003 结构检查只限可操作面（validate-skills 锚点存活类）的先例。
- **现有 D 条目批量背填属性**：一次性大 diff + doc-sync churn；缺省 user-boundary 已 fail-safe，触达时补即可。

**Out of Scope:** access-gate/enforcement 层任何改动（纯提示词与记录面）；为申报属性新增专用 skill 或路由；原则逐条强度分级（Rule Status 是全局优先级 + 报告出口，非 per-rule 强度表）。

## D-048: 类语义模型收编 domain、glob 编译边界与 config 加载即校验

**Status:** active
**Reversal surface:** engineering

**Decision:** 三处结构收编（architecture deepening #6）：

- **A（类语义模型收编 domain）**：类→基础 effect 蕴含（原散落于 `shared.defaultEffects` / `git.gitEffects` / `builder.effectsFor` 三处）合并进 `domain.ts` 的 `COMMAND_CLASS_EFFECTS`（`defaults`/`requires` 双视图）；effect 轴（`EFFECT_AXIS`）与写面集合（`WRITE_SIDE_EFFECTS`）同收 domain，kernel 原 `EFFECT_POLICY_AXIS` 引用之。`requires` 是 plan 完整性不变量（非 kernel 分支依赖——D-022 已记录 shell effects 只被 Direct 消费），构造侧（`effectsFor` 守卫）与证明侧（`access-plan-verifier` seal 边界复核 effects 覆盖 require）双查表——D-022「effect 被安全解释」承诺获运行时证明。`shared.ts` 消解，原语（semantics/args/intent/rules/naming）按职责上升 command-semantics 层，修正核心层依赖 adapter 内部文件的依赖倒置。
- **glob 语言 globstar 修正 + 编译边界**：`path/glob.ts` 定义 `*` 单段（不跨 `/`）、`**` 跨段含零段（`a/**/b` 匹配 `a/b`）、`/**` 结尾匹配自身及子——`compileGlob` 一次编译、`globMatches` 多次匹配；编译边界落在 path 层 WeakMap 记忆化（`compileBlockedOnce`/`compileRulesOnce` 按引用缓存），判定纯查找零编译。glob 编译无安全契约，故不采用「编译进 ResolvedProfile」的 seal 式落点（避免配置数据混入运行时资产 + fixtures 全量迁移）。通配符语言成独立可测模块（`pathMatches`→`globMatches`、`candidates`→`identityForms`；规则匹配改为编译制品路径 `compileRules`/`firstCompiledRule` 取代原 `selectPathRule`）。
- **config 加载即校验**：commands 段语义校验（class/effect/reclassify）从 overrides 消费方「命令分析时 throw」前移至 `config.loadConfig` 加载期——损坏配置立即 fail-closed（error），走 `loadProfiles` 既有的 error→failClosed-to-keel-read 路径，不再让损坏配置在受管辖 tool_call 中途未捕获。删除 overrides `_validated` 第三层缓存；`loadOverrides`→`commandOverridesFor`、`resetConfig`→`resetConfigCache` 命名修正。

**Why:** 类→effect 蕴含与 effect 轴是封闭世界领域知识，三处实现是单一来源缺口（新增 effect/类需多处记忆同步）；安全相关语义值得运行时证明而非仅构造侧自证。通配符原实现 `*`→`.*` 跨段超宽匹配、`**` 非零段漏配 `a/**/b` 的 `a/b`——glob 语言无定义、无直接测试。config 惰性校验把损坏配置的爆炸点推迟到命令分析，profile 层已有 fail-closed 呈现路径却未复用。

**Impact:** 类知识一处定义（编译期 fail-fast）；D-022「effect 安全解释」从设计承诺升级为可验证不变量。glob star/globstar 语义修正（行为变更，用 blocked 全量矩阵回归证明覆盖面不减）；通配符语言可直接测试。损坏 commands 从「分析时炸」→「启动 fail-closed」（行为变更，翻转 4 条 assert.throws 测试 + 新端到端覆盖）。`npm test` 全量 + validate-docs/skills 通过。

**Rejected:**

- **effects 裁剪/惰性视图**：shell effects 是 D-022 完整性载体 + 大量测试契约；惰性违背 sealed 不可变 plan（deletion test 平移失败）。
- **配置编译进 ResolvedProfile（seal 式落点）**：ResolvedProfile 是配置数据，混入运行时资产破坏 D-060 数据/制品分离；glob 编译无安全契约，编译期报错收益落空，fixtures 全量迁移成本高。
- **glob `*` 保留跨段（超宽）语义**：与 globstar 约定不符，`a/*` 误配 `a/x/y`。
- **commands 校验留在 overrides（维持分析时 throw）**：损坏配置在门禁调用中途炸，未复用 profile 已有 fail-closed 路径。

**Out of Scope:**

- shell effects 的进一步裁剪/排序（候选 F 挂起，见 C-012）。
- glob 性能的进一步量化（编译已摊销，量级非灾难）。
- config 热重载。

## D-049: 内置 Profile 集合收敛（移除 keel-code/keel-query/keel-subagent-scratch）

**Status:** active
**Reversal surface:** engineering

**Decision:** 内置 profile 从 9 个收敛为 6 个：移除 `keel-code`（仅写 `project/src/**`、`project/tests/**` 的代码编辑档）、`keel-query`（项目写 ask 的审批中档）与 `keel-subagent-scratch`（T0）。

- `keel-query` 合并进 `keel-develop`：develop 改 `extends: [keel-plan]`，显式补 `execute: ask` 与 `project/** write: allow`，resolve 结果与改前完全一致（原 query 的 `project/** write: ask` 规则本就因首匹配被 develop 的 allow 规则 shadow，是死规则）。
- `keel-subagent-scratch` 合并进 `keel-explore`：explore 增加 `/tmp/pi-work/**` 写规则后与 T0 解析完全一致（实现前验证）；T0 档位映射改为 `keel-explore`，T1 改 `extends: [keel-explore]` 后解析不变；plan/develop 自带的重叠 `/tmp/pi-work` 规则删除——scratch 规则单一来源在 explore。

**Why:** `keel-code` 零实际使用（仓库内无任何运行时引用，只有测试自引用），且语义残缺——真实代码编辑必然触碰 `package.json`/`tsconfig.json` 等项目根配置文件，该档只允许写 src/tests，无法承载“写代码”这一实际用途；真实代码编辑由 `keel-develop`（项目全写）覆盖。结构上它是 `keel-read` 的未用分支，无任何 profile extends 它，删除不改变继承拓扑。`keel-query` 同样零运行时引用，且 ask-first 是“审批哲学”而非能力档——选择 develop 即接受项目写，需要“写前全审”的用户自配 profile（配方：`extends: [keel-plan]` + `project/** write: ask` + `execute: ask`）比内置默认档位更适合表达该偏好。`keel-subagent-scratch` 解析后 = explore + 一条 `/tmp/pi-work` 写规则，是重复档；explore 作为主档的“纯只读”承诺（writes denied）没有安全相关性——`/tmp/pi-work` 是 pi-keel 自有 scratch 约定目录（非用户数据、ephemeral），其余可写档（plan/develop/build）本就全带此规则。合并后主链梯子每级严格递增：read（零写）→ explore（+scratch）→ plan（+docs）→ develop（+项目写）→ build（全信任）。

**Impact:** `/profile` 可选项 9→6（主链 5：read/explore/plan/develop/build + T1 `keel-subagent-project`）；子代理 T0 复用 explore（footer 显示 explore）；既有配置若 `extends: [keel-code]`/`keel-query`/`keel-subagent-scratch` 将解析失败并 fail-closed 到 `keel-read`（三档均无任何文档化使用，爆炸半径为零）；安全梯度与其余档位语义不变（plan/develop/build 逐项 resolve 验证相同）。

**Rejected:**

- **移除 keel-explore**：read-anywhere + scratch 默认需内联进 plan 与 T1 两处，造成配置重复，且失去“全盘只读”主档位。
- **把 explore 的写面放宽到 `/tmp/**`**：共享目录任意路径写有 symlink/交叉用户风险；合并只用 pi-keel 自有约定 `/tmp/pi-work/**`（build 的 `/tmp/**` 是另一档语义，不受影响）。
- **合并 keel-develop 与 keel-build**：build 的 modify/execute allow 是全信任语义，与 develop 的 ask 是安全梯度实质差异；合并会让 develop 默认允许执行，是危险默认。
- **程序化合成子代理档位**：把 T0/T1 从 profile 数据改为运行时合成，增加运行时复杂度并失去配置层可测试性；本次未采用该历史方案。

## D-050: 移除可选工具 adapter 支持

**Status:** active
**Reversal surface:** engineering

**Decision:** pi-keel 不再分发或加载 optional adapter，也不再提供 `optionalAdapters` 配置字段。未被核心 adapter 或用户 `commands` 覆盖层建模的裸名命令保持 `unknown`；路径形式的未建模可执行文件仍按 D-031 分类为 `execute`。

**Why:** 唯一的 optional adapter 是外部工具的专用建模，增加配置面、注册表分支、测试和文档维护成本，但不属于 pi-keel 的核心访问策略。移除后核心 adapter 集合重新成为唯一内置语义来源，用户仍可通过 `commands`/`aliases`/`reclassify` 显式扩展本地命令语义。

**Impact:**

- `command-semantics/registry.ts` 只构建核心 adapter 索引。
- `config.yaml` 的顶层 schema 只保留 Profile、子代理档位和 `commands` 段。
- 旧 optional adapter 配置不再激活任何工具；兼容回归保持裸名命令的 `unknown` 分类。
- README、CONTEXT、测试和第三方 companion 文案不再描述该工具或其安装方式。

**Rejected:** 保留一个通用 optional adapter 框架但不附带实现：没有当前消费者，仍保留配置和注册表复杂度；未来新增工具应基于明确需求重新设计，而不是保留空扩展点。

**Out of Scope:** 用户 `commands` 覆盖层的能力和优先级不变；本决策不禁止用户自行在其配置中为任意命令声明语义。

## D-051: pi host 凭据文件边界（auth.json）

**Status:** active
**Reversal surface:** user-boundary

**Decision:** 将 `~/.pi/agent/auth.json`（pi host 的 Credentials 文件，存 API keys / OAuth tokens）加入 `DEFAULT_BLOCKED_PATHS`，read/list/search/write 四操作一律 hard deny。`~/.pi/agent` 下其余文件（`settings.json`、`sessions/**`、`models-store.json`）不进 blocked 清单，继续由 PathPolicy 治理。

**Why:** auth.json 是 pi 目录中唯一“纯凭据、无合法 agent 场景”的文件——凭据注册由 host 的 `/auth`/`/login` 流程独占管理；agent 帮助配置供应商写的是 `settings.json`/`models-store.json` 的 provider 配置，分析会话读的是 `sessions/`，均不触碰 auth.json。整棵 `~/.pi/**` 硬拒会封死供应商配置与会话分析两个合法场景，与既有清单“home 凭据目录整树硬拒”的形态不同——本决策按最小面只拦唯一无合法 agent 场景的凭据文件。

**Impact:** `cat`/Direct `read` 等对 `~/.pi/agent/auth.json` 一律 hard deny；`settings.json`、`sessions/**`、`models-store.json` 保持 profile 规则治理（读按默认、写按规则；keel-build 的 `~/** write=ask` 仍覆盖 provider 配置写审批）。

**Rejected:** 整棵 `~/.pi/**` 硬拒（误伤 settings/sessions 合法场景）；`~/.pi/agent/auth*` glob（覆盖 auth.json.bak 等变体，超出当前最小面——变体文件出现时按本决策模式追加）。

**Out of Scope:** `models-store.json` 可能内嵌 provider `apiKey`（中间态）不硬拒，由 profile 写规则治理；若未来需收紧单独评估。

## D-052: git clone 显式目标目录提取

**Status:** active
**Reversal surface:** engineering

**Decision:** git 适配器的 `clone` 子命令增加写目标提取：取值选项单一来源表（`CLONE_VALUE_OPTS`，官方 git-clone(1)）消费选项后，位置参数恰好为 [`<repo>`, `<dir>`] 两个时，把 `<dir>` 作为 write intent（argument/exact，与 mv/bundle create 同构）；consumed 的 file 值（`--template`/`--reference(-if-able)`）映射为 read intent（D-040 契约兑现：模板/引用目录的真实读取进 PathPolicy 读轴）；其余情况不提取，保持 shell-compiler 的 cwd 保守写面回退。

**Rules:**

- len==2 门控是 fail-closed 不变量：任何解析异常（如未建模 separated 取值选项的值泄漏进位置参数 → ≥3）一律放弃提取、回退保守行为——提取只能把决策收窄，不能放宽。
- 未建模 equals/attached 形式选项整 token 原子跳过，无值泄漏——取值选项表完整性只影响覆盖率，不影响安全。
- `--separate-git-dir` 值只消费、不产生 intent：归因会使无 `<dir>` 的 clone intents 非空、抑制 cwd fallback（fail-open）。
- 无 `<dir>` 时的 ==2 泄漏签名（`[泄漏值, <repo>]`）会令提取指向 `<repo>` 并抑制 cwd fallback——当前不可达（表覆盖 git-clone(1) 全部取值选项，未知选项 git 在写盘前报错），未来新增取值选项须先复核此签名再改表。

**Why:** clone 此前是 modify 命令中少数无路径提取的子命令，写面 fallback 钉在 cwd（项目根）——显式克隆到 `/tmp/pi-work/**`（keel-plan/keel-explore 写面内）被误拒为 write path denied。目标目录是静态可析取的位置参数，与 archive -o / bundle create 同级。

**Impact:** 显式目标落在 scratch/docs 写面内的 clone 从误拒转为放行（路径维度；命令级 shellPolicy 仍按档位裁决，keel-plan 下 modify 审批一次）；项目内显式目标按精确路径走既有规则（与 mkdir/cp 一致）；无 `<dir>` 的 clone 行为不变（cwd 回退）。`--template`/`--reference` 的读取从此受 PathPolicy 读轴治理。既有语义用例 `git clone <url>`（无 dir）不变。

**Rejected:** 通用「末个位置参数 = 写目标」规则（sed -e/commit -m/push ref 误归因，泄漏面全开）；fallback 改为 cwd+显式目标双检查（冗余，不换收益）；放宽 profile 项目写（放弃最小权限）；`--separate-git-dir` 归因（fail-open，见 Rules）。

**Out of Scope:** 本地仓库源（`<repo>` 为本地路径时）的 read intent——与本次误拒无关，且需 URL 启发式；其读压力由既有分类级 shellPolicy 覆盖。

## D-053: Profile 数据零注入（LLM 上下文隔离）

**Status:** active
**Reversal surface:** engineering

**Decision:** 当前 Profile 机制的任何数据——`ResolvedProfile`、集中配置、builtins、活动 profile 名——永不进入 LLM 上下文：不注入 context 消息、不修改 tool schema/description、不进 system prompt。活动 profile（`/profile` 切换）不改变任何注入内容；恒定注入文本只依赖静态文件（`principles.md`）。模型感知 profile 的唯一渠道是失败路径的静态 guidance（`profile-restriction`），且该 guidance 只给可行行动路径（ask the user to update the Profile），不描述机制、不提示实际不存在的操作通道。T-069 的 `Policy Snapshot`、新配置和活动 policy 状态继承同一零注入边界；类型和文案从零设计，不复用旧 Profile 实现（D-059）。

**Rules:**

- 模型在任何配置、任何活动 profile 下都观察不到 profile 数据文本（注入消息 / tool description / system prompt 三面皆无）。
- 恒定注入面保持唯一：`src/bootstrap/index.ts` 是唯一 `context` 注入点；access-gate 只经失败路径产出静态 guidance。
- guidance 与实现一致：profile deny（`shell-policy-denied`/`path-denied`）无逐次批准（allow-once 仅存在于 ask 流），故 guidance 不出现 "approve the operation" 类描述。
- 未来任何"让模型可见活动 profile 或 profile 规则"的需求必须经本决策生命周期（superseded/retired）显式变更。

**Why:** profile 是 gate 的确定性计算输入而非提示词素材。把规则翻译进上下文会诱导模型自行判断权限、绕过 gate 消费结果，带来行为漂移、token 税与安全稀释；失败路径 guidance 是唯一必要的模型可见面，只在拒绝时给出可行行动路径（D-023）。

**Impact:** 恒定注入内容与活动 profile 无关；模型在会话中不可见 profile 名与规则；新增注入面即违反本决策，由校验脚本与测试承载防回归。

**Rejected:** profile 感知的动态注入裁剪（注入内容随 `/profile` 切换变化——行为随运行时状态漂移）；在恒定层注入 "Active profile: X"（token 税 + 诱导模型自行判定规则）；把 profile 描述文本放进 tool description（恒定成本扩大）。

**Out of Scope:** 失败路径 block reason（静态 guidance + category-only subject）本身属于模型可见面，不在"数据注入"之列；TUI（footer、`/profile status`）面向人类用户，不属 LLM 上下文。

## D-054: 提示词面引用可靠性边界（指针化与内嵌的取舍判据）

**Status:** active
**Reversal surface:** engineering

**Decision:** 提示词面内容的引用化（`per principles.md X` 形态）按总则加四问取舍。总则：引用是共享规则的低频定位手段，不是技能默认形态——操作步骤与守卫留在动作点。四问：① 引用目标须在同一读取/注入面且短而高显著（同文档相邻、guidance 当下渲染）；跨文件引用（技能→其他技能子文件）解析时付一次真实读取，仅在单源收益超过读取成本时使用；长细节段（Next-ID slots、迁移表）接受方必须内嵌。② 执行必需或 do-not-X 守卫（审批否决、分类守卫、防误删）必须留在动作点内嵌。③ 解析失败须可测或有情境兜底（校验器、违反即重现）；否则失败静默。④ 删除量不足指针固定成本（措辞+解析）的短句不指针化。"存量引用存在"不构成映射可靠、常规或正确的证据——本判据约束新改动，存量按同一标准再审计、不自动回退。操作化判据以 AGENTS.md「提示词内容改动约定 — 引用与内嵌取舍」为准。

**Why:** 引用解析依赖模型对注入面文本的回忆——回忆随 session 老化衰减、compaction 重注入不等于可回忆，且无反馈环验证解析成功：失败时模型带着残缺回忆静默继续执行；引用式（citation-style）措辞还降低指令权重。D-030 已按"不可操作化"先例拒斥 token 基线测量——本判据是结构层可靠性标准，正属 D-030 承认的可操作化方向（结构层行为测试）。

**Impact:** 既有提示词面参考引用不受本判据回溯、不自动回退；后续编辑按四问执行；重试禁令撤出恒定注入面后唯一载体是运行时 guidance——删该句即删禁令，由 gate 防回归断言锁定；本判据不引入 token 度量，与 D-030 的 dismiss 面无冲突。

**Rejected:** 纯指针化（机制全改引用——回忆失败即静默错误，无反馈环）；全内嵌复刻（多源漂移，D-030 已证）；以 token 量作为取舍判据（"量"不可操作化的 dismiss 先例）；并入 D-030 原地修订（违反 D-047：已记录决策只经生命周期变更）。

**Out of Scope:** 对存量引用的逐条回退裁定（另立审计）；guidance 文本精简（D-030 dismissed）；用户项目注入面（principles.md）不承载本维护纪律；逐条引用解析的运行时测量。

## D-055: 搜索命令选项建模对齐官方文档与 rg 14 基线

**Status:** retired — superseded by [D-059](#d-059-greenfield-access-decision-pipeline-与原子替换); the former search adapter contract is not part of the Greenfield policy.
**Reversal surface:** engineering

**Decision:** `search.ts` 的 grep/rg 选项表按官方文档建模，并锚定 **rg 14.x**（与仓库声明的 Arch Linux 工具链基线一致）为 rg 短选项语义基线：

- grep 补 regex 引擎族 `-E/--extended-regexp`、`-G/--basic-regexp`、`-F/--fixed-strings`、`-P/--perl-regexp`（无值 flag，GNU grep §grep Programs）；NUL 短长形式按官方拆分：`-z/--null-data`、`-Z/--null`。
- rg 修正错映射：`-L` 是 `--follow`（符号链接），不是 `--files-without-match`（该选项实际无短形式）；`-I` 是 `--no-filename` 的短形式（`-h` 在 rg 是 `--help`，建模为无值 flag）；`-z` 在 14.x 是 `--search-zip`（≤13 无 `-z`），NUL 输出的短形式是 `-0/--null`，`--null-data` 无短形式。
- rg 补建模安全选项：无值 flag `-P/--pcre2`、`-U/--multiline`、`-S/--smart-case`、`-N/--no-line-number`、`-0/--null`、`-p/--pretty`；`-E/--encoding` 建模为**取值**（expression）——rg 的 `-E` 与 grep 的 `-E` 语义不同，严禁跨命令复制；`-d/--max-depth` 短形式建模为**取值**（rg 14.x 新增，`-d` 与 grep `-d`=--directories 语义不同，严禁跨命令复制）。
- 删除编造的 `--min-filesize`（rg 官方无此选项，只有 `--max-filesize`）。
- 五个只读搜索命令（find/tree/grep/rg/ls）补只读信息探测长形式 `--version`/`--help`（无值 flag）——闭合同族的 opaque 误拦（`rg --version`/`grep --version` 及 `--help` 此前被 opaqueOnUnknown 拦为 opaque-command，且引号无法绕过，D-055 紧随的 bootstrap 悖论）。信息探测短形式同批建模：grep/rg `-V`（`--version`，GNU grep 与 rg 官方 man 均确认）、rg `-h`（`--help`，rg 项目确认 `-h` 即 help）；grep `-h`/ls `-h` 是已建模的真实选项（`--no-filename`/`--human-readable`），不误当帮助短形式。
- 收敛剩余未建模只读选项（均官方 man 确认、只读无写面）：rg 取值短形式 `-M/--max-columns`、`-T/--type-not`、`-r/--replace`、`-j/--threads`、`--engine`，及 `--max-depth` 别名 `--maxdepth`；grep 无值 flag `-T/--initial-tab`、`-U/--binary`、`--line-buffered`，取值 `-D/--devices`、`--binary-files`、`--group-separator`，文件读取 `--exclude-from=FILE`（read intent，同 `-f`）。跨命令同名短选项差异照 D-055 原则各自建模（`-T`：rg=--type-not 值 / grep=--initial-tab flag；`-r`：rg=--replace 值 / grep=--recursive flag；`-U`：rg=--multiline / grep=--binary，均无值 flag 但语义不同）。

**Why:** `opaqueOnUnknown`（D-040）的收紧意图是堵未建模的破坏性选项（find `-delete`/`-exec` 等），但 grep/rg 只读、无写面，官方确认的无值取值选项不建模只会把可分析的字面搜索命令变成 `opaque-command` 误拦（`npm test 2>&1 | grep -E '^ℹ ...'` 被拦即为此因）；建模必须映射真实工具语义——rg 的错标签（`-L`/`-h`/`-z`）虽不改变 gate 判定（同为无值 flag），但会在未来按选项语义做 upgrade/downgrade 调节时埋错。

**Impact:** `grep -E/-G/-F/-P/-Z/--null-data` 与 `rg -P/-U/-S/-N/-0/-p/-z/-L/-I`（及 `-E` 取值）不再误拦；`--version`/`--help` 长形式在 find/tree/grep/rg/ls 均不再误拦，grep/rg `-V` 与 rg `-h` 短形式同样不再误拦（信息探测打开至执行面，仍为 inspect 只读、无路径 write 面）；rg `-M/-T/-r/-j/--engine/--maxdepth` 与 grep `-T/-U/-D/--line-buffered/--binary-files/--group-separator/--exclude-from` 不再误拦；rg 短选项模型以 14.x 为基线，未来版本漂移（新增短形式）按同一基线评估；新增选项建模须对照官方 man 并核对 grep/rg 同名短选项差异（`-E/-L/-h/-I/-s/-z` 六组均不同）。

**Rejected:** 把 grep 的 `-E` 直接复制为 rg flag（rg `-E` 是 `--encoding` 取值，当 flag 会吞掉下一个参数并错解析路径 intent）；按 rg 13.0.0 建模（与实际 Arch 14.x 基线不符）；完整枚举 rg 全部选项（超出安全决策面的噪音）；建模 `--color[=WHEN]`（可选值形态，当前 opt 表无此表达力）；把 rg 的 `-T`/`-r`/`-U` 语义复制到 grep（同名短选项语义不同，严禁跨命令复制）。

**Out of Scope:** `--color[=WHEN]` 可选值形态（grep/rg 均，当前 opt 表无此表达力）；本机已安装 rg 二进制版本不在建模依赖内（安装副本在重装前仍按旧表拦截 `rg --version`，属分发产物待更新，非源模型的 gaps）。

## D-056: 归约展示视图：坐标职责与 renderer 归属

**Status:** active
**Reversal surface:** engineering

**Decision:** **当前基线（T-069 完成前）：** 归约路径（T-062 for 建模）的展示职责全归渲染层。Policy Kernel（evaluate-request）证据坐标恒为归约坐标，不再持有原始坐标/去重/expanded form 知识（每条命令一证据）；plan 只携带纯数据 `expansion`（`{ segments: {kind: "verbatim"|"expanded", reduced, original}[], expandedText }`，命令级段 + verbatim 段线性位移由段自身差承载），经 seal clone + verifier 形状检查 + deepFreeze 三件套入场；渲染层新增 `gate/decision/expansion-view`（`mapOriginal` 段映射、`originalGroupKey` 去重组键）作为「归约坐标 → 原始坐标」唯一查询面；`renderDecision(decision, ctx?: {rawCommand?, expansion?})` 分组去重（迭代拷贝同 original 折叠、不同 body 命令不折叠）、literal form 按原始坐标切原文、expanded form 首条 command 证据后附加一次。删除三处散落载体：`operation.originalSpan?`（Path/Command 两操作类型，Path 侧本为写-only 死字段）、`plan.reductionText?`、`GateEvidence.expandedText?`。coverage/verifier 对账语义唯一化：`span` 恒为归约坐标，无第二坐标系。COMPILER_VERSION 不因字段增删 bump（verifier 是唯一形状门，无外部 plan 消费方）。

**Why:** 双坐标契约以裸字段 + 每家消费者各自实现散落五层，且 expanded 段 original 为整 body 区间导致去重折叠不同命令（`do echo x && echo y` 并入一条）——根因是段粒度是「整 body 迭代」而非命令级；去重与 expanded 布点是纯展示关切（决策 per-plan，证据条数只影响提示文案），留在内核持续污染 D-022 分层纯度；方法对象进 plan 破坏「可信数据制品」形态（D-046：验证收敛 seal + brand 门，行为不可结构验证、不可版本化对齐）。展示逻辑作为决策视图，与 kernel 纯策略职责分离是本仓库分层原则的自然延伸而非新规。

**Impact:** 当前基线的 plan 携带 `expansion` 纯数据，kernel 证据列表按命令生成，展示折叠归渲染层；`reduceToFlat` 段为命令级，`expansion-view` 负责归约坐标到原始坐标的映射。T-069/D-060 完成后，坐标职责保留，但 `expansion` 移入独立 Display View，不再属于 Admission Plan 或旧 verifier 的生命周期。

**Rejected:**

- **方法服务进 plan（V2a）**：行为无法被 verifier 形状验证、plan 失去值语义（序列化/版本化对齐），展示逻辑入编译器层；混合形态（数据在 plan、渲染边界构造服务）在单一消费方 + 行为量小前提下是过度抽象。
- **kernel 侧去重（现状收拢版）**：展示知识留在决策内核，D-022 纯度不还原；整 body 粒度过粗的折叠缺陷无法根治。
- **双坐标字段保留**：散落载体继续泄漏，Path 死字段留恒。
- **verbatim 位移由命令记录推导**：骨架删除量（`for…; do`/`done` 删除 + 合成 `; `/重挂载）不在命令记录内，推导不成立——展段/verbatim 段结构必须由段数据整体承载。
- **编译期命令级细化（C3b）**：坐标解释出现第二处（合成器 + 编译器各一半），序不变量隐式扩散到解释器，违背单源原则。

**Out of Scope:** expandedText 为 reductionText 同值改名（无语义变化）；非归约路径去重行为（span 天然互异，渲染层分组恒直通）；结构化审批 UI 等第二展示消费方出现时把 expansion-view 查询提为共享模块/服务对象的触发路径（届时本决策据 D-047 engineering 面正式 supersede）。

## D-057: uv run 执行语义

**Status:** active
**Reversal surface:** engineering

**Decision:** 将 `uv` 纳入核心命令 adapter；`uv run` 分类为 `execute`，`uv --version`/`-V`、`uv --help`/`-h` 和 `uv help` 分类为 `inspect`。未建模的 uv 顶层子命令保持 `unknown + opaque`，不以一个宽泛的 `uv: execute` 定义覆盖整个 CLI。

**Why:** `uv run` 不只是启动已存在的 pytest：在项目中它会确保环境最新，并可能自动 lock/sync、解析或下载依赖，然后运行任意命令。把 `uv run pytest tests/test_reporting.py -q` 留作 unknown 会在允许 `unknown` 的 profile 中失去“执行代码”的分类；把所有 uv 命令统一成 execute 又会过度收紧只读版本/帮助场景。该分类依据 uv 官方 CLI/项目文档的 `run` 行为。

**Impact:** `uv run` 继承 `execute` 决策；其参数中的 pytest、脚本或其他程序不在 uv adapter 内重复推断，均由 execute 类覆盖。`uv` 环境同步产生的 `.venv`、`uv.lock`、缓存和配置文件路径写入仍不单独建模；未建模子命令继续 fail-closed。核心分类及对应回归测试位于 `src/access-gate/access-decision/core/shell-words.ts` 与 `tests/access-gate/access-decision/core/shell-policy.test.ts`。

**Rejected:**

- **把整个 uv 注册为 execute**：版本/帮助以及未来可证明只读的子命令会被过度分类，且无法表达逐子命令的安全语义。
- **仅注册为 unknown 或仅使用用户 commands 覆盖**：真实的 `uv run` 工作流在 `unknown: allow` 下可能绕过 execute 分类；核心行为也不应要求每个用户重复配置。
- **把 `uv run` 分类为 inspect**：忽略了环境同步、依赖解析/下载和任意子进程执行的副作用。
- **为 `uv run` 增加 `network` effect**：当前 Shell Gate 只按 `commandClass` 使用 `shellPolicy`，不消费该 effect；它增加语义和维护复杂度，却不改变授权结果。只有出现独立网络授权需求时，才另行设计网络策略轴。

**Out of Scope:** `uv` 其余顶层子命令（如 `sync`、`lock`、`add`、`pip`、`auth`、`build`、`publish`）的细粒度分类、uv 具体文件路径 intent、独立 network policy 轴，以及可选值参数的完整 CLI 语法；出现真实需求和足够语义证据时再按子命令单独扩展。当前既有命令的 `network` effect 不在本决策中清理；只有出现独立网络授权需求时再评估其消费者。

## D-059: Greenfield Access Decision Pipeline 与原子替换

**Status:** active
**Reversal surface:** engineering

**Decision:** T-069 以 Greenfield Semantic Rebuild 从零重建 Access Decision Pipeline。新实现只以 Pi tool-call 外部合同、Linux/Bash 行为、明确的政策语义和安全不变量为设计输入；当前 `src/access-gate/` 的 parser、command semantics、path resolver、threat scan、compiler/plan、Kernel、renderer、Profile/config 与 cfc8071 archive 均不是可复用实现。旧代码和旧测试只作非权威历史线索或反例，不得被新核心 import、复制、改名、包装、适配、shadow 调用或作为 parity oracle。

新实现在独立 `src/access-gate/access-decision/` 边界内物理分为 `core/`、`adapters/`、`runtime/`：core 只含 Pi host/config 无关的语义与决策域，Linux pathname lookup 是该语义域的外部合同；adapters 单向把 Pi/config 外部合同变成 core 输入，runtime 是唯一 Composition Root；依赖只能 core ← adapters ← runtime，三层都不得 import 其他现有 access-gate 实现。自定义 Profile/config schema、继承规则、名称和序列化形状不兼容；外部配置在新 `Policy Snapshot` 稳定后单向适配，不反向塑造核心领域模型。

实现可在任务分支按垂直切片独立提交，但生产入口只在完整新信任链通过验证后一次性切换；同一切换删除旧决策入口、旧 public API 和所有兼容/双轨路径。Slice 0 中旧代码、旧测试和旧 Decision 只可产生待证明的探针；每个进入新合同的场景必须有 Pi/Bash/Linux 外部来源、独立实验或重新采纳的政策语义，旧行为本身不得成为 expected value。Slice 0 只冻结外部事实、职责边界和安全不变量，不以 fixture 自检冒充完整 runtime 合同；具体 request/Canonical/Admission/Policy/Display 类型和行为，必须在新 public seam 上先写失败测试再实现。所有 T-069 之前关于旧 Access Gate 的类型、算法、场景、配置和结果的 Decision，在新 Pipeline 中均按 reference-only 处理，除非 Slice 0 明确重新采纳。后续 Footer、Session UI 与子代理档位等外围能力不在 T-069 内重建；其旧注册在切换时明确停止，用户文档同步更新为能力暂时缺席，等待独立 Task 从零重建。新 runtime 只实现 tool-call 决策所需的最小 policy state 与 project/staging 生命周期。

**Why:** 从旧模块迁移、复用或逐字段重建会把旧场景假设、隐藏缺陷和错误边界带入新架构；以旧结果做 parity 又会把未知正确性的行为升级为规格。Greenfield 边界迫使语义依据、预算和信任关系重新证明。垂直提交保持评审粒度，原子生产切换则避免新旧 parser/compiler/kernel/config 交叉组成第三套未验证系统。

**Impact:**

- T-069 不再是文件搬迁或 API migration，而是完整 Access Decision trust path 的替换任务。
- 新测试在独立镜像目录从外部语义和安全合同建立，不机械迁移旧 unit tests；旧用例只有经重新仲裁后才能成为新断言。
- 旧 Profile/config 不提供 alias、转换器、兼容读取或迁移期 fallback；配置提供方必须适配新合同。
- Static Flow、Explanation Replay、Runtime Audit 和 Runtime Content Flow 延后到有真实 producer/consumer/enforcement seam 的独立任务。

**Rejected:**

- **复用现有 lexer/parser/semantics/path，再更换 plan：** 直接继承旧语义边界和缺陷，无法证明新 canonical 是独立事实来源。
- **复制旧实现后改名重构：** 物理路径变化不改变设计来源，仍是旧架构的隐式兼容层。
- **新旧 parity shadow：** 旧输出不是权威 oracle；一致只能证明复刻，不能证明语义正确。
- **逐层生产切换：** 新旧 compiler/kernel/config 的混搭没有整体信任证明。
- **把所有外围重写合并为一个 big-bang Task：** 扩大无关面和评审半径；外围通过外向依赖边界后可独立重建。

**Out of Scope:** 兼容旧 API、旧模块路径、旧 config/Profile schema、旧测试 helper 或 cfc8071 integration；在 T-069 内实现 Static Flow、Explanation Replay、Runtime Content Flow；重写不参与当前决策信任链的 Footer/Session/子代理内部行为。

## D-060: 受保护 Canonical 制品、窄 Admission 投影与有界求值

**Status:** active
**Reversal surface:** engineering

**Decision:** 新 Canonical Semantic Core 对一个请求执行一次政策无关、资源有界的解释，发行单一 opaque `CanonicalCompilation`。编译制品内部持有经过 seal 边界一次结构验证和 deep-freeze 的事实与资源证明，但不公开可枚举 ledger DTO；消费边界只做 O(1) issuance/authenticity 检查。Composition Root 从同一制品按需取得两种互不反向依赖的最小产物：sealed `Admission Plan` 与纯数据 `Display View`。不增加 `CanonicalCompilationHandle` 包装、中间 `CanonicalAdmissionView`、公共全域 operation、冗余 sequence、无消费者的 identity/ref/fingerprint/uncertainty 列表或每个视图的重复深复制。

`Admission Plan` 只包含新 Policy Kernel 决策所需的有序 command/path 事实、每个路径候选在 canonical 时点解析得到的 bounded `ResolvedPath` 值、必要 source anchor 和置信语义；不携带原始 Shell、配置格式、展示坐标、project/staging root（若解析后无消费者）、未来 Flow 数据或自然语言原因。Kernel 只消费 `Admission Plan` 与不可变 `Policy Snapshot`，不得重新调用 Shell parser、Direct schema analyzer 或 path resolver。`Display View` 只保存 renderer 需要的原始/归约坐标和有界展示数据，并只在实际需要展示时投影。

Canonical reject 使用本域封闭 code、source anchor 与资源分类；renderer 在外层映射为静态文案，不把 `GateEvidence` 或自然语言 subject 反向注入 compiler。硬资源上限由代码内固定常量拥有，外部只能收紧不能放宽；输入、token、分支候选、operation、归约输出和展示分配都必须在物化前以 checked/saturating arithmetic 计数。预算单位必须显式统一，不能把 JavaScript `.length` 的 code unit 与 byte 混称。

`Policy Snapshot` 是与配置格式无关的深度不可变值，由新授权语义决定字段；Canonical core 不读取它，Policy Kernel 不读取配置 loader。配置 adapter、policy state 与 host adapter 只在 Composition Root 外围单向提供输入。

**Why:** 一个受保护制品保证事实只解释一次；窄 Admission/Display 投影防止授权、展示和未来领域形成公共大 DTO。去掉 handle/identity/中间 view 可避免隐藏 WeakMap 状态和浅包装；路径在 canonical 阶段解析可阻断 Kernel 二次解释；物化前预算与单次 seal 保持正常路径 O(input + emitted facts) 的有界成本。

**Impact:**

- D-022/D-046 的“compiler 不接政策、seal 深验一次、consumer 廉价验真”安全原则保留，但不复用其类型、代码、WeakSet 布局或 verifier。
- D-056 的“展示坐标不进入 Kernel”职责保留，但新 Display View 从零设计，不迁移旧 `ExpansionData` 形状。
- Admission 不保存 `operations/commands/paths` 三份平行数组；若 Kernel 需要分类优先级，在同一有序集合上无分配扫描。
- Composition Root 对每个请求只调用每种投影至多一次；该 orchestration 由 service 测试证明，不要求 projector 自带隐藏缓存。已冻结事实可通过窄类型共享，不做无收益 defensive-copy 链。

**Rejected:**

- **公开 Canonical ledger DTO：** 调用方可遍历并耦合所有领域事实。
- **只有 identity 的 handle + 模块级 ledger WeakMap：** 引入隐藏语义存储、模糊生命周期和 GC 行为。
- **Admission 暴露 CanonicalOperation：** 把未来 flow/display 字段泄漏进 Kernel，名为窄投影实为宽类型。
- **Kernel 再解析路径：** 破坏一次解释并让文件系统观察时点漂移。
- **每个投影独立全量复制和验证：** 增加 O(N) 分配而不增加可达防线。

**Out of Scope:** Static Flow/OperationRef、Explanation Ticket/Replay、provenance fingerprint、Runtime Audit Event、跨请求缓存或持久化 canonical 制品；这些实体只有在真实消费者和独立生命周期出现后重新设计。

## D-061: T-069 Slice 0 外部边界冻结

**Status:** active
**Reversal surface:** engineering

**Decision:** T-069 Slice 0 只冻结与实现无关的外部事实、职责边界和安全不变量，不预先冻结新 runtime 的完整 DTO。冻结内容包括：Pi `tool_call` 的输入/拦截边界及 host UI 能力；T-069 支持子集内经 Bash/Linux 来源和独立观察证明的语义；Canonical 必须先于授权解释事实；Admission 只能向 Policy Kernel 提供最小可信授权事实；Display 不进入授权域；硬边界优先、不可证明形态 fail-closed、无 UI 不执行 ask、资源上限在物化前闭合，以及 core ← adapters ← runtime 单向依赖。

host-neutral request 的具体归一化字段和受管辖 surface 集合、Canonical reject code 与优先级、CanonicalCompilation 的发行/封装、Admission/Display 的具体字段、Policy Snapshot 的字段/默认值/决策联合，均推迟到新 public seam 设计时用失败测试冻结。它们不得从旧代码、旧测试、旧 Decision、旧 DTO、旧数值、旧结果或既有 Profile/config 推导。该边界冻结不表示生产 Pipeline 已实现。

**Why:** Slice 0 先锁住外部事实和不可退让的不变量，可防止新实现被旧 Access Gate 塑形；同时避免用 fixture 自检冒充完整 runtime 合同。具体类型只有在新 Greenfield seam 存在并经过 Design Twice 后才有真实消费者，随后由 TDD 测试先冻结、再实现。

**Impact:** `tests/access-gate/access-decision/` 在 Slice 0 负责外部语义观察、边界协议和 no-copy/dependency 检查；Slice 1 起，新 `access-decision/core`、`adapters`、`runtime` 的 public seam 必须把上述延后合同转成可失败的行为测试。D-059/D-060 的 Greenfield、窄投影、一次性 seal 和原子切换约束继续有效。

**Rejected:** 复用旧决策类型、迁移旧 expected values、以旧结果建立 parity、先重构旧代码再补合同、把 Profile/config 字段提升为 Policy Snapshot 字段、把 Display/Flow/自然语言原因塞入 Admission。

**Out of Scope:** 本条不冻结完整 Bash、具体外部配置序列化、旧外围能力恢复或任何 Static Flow/Explanation/Runtime Content 实体；这些需要后续真实消费者和独立任务。

## D-062: 新 Policy 文件加载边界

**Status:** active
**Reversal surface:** engineering

**Decision:** T-069 的用户全局 Policy 输入固定为 `$PI_CODING_AGENT_DIR/pi-keel/policy.yaml`，默认目录为 `~/.pi/agent`。文件的唯一顶层字段为新 `PolicyConfig` 的 `paths` 与 `commands`；旧 `config.yaml`、Profile、继承、命令覆盖和子代理字段均不读取、不转换、不 fallback。缺失文件等价于空新配置，因 `PolicyConfig` 的 deny-by-default 语义而关闭所有受管辖操作；YAML 语法错误、根非 mapping 或任何 schema 错误也必须关闭，不保留旧策略。

**Why:** Policy Snapshot 已有稳定的最小输入合同。独立文件把新格式与旧 `config.yaml` 的名称和 schema 隔离，避免任何兼容读取、隐式迁移或旧字段塑造新内核；缺失和损坏均从同一 closed default 进入决策链。

**Impact:** 新 loader 位于 `access-decision/adapters/`，只解析 YAML 并将未知值交给新 `adaptPolicyConfig` 验证；它不 import 既有 `agent-dir`、`config` 或 Profile 模块。production composition 在切换前只可消费该 loader 发行的 policy state；README 在切换时说明新文件和旧配置不兼容。

**Rejected:**

- **复用或扩展 `config.yaml`：** 复用旧文件名/loader 会把旧 schema 和 fallback 带入新信任链。
- **读取旧 Profiles 并投影：** 这是被 D-059 禁止的兼容 adapter，且旧结果不是新 Policy 规格。
- **缺失配置自动宽松：** 会使首次安装或路径错误成为 silent allow，违反 fail-closed。

**Out of Scope:** 新 policy 选择 UI、多个 policy 文件、项目级配置、热重载、配置迁移与子代理策略；它们需要独立消费者和任务。

## D-063: 待创建
