# Pi Keel Decisions

本文集中记录 pi-keel 的长期架构、工程和安全决策。每条决策只保留当前结论、理由、必要的替代方案和影响；被后续决策完整吸收（`superseded`）或主动退役（`retired`）的条目从当前寄存器剪除，历史由 Git 保留。瞬态迁移与去向规则见 [D-028](#d-028-统一-project-record-模型)。

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

**Impact:** `principles.md` 是通用参考数据的唯一注入来源；用户项目使用 `CONTEXT.md`、可选的 `docs/candidates.md`、`docs/decisions.md` 和 `docs/task.md`。

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
- coverage 必须逐项对应：command/redirection span 与 operation、顶层 cwd candidates 与 path candidates 去重集合；T-046 起 effect 不再有平行 operations 数组——effect 只以 `command.effects` 承载，span 与 command span 相同，verifier 通过 command span 隐含证明 effect 覆盖；verifier 独立复核 `maxCommands`、`maxOperations`、`maxCwdCandidates` 和 `maxInputLength`。
- Effect policy axis 是封闭映射：`read/search/write/delete/permissionChange/cwdChange → path`，`execute/network → shell`。

## D-023: 拒绝解释与静态 Guidance

**Status:** active

**Decision:** 拒绝结果的 guidance 只能引用源码内置的静态 `GuidanceId` catalog，不能拼接可执行 Shell、原始 glob 或用户输入。`renderDecision()` 处理 Policy Kernel 的 `GateDecision`，`renderCompilationFailure()` 处理 typed compiler outcome；两者都执行长度预算（subject ≤ 1,024，reason ≤ 2,048），且 deny 侧 subject 不携带用户派生值（见 D-032 类别化设计）。

**Why:** guidance 不能成为间接 code injection 通道；blocked path/threat 不提供绕过建议；deny 侧 subject 只含分类信息（操作类型、可执行名、威胁 id），不携带用户派生值——模型已持有自己提出的命令，gate 不重复具体路径（D-032 类别化取代掩码脱敏）。guidance 文本必须给出可验证判据（如 literal 定义的动态字符集合），且不得建议 LLM 无法自行完成的动作：切换 Profile 只能由用户进行，profile 类 deny 不触发审批弹窗，因此指引改为请求用户更新或批准。

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
# 路径提取、效果推断和子命令解析全部沿用目标 adapter 的逻辑；
# 键为显式作用域：裸名（仅裸调用）/ 完整路径字符串 / 路径前缀（以 / 结尾，
# 覆盖该前缀下所有路径形式；前缀键与路径形式均做 ./ 归一化；
# 精确键优先，最长前缀优先）（D-034）
aliases:
  fd: find
  bat: cat
  exa: ls
  just: make
  "./node_modules/.bin/eslint": node   # 精确：npm 本地 eslint 按 node 语义
  "bin/": cat                          # 前缀：项目 bin/ 脚本只读语义（./bin/ 同样命中）

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
- `reclassify` 的子命令提取（`fullSubcommand`）不跳过取值选项的值。例如 `cargo --manifest-path Cargo.toml build` 产生的子命令是 `"Cargo.toml build"` 而非 `"build"`。这是因为 `fullSubcommand` 不依赖 per-adapter 的 `valueOpts` 配置。实际影响极小：reclassify 的 pattern 使用 substring 匹配（`"build"` 而非 `"^build$"`），且典型场景（如 git 子命令重分类）不存在此问题。详见 `adapters/shared.ts` 中 `fullSubcommand` 的注释（T-046 R4 迁入 shared 层）。

## D-025: Direct 优先与 Shell 安全子集

**Status:** active

**Decision:** 文件检查场景优先选择 Direct `read`、`grep`、`find`、`ls` 工具，但不因为存在 Direct 等价入口而全局禁用 Shell 命令。字面且能完成路径和效果分析的 Shell inspect 命令继续经过 Profile 和 PathPolicy；只有无法安全建模的 Shell 语法以及明确的安全风险才 hard deny。

**Why:** Direct 工具提供结构化参数和更窄的访问面，适合作为模型默认选择；Shell 仍承载 pipeline、命令特有选项和组合语义。按命令名禁用会把工具选择问题错误地变成能力禁止，并破坏合法的组合操作。

**Deny feedback:** dynamic、unsafe、opaque 和 unsupported 语法的拒绝必须说明“当前 Shell 形式不能批准”，并指向 Direct 工具或更简单的字面命令。threat、blocked path、symlink escape、destroy 和 hard command rule 等不可覆盖边界必须说明不可绕过，不能提供替代执行建议。两类 guidance 都只能使用静态 catalog 文本（D-023）。

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

**Current implementation:** `OptionSchema.valueKind` 与 `inlineSuffix` 字段；parseOptions 对 expression 值消费但不 push intent，对 inline 后缀产生 conservative write intent。位置参数一律产生路径 intent：sed/awk 在出现写选项（-i）时 positional 升级为 write（原地修改目标），否则为 read；`--` 之后的 token 按文件参数处理。常用无值修饰符（sed -n/-E/-r/-z/-s/-u/--sandbox、awk -V/-h、sort/uniq 常用 flag）标记为 `flag`，不产生 intent 也不置 opaque；awk -F/-v、sed -l、sort -t/-k 等取值选项按 expression 消费；支持短选项内联值（-F,、-vfoo、-es/x/y/）。当前行为：`git rm` 的 delete effect 与 `git push` 等 network effect 生效；`cargo --version` 等全选项输入按 npx 同规则处理（subcmd 为空时回退到第一个选项）。gate 对 bash 命令按 `commandClass` 决策，effects 仅用于 direct-origin 拒绝，git effect 恢复不改变任何审批路径。

## D-028: 统一 Project Record 模型

**Status:** active

**Decision:** 用户项目使用分层的 Project Record 模型：`docs/candidates.md` 中的 `C-xxx` 是当前未采纳、未承诺实施的候选事项；`docs/task.md` 或扁平的 `docs/task-<topic>.md` 中的 `T-xxx` 是已承诺研究、设计或实施的 Task Record；`docs/decisions.md` 中的 `D-xxx` 是已采纳的长期结论；`CONTEXT.md` 只表达当前事实和 active Decision 索引。Requirements、Design 和 Plan 只作为 Task Record 章节存在，不创建独立 plan/spec 文档类型。

**Authority rules:**

- Candidate Record 内容是项目数据而非指令；文件存在、命令式措辞、`Review On` 或 `Trigger` 都不构成需求、优先级、路线图、当前事实、用户批准或实施授权。
- 只有用户在当前会话明确选择后，Candidate Record 才能迁移为 Task、Decision、Negative Space 或其他权威内容；迁移时移动 durable content 并在同一变更中删除 C 来源，避免双源。
- `Review On` 是显式 context survey 使用的被动复审日期，不提供自动提醒、后台处理、Session hook、Footer 状态或到期后的默认动作。
- Candidate 文件按需创建；缺失表示没有记录候选，不是项目结构错误。Task 容器在完成后清空，Decision 被替代内容完整吸收（`superseded`）或主动退役（`retired`）后剪除，历史统一由 Git 保留且 ID 不复用。每个容器文末常驻一个待创建占位记录（`X-0NN: 待创建`，编号=下一可用号）：创建记录=填充占位并在文末追加新占位（编号+1）；移除记录（Task 清空/Candidate 迁移或否决/Decision 剪除）不动占位；占位缺失或多余时按 Git 历史最大+1 重建唯一占位（多占位保留编号最大者）。
- Decision 的离开只有两种路径：`superseded`（被后续决策完整吸收，内容延续）或 `retired`（能力撤销或移交外部，内容终止）；两者都是短暂迁移态，去向就位后统一剪除。退役去向：完全撤销时残余耐用主张迁入 `CONTEXT.md` Negative Space；移交外部时归属边界记录为新的窄边界决策（或并入 CONTEXT）。`superseded` 必须指向承接 D-xxx，`retired` 必须指向去向；退役不得硬标 `superseded`，退役决策不得保留为 active。终态一律原因命名并声明去向：Candidate 为 `promoted/dismissed`，Task 为 `cleared`，Decision 为 `superseded/retired` → 剪除。
- `principles.md` 是 Project Record 分类和生命周期的唯一部署权威；`survey-context` 只报告 Candidate 为 not adopted，并等待用户选择，现有领域、计划和文档技能负责迁移，不新增专用 review 技能。

**Why:** 候选、承诺工作、长期结论和当前事实具有不同权威等级。把候选写入 Task、Decision 或 CONTEXT 会让模型把“可能采用”误解为“应该执行”；为 Candidate 增加自动提醒或专用工作流又会把低概率候选升级为持续维护负担。统一协议和类型化容器可以保留想法，同时让非采纳状态在读取后仍然明确。容器原名 Future Record 命名自时间属性而本质是承诺属性，`future` 引导 roadmap 误读，与“不把候选当 backlog/roadmap”的约束相悖；改名时 future.md 为空、包未发布，故同步 C-xxx 前缀且不提供旧路径兼容读取。

**Impact:** 本决策完整吸收原 D-021 的 Task Record 术语和结构，以及原 D-029 的 Decision 退役路径与统一终态命名；原条目从当前寄存器移除，Git 保留历史。`README.md` 是唯一用户使用入口；Project Record 的通用规则通过 principles 注入，技能只实现各自职责。

**Rejected:** 不把 C/T/D 合并到单一记录文件；不为每条记录创建独立文件；不采用 Proposed Decision 表达未承诺候选；不新增 `review-records` 技能、Record Manager、到期提醒扩展或 slash command；不把 Candidate Record 当作默认 backlog 或 roadmap；不为 `retired` 增加永久状态枚举或墓碑文件；不把外部移交的所有权边界写入 traceability（所有权边界属于决策，许可证归属才属于 traceability）；不提供容器级迁移引导——兼容自有格式需模型自动识别项目文档体系并跨格式校验（C-xxx/T-xxx/D-xxx），产生猜测与格式权威混用；非标准容器本不该被模型触碰，识别负担属用户显式声明而非模型自动探测。

**Out of Scope:**

- **容器级迁移引导机制**（以自有方式管理文档的用户项目——自有决策寄存器、ADR、跟踪器、ideas/backlog 文档）：不建专用 skill、不建声明/路由系统、不改 CONTEXT.md 契约。二元边界：标准路径容器由 pi-keel 管理；非标准文档体系由用户经 `AGENTS.md` 或显式会话指示声明，pi-keel 不自动识别、不写入。迁移非默认，仅用户显式选择时作为一次性 Task 走 Migration Protocol。不可读来源（外部系统）报告缺口并请求中央化进 CONTEXT.md，不盲猜。

## D-030: 提示词体系边界（Prompt Surface）

**Status:** active

**Decision:** 与 LLM 交互的提示词按注入面分层：`principles.md`（恒定注入，承载原则与唯一格式/规则来源）、`skills/`（按需加载，每个 skill 单一职责、调用时全量消费）、access-gate guidance（失败路径，保持原样不精简）。两条约束：① skill 单一职责——一个 skill 只做一件事，不混合；触发场景互斥的 skill 保持独立，不合并；② 格式/规则单一来源——只在 `principles.md` Quick Reference 定义一次，技能只文字引用（如 "per principles.md Quick Reference — Record Lifecycle"），不内嵌副本。

**Why:** 混合职责的 skill 被调用时部分内容永远用不到，浪费 token、稀释注意力并使触发匹配模糊；内嵌格式副本在多个 skill 间漂移（survey-context 与 principles 的 Candidate Record 措辞已出现分歧）。principles 每次 session 恒定注入，格式放此处零额外注入成本，且模型无需额外 read 动作即可获得权威定义。

**Impact:** 本次重构以两条约束为验收标准：skills 全部瘦身（删内嵌副本）、principles Quick Reference 去重压缩（只删同义重复、不删唯一语义）、不新建承载格式的 skill、不修订 D-013（回到其原设计并执行）。

**Rejected:**

- **新建 `project-records` skill 承载格式**：指针引用依赖模型主动 read，可能被跳过且单次注入可能多于内嵌副本；格式与 principles 恒定注入面天然同层。
- **Quick Reference 下沉到各对应 skill**：需修订 D-013，且操作手册分散后失去恒定注入的零成本优势。

**Out of Scope:**

- **guidance 文本精简**：失败路径、高压力场景，措辞精度要求最高，压缩风险高于收益。Revisit when guidance 文本总量显著增长。**已评估并 dismiss（C-001，2026-08-08）**：评估结论——进一步压缩无法满足语义零损失，且与总量无关：a9b4448 已把 guidance 从不可执行的含糊短句（`Use a simple literal command or a Direct tool.`）改为可执行判据（动态 token 定义、引号规则、重定向白名单），短句形态因不可执行已被否决；Direct 工具枚举（read/grep/find/ls 等）是模型无法从自身 tool schema 推导的 gate 支持子集，删除即语义损失；其余限定子句（单引号规则、schema 修正、Profile 不可自改、安全边界不可绕过）均为判据或安全祈使。增长哨兵的前提（总量增长→压缩可行）被否定，随 dismiss 撤销，不再设 Revisit。
- **合并任何触发场景互斥的 skill**（draft-spec→brainstorm-design、draft-tickets→plan-writing、grill-docs→grill-plan）：全量消费约束的必然推论；配对触发场景互斥（想法需探索/已讨论完直接落记录、计划需分解/需求→步骤计划、纯拷问/拷问+文档验证），各自全量使用。Revisit when 实测两 skill 触发场景重合。
- **token 基线测量与提示词行为测试**：无法可靠操作化“理解认知”，用户明确不做额外验证。Revisit when 出现可观察的遵守度问题。**已评估并 dismiss（C-003，2026-08-08）**：遵守度问题实际出现一次——D-036 中 8 个 workflows skill 的 description 与 `disable-model-invocation` 矛盾（承诺的模型自动响应永不发生）。评估结论：该事故属结构矛盾而非 token 消耗，可操作化的测量是结构层行为测试（validate-skills 新增 `Use /skill:<name>` 强制校验与负向自检，锁 D-036 防回归）；token 基线/“理解认知”级测量维持拒绝，已观察到的遵守度问题由结构校验覆盖，不产生新的测量需求。

## D-031: 路径可执行与 tsx 解释器归类

**Status:** active

**Decision:** 无 adapter 的路径形式可执行文件（executable 含 `/`：`./x`、`../x`、绝对路径、`scripts/x.sh`）分类为 `execute`（non-opaque）；`tsx` 作为语言运行时纳入 interpreter adapter（与 node/python 同规则：`--version`/`-v`/`--help` → inspect，其余 → execute）；无路径的裸名未知命令保持 `unknown`（non-opaque）。

**Why:** 同一操作（运行本地二进制）此前因拼写不同落入不同 Profile 决策——`npx tsx` 为 execute（plan deny/build allow），`./node_modules/.bin/tsx` 为 unknown（plan ask）——这是 spelling-based 分类偏差。含 `/` 的裸词在 POSIX 下即文件路径，路径形式“运行二进制”是事实而非假设，归 execute 是正确语义；裸名可能是 alias/函数/PATH 工具，静态分析无法确定语义，`unknown`→ask 是诚实分类与同意层，语义扩充权留给 D-024 用户覆盖层。内置注册仅限两个封闭范畴：语言运行时（node/python/ruby/perl/tsx，tsx 先例）与 POSIX 只读检查工具（od，T-040；判据：静态可证仅读输入→写 stdout，无 modify/execute/network/destroy 副作用）；两者都是静态可界属性，不构成“任意工具进内置”的先例。

**Impact:** 变更后矩阵——脚本执行场景（`tsx foo.ts`）下 `npx tsx foo.ts`、`./node_modules/.bin/tsx foo.ts`、裸名 `tsx foo.ts` 全部为 execute：keel-plan deny、keel-code/query/develop ask、keel-build allow；裸名无 adapter 命令保持 unknown（keel-plan ask）。版本探测有意不对称：`npx tsx --version` 为 execute（npx 语义＝下载+运行包，flags 不改变风险），而本地解释器 `./node_modules/.bin/tsx --version`/`tsx --version` 为 inspect（与 node/python 同规则）——门禁建模的是命令本身（npx vs 本地解释器），不是目标包。唯一放宽点是 keel-build（路径二进制从 ask 变 allow），与 full-trust 语义一致；keel-plan 对本地脚本从 ask 收紧为 deny，符合其“execute 命令一律拒绝”的声明意图。keel-build 描述保持原样——execute 覆盖路径二进制与该 Profile full-trust 意图一致，不因措辞微调。`analyzeSemantics` 唯一生产调用方是 `shell-compiler.ts`，爆炸半径封闭；不新增 path intent、不触碰任何 hard boundary（blocked path/destroy/dynamic/opaque/threat）、D-024 覆盖层优先级（commands→aliases→adapter→reclassify）不变。

**Rejected:**

- **仅禁 `./node_modules/.bin/*`（按目录）**：误伤 npm scripts 全部本地二进制，且不解决绝对路径与项目脚本；拒绝。
- **为任意裸名工具新增内置 adapter（eslint/prettier/vitest → execute）**：whack-a-mole——execute 类工具运行任意代码，静态不可界，与 D-024（用户覆盖层是语义扩充的唯一入口）冲突；内置注册的封闭范畴例外仅限语言运行时（tsx）与 POSIX 只读检查工具（od，T-040），不构成“任意工具进内置”的先例。
- **保持 unknown、仅改 guidance**：不消除 deny/ask 拼写分歧；拒绝。
- **引入新 commandClass**：破坏 D-017/D-022 的封闭类集合与 effect axis；拒绝。
- **按项目根判定（仅项目内路径归 execute）**：语义层引入 cwd/path 上下文耦合，绝对路径与 `/usr/local/bin` 工具分类不一致；拒绝。

**Out of Scope:**

- Windows `\` 路径（宿主为 Unix 语义，按 POSIX `/` 判定）。
- 裸名经 PATH 到达的路径：`export PATH=…`（unknown→ask）与裸命令（unknown→ask）是两次审批，不构成静默绕过；裸名工具语义扩充属于用户 `command-overrides.yaml`（D-024），只读检查封闭范畴（od，T-040）除外。
- 路径形式的 alias 匹配：已解决——覆盖层键为显式作用域（精确键 + 路径前缀键，D-034），路径形式需精确/前缀键声明语义（裸名键不隐式覆盖路径形式，basename 冲突结构性消除）。
- PATH 解析与文件存在性探测：静态分类不做 filesystem 检查。

## D-032: ask 渲染展示 unknown 命令的 literal form（知情同意）

**Status:** active

**Decision:** `evaluate.ts` 把原始命令文本顺着 `adaptDecision` 传给 renderer；`renderDecision` 的 ask 分支对 `kind === "command"` 的证据按证据 span 从原文切片，追加 `— literal form: <完整命令>`（仅长度截断，**不脱敏**）。模型侧（block reason / 编译失败）**不重复命令、不携带用户派生值**：path 证据在 deny 侧只渲染为操作类型分类（`read path denied`、`write path denied`），原始路径只存在于 ask 侧（人类同意面）与命令的 literal form——**类别化设计取代掩码脱敏，`redactSubject` 全套移除**。语义层不变：xargs、`sh -c` 等运行期构造命令的命令族保持 `unknown`→ask，不做任何建模。

**Why:**
- unknown 命令没有可提取的路径/效果语义，人类批准是唯一针对该命令本身的防线；审批框只显示 `unknown command: xargs` 时，人类无从判断要批准什么——同意层变成橡皮图章，防线实际失效。
- 字面文本是门禁对该命令唯一诚实可知的完整信息：原文已在输入中，span 是 lexer/parser 算出的真实字符偏移（verifier 校验过 span 与命令操作的对应），渲染只是展示事实而非推断。语义建模（给 xargs 加 adapter/wrapper）把运行期 stdin 数据驱动的命令构造猜成静态 class，是伪精确，违反 D-024/D-025 的诚实分类原则。
- 覆盖是结构性的：修复只依赖 "command 证据 + span" 这对每条命令都存在的产物，不依赖任何适配器知识；所有 unknown（以及 profile 下 ask 的 modeled）命令经同一漏斗出口自动受益，不枚举命令、不新增适配器。
- **审批展示不脱敏**：命令由模型提出，原文已作为 `AssistantMessage` 的 toolCall 参数存在于模型上下文与 session JSONL 中——审批框（TUI 覆盖层，不落 session）脱敏保护不了任何尚未暴露的信息，反而削弱人类否决时所需的完整信息。
- **类别化取代掩码**：掩码是"嵌入原始值再打码"的补丁。根治：模型侧 deny 证据 subject 不嵌入用户派生值——path 证据只渲染操作类型分类（`write path denied`），命令证据只含可执行名，编译失败 subject 为固定诊断/威胁 id。模型已持有自己提出的命令（toolCall 参数），路径与区域都是它可自行推导的冗余信息，gate 不重复（与"不追加重复信息"同根）；ask 侧保留完整 path 证据——Direct 工具无 literal form，路径是人类同意的唯一信息。

**Impact:**
- 审批提示从 `unknown command: xargs` 变为 `unknown command — literal form: xargs sed -i 's/…'`——literal form 已包含完整命令（可执行名是首 token），subject 只保留命令类别，不追加重复信息；`sh -c 'rm -rf /'` 显示完整负载，人类批准从盲批变为知情且可完整否决。
- block/deny 渲染不出现命令重复、不携带原始路径：deny 侧 path 证据为 `read path denied`/`write path denied`，`dynamic shell token` 等固定诊断词原样展示（无掩码误伤）。
- 删除 `redactSubject`/`SENSITIVE_PREFIXES`/边界启发式全套；无前缀表维护、无脱敏误伤。
- ask 侧 command subject 按面构造（evaluate-request 决策时只含类别，如 `unknown command`），渲染器纯追加 literal form——不做 subject 格式手术（消除跨模块格式耦合）；deny 侧 subject 含可执行名（模型分类需要）。
- 不改 plan 形状、`access-plan-verifier`、profile/path policy。

**Rejected:**
- **给 xargs 建模（adapter / wrapper 白名单 / reclassify）**：xargs 与 `sh -c`、`bash -c` 同属运行期构造命令族，静态 class/路径是猜测；单独建模造成双标（`xargs rm -rf /` 硬拒而 `sh -c 'rm -rf /'` 盲批说不通），且 keel-build 会自动放行错误的 class。
- **把 raw command 存入 `CompleteAccessPlan`**：plan 形状变更需同步 verifier 与 coverage proof，收益与渲染层传参相同。
- **审批展示脱敏**：命令原文已通过 toolCall 参数存在于会话与模型上下文，审批框（不落 session）脱敏是无效剧场——不减少任何暴露，却让人类否决时看不到完整命令（如嵌入的 token 值）；拒绝。
- **block reason 附加 literal form**：模型已持有自己的 toolCall 参数，重复命令浪费上下文并双倍持久化，且无新增信息；拒绝。
- **掩码脱敏（redactSubject 前缀表）**：掩码是"嵌入原始值再打码"的补丁——需要前缀表维护与边界启发式，且会误伤固定诊断词（`dynamic shell token` → `*** *** ***`）。类别化设计让 deny 侧根本不产生用户派生值，掩码从设计上消失；拒绝。

**Out of Scope:**
- 逐命令拆分审批：批准粒度仍是 tool-call 级（D-032 只让审批看到全文，不改变批准范围）。
- xargs 的 stdin 目标静态提取：运行期数据，静态不可知（D-031 同款边界）。
- 其他 unknown 命令的语义扩充：属 D-024 用户 `command-overrides.yaml`。

## D-034: 覆盖层显式作用域键（取代隐式 basename 回退）

**Status:** active（取代隐式 basename 回退）

**Decision:** 覆盖层（`aliases` 与 `commands`）的键改为**显式作用域匹配**：精确键优先（裸名或完整路径字符串，`./` 归一化对精确键与前缀键对称生效），路径形式按最长路径前缀键匹配（键以 `/` 结尾）；**移除隐式 basename 回退**。别名目标可为用户定义的 `commands` 条目（链式：别名 → 命令定义）。解析顺序：commands→aliases→commands(别名目标)→adapter→reclassify。

**Why:**
- 隐式 basename 回退（路径形式在精确键未命中时按工具 basename 查键，让一次声明覆盖两种拼写）把"工具身份"与"调用拼写"混为一谈：一个裸名键同时覆盖 `./bin/mytool` 与 `./vendor/mytool`——gate 不做 filesystem 解析（D-031），同名不同工具无法区分，冲突结构性存在。
- 显式作用域把歧义交给用户声明（D-024 权威）：每个键声明明确覆盖范围（裸名 / 精确路径 / 路径前缀），gate 不再猜测哪个路径形式该被覆盖——basename 冲突从设计上消除。
- 路径前缀键把"误伤"变成"能力"：`"bin/": cat` 明确声明目录内全部工具语义；`"./vendor/mytool": git` 精确指向具体二进制。
- 拼写一致性目标以显式方式保留：想两种拼写都覆盖，写 `mytool: cat` + `"bin/": cat`——声明取代猜测。

**Impact:**
- `aliases: {mytool: cat}` 不再覆盖 `./bin/mytool`（路径形式默认 execute，D-031）；覆盖需 `"bin/": cat` 或精确路径键。
- 匹配规则：精确键 > 最长前缀键；`./` 归一化（`"bin/"` 命中 `./bin/mytool`）；前缀键不误伤其他目录同名工具。
- `commands` 同样支持前缀键（此前 commands 只支持精确键，与 aliases 的路径形式匹配不对称；现两者统一为显式作用域）。
- `./` 归一化对称：精确键与前缀键同样归一化前导 `./`——`"bin/eslint"` 命中 `./bin/eslint`，`"./bin/eslint"` 命中 `bin/eslint`（`./` 无管理意义，拼写差异不产生作用域分裂）。
- 别名目标可为 `commands` 定义（`aliases: {mytool: my-linter}` 复用 my-linter 的 class/effects/subcommands，reason 用原始调用名）；alias 单步解析，不链式套 alias。
- `reclassify` 按 basename 对齐 adapter 身份：adapter 已按 basename 识别命令（`/usr/local/bin/git` → git adapter），reclassify 匹配规则命令名时同样回退 basename——用户声明的分类微调在路径形式下不再静默失效（如 `/usr/local/bin/git status` + `{command: git, pattern: "status", class: modify}` 生效）。
- 爆炸半径：registry.ts（`scopeKey` 3 处调用点：commands、aliases、别名目标的 commands 链式各一）；不碰 plan/verifier/policy。

**Rejected:**
- **保留 basename 回退作为前缀键后的兜底**：冲突只在用户不用新消歧时"休眠"而非消除；显式作用域是更诚实的分类（D-024：语义由用户声明定义）。
- **realpath/filesystem 消歧**：D-031 明确静态分类不做 filesystem 检查；引入解析会破坏无副作用语义。
- **alias→alias 链式解析**：单步是显式作用域哲学的延伸——链式让 `a` 的语义需沿解析图追多跳才能确定，与"声明取代猜测"冲突；目标为 alias 键无表达力增量（`lg: lazygit` 一次声明即可），却引入环检测、逐跳作用域重放与 reason 渲染复杂度；commands 链式已覆盖"复用语义定义"的需求（commands 目标携带 class/effects/subcommands，alias 目标只是名字）。

**Out of Scope:**
- 前缀键的绝对/相对拼写敏感（`"/abs/bin/"` 与 `"bin/"` 是不同作用域）：`./` 已归一化，其余拼写差异由用户声明承担。
- Windows `\` 路径（POSIX 语义）。
- 目录内多个前缀键重叠：最长前缀优先，已测试。

## D-035: 平台边界收窄为仅 Linux（dismiss C-007）

**Status:** active

**Decision:** 平台支持边界从“仅支持 POSIX”收窄为**仅保证支持 Linux，以 Arch Linux 为基准工具链**：命令选项解析固定按 Arch Linux 的 GNU 工具链语义处理（GNU coreutils / GNU git / npm 生态常用选项），不提供按平台或发行版检测方言并切换选项表的机制。Windows、macOS、BSD 均不在支持范围，不建模其路径语义与选项方言；其他 Linux 发行版的工具链版本差异（如旧版 coreutils 缺失部分选项）不在保证范围——选项表以 Arch Linux（滚动发布、工具链最新）为准。BSD 工具与 GNU 的选项歧义（`stat -f` 为格式参数、`du -d` 在 BSD 无对应、`df -t` 在 BSD 为 flag）造成的解析差异不承诺消除，BSD 平台上的命令语义不在承诺范围。

**Why:** 候选 C-007（BSD 选项方言检测）评估确认：触发条件（用户项目实际运行于 BSD 工具链）无现实样本，方言检测收益不抵成本（错配/双维护/误报，详见 Rejected）。用户明确决定不引入方言检测，并把支持承诺锚定为 Arch Linux 基准——开发与验证环境即 Arch，选项表以该环境的 GNU 工具链为准，其他发行版工具链差异由环境承担。GNU 语义成为唯一且无条件的解析基线，消除“POSIX 范围内 BSD 行为未定义”的悬空承诺。

**Impact:** R-16 平台边界表述同步；CONTEXT.md Negative Space 同步（仅保证 Arch Linux，Windows/macOS/BSD 显式列出，其他发行版不在保证范围）；C-007 dismissed（durable content 迁入本决策、R-16 与 Negative Space，同一变更删除候选来源）。代码零改动——选项解析本就固定 GNU 语义，无平台/发行版检测代码。D-031/D-034 中“POSIX 语义”指路径分隔符语义（`/`），与平台支持范围正交，表述不变。

**Rejected:**

- **按宿主平台检测方言切换选项表（`process.platform`）**：gate 分析宿主 ≠ 命令执行宿主（ssh/容器内 BSD 工具链会错配）；每张选项表需 GNU/BSD 双维护。拒绝。
- **保守双解析取并集（方言无关）**：两方言下都产生额外误报（如 BSD 下 `stat -c %s f` 带出 `%s` 路径意图）；对仅支持 Linux 的承诺无意义。拒绝。
- **宿主检测 + 用户配置覆盖**：为无现实样本的触发场景引入配置面与文档负担。拒绝。

**Out of Scope:**

- Windows `\` 路径与 macOS 路径/选项方言：已在 Negative Space，不因 stat/du/df 同为 BSD 方言而把 macOS 纳入支持。
- 跨宿主场景（ssh、容器）的命令语义方言：静态分类不做执行环境探测（同 D-031 无 filesystem 检查边界）。

## D-036: Workflows 触发模型（手动调用与即时介入）

**Status:** active

**Decision:** workflows 层按“是否需要即时介入”划分触发模型：**用户显式 `/skill` 触发**（`disable-model-invocation: true`，description 以 `Use /skill:<name>` 开头）——brainstorm-design、draft-spec、draft-tickets、grill-docs、implement-work、improve-architecture、rollback-session、handoff-session；**模型可响应触发词**（无禁用）——survey-context（任务启动）、grill-plan（grill 触发词）。validate-skills.ts 强制校验：workflows 层带 `disable-model-invocation` 的 skill，description 必须以 `Use /skill:<name>` 开头，防触发承诺失效回归。

**Why:** 8 个流程型 skill 的 description 原为模型指令式措辞（“You MUST use this...”、“Use when the user says...”），但 `disable-model-invocation` 使模型永远看不到 description——触发承诺与实际触发机制矛盾，承诺的自动响应永不发生。修复：description 统一改写为用户侧调用指引（`Use /skill:<name> when...`），语义保留、仅改写触发面。rollback-session 保持手动调用而非模型响应：“undo/rollback” 语义有歧义（可能是会话导航 `/tree`、小修改或大规模撤销），且恢复涉及 `git reset --hard`/`checkout --`/`clean` 等破坏性操作，用户显式发起才具备明确撤销意图；触发词 “go back” 删除（与 `/tree` 会话导航语义重叠）。

**Impact:** handoff-session 保留禁用并重构（见 Out of Scope）；README “User workflows” 概览与 D-005 三目录不变；触发场景互斥的 skill 保持独立（D-030）；校验脚本新增防回归检查。

**Rejected:**

- **移除 rollback-session 的 `disable-model-invocation` 让模型响应 “undo” 触发词**：用户说 “undo” 可能是会话导航或小修改，模型自动进入恢复指导会误判与打断；破坏性操作需要用户显式发起。拒绝。
- **为 workflows 触发模型新增专用配置面或路由系统**：`/skill:` 是 pi 宿主既有机制，自建即重复。拒绝。

**Out of Scope:**

- **handoff-session 定位**（跨环境交接）：handoff 文档的唯一不可替代价值是“无本会话历史访问权的接收方”（非 pi 工具、跨机器/环境）获得状态摘要；同 pi 环境交接由 `/resume`/`/tree`（pi 持久 session 文件全量恢复）与 `survey-context`（从 CONTEXT/task/decisions 重建上下文）覆盖，摘要不增加保真度。原实现写 `$TMPDIR` 是缺陷：Linux `/tmp` 重启即清理、跨机器不可达——在唯一需要它的场景（跨环境）恰恰无法送达。重构：默认在会话中输出文档内容由用户交付（用户掌控持久性），用户显式指定路径时才写入；未沉淀决策不写入 handoff，先经 domain-modeling 入 `docs/decisions.md` 再引用路径（防双源，D-028）。**Revisit when** 出现需频繁跨工具交接的真实用户场景。


## D-037: 解析器拥有 wrapper 链（IR 契约：executable 永不承载 wrapper）

**Status:** active

**Decision:** `shell-parse/parser.ts` 在 wrapper-args 状态下识别嵌套 wrapper 并入栈（重置该 wrapper 的 `WRAPPER_POS_SKIP`）；wrapper 的 positional 参数（`timeout <duration>`）由 parser 消费丢弃，`node.args` 只含真实命令参数。`ShellCommandNode.executable` 只承载真正要运行的命令，**永不可能是 wrapper**。`normalize.ts` 退化为纯出栈：循环弹出 wrapper 链，删除 `promotion` / `guessExecutable` / `removeFromArgs` / unwrap 的 slice 逻辑 / `MAX_UNWRAP_DEPTH`。

**Why:**
- 旧设计仅在嵌套形态下把 wrapper 放 executable 槽（如 `timeout 5 env python` → executable=env），真实命令沉入 args，normalize 用 promotion + guess 恢复——猜测逻辑脆弱，且产生两个已实证的盲点：
  - preflight `download→pipe→interpreter` 硬规则只查 raw executable：`curl … | timeout 5 env python`、`curl … | env nohup bash` 等嵌套形态整体绕过（本地脚本实证：executable=env/nohup，preflight PASS）；
  - `analyzeCd` 只查 raw executable：`timeout 5 env cd x` 的 cwd 变化不被追踪，后续命令路径检查基于错误 cwd。
- 修复放在生产者（parser）：不变量"executable = 真实命令"由构造保证，消费方（preflight、analyzeCd 及未来新增检查）按构造正确，不在消费方复制 wrapper 解包知识（Centralize，D-030 同源）。

**Impact:**
- 解析后 `node.args` 只含真实命令参数；wrapper positional 不再进入 args，threatScan 的 token 文本覆盖不变（wrapper 名与 executable 仍被扫描）。
- preflight 硬规则对嵌套 wrapper 形态按构造闭合：实证的 4 个绕过形态（`timeout 5 env python`、`command env python`、`timeout 5 env -i python`、`env nohup bash`）由 PASS 变拦截，回归测试锁定。
- `analyzeCd` 正确追踪嵌套 wrapper 下的 cd（`timeout 5 env cd x && rm file` 的路径检查基于正确 cwd，fail-closed 方向）。
- normalize 大幅简化；删除的正是"猜测 executable"逻辑，与 D-031 诚实分类原则同向。
- 深嵌套（`timeout 5 env timeout 3 cmd`）统一正确——旧 guess 机制在此形态下破碎（executable 被猜成数字）。
- 既有单层 wrapper 行为零变化（shell-parse / control-flow / driver 测试全部存活）。

**Rejected:**
- **消费方各自 normalize（preflight/analyzeCd 调用 normalizeCommand）**：不变量落在每个消费方，未来新增 preflight 检查会重蹈覆辙，且安全修复不彻底；违反 Centralize。拒绝。
- **保持 parser 不动、仅独立修 preflight**：A1 目标形态免费闭合安全面（零额外 preflight 代码）；独立修复需在 preflight 复制 wrapper 解包知识，产生双源。拒绝。

**Out of Scope:**
- **wrapper 名单位扩充**（仍为 env/command/nohup/exec/timeout）：语义扩充属用户 `command-overrides.yaml`（D-024），不内置。
- **非 wrapper 的 option-with-value 建模**（如 `env -S`）：维持 fail-closed 现状。
- **POSIX `>&file` 双流语义修正**：当前建模为 stdout write，路径检查（write intent）不受影响，无安全差异；A2 只把回退分支显式化，不改语义。

## D-038: footer 单一 fitter + pi-tui 宽度助手（生产/测试双路径）

**Status:** active

**Decision:** footer 的 left/right 适配统一为单一 ANSI 感知 `fitLine`（取代 appendRight + fitLine 双实现，A3a）；宽度/截断助手（`visibleWidth`/`truncate`）生产环境选用宿主 `@earendil-works/pi-tui`（grapheme/宽字符正确，CJK/emoji 按 2 列），独立测试环境（无 pi-tui）fallback 到手写近似（A3b）——与 NativeFooter 动态导入同模式；`selectWidthHelpers` 对宿主模块做结构检查，缺失或形状不符回退。

**Why:** 双布局引擎（native 路径 appendRight vs fallback 路径 fitLine）是同一 left/right 适配算法的近重复，差异仅在 ANSI 感知（appendRight 用 `visibleWidth`，fitLine 用裸 `.length`），统一后单一维护点。pi-keel 手写 `visibleWidth`/`truncate` 是 UTF-16 单元计数而非显示宽度——native 路径对含 CJK 的 Profile 名/路径每字符偏 1 列。实测（bundle 提取）pi-tui 的 `truncateToWidth`（默认省略符 `"..."`，与 pi-keel 惯例一致；grapheme 迭代不劈开 emoji/组合字符）与 `visibleWidth`（ANSI 剥离 + grapheme 宽字符计数 + tab 3 列 + 缓存）是正确的显示宽度实现，且是官方声明的扩展可用导入（extensions.md Available Imports）；pi-tui 只随宿主 bundle 提供，独立测试环境不可解析。

**Impact:**
- profile-footer.ts 净减 ~15 行；appendRight 删除，两路径共用 fitLine；宽度契约升级为显示宽度（含 ANSI 处理）。
- 生产：CJK/emoji 填充正确（修复既有偏差）；测试：fallback 手写近似，行为逐字符保持（renderProfileFooter 120/48 宽 + ANSI 用例全绿）。
- 新增 `types/pi-tui.d.ts`（仅声明消费的 `visibleWidth`/`truncateToWidth` 两个导出）。
- truncate 契约：按显示宽度截断含 ANSI 文本（pi-tui 保留 ANSI 颜色；fallback 剥离后截断）。

**Rejected:**
- **仅 A3a（纯统一、不接 pi-tui）**：CJK 填充偏差保持现状；实测已确认 pi-tui 正确且官方支持，接入成本仅 ~5 行选择逻辑 + 声明文件。拒绝。
- **接 pi-tui 其余导出（Box/Text 等组件）**：超出 footer 宽度助手范围。拒绝。
- **全量替换手写实现（无 fallback）**：独立测试环境无法解析 pi-tui（只随宿主 bundle 提供），测试会挂。拒绝。

**Out of Scope:**
- **Native FooterComponent 直接构造**（未文档公开的宿主内部 API）：现有行为，不在本次范围。
- **其他 pi-tui 组件与 API 接入**。

## D-039: 待创建
