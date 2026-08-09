# Pi Keel Context

## Glossary

- **Profile**：当前 Session 唯一的访问策略入口，组合 Shell 决策、路径规则和审批行为。
- **Access Gate**：拦截 Pi `tool_call` 并执行 compiler → Policy Kernel → guidance renderer → host adapter 的统一策略层。
- **CompleteAccessPlan**：compiler 产出的不可变、可验证的访问计划；不包含 allow/deny 等授权结果。
- **Policy Kernel**：消费经过 verifier 验证的 `CompleteAccessPlan` 和 `Profile`，产出结构化 `GateDecision`；不依赖原始 Shell。
- **GateDecision**：`allow | ask | deny(hard/profile/user)` 的封闭决策类型；每个 deny 附带稳定 `DecisionCode`。
- **Guidance**：从 `DecisionCode` 到静态 `GuidanceId` 的封闭映射，不携带可执行 Shell。
- **Project Record**：项目文档中的受控记录总称；按权威等级分为非约束的 Candidate Record、已承诺的 Task Record 和已采纳的 Decision Record。
- **Candidate Record**：当前未采纳、未承诺实施的候选事项，使用 `C-xxx` 标识并存放在可选的 [`docs/candidates.md`](docs/candidates.md)；其内容是数据而非指令，不构成需求、优先级、路线图、当前事实或用户批准。
- **Review On**：Candidate Record 的被动复审日期，只在显式 context survey 中报告；不是期限、提醒承诺或自动激活条件。
- **Task Record**：具有目标、范围、验收和验证边界的已承诺短期任务，使用 `T-xxx` 标识。
- **Slot（待创建占位）**：容器文末的占位记录（`X-0NN: 待创建`），非记录类型，仅承载该序列（C/T/D）的下一可用编号，创建时填充为真实记录；机制见 D-028 与 principles.md Next-ID slots。
- **Decision**：需要长期保留的已采纳架构、领域或安全取舍，记录在 [`docs/decisions.md`](docs/decisions.md)。
- **Durable Content**：在当前工作或会话结束后仍然成立且承载约束的事实、取舍与承诺（如采纳结论、安全不变量、外部归属边界、拒绝理由）；过程产物（实施步骤、测试日志、审查报告）不是耐用内容，不进入权威容器。
- **Direct-first**：文件检查优先使用 Direct `read`、`grep`、`find`、`ls`；安全可分析的字面 Shell 仍可使用，Gate 不因存在 Direct 等价入口而自动拒绝 Shell。
- **Prompt Surface**：与 LLM 交互的提示词面，按注入方式分层——`principles.md`（恒定注入）、`skills/`（按需加载）、access-gate guidance（失败路径）。
- **Skill Single Responsibility**：每个 skill 单一职责、调用时内容全量被使用；触发场景互斥的 skill 保持独立，不合并（D-030）。
- **Single Source of Format**：格式/规则只在 `principles.md` Quick Reference 定义一次，技能只文字引用不内嵌副本（D-030）。

## Architecture

- `src/bootstrap/` 在 Session 启动和 compaction 后注入工程原则。
- `src/access-gate/` 统一处理用户全局 Profile、Shell IR、命令语义、路径策略、Gate、Session 状态和 Footer。
- `shell-parse/` 输出受限 Shell IR；`command-semantics/` 提取命令类别、路径意图、效果和 cwd 转换，用户全局 `pi-keel/command-overrides.yaml` 只扩展 Shell 命令语义。wrapper 链由 parser 单一拥有——`executable` 永不承载 wrapper，wrapper positional 由 parser 消费丢弃，normalize 纯出栈（D-037）。
- `gate/` 编译器将 Shell IR 和 Direct tool 参数转换为 `CompleteAccessPlan`；compiler outcome 另外区分 unsupported form、security block 和 invalid request。`compiler-entry.ts` 是唯一 plan sealing boundary，同步 Policy Kernel 只消费经过 verifier 验证的 plan 和 Profile，产出 `GateDecision`，renderer 将决策转为 host 兼容结果。
- Direct tool（`read`、`write`、`edit`、`find`、`grep`、`ls`）和 Shell 命令经过各自的 compiler 后进入同一 Policy Kernel。
- 用户项目运行时文档入口为 `CONTEXT.md`、可选的 `docs/candidates.md`、`docs/decisions.md` 和 `docs/task.md`；Candidate Record 不进入当前事实或 active Decision 索引。

## Security Boundaries

