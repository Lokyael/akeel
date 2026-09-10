# AKeel Context

## Glossary

- **Access Gate**：拦截受管辖的 Pi `tool_call`，执行 Canonical → Admission → Policy → host composition；未受管辖的工具 passthrough。
- **Access Root**：AKeel 绑定到 Pi 会话创建时 `cwd` 的固定访问边界；不要求 Git root，不因 Shell `cd` 改变，也不向下猜测子仓库。
- **Tilde Expansion Authority**：Shell 中受限 tilde expansion 使用的唯一 home 来源；当前为会话初始化时 Pi 进程的 `$HOME`，不是额外的 Pi `home` 字段。
- **Greenfield Semantic Rebuild**：新决策链只从 Pi/Bash/Linux 外部合同、明确政策语义和安全不变量设计；旧实现仅保留为 Git 历史参考。
- **Canonical Compilation**：对一个请求执行一次有界解释后发行的 opaque、不可变、可验真的编译制品；内部事实不作为公共 DTO 暴露。
- **Verified Candidate**：Herdr 讨论完成问题处理与事实核对后生成、等待 Task Owner Session 导入确认的临时候选制品。
- **Admission Plan**：Canonical Compilation 向授权域投影的最小 sealed 输入，只包含 Policy Kernel 实际消费的事实。
- **Policy Snapshot**：与配置格式无关、不可变的授权值；只由新 policy.yaml adapter 发行。
- **Policy Preset**：会话可绑定的完整策略定位；内置 `review`、`guided`、`develop`，并可加载合法的自定义 preset；不使用继承式 Profile，`status` 是命令保留字。
- **Human-only Status**：只面向用户显示、不会进入 LLM context、tool description 或 system prompt 的策略状态或选择界面。
- **Access Gate Disabled Mode**：用户在 `policy.yaml` 中显式设置 `accessGate: disabled` 后，仅保留 bootstrap 与 skills，Access Gate 不执行 tool-call 准入。
- **Policy Kernel**：只消费 Admission Plan 与 Policy Snapshot 的同步纯函数，不读取原始请求、配置 loader 或 Shell parser。
- **Guidance**：从决策代码到静态 bounded host-facing 文案的封闭映射，不携带可执行 Shell。
- **Project Record**：项目文档中的受控记录总称，分为 Candidate、Task 和 Decision。
- **Candidate Record**：未采纳、未承诺实施的 `C-xxx` 停车记录，不构成指令或路线图。
- **Task Record**：用户已承诺调查、设计或实施的 `T-xxx` 短期工作记录。
- **Slot（待创建占位）**：承载 C/T/D 序列下一可用编号的非记录占位。
- **Decision**：需要长期保留的架构、领域或安全取舍，记录在 `docs/decisions.md`。
- **Reversal surface**：每条 Decision 显式声明的逆转批准面；`user-boundary` 需用户显式批准，`engineering` 可经正式生命周期 supersede。
- **Durable Content**：工作结束后仍成立且承载约束的事实、取舍与承诺；过程产物不进入权威容器。
- **Task Owner Session**：对一个 Task 的用户意图、Requirements、已采纳裁决、finding disposition、最终验收、发布和 Project Record 更新持有唯一权威的会话；多个 Owner 只承载互斥、可独立验收的范围。
- **Authority Context**：由 Task Owner Session 持有的用户原始意图、Requirements、已采纳的范围/架构/政策决策、finding disposition、最终验收、发布决定与 Project Record 更新。
- **Result-Necessary Context**：理解、审计、质疑或继续 child 定稿所必需的推理、实质被拒方案、引用证据、变更、验证、未决问题和残余风险。
- **Quarantined Process Context**：探索期有用但不具结果准入资格的搜索轨迹、完整日志、重复失败、无影响假设、工具时间线和中间草稿；留在隔离会话或 artifact。
- **Direct-first**：文件检查优先使用 Direct `read`、`grep`、`find`、`ls`；新 pipeline 不因存在 Direct 等价入口自动拒绝安全可分析的 Shell。
- **Prompt Surface**：`principles.md` 恒定注入、`skills/` 按需加载，以及失败路径 guidance 三类 LLM 交互面。
- **Constant Invariant**：跨任务持续成立且需恒定可见的行为约束，由 `principles.md` 承载，不包装为按需 skill。
- **Skill Responsibility**：`disciplines/` 承载可复用工程方法，`workflows/` 承载端到端编排；目录表达作者职责，不定义 Pi 加载机制。
- **Skill Single Responsibility**：每个 skill 只做一件事，调用时全量消费；触发场景互斥的 skill 保持独立。
- **Single Source of Format**：格式与规则只在 `principles.md` 参考节定义一次，技能只引用不复制。
- **Module Design**：针对已知模块或接口问题，以 depth、leverage、locality、testability、implementation cost 与 test seam 评估具体设计的 discipline。
- **Modularity Assessment**：用户明确调用后，在指定仓库或子系统中发现 shallow module、weak seam 与 scattered responsibility，并交付临时 findings 的 workflow。
- **Change Preflight**：提交或独立审查前，只把当前 Task 的活动变更清理并核对为 review-ready 或 blocked 的作者侧 discipline；不处理历史代码卫生或架构问题。
- **Review Surface**：独立代码审查开始时固定的不可变输入，覆盖适用的 branch commits、staged、unstaged、范围内 untracked 内容及其 Requirements；内容变化使旧审查结果失效。
- **Code Cleanup**：只在用户明确范围或已批准 maintenance scope 内执行的行为保持型深度维护；完成后重新进入文档同步、验证、preflight 与 review。
- **Reproduction Result**：`bug-reproduction` 交付的反馈信号结果，以 `reliable`、`probabilistic` 或 `blocked` 表示可用性，并携带 runner、症状判定、迭代成本、实测复现率、最小条件、调查工件与下一证据。

