# Pi Keel Decisions

本文集中记录 pi-keel 的长期架构、工程和安全决策。每条决策只保留当前结论、理由、必要的替代方案和影响；历史决策标记为 `superseded`。

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

## D-007: 安全扩展模块化拆分

**Status:** superseded by D-017 and D-018

**Decision:** 旧安全扩展按配置、命令分类、安全检测、路径与权限策略、生命周期状态和事件管道拆分，入口只负责注册和组装。

**Why:** 职责边界可以独立理解和测试，避免入口承载策略细节。

## D-009: 项目分发与文档边界

**Status:** active

**Decision:** 移除不必要的 npm 元数据和用户 `AGENTS.md` 模板；使用文档放在根目录，长期安全和溯源文档保留在 `docs/`。

**Why:** 每个文件都应有明确的维护对象和用户价值；pi-keel 不应越过用户项目工程约定文件的所有权边界。

## D-010: Shell 写入统一门控

**Status:** active

**Decision:** Shell 文件修改统一纳入受限 Shell analysis、command semantics 和 canonical path policy。写入 intent 与其他路径操作使用同一套 hard boundary 和 Profile gate。

**Why:** `write`/`edit` 工具保护无法覆盖重定向、`tee`、`cp`、`mv` 等 Shell 写入入口；secret-pattern scan 不承担访问控制职责。

## D-011: 统一命令分类

**Status:** superseded by D-017 and D-018

**Decision:** 命令语义集中管理，由受限 Shell 分析提取命令类别和文件操作意图，再交给路径策略和权限决策。

**Why:** 分散的模式列表会造成命令分类和安全策略漂移。

## D-012: Pipeline 与 Bootstrap 简化

**Status:** superseded by D-017 and D-018; principles deployment retained by D-013

**Decision:** 事件入口只负责注册和组装，策略逻辑按职责分层；原则内容独立于 TypeScript；注入状态使用表达实际语义的最小状态。

**Why:** 职责分层便于测试，原则内容可独立编辑，最小状态减少重复注入。

## D-013: 原则部署

**Status:** active

**Decision:** 使用“原则注入 + Quick Reference”部署通用约束；技能只引用权威内容，不重复定义格式和规则。

**Why:** 用户项目中可稳定获得的渠道是会话注入内容和按需加载的技能，集中定义可以避免规则分叉和死链。

**Impact:** `principles.md` 是通用参考数据的唯一注入来源；用户项目使用 `CONTEXT.md`、`docs/decisions.md` 和 `docs/task.md`。

## D-016: 安全门控边界与命名

**Status:** superseded by D-017 and D-018

**Decision:** 安全门控按领域职责拆分模块，文件名表达领域概念，入口负责生命周期和组装，策略模块负责具体决策。

**Why:** 清晰的职责和命名降低耦合，使依赖方向、公共入口和测试边界可直接理解。

## D-017: Profile 访问策略

**Status:** active

**Decision:** 命名 Profile 是唯一用户权限入口，分别配置 Shell 决策和 `read`、`list`、`search`、`write` 四类路径策略。

**Rules:**

- Shell 命令分类为 `inspect`、`modify`、`execute`、`destroy`、`unknown`。
- 路径规则按声明顺序 per-operation first-match。
- `blockedPaths`、威胁模式、unsafe syntax 和 symlink escape 是不可覆盖的 hard deny。
- `ask` 只提供 `Allow once` 和 `Deny`，不跨调用或 Session 持久化。
- 每次 Session 从配置的 `defaultProfile` 开始，不继承其他 Session 的临时 Profile。
- 配置按内置、全局、受信项目顺序合并，后层同名 Profile 替换前层定义。

## D-018: Shell IR 与 Access Gate

**Status:** active

**Decision:** 采用 `shell-parse/`、`command-semantics/`、`gate/` 三层架构，以不可执行的 Shell IR 传递结构化结果。

**Security invariants:**

- blocked intent hard deny，不能由 Profile 或 `Allow once` 覆盖。
- 只有所有语法节点和 effect 都被安全解释时才可 allow。
- wrapper 必须保留底层命令 intent。
- modify 命令的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- 无法确定分支 cwd 时不得 allow。
- 一个 tool call 的所有 ask intent 聚合为一次审批。
- 项目 Profile 仅在项目受信时参与合并。

**Enforcement scope:**

