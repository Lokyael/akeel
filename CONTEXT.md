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
- **Reversal surface**：Decision Record 的可选属性，声明逆转该决策的批准面——`user-boundary`（安全不变量、归属边界、明确用户承诺，逆转须用户显式批准）或 `engineering`（模块级实现取舍，可在重构中经正常生命周期正式 supersede）；是上报信息而非许可（D-047）。
- **Durable Content**：在当前工作或会话结束后仍然成立且承载约束的事实、取舍与承诺（如采纳结论、安全不变量、外部归属边界、拒绝理由）；过程产物（实施步骤、测试日志、审查报告）不是耐用内容，不进入权威容器。
- **Direct-first**：文件检查优先使用 Direct `read`、`grep`、`find`、`ls`；安全可分析的字面 Shell 仍可使用，Gate 不因存在 Direct 等价入口而自动拒绝 Shell。
- **Prompt Surface**：与 LLM 交互的提示词面，按注入方式分层——`principles.md`（恒定注入）、`skills/`（按需加载）、access-gate guidance（失败路径）。
- **Skill Single Responsibility**：每个 skill 单一职责、调用时内容全量被使用；触发场景互斥的 skill 保持独立，不合并（D-030）。
- **Single Source of Format**：格式/规则只在 `principles.md` 参考节（Quick Reference / Project Records）定义一次，技能只文字引用不内嵌副本（D-030）。
- **子代理档位（tier）**：pi-subagents 子代理会话的权限档位，共两档——T0 `scratch`（复用主档 `keel-explore`，写仅 `/tmp/pi-work/**`）与 T1 `project`（`keel-subagent-project`，写 `project/**` + scratch）；读均全盘、shell 轴两档一致（inspect-only），差异只在 Direct 写面。机制与细节见 Architecture 与 D-039。
- **subagentProfiles 映射**：`config.yaml`（集中配置，D-041）可选顶层键，agent 名→档位名（`scratch`/`project`，`"*"` 回退），优先级 显式 > 内置默认 > `*`（D-039）。
- **父档位钳制**：父会话档位号（1=项目可写档，否则 0）经 `PI_KEEL_PARENT_TIER`（`"0"`/`"1"`）env 传播，父侧算好、子代理零解析；子代理生效档 = min(映射档, 父TIER)——子代理权限上限 = 父会话当前档位（D-039）。

## Architecture