## Architecture

- `src/bootstrap/` 在 Session 启动和 compaction 后注入工程原则；通用 fresh-evidence 门禁属于该恒定面。Skills 只保留 `disciplines/` 可复用方法与 `workflows/` 端到端编排两个作者职责根。`module-design` 处理已知模块或接口设计；手动 `assess-modularity` 只发现仓库或子系统级结构摩擦并交付临时 findings。`implement-work` 在提交前编排 `change-preflight` 清理并核对当前活动变更，`code-review` 对固定 Review Surface 做独立只读审查，`code-cleanup` 只处理明确批准范围内的行为保持型深度维护。`bug-reproduction` 为难以稳定观察的技术问题建立 Reproduction Result，`systematic-debugging` 消费可用信号并以区分性实验确认根因，在授权范围内衔接 TDD 与 fix validation。Grilling 只由用户手动调用的 `grill-docs` 承载，按未决问题处理、候选方案确认、事实核对、verified candidate 交接和 Task Owner 导入的固定顺序执行。
- 委托按 D-075/D-076 执行上下文准入和封闭路由：Task Owner Session 保留 Authority Context；需要隔离过程上下文且结果仍由该 Owner 裁决的工作通过 Herdr child 同步执行，Owner 预定 artifact、等待 settle 后按路径拉取，child 不发送完成 prompt。可独立验收的长期工作只有经用户明确授权才进入范围互斥的新 Task Owner Session。有效能力含写入或文件修改 Shell 的 delegated agent 强制进入独立 worktree，新增的并行 Owner 也必须拥有不与其他 Owner 共享的 checkout；child 不自清理，由存活 Owner 负责检查、集成与明确批准后的回收。
- `src/access-gate/access-decision/` 是当前唯一决策实现：`core/` 负责 Pi host/config 无关的语义与策略，Linux pathname lookup 属于该语义域的外部合同；`core/program-semantics/` 负责 Git、解释器、Python 工具、uv 和 npm 族的程序分类与路径事实，Git `-C`、`--git-dir` 和 `--work-tree` 已通过 Canonical command-local cwd seam 解析，helper-capable Git 操作及 `git config` hard-deny；`adapters/` 转换 Pi 和 policy.yaml 输入，`runtime/` 负责 project/staging 生命周期和 host composition。运行时以 session-start cwd 作为固定 Access Root，不要求 Git root；Shell tilde expansion 使用会话初始化时的 `$HOME`。
- Access Decision Pipeline（D-059/D-060）已完成 Greenfield trust path 与原子生产切换。Canonical 只解释一次；Admission 与 Display 按需投影；Policy Kernel 不读取配置或重新解析请求。Canonical path resolution 同时保留 lexical 与 symlink-target traversal prefixes，Direct search 与 Shell recursive path 均在 blocked descendants 上 fail-closed；有显式 path boundary 时，unknown/unbounded Shell path access 也不得放行。path-form executable 不因已知 basename 获得 inspect/modify 语义，非破坏性形式统一按 opaque execute 处理。Git 显式项目内 `file://` remote 也在 Canonical 阶段转为 path fact；helper-capable Git 操作与 `git config` 保持 hard-deny，host、alias 和间接 config remote 继续 fail-closed。
- 受管辖 surface 为 Direct `read`、`write`、`edit`、`find`、`grep`、`ls` 与 Shell `bash`。无效 host context、unsupported syntax 和硬安全边界 fail-closed；外置 `policy.yaml` 缺失、为空或不可用时整体忽略并使用内置 `review` 基线，不部分采用无效内容；未拥有的工具 passthrough。
- 生产入口只读取 `$PI_CODING_AGENT_DIR/akeel/policy.yaml`（默认 `~/.pi/agent/akeel/policy.yaml`）。内置 `review`、`guided`、`develop` 不依赖外置文件；文件缺失、为空、格式/schema/legacy 不可用时整体忽略并使用内置 `review`，不部分采用、不读取旧 config/Profile schema，也不使用旧 fallback。
- Policy Preset 当前由 D-069 规定为内置 `review`、`guided`、`develop` 加 `policy.yaml` 自定义 preset；外部 flat policy 与自定义 preset 均使用完整的 `paths` 与 `commands` 定义，缺失必需字段时整体回退到内置 `review`；每个 preset 可拥有独立 path scope，系统 hard boundary 始终优先。`commands.destroy` 可在自定义 preset 中配置为 `allow`，但 D-071 规定所有 destroy/delete 操作永久 hard-deny，不产生 ask。D-068 定案其用户入口：原生 TUI 中 `/policy` 无参数打开临时 human-only 选择面板，显示所有已加载 preset，显式 `/policy <preset>` 入口保留，策略状态不常驻 UI。AKeel 管理的 subagent tier/parent-tier 注册和子代理策略管理仍属候选范围。
- 宿主拥有且用于保存实时凭据的凭据工件由 D-070 归入系统 hard boundary：对 Canonical 阶段明确识别的受管路径操作 `read`、`write`、`edit`、`list`、`search` 一律拒绝，preset 不得放宽；模板类工件不属于该类别。分类依据是受信任 agent 目录下的路径身份契约，不读取内容；保护范围是尽力覆盖，不递归扩大到父目录后代，也不为 opaque Shell access 增加凭据专用拒绝；`accessGate: disabled` 时不提供任何保护保证。
- Access Gate 默认启用；D-066 允许用户以唯一配置 `accessGate: disabled` 进入仅 bootstrap/skills 模式。禁用期间 AKeel 不提供 tool-call 操作准入或路径安全保证，重新启用需修改 policy.yaml 并重启会话。
- Prompt Surface（D-030/D-053/D-023）：Policy Snapshot、policy.yaml 和活动 policy 状态不进入 context 消息、tool description 或 system prompt；模型可见的政策相关文本只有受 D-023 限定的静态失败 Guidance。
- 旧决策实现、旧测试与 archive 不属于当前依赖边界，也不是 parity oracle。Static Flow、Explanation Replay 与 Runtime Content Flow 不属于 T-069。