只拦截 Pi `tool_call` 事件，不承诺全局 enforcement。`user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 和后续 handler 对 input 的修改不在范围内。

## D-019: 两行 Profile Footer

**Status:** active

**Decision:** TUI 使用 `setFooter()` 包装 Pi 原生 Footer，固定渲染两行；第一行显示位置、Session 和 Profile，第二行保留原生运行统计和扩展状态；Pi 主包不可用时使用本地 fallback。

**Why:** `setStatus()` 无法控制 Footer 整体布局，`setFooter()` 才能稳定保留原生信息并放置 Profile。

## D-020: 用户项目文档统一模型

**Status:** superseded by D-021

**Decision:** 用户项目使用 `CONTEXT.md`、`docs/decisions.md` 和统一工作文件集中管理当前知识、长期决策和短期过程。

**Why:** 按 spec、plan、design、ticket、bug 分目录会导致过程文档膨胀和重复引用。

## D-021: Task Record 术语

**Status:** active

**Decision:** 用户项目短期产物统一称为 Task Record，默认文件为 `docs/task.md`，并行任务使用扁平的 `docs/task-<topic>.md`，条目使用 `T-xxx`。

**Requirements:** Task Record 内包含 `Requirements`、`Design`、`Plan`、`Evidence` 和 `Durable Updates`；任务性质通过 `Kind` 表达：`feature`、`bug`、`refactor`、`investigation`、`maintenance`。

**Why:** Task 比 Work 更准确地表达具有目标、范围、验收和验证边界的有限任务；Requirements 保留为内容概念，不再作为独立文件类型。

**Rejected:** 不采用 Work/Work Item、Change Record、Change Request 或独立 Specification 文件作为统一短期产物。

## D-022: Compiler-Kernel 分层与请求真实性

**Status:** active

**Decision:** Access Gate 的 enforcement 分为三层：compiler → Policy Kernel → host adapter。Compiler 只生成 `CompleteAccessRequest`（分析证据）或 structured reject，不接 Profile 或审批。Policy Kernel 只消费 compiler-issued request，验证其 authenticity（WeakSet issuance）后执行封闭 policy evaluation。

**Why:** 分层保证分析证据（request）和授权结果（GateDecision）不混淆；compiler 可以独立证明 fail-closed 边界，Kernel 可以独立证明 monotonic policy。

**Security invariants:**

- 每个 request 由构造器 defensive-copy、deep-freeze 后加入模块私有 WeakSet，只有 issued request 能通过 `isCompleteAccessRequest()`。
- Kernel 不接收原始 Shell，不重新计算 hard hazard — 所有 dynamic/unsafe/opaque/threat 在 compiler 阶段已 reject。
- coverage 必须逐项对应：command/redirection/effect span 与 operation、顶层 cwd candidates 与 path candidates 去重集合。
- Effect policy axis 是封闭映射：`read/search/write/delete/permissionChange/cwdChange → path`，`execute/network → shell`。

## D-023: 拒绝解释与静态 Guidance

**Status:** active

**Decision:** 拒绝结果的 guidance 只能引用源码内置的静态 `GuidanceId` catalog，不能拼接可执行 Shell、原始 glob 或用户输入。`renderDecision()` 将 `GateDecision` 转为 Pi host `GateResult` 时执行 evidence redact 和长度预算。

**Why:** guidance 不能成为间接 code injection 通道；blocked path/threat 不提供绕过建议；evidence 脱敏防止拒绝原因泄露敏感路径。

**Guidance mapping:**

| DecisionCode | GuidanceId |
|---|---|
| `dynamic-shell` | `batch-inspection-tools` |
| `opaque-command` | `literal-command-or-direct-tool` |
| `unsafe-syntax` | `split-supported-commands` |
| `shell-policy-denied` | `profile-restriction` |
| 其他 deny code | 无（避免诱导绕过）|

**Redaction rules:** renderer 仅对 deny 决策执行 sensitive prefix 脱敏（`~/.ssh`、`/home/`、`.env` 等），ask 决策保留完整 evidence 供用户审批判断。

## D-024: 命令覆盖层

**Status:** active

**Decision:** 不将内置 adapter 的分类规则迁移到声明式文件。改为提供轻量 `command-overrides.yaml`，作为 Shell 命令和 Direct 工具的**统一扩展入口**，支持三种操作：别名映射、新命令定义和分类微调。

**Why:**
- Shell adapter 的分类、路径提取和效果推断共享同一趟参数解析——三者是同一个分析的输出，不是可拆分的"数据"和"逻辑"。强行拆分会造成 YAML 和 TS 描述同一命令的双源真理问题。
- 内置命令分类是权威语义知识，不是用户面策略。用户真正需要的是「为未知命令添加支持」，而不是「覆盖 git push 的分类」。
- Direct 工具的 TOOL_SCHEMAS 已是声明式静态映射，但也没有扩展机制。用一个统一入口覆盖 Shell + Direct 两类扩展需求，比只改 Shell adapter 更整体。

**格式：**

```yaml
# .pi/command-overrides.yaml（可选）

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

**加载链：** `~/.pi/agent/command-overrides.yaml → .pi/command-overrides.yaml`，项目覆盖全局。无 builtins 层（TypeScript adapter 是内置权威来源）。

**影响：**
- 内置 adapter 结构和测试不受影响
- 不改变 Profile、PathPolicy、Gate 或 Shell IR
- YAML 仅定义 TS 中没有的命令；同名时 commands 段优先，reclassify 在 adapter 返回后覆盖
- 别名节点替换 executable 名称后传给目标 adapter，adapter 按目标命令规则执行完整分析（含路径提取）

**已知局限：**
- `reclassify` 的子命令提取（`fullSubcommand`）不跳过取值选项的值。例如 `cargo --manifest-path Cargo.toml build` 产生的子命令是 `"Cargo.toml build"` 而非 `"build"`。这是因为 `fullSubcommand` 不依赖 per-adapter 的 `valueOpts` 配置。实际影响极小：reclassify 的 pattern 使用 substring 匹配（`"build"` 而非 `"^build$"`），且典型场景（如 git 子命令重分类）不存在此问题。详见 `overrides.ts` 中 `fullSubcommand` 的注释。
