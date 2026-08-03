# Pi Keel Decisions

本文集中记录 pi-keel 的长期架构、工程和安全决策。每条决策只保留当前结论、理由、必要的替代方案和影响；被后续决策完整吸收（`superseded`）或主动退役（`retired`）的条目从当前寄存器剪除，历史由 Git 保留。瞬态迁移与去向规则见 [D-028](#d-028-统一-project-record-模型)。

下一编号：`D-030`。删除条目后不复用历史 ID。

## D-001: Soft 技能匹配

**Status:** active

**Decision:** 技能适用时使用，但用户指令优先，不把技能描述为不可协商的强制规则。

**Why:** 强制措辞不能可靠改变模型行为，且可能阻断用户明确要求的更简单路径；清晰的 description 和 bootstrap 引导更适合 Pi 的用户控制模型。

**Rejected:** 不采用“匹配即必须执行”的硬性措辞。

## D-002: 统一 Access Gate

**Status:** active

**Decision:** 使用统一的 `src/access-gate/` 扩展集中处理 Profile、命令分类、路径策略、hard boundary 和审批。

**Why:** 多个安全扩展会产生拦截顺序竞争、重复审批、分散配置和难以关联的审计信息。

**Impact:** pi-keel 自行维护统一扩展，不自动继承社区扩展的独立更新。

## D-003: bigpowers 技能精选

**Status:** active

**Decision:** 只引入 bigpowers 中具有独特价值、且没有更合适替代品的技能。

**Why:** 整体引入会带入平台专用、重复、内部元工具和项目特定能力，增加加载与维护成本。

**Impact:** 不提供自动生命周期编排，由 bootstrap、技能匹配和 `survey-context` 协同完成。

## D-004: 用户态路径策略边界

**Status:** active

**Decision:** pi-keel 提供 command classification、canonical path policy、Profile access gate 和 hard boundary，不提供或假定 OS-level isolation。

**Why:** Node.js 路径检查没有 kernel-level enforcement；将其称为 sandbox 会造成安全承诺与真实边界不一致。

**Out of Scope:** OS sandbox、容器、VM、seccomp、Landlock、network namespace 和其他 kernel-level isolation。

## D-005: 技能三目录

**Status:** active

**Decision:** 技能按加载方式分为 `foundations/`、`disciplines/` 和 `workflows/`。

**Why:** 目录名直接表达技能何时生效，比按领域或生命周期阶段组织更符合实际加载机制。

## D-006: 统一命名

**Status:** active

**Decision:** Foundations 使用简短描述名，Disciplines 使用名词短语，Workflows 使用动词-名词；复合名称使用 kebab-case，避免非必要缩写和人物名。

**Why:** 名称需要帮助模型和维护者推断用途、加载机制和技能职责。

## D-009: 项目分发与文档边界

**Status:** active

**Decision:** `README.md` 是唯一用户使用入口；移除平行的 `USAGE.md`、不必要的 npm 元数据和用户 `AGENTS.md` 模板。长期架构、安全、溯源和 Project Record 文档按职责保留在 `docs/`。

**Why:** 每个文件都应有明确的维护对象和用户价值；重复的使用、架构、安全和工作流说明会漂移，pi-keel 也不应越过用户项目工程约定文件的所有权边界。

## D-013: 原则部署

**Status:** active

**Decision:** 使用“原则注入 + Quick Reference”部署通用约束；技能只引用权威内容，不重复定义格式和规则。

**Why:** 用户项目中可稳定获得的渠道是会话注入内容和按需加载的技能，集中定义可以避免规则分叉和死链。

**Impact:** `principles.md` 是通用参考数据的唯一注入来源；用户项目使用 `CONTEXT.md`、可选的 `docs/future.md`、`docs/decisions.md` 和 `docs/task.md`。

## D-017: Profile 访问策略

**Status:** active

**Decision:** 命名 Profile 是唯一用户权限入口，分别配置 Shell 决策和 `read`、`list`、`search`、`write` 四类路径策略。

**Rules:**

- Shell 命令分类为 `inspect`、`modify`、`execute`、`destroy`、`unknown`。
- 路径规则按声明顺序 per-operation first-match。
- `blockedPaths`、威胁模式、unsafe syntax 和 symlink escape 是不可覆盖的 hard deny。
- `ask` 只提供 `Allow once` 和 `Deny`，不跨调用或 Session 持久化。
- 每次 Session 从配置的 `defaultProfile` 开始，不继承其他 Session 的临时 Profile。
- 配置只分内置与用户全局两层：按内置、用户全局顺序合并，全局同名 Profile 替换内置定义。用户全局配置位于 `~/.pi/agent/pi-keel/profiles.json`（`PI_CODING_AGENT_DIR` 可改变 agent 目录）。
- 全局配置无效时保留内置 Profiles，并将当前 Session 默认项收紧为 `keel-read`。

## D-018: Shell IR 与 Access Gate

**Status:** active

**Decision:** 采用 `shell-parse/`、`command-semantics/`、`gate/` 三层架构，以不可执行的 Shell IR 传递结构化结果。Shell 文件修改与其他路径操作使用同一套 hard boundary、canonical path policy 和 Profile gate。

**Why:** `write`/`edit` 工具保护无法覆盖重定向、`tee`、`cp`、`mv` 等 Shell 写入入口，secret-pattern scan 也不承担访问控制职责；统一 IR 和语义层可以集中提取命令类别、路径 intent 与 effect，避免分类和策略漂移。

**Security invariants:**

- blocked intent hard deny，不能由 Profile 或 `Allow once` 覆盖。
- 只有所有语法节点和 effect 都被安全解释时才可 allow。
- wrapper 必须保留底层命令 intent。
- modify 命令的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- 无法确定分支 cwd 时不得 allow。
- 一个 tool call 的所有 ask intent 聚合为一次审批。

**Enforcement scope:**

只对 Pi `tool_call` 中的 `bash` 和 `TOOL_SCHEMAS` 已知 Direct surface 执行策略；未知 Direct surface passthrough。它不承诺全局 enforcement，`user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 和后续 handler 对 input 的修改不在范围内。

## D-019: 两行 Profile Footer

**Status:** active

**Decision:** TUI 使用 `setFooter()` 包装 Pi 原生 Footer，固定渲染两行；第一行显示位置、Session 和 Profile，第二行保留原生运行统计和扩展状态；Pi 主包不可用时使用本地 fallback。

**Why:** `setStatus()` 无法控制 Footer 整体布局，`setFooter()` 才能稳定保留原生信息并放置 Profile。

## D-022: Compiler-Kernel 分层与请求真实性

**Status:** active

**Decision:** Access Gate 的 enforcement pipeline 为 compiler → compiler-entry sealing boundary/verifier → Policy Kernel → host adapter。Compiler 只生成经过 brand 和 coverage 证明的 `CompleteAccessPlan`，或带明确 category 的 typed compilation outcome，不接 Profile 或审批。Policy Kernel 是同步纯函数，只消费 compiler-entry 发行、verifier 验证的 plan 和 Profile，验证其 authenticity（WeakSet issuance）后执行封闭 policy evaluation。

**Why:** 分层保证分析证据（request）和授权结果（GateDecision）不混淆；compiler 可以独立证明 fail-closed 边界，Kernel 可以独立证明 monotonic policy。

**Security invariants:**

- 每个 plan 由 `compiler-entry.ts` 的私有 sealing boundary defensive-copy、deep-freeze 后加入私有 WeakSet；只有官方 compiler entry 能发行 plan，`access-plan-verifier.ts` 只负责无副作用的完整性和 budget proof，`isCompleteAccessPlan()` 是唯一公开完整性 predicate。
- Kernel 不接收原始 Shell，也不接收未验证的 plan；compiler outcome 将 dynamic/unsafe/opaque/threat 分为 typed unsupported 或 security category，host renderer 不再通过 DecisionCode 反推 compiler failure kind。
- coverage 必须逐项对应：command/redirection/effect span 与 operation、顶层 cwd candidates 与 path candidates 去重集合；verifier 独立复核 `maxCommands`、`maxOperations`、`maxCwdCandidates` 和 `maxInputLength`。
- Effect policy axis 是封闭映射：`read/search/write/delete/permissionChange/cwdChange → path`，`execute/network → shell`。

## D-023: 拒绝解释与静态 Guidance

**Status:** active

**Decision:** 拒绝结果的 guidance 只能引用源码内置的静态 `GuidanceId` catalog，不能拼接可执行 Shell、原始 glob 或用户输入。`renderDecision()` 处理 Policy Kernel 的 `GateDecision`，`renderCompilationFailure()` 处理 typed compiler outcome；两者都执行 evidence redact 和长度预算。

**Why:** guidance 不能成为间接 code injection 通道；blocked path/threat 不提供绕过建议；evidence 脱敏防止拒绝原因泄露敏感路径。guidance 文本必须给出可验证判据（如 literal 定义的动态字符集合），且不得建议 LLM 无法自行完成的动作：切换 Profile 只能由用户进行，profile 类 deny 不触发审批弹窗，因此指引改为请求用户更新或批准。

**Guidance mapping:**

| DecisionCode | GuidanceId |
|---|---|
| `dynamic-shell` | `batch-inspection-tools` |
| `opaque-command` | `literal-command-or-direct-tool` |
| `unsafe-syntax` | `split-supported-commands` |
| `unsupported-redirection` | `split-supported-commands` |
| `uncertain-cwd` | `literal-command-or-direct-tool` |
| `shell-policy-denied` | `profile-restriction` |
| `unknown-tool` | `check-tool-input` |
| `invalid-tool-input` | `check-tool-input` |
| 其他 deny code | 无（避免诱导绕过）|

**Redaction rules:** renderer 仅对 deny 决策执行 sensitive prefix 脱敏（`~/.ssh`、`/home/`、`.env` 等），ask 决策保留完整 evidence 供用户审批判断。

## D-024: 命令覆盖层

**Status:** active

**Decision:** 不将内置 adapter 的分类规则迁移到声明式文件。提供用户全局 `command-overrides.yaml` 作为 Shell 命令扩展入口，支持别名映射、新命令定义和分类微调。Direct 工具继续由源码 `TOOL_SCHEMAS` 管理。


**Why:**
- Shell adapter 的分类、路径提取和效果推断共享同一趟参数解析——三者是同一个分析的输出，不是可拆分的"数据"和"逻辑"。强行拆分会造成 YAML 和 TS 描述同一命令的双源真理问题。
- 内置命令分类是权威语义知识；覆盖层用于用户主动补充本机 Shell 命令语义。
- 命令语义只由内置 adapter 与用户全局 `command-overrides.yaml` 定义，仓库内容不是语义来源。
- Direct 工具需要精确参数 schema、路径字段和 effect 证明，继续通过源码和测试扩展，不开放 YAML schema。

**格式：**

```yaml
# ~/.pi/agent/pi-keel/command-overrides.yaml（可选）

# 别名：让未知命令复用已知 adapter 的完整语义分析
# 路径提取、效果推断和子命令解析全部沿用目标 adapter 的逻辑
aliases:
  fd: find
  bat: cat
  exa: ls
  just: make

# 新命令定义：为没有对应 adapter 的命令提供声明式分类
# 适合只需分类、不需要路径提取的简单命令
commands:
  docker:
    class: execute
    effects: [execute, network]
    subcommands:
      ps: { class: inspect, effects: [read] }
      images: { class: inspect, effects: [read] }
      build: { class: execute, effects: [write, network] }

# 分类微调：修改内置 adapter 的分类结果
# pattern 是正则，匹配完整的子命令字符串（从第一个非选项参数起，空格连接）
reclassify:
  - command: git
    pattern: "branch -[dD]"
    class: destroy
```

**查找顺序：** `commands 定义 → aliases 别名解析 → 内置 adapter → reclassify 覆盖`。

**加载：** 只读取用户全局 `~/.pi/agent/pi-keel/command-overrides.yaml`（`PI_CODING_AGENT_DIR` 可改变 agent 目录）。TypeScript adapter 是内置权威来源。

**影响：**
- 内置 adapter 结构和测试不受影响
- 不改变 Profile、PathPolicy、Gate 或 Shell IR
- Direct 工具和未知 Direct tool passthrough 行为不由本配置改变
- 全局 YAML 可以按名称定义或覆盖 Shell 命令语义；同名时 commands 段优先，reclassify 在 adapter 返回后覆盖
- 别名节点替换 executable 名称后传给目标 adapter，adapter 按目标命令规则执行完整分析（含路径提取）

**已知局限：**
- `reclassify` 的子命令提取（`fullSubcommand`）不跳过取值选项的值。例如 `cargo --manifest-path Cargo.toml build` 产生的子命令是 `"Cargo.toml build"` 而非 `"build"`。这是因为 `fullSubcommand` 不依赖 per-adapter 的 `valueOpts` 配置。实际影响极小：reclassify 的 pattern 使用 substring 匹配（`"build"` 而非 `"^build$"`），且典型场景（如 git 子命令重分类）不存在此问题。详见 `overrides.ts` 中 `fullSubcommand` 的注释。

## D-025: Direct 优先与 Shell 安全子集

**Status:** active

**Decision:** 文件检查场景优先选择 Direct `read`、`grep`、`find`、`ls` 工具，但不因为存在 Direct 等价入口而全局禁用 Shell 命令。字面且能完成路径和效果分析的 Shell inspect 命令继续经过 Profile 和 PathPolicy；只有无法安全建模的 Shell 语法以及明确的安全风险才 hard deny。

**Why:** Direct 工具提供结构化参数和更窄的访问面，适合作为模型默认选择；Shell 仍承载 pipeline、命令特有选项和组合语义。按命令名禁用会把工具选择问题错误地变成能力禁止，并破坏合法的组合操作。

**Deny feedback:** dynamic、unsafe、opaque 和 unsupported 语法的拒绝必须说明“当前 Shell 形式不能批准”，并指向 Direct 工具或更简单的字面命令。threat、blocked path、symlink escape、destroy 和 hard command rule 等不可覆盖边界必须说明不可绕过，不能提供替代执行建议。两类 guidance 都只能使用静态 catalog 文本。compiler outcome 使用封闭 category，并直接进入 host renderer；不通过 DecisionCode 反推失败类型。

**Rejected:** 不采用“Direct 存在即禁用 Shell”等价命令；不把 Direct 工具作为 Shell gate 的绕过路径；不在本决策中实现 Shell glob 的安全展开。

**Current implementation:** Direct-first 当前是 `principles.md` 中的模型工具选择偏好，不是 host 层自动路由或 Policy Kernel 的强制优先级。安全可分析的字面 Shell 仍然允许。compiler 使用 `CompilationCategory` 和 category-specific code union 区分 unsupported form、security block 和 invalid request；完整计划由 `access-plan-verifier.ts` 验证。

## D-026: 本地约束与溯源文档边界

**Status:** active

**Decision:** `AGENTS.md` 只定义 pi-keel 自身的维护入口和仓库约定，不复制注入原则、Task 生命周期或当前架构。它随仓库提交并只影响仓库内开发会话。`docs/traceability.md` 只记录外部来源、采用方式、当前文件映射和许可证义务；当前架构、安全边界和长期取舍分别由 `CONTEXT.md`、`docs/security-boundaries.md` 和本决策寄存器维护。

**Why:** 同一规则或行为在多个长期文档中重复描述会产生漂移。溯源文件只有在来源、revision、采用范围和许可证证据可核查时才具有合规价值；运行时行为和融合取舍放入其中会把它变成第二份架构与决策文档。

**Impact:** 修改运行时行为不再自动更新 `docs/traceability.md`；只有第三方来源映射或许可证义务变化时才更新。新增或同步外部内容必须记录固定的上游 commit 或 release。

**Rejected:** 不保留按当前模块罗列“来源 + 融合决策”的架构摘要，也不使用主观原创占比作为合规证据。

**Out of Scope:**

- **恢复初始引入的精确上游 revision**: 本地提交 `2f4a3ef` 未保存这些 revision，现有 Git 历史无法可靠还原。仅在获得可验证的历史快照或导入元数据时补录。

## D-027: 选项值按性质分类（expression vs file）

**Status:** active

**Decision:** `text-transform` 适配器的取值选项按值性质分类：`file`（值是一个文件路径，产生 read/write 路径 intent）和 `expression`（值是程序/表达式，值被消费但不产生路径 intent）。`sed -e`/`--expression`、`awk -e` 归为 `expression`；`sed -f`/`--file`、`awk -f` 归为 `file`。支持 inline 后缀形式（`sed -i.bak`、`--in-place=.bak`），视为与 `-i`/`--in-place` 相同的 conservative write intent 且不降级为 opaque。

**Why:** `sed -e 's/foo/bar/' file` 的表达式不是文件；把它当 read 路径 intent 会把表达式字符串交给 PathPolicy 做路径检查，产生无意义的拦截。`sed -i.bak` 是 macOS 常见用法，此前因未知选项被整体 opaque 拒绝。区分值性质保留 `-f` 脚本文件的真实路径检查，同时不再把表达式误判为路径。位置参数是输入文件，必须产生路径 intent——此前 sed/awk/sort/uniq 的 positional 完全被忽略，`sed 's/x/y/' /etc/passwd` 等命令不产生任何路径检查，PathPolicy 被整体绕过。

**Rejected:** 不把 `-e` 移除出 schema（会导致 opaque 降级）；不为每个取值选项创建独立 adapter；不把 awk `-i`（gawk include 与 in-place 语义冲突）纳入本次修复——保持 fail-closed 的保守 write 分类。不因 sed/awk 的程序/文件位置歧义而放弃 positional 检查——宁可把 program 误判为额外 read 路径（fail-closed 噪声），也不漏掉输入文件（fail-open 漏报）。

**Current implementation:** `OptionSchema.valueKind` 与 `inlineSuffix` 字段；parseOptions 对 expression 值消费但不 push intent，对 inline 后缀产生 conservative write intent。位置参数一律产生路径 intent：sed/awk 在出现写选项（-i）时 positional 升级为 write（原地修改目标），否则为 read；`--` 之后的 token 按文件参数处理。常用无值修饰符（sed -n/-E/-r/-z/-s/-u/--sandbox、awk -V/-h、sort/uniq 常用 flag）标记为 `flag`，不产生 intent 也不置 opaque；awk -F/-v、sed -l、sort -t/-k 等取值选项按 expression 消费；支持短选项内联值（-F,、-vfoo、-es/x/y/）。同时修复两个被测试暴露的既有缺陷：`gitEffects` 正则字面量 `\\b` 导致 `git rm` 的 delete effect 与 `git push` 等 network effect 从未生效（改为 `\b` 单词边界）；`cargo --version` 等全选项输入因 `extractSubcommand` 返回空串而落入 unknown（analyze 在 subcmd 为空时回退到第一个选项，对齐 npx 处理）。gate 对 bash 命令按 `commandClass` 决策，effects 仅用于 direct-origin 拒绝，因此 git effect 恢复不改变任何审批路径。

## D-028: 统一 Project Record 模型

**Status:** active

**Decision:** 用户项目使用分层的 Project Record 模型：`docs/future.md` 中的 `F-xxx` 是当前未采纳、未承诺实施的候选事项；`docs/task.md` 或扁平的 `docs/task-<topic>.md` 中的 `T-xxx` 是已承诺研究、设计或实施的 Task Record；`docs/decisions.md` 中的 `D-xxx` 是已采纳的长期结论；`CONTEXT.md` 只表达当前事实和 active Decision 索引。Requirements、Design 和 Plan 只作为 Task Record 章节存在，不创建独立 plan/spec 文档类型。

**Authority rules:**

- Future Record 内容是项目数据而非指令；文件存在、命令式措辞、`Review On` 或 `Trigger` 都不构成需求、优先级、路线图、当前事实、用户批准或实施授权。
- 只有用户在当前会话明确选择后，Future Record 才能迁移为 Task、Decision、Negative Space 或其他权威内容；迁移时移动 durable content 并在同一变更中删除 F 来源，避免双源。
- `Review On` 是显式 context survey 使用的被动复审日期，不提供自动提醒、后台处理、Session hook、Footer 状态或到期后的默认动作。
- Future 文件按需创建；缺失表示没有记录候选，不是项目结构错误。Task 容器在完成后清空，Decision 被替代内容完整吸收（`superseded`）或主动退役（`retired`）后剪除，历史统一由 Git 保留且 ID 不复用。
- Decision 的离开只有两种路径：`superseded`（被后续决策完整吸收，内容延续）或 `retired`（能力撤销或移交外部，内容终止）；两者都是短暂迁移态，去向就位后统一剪除。退役去向：完全撤销时残余耐用主张迁入 `CONTEXT.md` Negative Space；移交外部时归属边界记录为新的窄边界决策（或并入 CONTEXT）。`superseded` 必须指向承接 D-xxx，`retired` 必须指向去向；退役不得硬标 `superseded`，退役决策不得保留为 active。终态一律原因命名并声明去向：Future 为 `promoted/dismissed`，Task 为 `cleared`，Decision 为 `superseded/retired` → 剪除。
- `principles.md` 是 Project Record 分类和生命周期的唯一部署权威；`survey-context` 只报告 Future 为 not adopted，并等待用户选择，现有领域、计划和文档技能负责迁移，不新增专用 review 技能。

**Why:** 候选、承诺工作、长期结论和当前事实具有不同权威等级。把候选写入 Task、Decision 或 CONTEXT 会让模型把“可能采用”误解为“应该执行”；为 Future 增加自动提醒或专用工作流又会把低概率候选升级为持续维护负担。统一协议和类型化容器可以保留想法，同时让非采纳状态在读取后仍然明确。

**Impact:** 本决策完整吸收原 D-021 的 Task Record 术语和结构，以及原 D-029 的 Decision 退役路径与统一终态命名；原条目从当前寄存器移除，Git 保留历史。`README.md` 是唯一用户使用入口；Project Record 的通用规则通过 principles 注入，技能只实现各自职责。

**Rejected:** 不把 F/T/D 合并到单一记录文件；不为每条记录创建独立文件；不采用 Proposed Decision 表达未承诺候选；不新增 `review-records` 技能、Record Manager、到期提醒扩展或 slash command；不把 Future Record 当作默认 backlog 或 roadmap；不为 `retired` 增加永久状态枚举或墓碑文件；不把外部移交的所有权边界写入 traceability（所有权边界属于决策，许可证归属才属于 traceability）。