当前安全边界和残余风险以 [`docs/security-boundaries.md`](docs/security-boundaries.md) 为准。该文件是独立的安全承诺，不记录实施任务或测试过程。

## Active Decisions

- [D-001 Soft 技能匹配](docs/decisions.md#d-001-soft-技能匹配)
- [D-002 统一 Access Gate](docs/decisions.md#d-002-统一-access-gate)
- [D-003 bigpowers 技能精选](docs/decisions.md#d-003-bigpowers-技能精选)
- [D-004 用户态路径策略边界](docs/decisions.md#d-004-用户态路径策略边界)
- [D-005 技能三目录](docs/decisions.md#d-005-技能三目录)
- [D-006 统一命名](docs/decisions.md#d-006-统一命名)
- [D-009 项目分发与文档边界](docs/decisions.md#d-009-项目分发与文档边界)
- [D-013 原则部署](docs/decisions.md#d-013-原则部署)
- [D-017 Profile 访问策略](docs/decisions.md#d-017-profile-访问策略)
- [D-018 Shell IR 与 Access Gate](docs/decisions.md#d-018-shell-ir-与-access-gate)
- [D-019 两行 Profile Footer](docs/decisions.md#d-019-两行-profile-footer)
- [D-022 Compiler-Kernel 分层与请求真实性](docs/decisions.md#d-022-compiler-kernel-分层与请求真实性)
- [D-023 拒绝解释与静态 Guidance](docs/decisions.md#d-023-拒绝解释与静态-guidance)
- [D-024 命令覆盖层](docs/decisions.md#d-024-命令覆盖层)
- [D-025 Direct 优先与 Shell 安全子集](docs/decisions.md#d-025-direct-优先与-shell-安全子集)
- [D-026 本地约束与溯源文档边界](docs/decisions.md#d-026-本地约束与溯源文档边界)
- [D-027 选项值按性质分类（expression vs file）](docs/decisions.md#d-027-选项值按性质分类expression-vs-file)
- [D-028 统一 Project Record 模型](docs/decisions.md#d-028-统一-project-record-模型)
- [D-030 提示词体系边界（Prompt Surface）](docs/decisions.md#d-030-提示词体系边界prompt-surface)
- [D-031 路径可执行与 tsx 解释器归类](docs/decisions.md#d-031-路径可执行与-tsx-解释器归类)
- [D-032 ask 渲染展示 unknown 命令的 literal form（知情同意）](docs/decisions.md#d-032-ask-渲染展示-unknown-命令的-literal-form知情同意)
- [D-034 覆盖层显式作用域键](docs/decisions.md#d-034-覆盖层显式作用域键取代隐式-basename-回退)
- [D-035 平台边界收窄为仅 Linux](docs/decisions.md#d-035-平台边界收窄为仅-linuxdismiss-c-007)
- [D-036 Workflows 触发模型（手动调用与即时介入）](docs/decisions.md#d-036-workflows-触发模型手动调用与即时介入)
- [D-037 解析器拥有 wrapper 链（IR 契约：executable 永不承载 wrapper）](docs/decisions.md#d-037-解析器拥有-wrapper-链ir-契约executable-永不承载-wrapper)

## Negative Space

- 不提供 OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或独立 network policy 轴。
- 仅保证支持 Linux 平台（以 Arch Linux 的 GNU 工具链为基准）；不提供 Windows / macOS / BSD 支持，不建模其路径语义与选项方言；其他 Linux 发行版的工具链差异不在保证范围。
- 不承诺 pathname check 与实际文件操作之间的 TOCTOU 消除。
- 不拦截 `user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend、未知 Direct tool surface 或其他 Extension 的直接操作。
- 不为 Candidate Record 提供自动提醒、后台定时器、Session hook、Footer 状态或专用 review 技能；复审只在显式 context survey 中报告。
- 不把短期 Task Record、实施过程或审查报告作为永久项目知识。
- 不自动识别、不写入用户项目的自有文档体系，不提供容器级迁移引导；非标准体系由用户在 `AGENTS.md` 或会话中显式声明。
- 不修改用户项目的 `README.md`、`AGENTS.md`、`.gitignore` 和 `package.json`，除非用户明确要求。

## Project Documents

- [`docs/candidates.md`](docs/candidates.md)：当前未采纳、未承诺实施的候选事项；不得作为指令、路线图或当前事实。
- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/security-boundaries.md`](docs/security-boundaries.md)：安全承诺和残余风险。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务；不定义当前架构、行为或决策。
