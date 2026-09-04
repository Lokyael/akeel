# Pi Keel Context

## Glossary

- **Access Gate**：拦截受管辖的 Pi `tool_call`，执行 Canonical → Admission → Policy → host composition；未受管辖的工具 passthrough。
- **Greenfield Semantic Rebuild**：新决策链只从 Pi/Bash/Linux 外部合同、明确政策语义和安全不变量设计；旧实现仅保留为 Git 历史参考。
- **Canonical Compilation**：对一个请求执行一次有界解释后发行的 opaque、不可变、可验真的编译制品；内部事实不作为公共 DTO 暴露。
- **Admission Plan**：Canonical Compilation 向授权域投影的最小 sealed 输入，只包含 Policy Kernel 实际消费的事实。
- **Policy Snapshot**：与配置格式无关、不可变的授权值；只由新 policy.yaml adapter 发行。
- **Policy Kernel**：只消费 Admission Plan 与 Policy Snapshot 的同步纯函数，不读取原始请求、配置 loader 或 Shell parser。
- **Guidance**：从决策代码到静态 bounded host-facing 文案的封闭映射，不携带可执行 Shell。
- **Project Record**：项目文档中的受控记录总称，分为 Candidate、Task 和 Decision。
- **Candidate Record**：未采纳、未承诺实施的 `C-xxx` 数据记录，不构成指令或路线图。
- **Task Record**：具有目标、范围、验收和验证边界的 `T-xxx` 短期任务。
- **Slot（待创建占位）**：容器文末承载 C/T/D 序列下一可用编号的占位，不是记录类型；创建时填充并追加新占位。
- **Decision**：需要长期保留的架构、领域或安全取舍，记录在 `docs/decisions.md`。
- **Reversal surface**：Decision 逆转所需的批准面；`user-boundary` 需用户显式批准，`engineering` 可经正式生命周期 supersede。
- **Durable Content**：工作结束后仍成立且承载约束的事实、取舍与承诺；过程产物不进入权威容器。
- **Direct-first**：文件检查优先使用 Direct `read`、`grep`、`find`、`ls`；新 pipeline 不因存在 Direct 等价入口自动拒绝安全可分析的 Shell。
- **Prompt Surface**：`principles.md` 恒定注入、`skills/` 按需加载，以及失败路径 guidance 三类 LLM 交互面。
- **Skill Single Responsibility**：每个 skill 只做一件事，调用时全量消费；触发场景互斥的 skill 保持独立。
- **Single Source of Format**：格式与规则只在 `principles.md` 参考节定义一次，技能只引用不复制。

## Architecture

- `src/bootstrap/` 在 Session 启动和 compaction 后注入工程原则。
- `src/access-gate/access-decision/` 是当前唯一决策实现：`core/` 负责 Pi host/config 无关的语义与策略，Linux pathname lookup 属于该语义域的外部合同；`adapters/` 转换 Pi 和 policy.yaml 输入，`runtime/` 负责 project/staging 生命周期和 host composition。
- Access Decision Pipeline（D-059/D-060）已完成 Greenfield trust path 与原子生产切换。Canonical 只解释一次；Admission 与 Display 按需投影；Policy Kernel 不读取配置或重新解析请求。Canonical path resolution 同时保留 lexical 与 symlink-target traversal prefixes，Direct search 与 Shell recursive path 均在 blocked descendants 上 fail-closed；有显式 path boundary 时，unknown/unbounded Shell path access 也不得放行。
- 受管辖 surface 为 Direct `read`、`write`、`edit`、`find`、`grep`、`ls` 与 Shell `bash`。无效 host context、unsupported syntax、硬安全边界和损坏政策 fail-closed；未拥有的工具 passthrough。
- 生产入口只读取 `$PI_CODING_AGENT_DIR/pi-keel/policy.yaml`（默认 `~/.pi/agent/pi-keel/policy.yaml`）。缺失文件是 deny-by-default；旧 config/Profile schema 不读取、不转换、不 fallback。
- `/profile`、Profile Footer、policy-selection UI 和 pi-keel 管理的 subagent tier/parent-tier 注册均缺席，等待独立任务从零重建。
- Prompt Surface（D-030/D-053）：Policy Snapshot、policy.yaml 和活动 policy 状态不进入 context 消息、tool description 或 system prompt；模型可见的政策相关文本只有静态失败 guidance。
- 旧决策实现、旧测试与 archive 不属于当前依赖边界，也不是 parity oracle。Static Flow、Explanation Replay 与 Runtime Content Flow 不属于 T-069。

## Active Decisions

