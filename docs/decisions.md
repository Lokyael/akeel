# Pi Keel Decisions

本文集中记录 pi-keel 的长期架构、工程和安全决策。每条只保留当前结论、理由、必要替代方案和影响；被完整吸收（`superseded`）或主动退役（`retired`）的条目从寄存器剪除，历史由 Git 保留（规则见 [D-028](#d-028-统一-project-record-模型)）。

**条目模板**：每条的段落顺序固定为 `Status` → `Decision`（可选规格子节紧随其后，如 `Rules`/`Security invariants`/`Guidance mapping`/`Enforcement scope`/`格式`/`延伸`）→ `Why` → `Impact` → `Rejected` → `Out of Scope`；无内容的段落省略，不留空标题。可选 `Reversal surface` 元数据行紧跟 `Status`（值 `user-boundary`/`engineering`，缺省 `user-boundary`；语义见 principles.md Project Records — Record Lifecycle）。

## D-002: 统一 Access Gate 与用户态边界

**Status:** active

**Decision:** 使用统一的 `src/access-gate/` 扩展集中处理 Profile、命令分类、路径策略、hard boundary 和审批，不提供或假定 OS-level isolation。

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

## D-017: Profile 访问策略

**Status:** active

**Decision:** 命名 Profile 是唯一用户权限入口，分别配置 Shell 决策和 `read`、`list`、`search`、`write` 四类路径策略。

**Rules:**

- Shell 命令分类为 `inspect`、`modify`、`execute`、`destroy`、`unknown`。
- 路径规则按声明顺序 per-operation first-match。
- `blockedPaths`、威胁模式、unsafe syntax 和 symlink escape 是不可覆盖的 hard deny。
- `ask` 只提供 `Allow once` 和 `Deny`，不跨调用或 Session 持久化。
- 每次 Session 从配置的 `defaultProfile` 开始，不继承其他 Session 的临时 Profile。
- 配置只分内置与用户全局两层（按内置、用户全局顺序合并，全局同名替换内置），用户全局配置为 `~/.pi/agent/pi-keel/config.yaml`（D-041）；全局配置无效时保留内置 Profiles 并将默认项收紧为 `keel-read`。
- 自定义特殊 profile 不在保证范围：gate 的行为保证边界是内置 profile；用户自配 profile 的矛盾组合（如同一路径 `read=deny` 且 `write=allow`）产生的行为不在责任范围，gate 不为自定义配置长尾追责，也不校验配置一致性。
- write⇒read 一致性：profile 配置的预期语义是“允许写入的路径应允许读取”（安全梯度：write 比 read 危险，能力层级上允许强能力蕴含允许弱能力；内置 profile 全部满足此性质）；矛盾配置（write 宽于 read）视为配置不一致，其行为修正属配置责任。

## D-018: Shell IR 与 Access Gate

**Status:** active

**Decision:** 采用 `shell-parse/`、`command-semantics/`、`gate/` 三层架构，以不可执行的 Shell IR 传递结构化结果。Shell 文件修改与其他路径操作使用同一套 hard boundary、canonical path policy 和 Profile gate。

**Security invariants:**

- blocked intent hard deny，不能由 Profile 或 `Allow once` 覆盖。
- 只有所有语法节点和 effect 都被安全解释时才可 allow。
- wrapper 必须保留底层命令 intent。
- modify 命令的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- 无法确定分支 cwd 时不得 allow。
- 一个 tool call 的所有 ask intent 聚合为一次审批。
- 复杂形态可拒绝：无法精确建模的形态编译期拒绝并引导拆解（heredoc/hereString 已如此；`unsupported-redirection` + split-supported-commands guidance 让 AI 拆成可识别的简单形态或 Direct 工具）——“尽量识别，但不是必要项”；识别不足时拒绝优先于猜测建模（fail-closed），不再引入无法建模的中间状态，拒绝路径必须携带拆解 guidance。
- `<>`（O_RDWR 读写打开）按 write 侧建模（`<>`→stdout、`2<>`→stderr）：write 决策允许即覆盖读面（write⇒read 一致性，D-017），只建模 read 会漏写侧；自定义矛盾 profile 下 `<>` 的读侧行为不保证（配置责任）。Rejected：`readwrite` 独立 kind（+ read+write 双 intent / 编译期拒绝）——为“read-deny + write-allow”矛盾配置付建模成本职责外，且 verifier/coverage 对账需配套改动；write 建模已语义完整，拒绝引入不必要的可用性损失；profile 验证层强制 write⇒read（矛盾配置报错）与“不负责自定义 profile”裁定矛盾。

**Enforcement scope:**

只对 Pi `tool_call` 中的 `bash` 和 `TOOL_SCHEMAS` 已知 Direct surface 执行策略；未知 Direct surface passthrough。不承诺全局 enforcement：`user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 及后续 handler 对 input 的修改不在范围内。

**Why:** Direct 写保护无法覆盖重定向、`tee`、`cp`、`mv` 等 Shell 写入入口，secret 扫描也不承担访问控制职责；统一 IR 和语义层集中提取命令类别、路径 intent 与 effect，避免分类和策略漂移。fail-closed 优先：识别不了就拒绝，由 AI 拆解（agent 可重试），而不是猜测语义（猜测 = 潜在漏判）。

**Impact:** 新形态处理顺序：识别 → 建模（write⇒read 下语义完整）→ 拒绝拆解；新增 adapter/重定向形态时按此顺序评估。

## D-019: Profile Footer

**Status:** active

**Decision:** TUI 使用 `setFooter()` 包装 Pi 原生 Footer，固定渲染两行；第一行显示位置、Session 和 Profile，第二行保留原生运行统计和扩展状态；Pi 主包不可用时使用本地 fallback。布局适配：left/right 统一为单一 ANSI 感知 `fitLine`；宽度/截断助手（`visibleWidth`/`truncate`）生产环境选用宿主 `@earendil-works/pi-tui`（grapheme/宽字符正确，CJK/emoji 按 2 列），独立测试环境（无 pi-tui）fallback 到手写近似——pi-tui 只随宿主 bundle 提供；`selectWidthHelpers` 对宿主模块做结构检查，缺失或形状不符回退。

**Why:** `setStatus()` 无法控制 Footer 整体布局，`setFooter()` 才能稳定保留原生信息并放置 Profile。双布局引擎是同一 left/right 适配算法的近重复，差异仅在 ANSI 感知，统一后单一维护点；手写 `visibleWidth`/`truncate` 是 UTF-16 单元计数而非显示宽度，native 路径对含 CJK 的 Profile 名/路径每字符偏 1 列。

**Impact:** 宽度契约升级为显示宽度（含 ANSI 处理）：生产 CJK/emoji 填充正确，测试 fallback 行为逐字符保持；新增 `types/pi-tui.d.ts`（仅声明 `visibleWidth`/`truncateToWidth` 两个导出）；truncate 按显示宽度截断含 ANSI 文本（pi-tui 保留颜色，fallback 剥离后截断）。

**Rejected:** 仅纯统一不接 pi-tui（CJK 偏差保持现状）；接 pi-tui 其余导出（超出宽度助手范围）；全量替换手写实现（独立测试环境无法解析 pi-tui，测试会挂）。

**Out of Scope:** Native FooterComponent 直接构造（未文档公开的宿主内部 API）；其他 pi-tui 组件与 API 接入。

## D-022: Compiler-Kernel 分层与请求真实性

**Status:** active

**Decision:** enforcement pipeline 为 compiler → compiler-entry sealing boundary/verifier → Policy Kernel → host adapter。Compiler 只生成经过 brand 和 coverage 证明的 `CompleteAccessPlan` 或带 category 的 typed outcome，不接 Profile 或审批。Policy Kernel 是同步纯函数，只消费 compiler-entry 发行、verifier 验证的 plan 和 Profile，验证 authenticity（WeakSet issuance）后执行封闭 policy evaluation。

**Security invariants:**

- plan 只能由 `compiler-entry.ts` 私有 sealing boundary 发行：defensive-copy、deep-freeze 后加入进程级私有 WeakSet，不跨调用缓存或持久化；`isCompleteAccessPlan()` 是唯一公开完整性 predicate，`access-plan-verifier.ts` 只做无副作用的完整性与 budget proof。
- Kernel 不接收原始 Shell 或未验证 plan；compiler outcome 将 dynamic/unsafe/opaque/threat 分为 typed unsupported 或 security category，renderer 不通过 DecisionCode 反推 failure kind。
- coverage 逐项对应 command/redirection span 与 operation、顶层 cwd 与 path candidates 去重集合；effect 只以 `command.effects` 承载（verifier 隐含证明覆盖），并独立复核 `maxCommands`/`maxOperations`/`maxCwdCandidates`/`maxInputLength`。
- Effect policy axis 是封闭映射：`read/search/write/delete/permissionChange/cwdChange → path`，`execute/network → shell`；Shell 命令按 `commandClass` 决策，effects 只在 Direct-origin 操作被消费（shell-only effect 硬拒）。

**结构落地（plan/decision 两层 + 共享根）：**

- `gate/` 物理分两层 + 共享根：`gate/plan/`（编译器与验证：compiler-entry、shell/direct-tool compiler、preflight、access-plan-verifier 等）、`gate/decision/`（evaluate、evaluate-request、decision-builder、render-decision）、根留（`host`/`decision-types`/`decision-code-catalog`——被两层共用，避免循环依赖）。`gate/index.ts` 公共表面不变。
- gate 内部 import 边界：plan 组不引用 decision 组；decision 组单向引用 plan 组；共享根被两层引用且不依赖子组。若未来共享根依赖继续演化，重新评估共享根归属，不强行分层。
- Rejected：gate 强行分 compiler/kernel/render 三组——共享根被三组共用造成跨组循环，物理边界与依赖图不符（虚假分层）；删除既有 index 改全深层引用——与“目录边界单一入口”方向相反，且 path/gate/config 的 index 均被真实消费。

**Why:** 分层保证分析证据（request）和授权结果（GateDecision）不混淆；compiler 可独立证明 fail-closed 边界，Kernel 可独立证明 monotonic policy。

## D-023: 决策渲染与知情同意（静态 Guidance + literal form）

**Status:** active

**Decision:** 渲染层覆盖 deny 与 ask 两侧，均只消费静态产物、不生成可执行内容：

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

**Decision:** 不将内置 adapter 的分类规则迁移到声明式文件。用户全局 `config.yaml` 的 `commands` 段（D-041）是 Shell 命令扩展入口，支持别名映射、新命令定义和分类微调；Direct 工具继续由源码 `TOOL_SCHEMAS` 管理。

**格式：** 完整 schema 与带注释示例见 [README](../README.md#configuration) 的 Command Semantics Overrides 小节。

**解析顺序：** `commands 定义 → aliases 别名解析 → commands（别名目标）→ 内置 adapter → reclassify 覆盖`。

**作用域键：** 覆盖层键为显式作用域匹配——精确键优先（裸名或完整路径字符串，`./` 归一化对称生效），路径形式按最长路径前缀键匹配（键以 `/` 结尾）；**移除隐式 basename 回退**。别名目标可为 `commands` 定义（复用 class/effects/subcommands，reason 用原始调用名），alias 单步解析不链式；`reclassify` 按 basename 对齐 adapter 身份（路径形式下分类微调不静默失效）。

**加载：** 只读取用户全局 `~/.pi/agent/pi-keel/config.yaml` 的 `commands` 段（`PI_CODING_AGENT_DIR` 可改变 agent 目录）；TypeScript adapter 是内置权威来源。本配置不改变 Profile、PathPolicy、Gate、Shell IR 或 Direct/passthrough 行为。

**已知局限：** `reclassify` 的子命令提取（`fullSubcommand`）不跳过取值选项的值（如 `cargo --manifest-path Cargo.toml build` 得子命令 `"Cargo.toml build"`）；实际影响极小，pattern 用 substring 匹配即可规避，实现细节见 `adapters/shared.ts`。

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

- Candidate Record 是项目数据而非指令；文件存在、命令式措辞、`Review On` 或 `Trigger` 都不构成需求、优先级、路线图、当前事实、用户批准或实施授权。
- 只有用户在当前会话明确选择后，Candidate 才能迁移为 Task、Decision、Negative Space 等权威内容；迁移时移动 durable content 并在同一变更删除 C 来源，避免双源。
- `Review On` 是显式 context survey 使用的被动复审日期，不提供自动提醒、后台处理、Session hook、Footer 状态或到期默认动作。
- Candidate 文件按需创建，缺失不是结构错误。Task 完成后清空；Decision 被完整吸收（`superseded`）或主动退役（`retired`）后剪除；历史由 Git 保留，ID 不复用。Next-ID slots 机制（创建=填充占位并追加新占位、移除不动占位、占位缺失时按 Git 历史最大+1 重建）见 principles.md Project Records — Next-ID slots。
- Decision 离开只有两条路径：`superseded`（被完整吸收，内容延续）或 `retired`（能力撤销或移交外部，内容终止），去向就位后剪除。退役去向：完全撤销→残余耐用主张迁入 Negative Space；移交外部→归属边界记为窄边界决策或并入 CONTEXT。`superseded` 必须指向承接 D-xxx，`retired` 必须指向去向；退役不得硬标 `superseded`，不得保留为 active。终态一律原因命名并声明去向：Candidate `promoted/dismissed`、Task `cleared`、Decision `superseded/retired` → 剪除。
- `principles.md` 是 Project Record 分类与生命周期的唯一部署权威；`survey-context` 只报告 Candidate 为 not adopted 并等待用户选择，迁移由现有领域/计划/文档技能负责，不新增专用 review 技能。

**Why:** 候选、承诺、长期结论和当前事实权威等级不同：把候选写入 Task/Decision/CONTEXT 会让模型把“可能采用”误解为“应该执行”，自动提醒或专用工作流又把低概率候选升级为持续维护负担；统一协议与类型化容器在保留想法的同时让非采纳状态明确。容器原名 Future Record 命名自时间属性而本质是承诺属性，`future` 引导 roadmap 误读；改名时 future.md 为空、包未发布，故同步 C-xxx 前缀且不提供旧路径兼容读取。

**Impact:** `README.md` 是唯一用户使用入口；通用规则经 principles 注入，技能只实现各自职责。

**Rejected:** 不合并 C/T/D 到单一文件；不每记录独立文件；不采用 Proposed Decision；不新增 review 技能、Record Manager、到期提醒扩展或 slash command；不把 Candidate 当默认 backlog/roadmap；不为 `retired` 增加永久状态枚举或墓碑文件；不把外部移交所有权边界写入 traceability（所有权属决策，许可证归属才属 traceability）；不提供容器级迁移引导（自有格式需模型自动识别并跨格式校验，产生猜测与格式权威混用；识别负担属用户显式声明而非模型自动探测）。

**Out of Scope:**

- **容器级迁移引导机制**（自有决策寄存器、ADR、跟踪器、ideas/backlog 文档的用户项目）：不建专用 skill、不建声明/路由系统、不改 CONTEXT.md 契约。二元边界：标准路径容器由 pi-keel 管理；非标准体系由用户经 `AGENTS.md` 或显式会话指示声明，pi-keel 不自动识别、不写入。迁移非默认，仅用户显式选择时作为一次性 Task 走 Migration Protocol；不可读来源报告缺口并请求中央化进 CONTEXT.md，不盲猜。

## D-030: 提示词体系边界与原则部署（Prompt Surface）

**Status:** active

**Decision:** 提示词按注入面分层：`principles.md`（恒定注入，承载原则与唯一格式/规则来源）、`skills/`（按需加载，每个 skill 单一职责、调用时全量消费）、access-gate guidance（失败路径，保持原样不精简）。通用约束经“原则注入 + Quick Reference”部署。两条约束：① skill 单一职责——一个 skill 只做一件事，触发场景互斥的 skill 保持独立，不合并；② 格式/规则单一来源——只在 `principles.md` 参考节（Quick Reference / Project Records）定义一次，技能只文字引用（如 "per principles.md Project Records — Record Lifecycle"）、不重复定义格式和规则、不内嵌副本。

**Why:** 混合职责的 skill 调用时部分内容永远用不到，浪费 token、稀释注意力并使触发匹配模糊；内嵌格式副本在多个 skill 间漂移（survey-context 与 principles 的 Candidate Record 措辞已出现分歧）。用户项目中可稳定获得的渠道是会话注入内容和按需加载的技能；principles 每 session 恒定注入，格式放此处零额外注入成本，模型无需额外 read 即获权威定义——集中定义可以避免规则分叉和死链。

**Impact:** `principles.md` 是通用参考数据的唯一注入来源；不新建承载格式的 skill。

**Rejected:**

- **新建 `project-records` skill 承载格式**：指针引用依赖模型主动 read，可能被跳过且单次注入可能多于内嵌副本；格式与 principles 恒定注入面天然同层。
- **Quick Reference 下沉到各对应 skill**：破坏格式/规则单一来源，操作手册分散后失去恒定注入的零成本优势。

**Out of Scope:**

- **guidance 文本精简**：失败路径措辞精度要求最高。**dismiss（C-001，2026-08-08）**：压缩无法满足语义零损失且与总量无关——guidance 已是可执行判据，短句形态被否决，Direct 工具枚举（read/grep/find/ls）是模型无法从自身 tool schema 推导的 gate 支持子集，其余限定子句均为判据或安全祈使；增长哨兵前提随 dismiss 撤销。
- **合并触发场景互斥的 skill**（draft-spec→brainstorm-design、draft-tickets→plan-writing、grill-docs→grill-plan）：全量消费约束的必然推论——配对触发场景互斥，各自全量使用。Revisit when 实测两 skill 触发场景重合。
- **token 基线测量与提示词行为测试**：无法可靠操作化“理解认知”，用户不做额外验证。**dismiss（C-003，2026-08-08）**：遵守度问题实际出现一次——D-036 中 8 个 workflows skill 的 description 与 `disable-model-invocation` 矛盾，属结构矛盾而非 token 消耗；可操作化的测量是结构层行为测试（validate-skills 强制 `Use /skill:<name>` 开头 + 负向自检）；token 基线级测量维持拒绝。

## D-031: 路径可执行与 tsx 解释器归类

**Status:** active

**Decision:** 无 adapter 的路径形式可执行文件（executable 含 `/`：`./x`、`../x`、绝对路径、`scripts/x.sh`）分类为 `execute`（non-opaque）；`tsx` 作为语言运行时纳入 interpreter adapter（与 node/python 同规则：`--version`/`-v`/`--help` → inspect，其余 → execute）；无路径的裸名未知命令保持 `unknown`（non-opaque）。内置注册仅限两个封闭范畴：语言运行时（node/python/ruby/perl/tsx）与 POSIX 只读检查工具（od；判据：静态可证仅读输入→写 stdout，无 modify/execute/network/destroy 副作用）；两者都是静态可界属性，不构成“任意工具进内置”的先例。

**Why:** 同一操作（运行本地二进制）此前因拼写不同落入不同 Profile 决策——`npx tsx` 为 execute（plan deny/build allow），`./node_modules/.bin/tsx` 为 unknown（plan ask）——spelling-based 分类偏差。含 `/` 的裸词在 POSIX 下即文件路径，“运行二进制”是事实而非假设；裸名可能是 alias/函数/PATH 工具，静态分析无法确定语义，`unknown`→ask 是诚实分类与同意层，语义扩充权留给 D-024。

**Impact:** 脚本执行三形态（`npx tsx foo.ts`、`./node_modules/.bin/tsx foo.ts`、裸名 `tsx foo.ts`）全为 execute：keel-plan deny、keel-develop ask、keel-build allow；裸名无 adapter 命令保持 unknown（keel-plan ask）。版本探测有意不对称：`npx tsx --version` 为 execute（npx 语义＝下载+运行包），本地解释器 `tsx --version`/`./node_modules/.bin/tsx --version` 为 inspect（与 node/python 同规则）——门禁建模命令本身而非目标包。唯一放宽点是 keel-build（路径二进制 ask→allow，与 full-trust 语义一致）；keel-plan 对本地脚本收紧为 deny，符合其“execute 命令一律拒绝”意图。爆炸半径封闭（`analyzeSemantics` 唯一调用方 `shell-compiler.ts`）；不新增 path intent、不触碰 hard boundary、D-024 覆盖层优先级不变。

**Rejected:**

- **仅禁 `./node_modules/.bin/*`**：误伤 npm scripts 全部本地二进制，且不解决绝对路径与项目脚本。
- **为任意裸名工具新增内置 adapter（eslint/prettier/vitest → execute）**：whack-a-mole——execute 类工具运行任意代码，静态不可界，与 D-024（用户覆盖层是语义扩充唯一入口）冲突；封闭范畴例外仅限语言运行时与只读检查工具，不构成先例。
- **保持 unknown、仅改 guidance**：不消除 deny/ask 拼写分歧；**引入新 commandClass** 破坏 D-017/D-022 的封闭类集合与 effect axis；**按项目根判定**引入 cwd/path 上下文耦合，绝对路径与 `/usr/local/bin` 分类不一致。

**Out of Scope:**

- Windows `\` 路径（POSIX 语义）。
- 裸名经 PATH 到达的路径（unknown→ask 两次审批，非静默绕过）；裸名语义扩充属用户 `config.yaml`（D-024），只读检查封闭范畴（od）除外。
- 路径形式的 alias 匹配：覆盖层键为显式作用域（精确键 + 路径前缀键，D-024），路径形式需显式声明语义。
- PATH 解析与文件存在性探测：静态分类不做 filesystem 检查。

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

- **handoff-session 定位**（跨环境交接）：其唯一不可替代价值是“无本会话历史访问权的接收方”（非 pi 工具、跨机器/环境）获得状态摘要；同 pi 环境交接由 `/resume`/`/tree`（持久 session 全量恢复）与 `survey-context` 覆盖，摘要不增加保真度。原实现写 `$TMPDIR` 是缺陷：Linux `/tmp` 重启即清理、跨机器不可达，在唯一需要它的场景（跨环境）恰恰无法送达。重构：默认在会话中输出内容由用户交付（用户掌控持久性），显式指定路径时才写入；未沉淀决策不写入 handoff，先经 domain-modeling 入 `docs/decisions.md` 再引用路径（防双源，D-028）。**Revisit when** 出现需频繁跨工具交接的真实用户场景。

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

## D-039: 子代理档位制（pi-keel × pi-subagents）

**Status:** active

**Decision:** pi-keel 用**档位**（tier）抽象管理 pi-subagents 子代理会话的权限，共两档，差异仅在 Direct 写面（读均全盘、shellPolicy 两档一致）：

| 档位 | 档位名 | profile | Direct 写面 |
|---|---|---|---|
| T0 | `scratch` | `keel-explore`（复用主档） | 仅 `/tmp/pi-work/**`（不碰项目） |
| T1 | `project` | `keel-subagent-project` | `project/**` + `/tmp/pi-work/**` |

两档 shellPolicy 相同：inspect=allow，modify/execute/destroy/unknown=deny（bash 重定向写走路径策略）。bash 工具保留仅限 T1 档 agent；T0 档 agent 必须无 mutation 工具（bash/write/edit）——pi-subagents 输出契约机制强制（有则被指令自写 output，与 T0 路径策略矛盾），故 scout 删 write+bash、researcher 原生即无。`session_start` 检测 `PI_SUBAGENT_CHILD=1`/`PI_SUBAGENT_CHILD_AGENT`，按 agent 映射档位：worker/delegate/reviewer→`project`，scout/researcher/oracle/未知→`scratch`；`config.yaml` 的 `subagentProfiles`（agent 名→档位名，`"*"` 回退）覆盖，优先级 显式 > 内置 > `*`。父会话档位号经 `PI_KEEL_PARENT_TIER` env 传播（父侧按自身 pathPolicy 算好，子代理零解析）：父档位号 1 = pathPolicy 有写规则覆盖 `project/src`、`project/tests` 或 `project/`，否则 0；子代理生效档 = min(映射档, 父TIER)——“父非项目可写 → 一律回退 T0 scratch”。**子代理权限上限 = 父会话当前档位**。

**Why:**

- 子代理是非交互 `pi --mode json -p` 子进程且默认加载全局扩展，profile 是 session 内存态 → 子代理吃 `defaultProfile`（keel-plan）→ modify=ask 非交互硬 block、execute=deny → worker 无法实现与验证，scout/researcher 的 output 契约破裂；pi-subagents 原生 permissions 只有工具名粒度（write=allow 全盘写）、硬编码拒 bash、ask 走 watchdog 模型仲裁——补不了路径轴，也不能表达“bash 只读用法”。
- 委派提权原则：父会话窄档（keel-plan 不写 src）不应能委派出宽子代理；父档位即授权上限。
- 嵌套子代理单调：子代理内 pi-keel 将 clamp 后档位写回 env，孙代理 ≤ 子代理 ≤ 父会话。

**Impact:**

- 子代理 profile：T1 内置（`keel-subagent-project`）+ T0 复用主档 `keel-explore`（explore 含 `/tmp/pi-work/**` 写规则，D-049；shell+path 双轴）；`subagentProfiles` 覆盖键；`session_start` env 检测初始化；`PI_KEEL_PARENT_TIER` 传播 + 生效档 = min(映射档, 父TIER)。
- 用户侧配置：scout overrides 删 write+bash（剩只读集）；researcher 原生无 mutation 工具不动。
- 子代理内审核零设施：无 ask、无模型仲裁、无审计记录；deny + guidance → 经 `contact_supervisor` 升级 → 父会话人审（裁决 + git diff 后 commit）。
- 操作规则：委派实现工作需父会话处于项目可写档（keel-develop/keel-subagent-project/自定义可写档）；默认 keel-plan 下委派 = 子代理 T0 scratch。
- 未装 pi-subagents 时（env 缺失）零行为变化；env 缺失 fail-closed 回退 T0 scratch。
- `git.ts` 附带修复 `branch -m/-M` 分类缺口（子代理 deny 姿态下可被利用）。

**Rejected:**

- **纯原生方案（pi-keel 不进子代理，agent `extensions: []` + 原生 permissions）**：无路径级限制——write=allow 全盘（`.env`、`~/.ssh`、`.git/hooks` 可写，hooks 注入 = 供应链向量）；bash 无政策（裸奔或装 pi-guard）。拒绝。
- **删 bash 工具（全量）**：子代理失去 git inspect 与 shell 管道能力；5/6 内置 agent 原生设计含 bash。曾暂采纳后撤回。拒绝。（T0 档 agent 无 bash 系输出契约强制，见 Decision。）
- **统一 profile（非 per-agent）**：只读 agent 被授予项目写权；per-agent 差异只在路径轴。拒绝。
- **子代理内审核设施（审计 JSONL / watchdog 模型仲裁 ask）**：审核收敛到配置时声明 + 父会话人审，子代理内零设施。拒绝。
- **全量 profile 继承传播**：钳制用 env 快照（档位名）+ 档位比较即可，不做完整策略传输。拒绝。

**Out of Scope:**

- **staging scope scratch**（gate 自建 0700 目录的真隔离）：`/tmp/pi-work` 是约定非隔离（无 symlink 检查）；候选 C-008。
- **execute 档（T2）**（子代理可跑测试/构建）：execute=deny 冻结；若 prototype 证明 worker 验证摩擦不可接受再开；候选 C-009。
- **docs/CONTEXT.md 写保护**（durable 内容防中毒）：默认不做，靠父会话 git diff；用户可 config.yaml 自加规则；候选 C-010。
- **pi-guard 共存说明**：装了 pi-keel 不需 pi-guard（pi-keel 即官方期望的 bash guard 角色）；候选 C-011。
- **原生 permissions 默认配置**：工具表即工具层；原生 permissions 仅作角落能力（门控 passthrough 工具）。
- **profile 选择持久化**：`/profile` 仍 session 内存态；钳制用 env 快照而非全量传播。
- **worktree 隔离模式**（`worktree: true` 并行突变通道，用户显式选择）：子代理改动在独立 worktree，父会话 git diff 审核不适用；走原生 patch 捕获审查（capturedDiffs → 用户审 patch → 手动 `git apply`）。
- **子代理内审计设施**：不引入。

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

## D-041: 集中配置（config.yaml）

**Status:** active

**Decision:** 所有 pi-keel 用户配置集中到唯一文件 `~/.pi/agent/pi-keel/config.yaml`（`PI_CODING_AGENT_DIR` 可改变 agent 目录）：顶层为 `defaultProfile`/`profiles`/`subagentProfiles`（原 profiles.json，D-018/D-039）与 `commands`（原 command-overrides.yaml，D-024）。旧 `profiles.json`/`command-overrides.yaml` 已废弃且不兼容：config.yaml 是唯一配置来源，旧文件不再读取。

**Why:** 配置分散在两个文件、两个读取点、两份错误处理；集中单一文件统一 schema 与错误报告，同时保留命令覆盖层对用户本地工具语义的显式扩展能力。

**Impact:**

- `src/access-gate/config/` 是唯一配置加载入口（缓存 + 顶层结构校验）；profile/load 与 overrides 改为消费集中配置。
- 错误消息统一为 `pi-keel: ...` 前缀；解析失败/结构非法时响亮报错并 fail-closed 降级。
- 配置以 config.yaml 为唯一来源；旧 profiles.json/command-overrides.yaml 废弃，不兼容读取。
- 工具语义的扩展入口是 `commands`/`aliases`/`reclassify`；pi-keel 不再分发或加载可选工具 adapter。

**Rejected:** 兼容读取旧 profiles.json/command-overrides.yaml：双源真理违背集中单一入口原则，且保留旧文件让配置位置分裂。

**Out of Scope:**

- 命令覆盖层的语义范围与优先级，继续由 D-024 定义。
- 任意外部工具的内置语义建模；若未来需要，应先建立独立决策并提供完整的 token 级测试。

## D-044: 测试组织镜像 src 分层

**Status:** active

**Decision:** `tests/access-gate/` 按 `src/access-gate/` 子目录镜像分层（`plan/`、`decision/`、`command-semantics/`、`shell-parse/`、`profile/`、`path/`、`config/`、`session/`、`ui/`，有测试的目录才物化——当前 `security/` 无测试故无镜像目录；根层留扩展入口集成测试）；`package.json` 组脚本用目录 glob（`tests/<dir>/*.test.ts`）而非文件枚举；共享测试工具按消费者集合拆分归属（表格驱动 DSL → `command-semantics/`，通用 fixtures → `shared/`，extension harness 留根层）。文件粒度：超大测试文件可沿 src 概念边界拆分（shell-parse 已按 lexer/parser 二分），前提是有对齐边界且拆分不引入跨文件共享 setup；纯集成面大文件（command-overrides）保持单文件，体积是领域深度而非结构问题。`npm test` 的 `**` glob 由 node test runner 自行展开（node ≥21，引号包裹）。

**Why:** 平铺 40 个测试文件与 `src/` 的 10 个子目录是两张并行地图（模块→测试靠命名前缀猜）；`test:gate` 手写枚举 9 个文件，新增/改名内核测试必须同步编辑 `package.json`（shotgun surgery）；`helpers.ts` 混装 fixtures / 表格驱动 DSL / 编译器工具三责，且三者的消费者集合不相交（command-semantics 测试 vs gate/plan 测试），镜像后共享 helper 无处安放，拆分是镜像的必然推论。

**Impact:** 新增测试放镜像路径（模块→测试同路径导航）；组脚本永久稳定（目录 glob 对文件增删不敏感）；`helpers.ts` 拆三后 DSL 演进不再牵动 gate 侧 fixtures。

**Rejected:**

- 平铺 + 重命名文件成共享前缀再 glob 化：为 glob 而命名，加 git 历史噪音，locality 零提升。
- 删除全部组脚本只留全量：丢失开发迭代的快速反馈面（全量含 validate + tsc）。
- 镜像只到 `gate/` 一层（plan/decision 并入）：组=目录严格对齐但丢失 D-022 物理分层的测试可见性。

**Out of Scope:**

- 测试内容重构（用例、断言、覆盖范围）；本决策只定组织与脚本形态。
- 引入新测试框架；维持 node:test + tsx。

## D-045: cd 目标存在性与幻影 cwd 双候选建模

**Status:** active

**Decision:** 命令链内 cd 目标的存在性基于**分析时点**检查（`resolveCdTarget` 的 exists，statSync），并作为 cwd 候选建模的输入：目标存在 → 单候选（现状不变，certainty exact）；目标不存在且后继操作符为 `;`/`newline` → 候选集 = {目标} ∪ {cd 前 cwd}（certainty conservative）；目标不存在且后继为 `&&` → 保持单候选（`&&` 短路时旧 cwd 分支不存在，不虚构）。`resolveCdTarget` 移除永不触发的 null 联合，`filter` 接线 exists，`targets.length === 0 → opaque` 死分支删除（候选集恒非空不变量）。

**Why:** 原实现计算 exists（statSync）后从未消费——目标不存在时幻影 cwd 以 exact 置信度成为后继命令路径检查的唯一锚点，真实 cwd（cd 失败后命令实际执行处）从评估中消失。且 resolvePath 对不存在的 cwd 抛 realpathSync 失败 → 整个路径操作落 unclassifiable 硬拒：`cd /nope ; touch x` 被 path-unclassifiable 拒绝（错误拒因——命令真实行为是对项目写，不是「路径不可分类」），规则差异化路径（docs/ 等）的评估落点也随之错误。exists 是设计源头就计算的安全信号，本次恢复其消费，并配套 resolvePath 的词法回退（分析时点不存在的 cwd 是合法假设候选，非垃圾输入）。

**Impact:**

- 行为收紧：`;`/`newline` 链中 cd 到不存在的目录 → 后续命令路径在目标与 cd 前 cwd 双候选下评估（真实 cwd 侧写入被复查）；`&&` 链行为不变。
- `&&` 链对「不会运行的命令」的保守评估（过拒方向）为既有行为，保持不变。
- `cd -`/`pushd`/多参数/动态 token 的 opaque 拒绝不变。
- 新测试矩阵（约 7 条）锁定单/双候选切换、去重与 resolvePath 幻影 cwd 词法回退；既有 cd 断言全部存活（`&&` 后继保持单候选）。

**Rejected:**

- **严格拒绝（目标不存在 → opaque 整命令拒绝）**：误杀 `mkdir -p X && cd X && cmd` 合法形态（分析时 X 由链内命令创建）。拒绝。
- **朴素双候选（无条件并入 pre-cd）**：`&&` 链产生幽灵询问（cd 失败短路的虚构分支）。拒绝。
- **软丢弃（丢弃不存在目标只留旧 cwd）**：漏检「先建后 cd」时目标目录上的真实写（unsound）。拒绝。
- **保持现状（删 fs 保留幻影单候选）**：不修幻影硬拒与真实 cwd 排除。拒绝。

**Out of Scope:**

- TOCTOU：存在性基于分析时点，执行前目标被外部删除/创建不在保证范围（与既有 TOCTOU 立场一致）。
- `&&` 链「cd 失败则后继不评估」的精确短路建模：需前序命令写意图分析，过拒方向已可接受。
- 候选集规模：连续 `;` 链不同不存在目标 → 候选增长受 ANALYSIS_LIMITS.maxCwdCandidates（256）约束，超限 fail-closed。

## D-046: plan 验证收敛到 seal 边界（kernel 品牌检查）

**Status:** active

**Decision:** CompleteAccessPlan 的结构验证只在 seal 边界（compiler-entry finalize）运行一次；Policy Kernel（evaluate-request）改用 O(1) 品牌检查 hasPlanBrand（REQUEST_BRAND + ISSUED_PLANS WeakSet 成员），不再全量深验。validateCompleteAccessPlan 保留为公开 type guard 与测试 seam。

**Why:** 每次受管辖 tool_call 原双重完整验证（seal + kernel 各一遍）；「拒绝未发行 plan」契约由 WeakSet 成员判定承载（结构复制丢失成员即拒绝），深验在 kernel 边界冗余——brand 模块私有、finalize 是唯一构造点、deep-freeze 阻断变更。

**Impact:** 每受管辖 tool_call 少一次全量深验；copied-plan 拒绝契约不变（hasPlanBrand 含成员判定）；isCompleteAccessPlan 对外行为不变。

**Rejected:** **保持双重验证（kernel 独立信任闸）**：防御线只对「未来绕过 compileToolCall 的构造路径」有效，而该路径需摸到模块私有 WeakSet，结构性不可达。拒绝。

**Out of Scope:** verifier 拆分/裁剪；plan 类型形状变更。

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
- **配置编译进 ResolvedProfile（seal 式落点）**：ResolvedProfile 是配置数据，混入运行时资产破坏 D-041 数据/制品分离；glob 编译无安全契约，编译期报错收益落空，fixtures 全量迁移成本高。
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
- **程序化合成子代理档位**：把 T0/T1 从 profile 数据改为运行时合成，增加运行时复杂度并失去配置层可测试性（D-039）；本次用“复用主档”而非合成，避免该代价。

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

## D-051: 待创建