- `src/bootstrap/` 在 Session 启动和 compaction 后注入工程原则。
- `src/access-gate/` 统一处理用户全局 Profile、Shell IR、命令语义、路径策略、Gate、Session 状态和 Footer。
- 子代理会话（pi-subagents `--mode json -p` 子进程，默认加载全局扩展）在 `session_start` 检测 `PI_SUBAGENT_CHILD`/`PI_SUBAGENT_CHILD_AGENT`，按 `subagentProfiles` 映射（优先级 显式 > 内置默认 > `*`）初始化为子代理档位（T0 `scratch`/T1 `project`）。T0 档 agent 必须无 mutation 工具（bash/write/edit）——pi-subagents 输出契约机制强制（有则被指令自写 output 与 T0 路径策略矛盾），scout 删 write+bash、researcher 原生即无。父会话档位号（1=项目可写档，否则 0）由父侧按自身 pathPolicy 算好，经 `PI_KEEL_PARENT_TIER` env 传播、子代理零解析；生效档 = min(映射档, 父TIER)——两档下即"父非项目可写 → 一律回退 T0 scratch"——子代理权限上限 = 父会话当前档位（D-039）。
- `shell-parse/` 输出受限 Shell IR；词值（引号剥离 + 转义解析）在 lexer 单点解码（bash 词义），`ShellArg.value` 为解码词值、`raw` 保留原文。`command-semantics/` 提取命令类别、路径意图、效果和 cwd 转换，用户全局 `pi-keel/config.yaml` 的 `commands` 段是 Shell 命令语义扩展入口（D-024/D-041）。wrapper 链由 parser 单一拥有（`resolvePreamble` 单点解析）——`executable` 永不承载 wrapper，wrapper positional 消费后保留在 `wrapperPositionals` 供 token 级扫描，normalize 纯出栈（D-037）。换行是命令分隔符（等价 `;`）；`&&`/`||`/`|`/`&` 与重定向操作符后紧跟的换行为行尾延续，不产分隔（bash 语义）。
- `gate/` 编译器将 Shell IR 和 Direct tool 参数转换为 `CompleteAccessPlan`；compiler outcome 的响应分类（shell-form/security-boundary/generic）由 `decision-code-catalog` 的 `DENY_RESPONSE_KIND` 全量表单一权威（拒绝单形状 `CompilationReject` 只携 code，渲染侧按 code 派生）。`compiler-entry.ts` 是唯一 plan sealing boundary（seal 处结构验证 + 品牌，D-046）；Policy Kernel 消费品牌检查通过的 plan 和 Profile，产出 `GateDecision`，renderer 将决策转为 host 兼容结果。物理分两层 + 共享根（D-022）：`plan/`（compiler-entry/shell-compiler/direct-tool-compiler/builder/preflight/access-plan-verifier 等）、`decision/`（evaluate/evaluate-request/decision-builder/render-decision）、根（`host`/`decision-types`/`decision-code-catalog`——被两层共用，避免循环依赖）；`plan/` 与 `decision/` 各经目录 index 单面化，跨目录消费统一走 index。
- `command-semantics/` 分类器：子命令提取收敛到统一引擎 `option-parse.ts`（值性质 file/expression/flag、位置参数性质 file/program-first/set、未知选项策略 opaqueOnUnknown 显式声明、class 调节原语 upgradeTo/downgradeTo，D-040）；git 用 token 级 `GIT_CLASSIFY` 声明表（cmd + upgrade/downgrade 调节，主流程经引擎定位子命令），stash/bundle 子命令族规则表化，config/branch 走专用 parser（D-040）；branch 标志单声明表（Opt + group 标签派生分类，单源）。adapter 接口 `analyze(node)` 单参（无项目上下文依赖，删除预留的 SemanticContext）。公共原语（makeSemantics/args/intent/rules/naming）在 command-semantics 根层按职责单文件，adapters 与 registry/overrides 同源引用（D-048，无 shared 合流模块）。
- `domain.ts` 是封闭世界语义模型：枚举词汇（类/操作/effect/来源/决策/工具面）三形态（VALUES/SET/TYPE）+ 派生映射表——类语义模型 `COMMAND_CLASS_EFFECTS`（defaults/requires）、effect 轴 `EFFECT_AXIS`、写面集合 `WRITE_SIDE_EFFECTS`（D-048）。类→基础 effect 蕴含、kernel 轴检查、编译器 requires 守卫、seal 边界 requires 证明侧（effects 覆盖类要求的运行时复核）都查表（D-022/D-048）。
- `path/`：glob 语言 `glob.ts` 编译一次、匹配多次（globstar：`*` 单段、`**` 跨段含零段）；编译边界在 path 层 WeakMap 记忆化（blocked 常量与 profile rules 按引用），判定零编译；通配符语言独立可测（D-048）。
- Direct tool（`read`、`write`、`edit`、`find`、`grep`、`ls`）和 Shell 命令经过各自的 compiler 后进入同一 Policy Kernel。
- `src/access-gate/ui/`：`footer-layout.ts` 纯布局/数据派生层（宽度助手显式注入，零宿主依赖）；`profile-footer.ts` 宿主桥（NativeFooter/pi-tui 选择 + 工厂）；`footer-install.ts` 安装。
- 用户项目运行时文档入口为 `CONTEXT.md`、可选的 `docs/candidates.md`、`docs/decisions.md` 和 `docs/task.md`；Candidate Record 不进入当前事实或 active Decision 索引。

## Active Decisions