## Active Decisions

- [D-002 统一 Access Gate 与用户态边界](docs/decisions.md#d-002-统一-access-gate-与用户态边界)
- [D-003 bigpowers 技能精选](docs/decisions.md#d-003-bigpowers-技能精选)
- [D-009 项目分发与文档边界](docs/decisions.md#d-009-项目分发与文档边界)
- [D-018 Shell 语义与 Access Gate](docs/decisions.md#d-018-shell-语义与-access-gate)
- [D-023 决策渲染、静态 Guidance 与知情同意（literal form）](docs/decisions.md#d-023-决策渲染静态-guidance-与知情同意literal-form)
- [D-025 Direct 优先与 Shell 安全子集](docs/decisions.md#d-025-direct-优先与-shell-安全子集)
- [D-028 统一 Project Record 模型与 Candidate 显式复审](docs/decisions.md#d-028-统一-project-record-模型与-candidate-显式复审)
- [D-030 提示词体系边界与原则部署（Prompt Surface）](docs/decisions.md#d-030-提示词体系边界与原则部署prompt-surface)
- [D-035 平台边界收窄为仅 Linux](docs/decisions.md#d-035-平台边界收窄为仅-linuxdismiss-c-007)
- [D-037 Shell wrapper 链由语义入口统一解析](docs/decisions.md#d-037-shell-wrapper-链由语义入口统一解析)
- [D-044 测试组织镜像 src 分层](docs/decisions.md#d-044-测试组织镜像-src-分层)
- [D-045 Shell 条件流的有界 CWD 结果集](docs/decisions.md#d-045-shell-条件流的有界-cwd-结果集)
- [D-047 原则优先级与 Reversal surface 申报属性](docs/decisions.md#d-047-原则优先级与-reversal-surface-申报属性)
- [D-052 Git clone 目标路径与选项边界](docs/decisions.md#d-052-git-clone-目标路径与选项边界)
- [D-053 Policy 数据零注入](docs/decisions.md#d-053-policy-数据零注入llm-上下文隔离)
- [D-054 提示词面引用可靠性边界](docs/decisions.md#d-054-提示词面引用可靠性边界指针化与内嵌的取舍判据)
- [D-059 Greenfield Access Decision Pipeline 与原子替换](docs/decisions.md#d-059-greenfield-access-decision-pipeline-与原子替换)
- [D-060 受保护 Canonical 制品、窄 Admission 投影与有界求值](docs/decisions.md#d-060-受保护-canonical-制品窄-admission-投影与有界求值)
- [D-063 Direct edit 独立策略与显式本地配置](docs/decisions.md#d-063-direct-edit-独立策略与显式本地配置)
- [D-066 Access Gate 显式禁用与仅技能运行模式](docs/decisions.md#d-066-access-gate-显式禁用与仅技能运行模式)
- [D-067 Canonical 程序语义族、可执行文件身份与委托执行边界](docs/decisions.md#d-067-canonical-程序语义族可执行文件身份与委托执行边界)
- [D-068 Policy preset 临时 TUI 选择面板，不恢复常驻 Footer](docs/decisions.md#d-068-policy-preset-临时-tui-选择面板不恢复常驻-footer)
- [D-069 Policy 文件、内置与自定义 Preset 及独立路径范围](docs/decisions.md#d-069-policy-文件内置与自定义-preset-及独立路径范围)
- [D-070 宿主凭据工件的系统硬边界与分类规则](docs/decisions.md#d-070-宿主凭据工件的系统硬边界与分类规则)
- [D-071 Destroy 操作永久硬拒绝](docs/decisions.md#d-071-destroy-操作永久硬拒绝)
- [D-072 Session 启动 cwd 作为访问根与 `$HOME` 的受限 tilde 语义](docs/decisions.md#d-072-session-启动-cwd-作为访问根与-home-的受限-tilde-语义)
- [D-073 Skill 作者职责与恒定不变量归属](docs/decisions.md#d-073-skill-作者职责与恒定不变量归属)
- [D-074 单一 grill-docs 分阶段工作流](docs/decisions.md#d-074-单一-grill-docs-分阶段工作流)
- [D-075 Task Owner 上下文准入、Herdr 同步委托与 Worktree 隔离](docs/decisions.md#d-075-task-owner-上下文准入herdr-同步委托与-worktree-隔离)
- [D-076 Herdr 统一委托执行面](docs/decisions.md#d-076-herdr-统一委托执行面)
- [D-077 Decision 寄存器的轻量 hygiene 校验](docs/decisions.md#d-077-decision-寄存器的轻量-hygiene-校验)
- [D-078 Workflows 触发模型](docs/decisions.md#d-078-workflows-触发模型手动调用与即时介入)
- [D-079 模块设计方法与模块化评估工作流分界](docs/decisions.md#d-079-模块设计方法与模块化评估工作流分界)
- [D-080 当前变更预检、独立代码审查与显式深度清理分界](docs/decisions.md#d-080-当前变更预检独立代码审查与显式深度清理分界)
- [D-081 复现信号与系统化根因调试分界](docs/decisions.md#d-081-复现信号与系统化根因调试分界)

## Negative Space

- 不提供 OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或独立 network policy 轴。
- 仅保证支持 Linux 平台；不提供 Windows、macOS、BSD 支持，也不建模其路径和选项方言。
- 不承诺 pathname check 与实际文件操作之间的 TOCTOU 消除；gate 只做纯决策，不执行文件操作或传递 fd。
- 不拦截 `user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend、未知 Direct tool surface 或其他 Extension 的直接操作。
- 审批后的实际文件操作由操作系统权限决定；gate 不控制执行后的行为，也不提供完整 security log scrubbing。
- 不提供旧式 `/profile` 命令或 Profile Footer；Policy Preset 使用 `/policy` 的临时 human-only TUI 选择面板、显式命令和状态查询，不提供独立的旧 Profile UI 或常驻 Footer。自定义 preset 不通过 UI 创建或编辑。
- 不提供 AKeel 管理的 subagent tier/parent-tier 钳制或子代理 preset 继承；这些能力仍属候选范围。
- Access Gate 可由用户显式禁用；禁用时不拦截 managed tool call，故不提供路径、Shell 或操作准入保证。bootstrap 与 skills 仍然分发和运行。
- 旧 `config.yaml`、Profile、命令覆盖、继承和子代理字段不属于新 Policy Snapshot 输入；当前只读取全局 `policy.yaml` 的静态策略字段、preset 绑定或显式 `accessGate` 禁用标志。
- Shell 只支持显式定义、可静态证明且资源有界的子集；不可证明形态 fail-closed。`core/program-semantics/` 中的已知程序仍需提供 bounded path 事实；解释器脚本、uv run、npm/pnpm/yarn 执行、npx、pytest 和未知子命令等委托执行保持 opaque，在显式 path boundary 下 hard-deny。所有 Canonical `destroy`/`delete` 操作永久 hard-deny；`commands.destroy: allow` 仅可作为自定义 preset 的合法配置值，不改变该边界。Git local transport 仅接受可解析的项目内 `file://` path；HTTPS/SSH 等外部 transport、host、alias、间接 config、ext transport 和其他未建模形态继续 hard-boundary。未建模的命令副作用不单独建模。
- 不把短期 Task Record、实施过程或审查报告作为永久项目知识。
- 不在 T-069 实现 Static Flow Graph、Explanation Replay、Runtime Audit Event 或 Runtime Content Flow。
- 不把旧实现结果当作正确性 oracle；旧代码、旧测试和 archive 只提供待重新证明的历史线索。
- Access Root 固定为会话启动时的 `cwd`；不自动向下选择子 Git 仓库，不因 cwd 位于 Git 子目录而向上扩大到 Git root，也不在会话内因 Shell `cd` 改变访问根。用户显式项目选择器、多个 Access Root 和动态切换仍不提供。
- Shell tilde expansion 只把受支持 Shell word 开头的未引用、未转义裸 `~` 或 `~/` 映射到会话初始化时的 `$HOME`；普通文件名、引用/转义形式、`~user`、动态或未建模形式不映射为 home。Direct path 不继承该 Shell 语义。
- 不自动识别或写入用户项目的自有文档体系；非标准体系由用户显式声明。
- 不分发独立 `grill-plan` 或响应自然语言 grill 触发词；grilling 只由用户手动调用 `grill-docs`。
- 不把 Herdr 声明为 AKeel runtime dependency；`grill-docs` 使用 Herdr 固定执行面和同步 artifact pull。当前不提供异步 child mailbox、receipt、自动续跑、结果聚合或自动 worktree 回收；长期独立工作使用用户授权、范围互斥的 Task Owner Session。
- `assess-modularity` 不提供覆盖数据所有权、运行时拓扑、部署、可靠性、安全和容量的广义 architecture review，也不实施或采纳其 findings。

## Project Documents

- [`docs/candidates.md`](docs/candidates.md)：当前未采纳、未承诺实施的候选事项。
- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务。