- [D-002 统一 Access Gate 与用户态边界](docs/decisions.md#d-002-统一-access-gate-与用户态边界)
- [D-003 bigpowers 技能精选](docs/decisions.md#d-003-bigpowers-技能精选)
- [D-005 技能组织](docs/decisions.md#d-005-技能组织)
- [D-009 项目分发与文档边界](docs/decisions.md#d-009-项目分发与文档边界)
- [D-018 Shell IR 与 Access Gate](docs/decisions.md#d-018-shell-ir-与-access-gate)
- [D-022 Compiler-Kernel 分层与请求真实性](docs/decisions.md#d-022-compiler-kernel-分层与请求真实性)
- [D-023 决策渲染与知情同意（静态 Guidance + literal form）](docs/decisions.md#d-023-决策渲染与知情同意静态-guidance--literal-form)
- [D-024 命令覆盖层](docs/decisions.md#d-024-命令覆盖层)
- [D-025 Direct 优先与 Shell 安全子集](docs/decisions.md#d-025-direct-优先与-shell-安全子集)
- [D-028 统一 Project Record 模型](docs/decisions.md#d-028-统一-project-record-模型)
- [D-030 提示词体系边界与原则部署（Prompt Surface）](docs/decisions.md#d-030-提示词体系边界与原则部署prompt-surface)
- [D-031 路径可执行与 tsx 解释器归类](docs/decisions.md#d-031-路径可执行与-tsx-解释器归类)
- [D-035 平台边界收窄为仅 Linux](docs/decisions.md#d-035-平台边界收窄为仅-linuxdismiss-c-007)
- [D-036 Workflows 触发模型](docs/decisions.md#d-036-workflows-触发模型手动调用与即时介入)
- [D-037 解析器拥有 wrapper 链](docs/decisions.md#d-037-解析器拥有-wrapper-链ir-契约executable-永不承载-wrapper)
- [D-040 命令语义分类与统一选项引擎](docs/decisions.md#d-040-命令语义分类与统一选项引擎)
- [D-044 测试组织镜像 src 分层](docs/decisions.md#d-044-测试组织镜像-src-分层)
- [D-045 cd 目标存在性与条件 CWD 结果集](docs/decisions.md#d-045-cd-目标存在性与条件-cwd-结果集)
- [D-046 plan 验证收敛到 seal 边界](docs/decisions.md#d-046-plan-验证收敛到-seal-边界kernel-品牌检查)
- [D-047 原则优先级与 Reversal surface 申报属性](docs/decisions.md#d-047-原则优先级与-reversal-surface-申报属性)
- [D-048 类语义模型收编](docs/decisions.md#d-048-类语义模型收编-domainglob-编译边界与-config-加载即校验)
- [D-049 内置 Profile 集合收敛](docs/decisions.md#d-049-内置-profile-集合收敛移除-keel-codekeel-querykeel-subagent-scratch)
- [D-050 移除可选工具 adapter 支持](docs/decisions.md#d-050-移除可选工具-adapter-支持)
- [D-051 pi host 凭据文件边界](docs/decisions.md#d-051-pi-host-凭据文件边界authjson)
- [D-052 git clone 显式目标目录提取](docs/decisions.md#d-052-git-clone-显式目标目录提取)
- [D-053 Profile 数据零注入](docs/decisions.md#d-053-profile-数据零注入llm-上下文隔离)
- [D-054 提示词面引用可靠性边界](docs/decisions.md#d-054-提示词面引用可靠性边界指针化与内嵌的取舍判据)
- [D-056 归约展示视图](docs/decisions.md#d-056-归约展示视图坐标职责与-renderer-归属)
- [D-057 uv run 执行语义](docs/decisions.md#d-057-uv-run-执行语义)
- [D-059 Greenfield Access Decision Pipeline 与原子替换](docs/decisions.md#d-059-greenfield-access-decision-pipeline-与原子替换)
- [D-060 受保护 Canonical 制品、窄 Admission 投影与有界求值](docs/decisions.md#d-060-受保护-canonical-制品窄-admission-投影与有界求值)
- [D-061 T-069 Slice 0 外部边界冻结](docs/decisions.md#d-061-t-069-slice-0-外部边界冻结)
- [D-062 新 Policy 文件加载边界](docs/decisions.md#d-062-新-policy-文件加载边界)

## Negative Space

- 不提供 OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或独立 network policy 轴。
- 仅保证支持 Linux 平台；不提供 Windows、macOS、BSD 支持，也不建模其路径和选项方言。
- 不承诺 pathname check 与实际文件操作之间的 TOCTOU 消除；gate 只做纯决策，不执行文件操作或传递 fd。
- 不拦截 `user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend、未知 Direct tool surface 或其他 Extension 的直接操作。
- 审批后的实际文件操作由操作系统权限决定；gate 不控制执行后的行为，也不提供完整 security log scrubbing。
- 不提供 `/profile` 命令、Profile Footer、policy-selection UI 或 pi-keel 管理的 subagent tier/parent-tier 钳制；这些能力需后续独立重建。
- 旧 `config.yaml`、Profile、命令覆盖、继承和子代理字段不属于新 Policy Snapshot 输入；当前只读取全局 `policy.yaml` 的 `paths` 与 `commands`。
- Shell 只支持显式定义、可静态证明且资源有界的子集；不可证明形态 fail-closed。未建模的命令副作用不单独建模。
- 不把短期 Task Record、实施过程或审查报告作为永久项目知识。
- 不在 T-069 实现 Static Flow Graph、Explanation Replay、Runtime Audit Event 或 Runtime Content Flow。
- 不把旧实现结果当作正确性 oracle；旧代码、旧测试和 archive 只提供待重新证明的历史线索。
- 不自动识别或写入用户项目的自有文档体系；非标准体系由用户显式声明。

## Project Documents

- [`docs/candidates.md`](docs/candidates.md)：当前未采纳、未承诺实施的候选事项。
- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务。