- [D-002 统一 Access Gate 与用户态边界](docs/decisions.md#d-002-统一-access-gate-与用户态边界)
- [D-003 bigpowers 技能精选](docs/decisions.md#d-003-bigpowers-技能精选)
- [D-005 技能组织](docs/decisions.md#d-005-技能组织)
- [D-009 项目分发与文档边界](docs/decisions.md#d-009-项目分发与文档边界)
- [D-017 Profile 访问策略](docs/decisions.md#d-017-profile-访问策略)
- [D-018 Shell IR 与 Access Gate](docs/decisions.md#d-018-shell-ir-与-access-gate)
- [D-019 Profile Footer](docs/decisions.md#d-019-profile-footer)
- [D-022 Compiler-Kernel 分层与请求真实性](docs/decisions.md#d-022-compiler-kernel-分层与请求真实性)
- [D-023 决策渲染与知情同意（静态 Guidance + literal form）](docs/decisions.md#d-023-决策渲染与知情同意静态-guidance--literal-form)
- [D-024 命令覆盖层](docs/decisions.md#d-024-命令覆盖层)
- [D-025 Direct 优先与 Shell 安全子集](docs/decisions.md#d-025-direct-优先与-shell-安全子集)
- [D-028 统一 Project Record 模型](docs/decisions.md#d-028-统一-project-record-模型)
- [D-030 提示词体系边界与原则部署（Prompt Surface）](docs/decisions.md#d-030-提示词体系边界与原则部署prompt-surface)
- [D-031 路径可执行与 tsx 解释器归类](docs/decisions.md#d-031-路径可执行与-tsx-解释器归类)
- [D-035 平台边界收窄为仅 Linux](docs/decisions.md#d-035-平台边界收窄为仅-linuxdismiss-c-007)
- [D-036 Workflows 触发模型（手动调用与即时介入）](docs/decisions.md#d-036-workflows-触发模型手动调用与即时介入)
- [D-037 解析器拥有 wrapper 链（IR 契约：executable 永不承载 wrapper）](docs/decisions.md#d-037-解析器拥有-wrapper-链ir-契约executable-永不承载-wrapper)
- [D-039 子代理档位制（pi-keel × pi-subagents）](docs/decisions.md#d-039-子代理档位制pi-keel--pi-subagents)
- [D-040 命令语义分类与统一选项引擎](docs/decisions.md#d-040-命令语义分类与统一选项引擎)
- [D-041 集中配置（config.yaml）](docs/decisions.md#d-041-集中配置configyaml)
- [D-044 测试组织镜像 src 分层](docs/decisions.md#d-044-测试组织镜像-src-分层)
- [D-045 cd 目标存在性与幻影 cwd 双候选建模](docs/decisions.md#d-045-cd-目标存在性与幻影-cwd-双候选建模)
- [D-046 plan 验证收敛到 seal 边界（kernel 品牌检查）](docs/decisions.md#d-046-plan-验证收敛到-seal-边界kernel-品牌检查)
- [D-047 原则优先级与 Reversal surface 申报属性](docs/decisions.md#d-047-原则优先级与-reversal-surface-申报属性)
- [D-048 类语义模型收编 domain、glob 编译边界与 config 加载即校验](docs/decisions.md#d-048-类语义模型收编-domainglob-编译边界与-config-加载即校验)
- [D-049 内置 Profile 集合收敛（移除 keel-code/keel-query/keel-subagent-scratch）](docs/decisions.md#d-049-内置-profile-集合收敛移除-keel-codekeel-querykeel-subagent-scratch)
- [D-050 移除可选工具 adapter 支持](docs/decisions.md#d-050-移除可选工具-adapter-支持)
- [D-051 pi host 凭据文件边界（auth.json）](docs/decisions.md#d-051-pi-host-凭据文件边界authjson)

## Negative Space

- 不提供 OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或独立 network policy 轴。
- 自定义 profile 的矛盾配置（如 write 宽于 read、read=deny + write=allow 同路径）不在保证范围：write⇒read 是配置一致性预期（D-017），gate 不校验自定义配置一致性，也不为矛盾组合的行为追责。
- 仅保证支持 Linux 平台（以 Arch Linux 的 GNU 工具链为基准）；不提供 Windows / macOS / BSD 支持，不建模其路径语义与选项方言；其他 Linux 发行版的工具链差异不在保证范围。
- 不承诺 pathname check 与实际文件操作之间的 TOCTOU 消除：gate 是纯决策层，不执行文件操作，与执行方之间没有 fd 传递通道；消除需 pi 宿主提供 fd/OS 级原子机制，结构性超出 pi-keel 能力。
- 不拦截 `user_bash`、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend、未知 Direct tool surface 或其他 Extension 的直接操作；用户安装的其他 Extension 可直接调用 Node fs/child_process。
- 审批后的实际文件操作由操作系统权限决定；gate 只做前置策略检查，不控制执行后的行为。
- 不提供完整 security log scrubbing：执行记录（`BashExecutionMessage.command`）由 pi 宿主负责。
- `optionalAdapters` 配置字段和随包分发的可选工具 adapter 不再属于 pi-keel 的支持面；用户如需命令语义扩展，应使用 `commands`/`aliases`/`reclassify` 覆盖层。
- Shell IR 不是完整 Bash 语法树：结构化控制流（for/while/if/函数定义）没有安全语义；动态 token 在决策前 hard deny，未知命令按 `shellPolicy.unknown` 决策不代表语法已验证。
- 未建模的配置写手（yarn/pip/uv/cargo 等）的外部配置文件写入不经过 PathPolicy，按 modify + cwd 保守写检查；已建模的 git/npm/pnpm config 写目标经 PathPolicy（含 keel-build 的 `~/**` write=ask 规则）。
- 子代理读全盘（读面不钳制，源码内硬编码密钥不在 blocked paths 覆盖）；write 管路径不管内容（durable 内容防中毒靠父会话 git diff）；`/tmp/pi-work` 是约定非隔离（sticky 共享目录、无 symlink 检查）；父档位钳制基于 spawn 时 env 快照。
- 不为 Candidate Record 提供自动提醒、后台定时器、Session hook、Footer 状态或专用 review 技能；复审只在显式 context survey 中报告。
- 不把短期 Task Record、实施过程或审查报告作为永久项目知识。
- 不自动识别、不写入用户项目的自有文档体系，不提供容器级迁移引导；非标准体系由用户在 `AGENTS.md` 或会话中显式声明。
- 不修改用户项目的 `README.md`、`AGENTS.md`、`.gitignore` 和 `package.json`，除非用户明确要求。

## Project Documents

- [`docs/candidates.md`](docs/candidates.md)：当前未采纳、未承诺实施的候选事项；不得作为指令、路线图或当前事实。
- [`docs/decisions.md`](docs/decisions.md)：长期决策寄存器。
- [`docs/task.md`](docs/task.md)：活跃任务记录。
- [`docs/traceability.md`](docs/traceability.md)：外部来源、采用方式、文件映射和许可证义务；不定义当前架构、行为或决策。
