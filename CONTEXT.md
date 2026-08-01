# Pi Keel Context

## Glossary

- **Profile**：当前 Session 唯一的访问策略入口，组合 Shell 决策、路径规则和审批行为。
- **Access Gate**：拦截 Pi `tool_call` 并执行 compiler → Policy Kernel → guidance renderer → host adapter 的统一策略层。
- **CompleteAccessPlan**：compiler 产出的不可变、可验证的访问计划；不包含 allow/deny 等授权结果。
- **Policy Kernel**：消费经过 verifier 验证的 `CompleteAccessPlan` 和 `Profile`，产出结构化 `GateDecision`；不依赖原始 Shell。
- **GateDecision**：`allow | ask | deny(hard/profile/user)` 的封闭决策类型；每个 deny 附带稳定 `DecisionCode`。
- **Guidance**：从 `DecisionCode` 到静态 `GuidanceId` 的封闭映射，不携带可执行 Shell。
- **Task Record**：具有目标、范围、验收和验证边界的短期任务，使用 `T-xxx` 标识。
- **Decision**：需要长期保留的架构、领域或安全取舍，记录在 [`docs/decisions.md`](docs/decisions.md)。
- **Direct-first**：文件检查优先使用 Direct `read`、`grep`、`find`、`ls`；安全可分析的字面 Shell 仍可使用，Gate 不因存在 Direct 等价入口而自动拒绝 Shell。

## Architecture

- `src/bootstrap/` 在 Session 启动和 compaction 后注入工程原则。
- `src/access-gate/` 统一处理用户全局 Profile、Shell IR、命令语义、路径策略、Gate、Session 状态和 Footer。
- `shell-parse/` 输出受限 Shell IR；`command-semantics/` 提取命令类别、路径意图、效果和 cwd 转换，用户全局 `command-overrides.yaml` 只扩展 Shell 命令语义。
- `gate/` 编译器将 Shell IR 和 Direct tool 参数转换为 `CompleteAccessPlan`；compiler outcome 另外区分 unsupported form、security block 和 invalid request。`compiler-entry.ts` 是唯一 plan sealing boundary，同步 Policy Kernel 只消费经过 verifier 验证的 plan 和 Profile，产出 `GateDecision`，renderer 将决策转为 host 兼容结果。
- Direct tool（`read`、`write`、`edit`、`find`、`grep`、`ls`）和 Shell 命令经过各自的 compiler 后进入同一 Policy Kernel。
- 用户项目运行时文档入口为 `CONTEXT.md`、`docs/decisions.md` 和 `docs/task.md`。

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
- [D-021 Task Record 术语](docs/decisions.md#d-021-task-record-术语)
- [D-022 Compiler-Kernel 分层与请求真实性](docs/decisions.md#d-022-compiler-kernel-分层与请求真实性)
- [D-023 拒绝解释与静态 Guidance](docs/decisions.md#d-023-拒绝解释与静态-guidance)
- [D-024 命令覆盖层](docs/decisions.md#d-024-命令覆盖层)
- [D-025 Direct 优先与 Shell 安全子集](docs/decisions.md#d-025-direct-优先与-shell-安全子集)
- [D-026 本地约束与溯源文档边界](docs/decisions.md#d-026-本地约束与溯源文档边界)
- [D-027 选项值按性质分类（expression vs file）](docs/decisions.md#d-027-选项值按性质分类expression-vs-file)

## Negative Space

- 不提供 OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或独立 network policy 轴。
- 不承诺 pathname check 与实际文件操作之间的 TOCTOU 消除。
- 不拦截 `user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend、未知 Direct tool surface 或其他 Extension 的直接操作。
- 不把短期 Task Record、实施过程或审查报告作为永久项目知识。
- 不修改用户项目的 `README.md`、`AGENTS.md`、`.gitignore` 和 `package.json`，除非用户明确要求。

## Project Documents

- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/security-boundaries.md`](docs/security-boundaries.md)：安全承诺和残余风险。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务；不定义当前架构、行为或决策。
