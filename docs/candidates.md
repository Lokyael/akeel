# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Revisit condition` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。

## C-008: delegated child scratch 的本机隔离

- **Why Not Now:** 当前没有真实证据要求 delegated child scratch 对其他本机用户不可读取；现有临时目录约定足以支撑当前工作流，但不承诺物理隔离。`stagingRoot` 是 AKeel runtime 的会话级临时根，不是 delegated child scratch 合同；旧 `/tmp/pi-work` 路径也不作为兼容目标。
- **Scope:** 仅评估 scratch 的物理隔离、独立生命周期和本机用户间可见性；不恢复旧 `staging/**` 规则，不改变 `stagingRoot` runtime 语义，不处理父子代理策略传播或资源自动回收。
- **Revisit condition:** delegated child 场景出现共享临时目录 symlink 攻击实证，或用户要求 scratch 内容不可被本机其他用户读取。

## C-009: delegated child 的任务能力分层与风险边界

- **Why Not Now:** 当前没有真实 delegated workflow 证明现有能力不足以完成任务，或证明 child 必须自行执行验证才能形成可审计结果；宽泛 execute 仍可能变成任意代码执行授权，`node -e` 等形态不能因“验证”名义获得能力。
- **Scope:** 评估按任务类型授予最小能力：只读调查、受限修改和有界验证分别处理；删除、发布和任意执行不作为普通 child 能力。子代理能力不得超过父会话，授权关系不明时不得放宽；不预设 T0/T1/T2、角色映射、策略传播或具体执行面，也不把 worktree 隔离解释为执行授权。
- **Revisit condition:** 真实 delegated workflow 证明当前能力分层无法完成必要任务或形成可审计结果，且现有同步 Owner 验证或其他受限替代不能合理闭环；或用户明确要求重新评估该能力边界。

## C-010: delegated child 的 durable 文档写保护

- **Why Not Now:** D-075 已通过独立 worktree、唯一 Task Owner 和显式结果导入隔离 delegated write；默认禁止 child 修改 `CONTEXT.md` 或 `docs/` 会同时破坏合法的文档更新和审查准备。仅有 child 在隔离 worktree 中产生文档 diff，不等于权威内容已被污染。
- **Revisit condition:** 出现 delegated child 对 durable 文档的越权修改被误导入 Owner checkout，或现有 worktree 与 Owner review 无法可靠阻止同类污染的实证。

## C-011: pi-guard 命令语义实现参考

- **Why Not Now:** 当前 AKeel 已有独立的 Canonical → Admission → Policy 程序语义边界，尚无真实工作流证明需要参考 pi-guard；其实现不作为正确性依据。
- **Exploration Direction:** 对照 pi-guard 的命令识别、选项和值消费、wrapper、路径、未知形态与 hard-boundary 处理和当前 public seam；仅在真实需求下依据 Bash/Linux 合同与安全边界重新证明后采纳，不追求 parity 或代码复制。
- **Boundary:** 不处理安装共存、装配顺序、重复拦截、升级或运行时互操作；不自动恢复命令覆盖或创建实现 Task。
- **Revisit condition:** 真实工作流受当前命令语义覆盖或处理方式阻塞，且 pi-guard 提供可核查参考证据；或用户明确要求开展有界对照复核。

## C-015: 复杂 Shell 语义验证方法收敛（停止判据 + Bash 差分语料仲裁）

- **Why Not Now:** 当前没有已采纳的 Shell 语义扩展 Task 需要新增验证机制；现行支持子集已有基于 Bash/Linux 外部合同和 public seam 的测试。独立差分语料会增加 oracle、fixture 与跨版本维护成本，只有未来语义扩展暴露纸面分析无法仲裁的分歧时才值得采用。
- **Proposal:** ①当架构级与下近似疑点均已转化为可执行语料，继续纸面评审不再能区分替代语义时停止纸面评审，不采用固定评审轮数；②建立由真实 Bash 行为独立核对的差分语料，以 `literal input → expected Canonical outcome/facts → expected Policy/render result` 锁定当前 public seam；③每个新增 Shell 语义守卫必须附带至少一条能证明其必要性的语料；④按高风险语义垂直切片实施并以差分测试收敛，不以旧实现、旧 reducer 或旧测试输出作为 oracle。
- **Revisit condition:** 已采纳的 Shell 语义扩展（包括 C-029 若未来被采纳）出现纸面模型与真实 Bash 行为无法仲裁的分歧，或用户明确选择建立差分语料体系。

## C-016: 项目 `.env` 的受管读取与按名掩码

- **Why Not Now:** 当前没有真实需求证明 agent 必须批量读取项目 `.env`，也没有已采纳的结构化读取工具合同。把掩码放在 deny/ask renderer 或 Shell 管道中会先暴露原值；按内容猜测 secret 又无法形成可靠保证。该能力还需重新核对 D-023 的渲染边界、D-060 的纯决策职责和 D-069 的配置输入，不能从现有路径准入顺手放宽。
- **Exploration Direction:** 若采用，应把 `.env` 建成独立 Managed Env Read Surface：AKeel 进程内读取结构化 `K=V`，仅按受校验的变量名契约分类，并在任何 tool result、日志或事件产生前把 protected 名替换为 `key=****`；allow/neutral 名是否返回原值需由明确合同决定。原始 `cat .env`、Shell 管道掩码、递归聚合读取和普通 Direct read 不因该受管面获得放行。历史 proposal 把 `protected`、`allow` 与 neutral 作为三类：protected 曾包含 `*(KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|BEARER)` 与 `*(HOST|URL|URI|ENDPOINT|IP|ADDR|CONN*|DBCONN*)` 等候选模式，allow 曾列出 `NODE_ENV`、`PORT`、`DEBUG`、`LOG_LEVEL`、`APP_NAME`、`REGION`、`TZ`，其余为可见但不可写的 neutral；这些模式、默认值、IP/URL 分类、用户覆盖和与写能力是否共用配置都只是复审输入，必须在采纳时重新证明。
- **Safety Boundary:** 只有“原始值不离开可信进程”时才可声称掩码；受管面不得 debug-log 原始内容，拒绝路径在读取文件前完成。按名掩码不覆盖名称未分类但值中含 secret、IP 或 URL 的变量；不提供按内容兜底保证。磁盘本体、其他 extension 的 Node fs、用户编辑器、被放行的 Shell、host 侧工具调用记录和进程输出仍在 AKeel 保证之外。
- **Revisit condition:** 用户需要 agent 检查项目 `.env` 的非敏感配置且普通整读因泄露风险不可接受，或出现可验证的按名掩码受管读取需求。

## C-019: 当前会话 Context watermark 的 human-only 预警

- **Why Not Now:** Pi 已通过 Extension `ctx.getContextUsage()` 提供当前模型的 context usage，并自带自动 compaction；常规任务通常在窗口耗尽前结束，当前没有重复证据证明 AKeel 还需增加独立预警。固定 token 数也不能跨模型表达同一风险。
- **Exploration Direction:** 只探索当前会话的 human-only 水位提示：从公开 `ctx.getContextUsage()` 获取使用量并结合当前模型 context window 计算比例，在不注入 LLM context、不扫描 session JSONL、不改变 compaction 和 Task 生命周期的前提下提醒用户。阈值必须可解释且有实际长会话测量依据；预警不声称 Git、测试或当前 Slice 已达到安全交接点，也不自动终止会话。
- **Out of Scope:** 跨 Agent/session 文件扫描、Herdr pane 总览、自动生成交接、自动切换会话和主动停机；安全收敛与交接由 C-037 独立评估。
- **Revisit condition:** 多个大型任务反复出现可测的 context 膨胀、推理退化或成本异常，且 Pi 自动 compaction 与现有人工状态显示不能满足预警需求；或用户明确要求 human-only 水位提醒。

## C-020: Content Flow checkpoint governance（仅探索方向）

> 本条只记录 Content Flow checkpoint 的未来探索；不改变现有 Access Gate 行为。

- **Why Not Now:** 当前项目只有 Operation Admission 信任链，没有可验证的 Content Flow producer/consumer、payload capture、enforcement 或 receipt seam。现在实现会把宿主的 substitution/projection 误称为发布控制，并制造超出实际能力的安全承诺。
- **Exploration Direction:** 若未来具备真实 seam，重新探索以下边界：Operation Admission 与 Content Flow 独立；静态 Normalized Flow 与运行时 Evidence 分离；Publication、Network Send、Process Start、File Commit 各自拥有 checkpoint 规则、授权、enforcement 和 receipt；只有受控绑定的 `exact` evidence 才能参与进一步判断，`unknown`/`unavailable`/`no-coverage` 不得解释为 clean、safe 或 permit；payload、lineage 和运行时授权不进入 `CompleteAccessPlan`。
- **Revisit condition:** 用户明确启动 Content Flow 方向的探索，或宿主提供可测试的发布/发送/进程/提交 enforcement seam，并出现真实 producer/consumer 工作流。

## C-021: 受管执行的 OS-level confinement

> 本条只记录宿主执行期物理隔离的未来探索；不把 sandbox runtime 纳入当前 Access Decision Core。

- **Why Not Now:** Access Gate 当前只拥有 tool-call 准入权，不拥有已放行进程、helper、子进程或 socket 的执行控制权。仅增加 `network` 标签、preset 或路径策略不能限制运行期外联；Pi 也尚未提供可验证的执行包装与隔离 seam。
- **Exploration Direction:** 只有宿主提供实际执行接缝后，才比较由独立 provider 建立的 Linux 隔离配置。provider 必须能证明文件系统、网络、凭据可见性、子进程、进程树终止和输出处理；Access Gate 只声明所需能力，不自行调用 Shell 包装器。若策略要求隔离而 provider 不可用，结果必须是拒绝；`prefer` 式降级只能明确表示“未隔离”，不能继续作出隔离承诺。
- **Boundary:** provider 不改变 Canonical、Admission、Mandatory Boundary 或 Policy 的语义；worktree、path admission、preset 和 Gate disabled 都不能被描述为 OS sandbox。C-039 只处理已知外部状态变更，C-020/C-038 分别处理内容流与不可信输入权威。
- **Revisit condition:** 用户正式启动外部不可信仓库的自动化审计、构建或重构流水线；供应链脚本或 helper 执行成为高频实际威胁；Pi 提供可测试的执行接缝；或用户明确要求评估 Linux OS-level confinement。


## C-023: 项目级 Policy 单向收紧

> 本条只记录未来项目局部安全声明的探索，不构成当前配置合同、实现承诺或项目文件信任保证。

- **Why Not Now:** D-069 当前只接受全局 `policy.yaml`，尚未定义项目配置的发现、信任、合成、错误处理或审计合同。过早增加项目规则会同时扩大配置来源和静态证明负担；当前也没有复杂仓库反复误碰核心文件的实证。
- **Exploration Direction:** 只探索在全局 Policy 与系统 hard boundary 之上追加项目局部限制，不允许项目配置扩大任何权限。复审必须定义可信项目、配置位置、全局与项目规则合成、非法或不可读配置的 fail-closed 行为、preset 切换关系，以及项目内容不能通过自带配置解除宿主边界。发布脚本、分支配置等项目工件只是可能用例，不预先形成默认清单。
- **Out of Scope:** 网络副作用授权由 C-039 评估；参数级隐式执行由对应程序语义合同评估；`.env` 受管面、历史敏感路径和 OS confinement 分别由 C-016/C-035/C-036、C-026 与 C-021 评估，不在本记录内组成统一“多维策略”。
- **Revisit condition:** 真实复杂仓库反复出现需要项目局部限制、且全局 policy 无法合理表达的误操作风险；或用户明确要求只收紧、不放宽的项目级 Policy overlay。

## C-025: Access Decision 历史差异复核清单（调查候选）

> 本条保存 `c52bd1d` 重构前实现与当前 Access Decision Pipeline 的历史差异、风险和待核对问题。唯一候选事项是未来是否启动这次系统复核；清单不是功能 backlog、恢复授权、parity 目标或当前实现合同。

- **Why Not Now:** 当前实现已按 D-059/D-060 完成 Greenfield trust path 与生产切换，目标不是复刻旧 `command-semantics/gate/profile` 行为；旧实现和旧测试只提供历史线索，不能作为正确性 oracle。完整复核会同时触及安全、配置、UI、可用性、迁移和子代理边界，尚未成为已承诺调查。
- **Review Contract:** 每个检查点分别核对 historical evidence、current evidence、外部合同与安全不变量，再由用户选择“确认当前行为 / 重新设计或恢复经证明的子集 / 文档同步 / 明确退役 / 发现实现与存活 Decision 不一致 / 迁移为独立 Task、Decision 或 Candidate”。清单覆盖保留不变、增强、收窄和删除项，按可独立判断的行为族组织，不按旧测试数量追求 parity；命令、选项、输入边界和测试细节归入对应功能族或横切检查项。当前实现、已有 Decision 和相关 Candidate 只构成证据或交叉引用；相关 Candidate 可以承载独立未来设计，但不能替代本记录的历史差异问题，未逐项裁决前也不得删除本地检查语义或预选结论。
- **Current external dispositions pending this review:**
  - **Resolved cluster:** `Project root and session lifecycle` 与 `Home resolution authority` 当前由 [D-072](decisions.md#d-072-session-启动-cwd-作为访问根与-home-的受限-tilde-语义) 定义；这约束现行行为，但不证明 C-025 已核对旧 Git-root 前置、额外 host `home` 字段及其全部外部场景。正式复核不得无授权逆转 D-072，也不得把 Decision 的存在当作该检查已完成。
  - **Migrated cluster:** `Bounded static iteration semantics` 已由 C-029 独立保存未来设计边界；C-025 仍保留“旧 reducer 与当前 unsupported `for` 的差异是否被正确处置”这一历史核对，不以迁移本身视为完成。

### Host、runtime 与 Direct tool 合同

  - **Production entry:** 当前入口只调用 `installGlobalPiAccessDecision()`。候选问题：是否需要重新暴露更丰富的 runtime 装配层。
  - **Direct managed surfaces:** 旧版与当前均管理 `read`、`write`、`edit`、`find`、`grep`、`ls`；当前 host adapter 规范化为 `read/write/edit/list/search`。候选问题：是否补充 surface 映射文档。
  - **Direct tool argument schema:** 旧版 Direct schema 允许 `grep.glob`，且 `read.offset/limit` 最小值按旧 schema 可为 0；旧 `find.path` 与 `find.pattern` 均可省略。当前 search 只接受 `path`/`pattern`，`list` 与 `search` 的 `path` 均可省略并默认当前 cwd，但统一 `search.pattern` 必须为非空字符串，`read.offset/limit` 必须为正整数，并对 `write/edit/search` 文本、NUL 与 key 集更严格。候选问题：是否恢复特定参数兼容、修正文档，或明确收窄。
### Canonical、Admission 与路径事实

  - **Effect vocabulary / policy axis:** 旧版封闭 effect 词汇含 `read/search/write/delete/permissionChange/execute/network/cwdChange`，并区分 path/shell effect axis；当前 Shell effect 收敛为 `read/write/delete/execute/cwd-change`，Policy Kernel 对每个 operation 同时按 effect（`read`/`cwd-change` 使用 read policy，`write`/`delete` 使用 write policy）与 command class 决策，`delete`/`destroy` 仍优先进入 hard boundary。当前 Shell effects 由 Canonical/Admission 承载并仍被 Policy 消费，`write`、`delete`、`cwd-change` 等事实不能在没有消费者与安全边界证明时因“精简”而裁剪；目前也没有可测 plan 体积问题。复核是否确认当前词汇与投影、明确退役旧 effect 轴、恢复经证明的 effect、记录架构差异，或在出现新消费者/性能证据后重新设计。
  - **Resource and analysis limits:** 旧版主要由 parser/plan 结构失败与旧 preflight 约束；当前新增显式资源上限，包括 Direct 文本字节、Shell command 字节、Shell command 数、cwd state 数与 edit entry 数。候选问题：是否把这些上限作为新安全/性能合同文档化，并确认默认值是否合适。
  - **Policy path canonicalization:** 旧版配置路径规则作为 glob/virtual path 规则加载；当前 `allowedRoots`、`blockedRoots`、`blockedPaths` 在 policy adapter 加载时经 `resolveExistingPath` 规范化，并在 symlink 解析失败时拒绝配置。候选问题：是否把配置侧 canonicalization 作为独立安全合同、迁移约束或实现细节记录。
  - **Symlink/traversal:** 旧版有 path resolve 与 blocked glob；当前 Canonical resolution 同时保留 lexical 与 symlink-target traversal prefixes，Direct search 与 Shell recursive path 在 blocked descendants 上 fail-closed。候选问题：是否把该增强写成迁移说明中的“非 parity 安全提升”。
### Shell grammar、flow、wrapper 与 redirection

  - **Shell grammar:** 旧版受限 Shell IR 覆盖更多形态；当前支持更小的 simple flow 与有界 `&&/||/;`，pipeline/background/compound/newline 多数 fail-closed。候选问题：是否恢复部分旧 Shell 形态，或保持 Greenfield 收窄。
  - **CWD / control-flow tracing:** 旧版 `control-flow.ts` 建模 `cd`、`cd -`、`pushd/popd`、`&&/||/;/newline` 下的 cwd 候选与 opaque 分支；当前 `core/compilation/shell/flow.ts` 追踪有界 reachable commands 与 `cd` 后 cwd states，但 newline 不作为 flow operator，`pushd/popd` 不再作为专门 cwd 变异族。候选问题：逐项确认旧 cwd 候选语义是否需要恢复、文档化退役，或仅保留当前 bounded flow seam。
  - **Wrapper handling:** 旧版建模 `env`、`timeout`、`command`、`nohup`、`exec` wrapper 链；当前仍有 wrapper 集合并测试底层语义保留。候选问题：是否补齐旧 wrapper 边角语料。
  - **Redirection:** 旧版支持重定向且 `<>/2<>` 按 write 侧建模；当前保留 read-write redirection write-side contract，unsupported clobber fail-closed。候选问题：是否补全 README 的重定向支持矩阵。
### Program semantics 与命令族覆盖

  - **Shell base inspection commands:** 当前基础集合保留 `cat/head/tail/grep/rg/find/ls/od` 等 inspect 命令；候选问题：逐项确认旧 read/search adapter 的 inspect 用例是否已由基础集合或 program semantics 覆盖。
  - **Shell base modification commands:** 当前基础集合保留 `mkdir/touch/cp/mv` 等 modify 命令；候选问题：逐项确认旧 filesystem adapter 中同类写入命令是否需要恢复。
  - **Shell base destructive commands:** 当前基础集合保留 `rm/rmdir` destroy 分类且 destructive command hard-boundary 优先；候选问题：逐项确认旧 filesystem destroy 行为是否已充分覆盖。
  - **Shell deterministic/noop commands:** 当前保留 `true/false/echo/printf` 等确定性或无路径命令；旧版 noop 还包含 `:`，当前 `:` 落入 unknown。候选问题：对照旧 noop/date/read adapter，确认哪些 inspect-only 命令应恢复。
  - **Filesystem adapter family:** 旧版 filesystem adapter 覆盖 `rm/rmdir/touch/mkdir/cp/mv/ln/tee/dd/chmod/chown/install/mktemp/truncate/shred` 等文件系统操作；当前只保留较小基础子集，`tee`/`dd` 等未建模形态进入更保守的边界处理。候选问题：逐项判断缺失命令是否恢复或退役。
  - **Permission-change effect:** 旧版 `chmod/chown` 等权限类操作可承载 `permissionChange` effect；当前没有独立 permission-change effect，相关命令多落入未建模/unknown 或被更窄命令集合拒绝。候选问题：是否恢复权限变更专门分类、并定义其与 write/destroy 的策略关系。
  - **Read adapter family:** 旧版 read adapter 实际覆盖 `cat/head/tail/wc/cut/diff/less/more/file/stat/du/df/od`；当前只保留部分基础 inspect 命令。候选问题：逐项判断缺失读命令是否恢复或改用 Direct 工具。
  - **Search adapter family:** 旧版 search adapter 覆盖 `find/tree/grep/rg/ls` 等，并建模部分输出文件/action 选项；当前 `find` 已支持 bounded 的 `-name`、`-iname`、`-path`、`-ipath`、`-type`、`-maxdepth`、`-mindepth` inspect 子集，start path 仍进入 recursive boundary，`find -exec/-delete` 等副作用形式继续 fail-closed。候选问题：逐项判断更复杂的搜索表达式和输出/action 选项是否恢复。
  - **Text-transform adapter family:** 旧版 text-transform adapter 覆盖 `sed/awk/sort/uniq/tr` 等，含 in-place/output 选项建模；当前未见等价专用家族。候选问题：是否恢复只读 transform 与写入 transform 的分层语义。
  - **Build adapter family:** 旧版 build adapter 覆盖 cargo/go/make 等构建工具语义；当前未见等价专用家族。候选问题：是否按真实构建工作流恢复，或依赖 execute/unknown 策略处理。
  - **Date adapter family:** 旧版 date adapter 区分 inspect 与 `--set` modify；当前未见等价专用家族。候选问题：是否明确退役或恢复 inspect-only 支持。
  - **Shell builtins adapter family:** 旧版 `source`/`.` 归为 execute；当前 compound/解释器边界更保守。候选问题：是否补充 shell builtin 分类矩阵。
  - **User command overrides:** 旧版 `commands/aliases/reclassify` 允许用户声明式扩展命令语义；当前无等价入口。候选问题：是否在新 Canonical 架构下重新设计用户扩展 seam，或明确不支持。
  - **Git semantics:** 旧版 Git adapter 覆盖较广但重构任务记录了 path-boundary 风险；当前重点强化 `-C`、`--git-dir`、`--work-tree`、local `file://`、clone/fetch/pull/push/submodule 等 hard-boundary 回归。候选问题：是否只补可证明 Git 子集，而非追求旧 adapter parity。
  - **Package managers:** 旧版 npm/pnpm/yarn/npx adapter 更宽；当前分类常见 inspect/modify/execute，脚本、install、npx 等委托执行 opaque，在 path boundary 下 hard-deny。候选问题：是否按真实用例增加 bounded package-manager 子命令。
  - **uv:** 旧版已有 `uv run` execute 语义；当前保留 `uv run` execute/opaque、help/version inspect、未知 fail-closed。候选问题：是否扩展 uv 其他顶层子命令。
  - **Python tools:** 旧版覆盖 `ruff/mypy/black/isort/pylint/pytest/pyright` 等；当前保留同族核心分类，但 `pytest` 与委托执行 opaque，`ruff clean` destroy。候选问题：是否按工具逐项补 option/path matrix。
  - **Interpreters:** 旧版区分 interpreter info 与 execute；当前保留，并把脚本 operand 纳入 path admission，`-e/-c` 等脚本选项 fail-closed。候选问题：是否补文档说明“脚本路径可见但内联代码不执行分析”。
  - **Threat scan / hard preflight:** 旧版有 `threat-scan.ts`、下载管道执行硬规则、prompt-injection 文本扫描；当前未见等价 threat scanner，部分风险由更窄 Shell 语法、pipeline fail-closed 和解释器脚本选项 fail-closed 覆盖。候选问题：是否恢复 token-level threat scanner，或将其退役并同步决策。
### Policy、Guidance、Approval 与诊断

  - **Decision code and guidance taxonomy:** 旧版拥有较细的 DecisionCode、evidence kind、response kind 与 GuidanceId 映射，如 `dynamic-shell`、`compound-command`、`opaque-command`、`blocked-path`、`symlink-escape`、`profile-restriction`；当前 host-facing block code 更少，失败文案为静态 bounded reason，并新增只读策略切换提醒。候选问题：是否维持收敛后的 host 合同、恢复更细诊断，或把旧码表退役写入决策。
  - **Approval UX:** 旧版 `ask` 走 UI select 的 Allow once/Deny；当前 `ask` 走 `ui.confirm`，无 UI 时 deny，批准摘要 bounded 且 Shell 包含 literal command。候选问题：是否恢复双按钮文案或保留 host confirm 合同。

### 测试策略与 Greenfield 迁移一致性

  - **Test strategy:** 不按数量追求 parity；只把旧测试中仍代表外部行为的部分转写到新 public seam。
- **Supplementary cross-cutting checks:** 以下横切行为尚未在高层点中单独拆项，纳入本候选的待核对范围：
  - **Command prefix normalization:** 旧 `normalize.ts`、`prefix.ts`、`args.ts` 处理 `builtin`、`time`、`!`、env assignment、wrapper positional 和位置参数；当前 wrapper/命令分类是否保留同等边界需核对。
  - **Executable identity normalization:** 旧 registry 会把路径形式 executable 取 basename 后匹配内置 adapter（如 `/usr/bin/cat`）；当前只有已注册的 program-semantic family 走 basename 归一化，未建模路径形式命令可能落入 `execute`/opaque。需逐项确认这是刻意收窄还是遗漏。
  - **Redirection matrix:** 除 `<>`/`2<>` 和 clobber 外，还需逐项核对 `2>`、`&>`、`&>>`、fd duplicate/close、heredoc、here-string、循环级重定向及 source/target 顺序。
  - **Host boundary and passthrough:** 旧 Gate 与当前 host adapter 对未知工具 passthrough、无效 host context、非法输入和受管 surface 的边界行为需逐项对照。
  - **Canonical trust boundary:** 旧 CompleteAccessPlan/verifier/coverage 与当前一次 Canonical 编译、sealed Admission、Display 分离、伪造对象拒绝之间的安全和可观察差异需单独记录。
  - **Approval evidence contract:** 路径证据聚合去重、literal command 展示、bounded reason、无 UI deny，以及 deny 路径/内容不回显等行为需与旧 approval/render contract 对照。
  - **Shell lexer/parser fidelity:** 旧低层 parser/lexer 测试覆盖 scan-time source span、重复 raw value span 稳定性、comment stripping 边界、quoted env-assignment 判别、numeric fd-prefix 与 quoted digit redirect disambiguation；这些不是当前 public seam，若恢复更宽 Shell 前端需先判定哪些是外部合同。
  - **Command registry internals:** 旧 registry 测试覆盖 duplicate registration fail-fast、`scopeKey` 精确/前缀/最长前缀/`./` 归一化和非真前缀不命中；若重新设计用户命令扩展 seam，需把这些作为候选行为重新证明，而非隐式继承。
  - **Read-only guidance narrow trigger:** 当前只读策略切换提醒只在 `review` 下 Direct `write`/`edit` 的普通 policy deny 生效，不覆盖 Shell、硬边界、未知、破坏性或敏感路径拒绝；后续文档/实现复核需保持这个窄触发，或显式重新设计。
  - **Git hard-boundary/destructive subforms:** 当前 Git 语义对 `-c`、未知 global option、`pathspec-from-file`/NUL、upload/receive/exec hooks、global/system config、remote/archive/submodule hazard，以及 `push --force`、`reset --hard`、branch delete、stash clear 等 destructive 子形态有更细 hard-boundary/destroy 分类；后续 Git parity 不应只按“Git adapter”大项模糊处理。
  - **Path input normalization and invalid forms:** 旧 resolver 还处理 `@` 前缀、拒绝 CR/LF 与 Windows/UNC 路径；当前 Direct canonicalization 与 Shell path resolver 主要显式拒绝 NUL、相对/绝对路径按新 seam 解析。需确认这些旧输入边界是公共兼容行为、安全合同，还是旧实现细节。
  - **Special device/discard handling:** 旧 gate 测试把 `2>/dev/null` 作为 stderr discard 特例允许，同时不把其他外部重定向写入一并放宽；当前 redirection 与 path policy 需确认 `/dev/null`、stdin/stdout/stderr、fd duplicate/close 是否作为稳定合同、Linux 设备特例或实现细节处理。
  - **Direct/Shell equivalence invariants:** 旧测试把 Shell grep 与 Direct grep、Shell read 与 Direct read、写入拒绝等行为作为跨 surface 等价，并锁定“增加 path intent 不得使决策变弱”。当前 Canonical/Admission seam 需确认这些是公共安全不变量、测试 seam，还是随新 surface 收窄而重写的内部证明目标。
  - **Implicit CWD path intent:** 旧 Shell compiler 对无显式路径/重定向的 modify 命令追加 conservative cwd write intent；当前只为 recursive/`ls`/`find` 等命令补 implicit path，其他无路径 modify 形态不再发行同等 cwd write fact。需确认这是刻意收窄、已由其他 hard boundary 吸收，还是遗漏。
  - **Stable legacy code contract:** 旧 `task2-contract` 锁定 headless approval、user denial、path policy deny、shell policy deny 等稳定 code；当前 host-facing block code 收敛且 reason 静态。后续若外部消费者依赖旧 code，需明确兼容、映射或退役，而不是只按 guidance taxonomy 大项处理。
  - **Hard preflight subforms:** 旧 preflight 测试逐项覆盖 literal download-to-interpreter、quote-split interpreter、downloader later in a pipe/line、nested wrapper、`eval` command substitution、comment/string literal 排除与 threat token table。当前更窄 Shell grammar 覆盖部分风险，但若恢复 threat scanner 或解释器/pipeline 子集，需逐项重新采纳或退役这些硬规则。
- **Decision reset / refresh queue:** 存活 Decision 与既有候选中凡是仍携带重构前结构、旧 Profile/config/schema、旧 plan/verifier/adapter/glob/for-reduction、T-069 前“当前基线”或其他已被 Greenfield Pipeline 重置的术语与结论，都需要逐一重审；未重审前只作为候选议题处理，不作为恢复旧行为的授权。重审时应按当前 Canonical/Admission/Display/Policy seam 迁移仍成立的安全意图，合并已被新决策吸收的内容，并把未承接部分退役或继续留作候选。
- **Revisit condition:** 用户明确要求开展“重构前后功能 parity/取舍”任务；或出现旧行为缺失导致真实工作流阻塞；或安全复核确认当前实现与存活 Decision（尤其默认敏感路径边界）存在不一致。

## C-026: 旧敏感路径清单的独立分类与边界重建

> 本条只记录未来对旧版敏感路径清单进行重新分类和重新证明的探索方向，不恢复旧 `DEFAULT_BLOCKED_PATHS`，不改变 D-070 当前边界，也不构成实现承诺。

- **Why Not Now:** 旧清单混合了 Git 元数据、项目环境文件、用户凭据目录、混合配置和系统文件；整体恢复会误伤当前 Git/配置工作流，也会把模板、公开元数据和实时凭据错误地归入同一 hard boundary。当前没有足够的工件角色 metadata 或真实工作流证据支持一次性重建完整清单。
- **Exploration Direction:** 以工件职责、所有权和可验证路径身份为分类轴，逐类判断 hard boundary、preset/path policy 或明确退役；优先区分实时凭据、混合配置、模板、Git 元数据和系统文件。复核时保留以下边界：不做值级 secret sniffing，不递归扩大到父目录后代，不把 opaque Shell 访问解释成已覆盖，并分别评估 `read/list/search/write/edit` 与 Shell path evidence。`.git/**`、`.env*`、整棵 SSH/AWS/GnuPG/Kube/Docker/GCloud 目录、系统账户文件和混合 provider 配置不得因旧清单存在而整体恢复。
- **Revisit condition:** 出现明确的凭据泄露或误操作实证、真实工作流因当前边界阻塞，或获得可验证的宿主工件角色 metadata seam；或者用户明确启动旧敏感路径清单的逐类重新采纳。
- **Out of Scope:** 不修改当前 D-070；不恢复旧清单或旧 glob 语义；不新增默认 policy 字段；不创建实现 Task；不把其他文件中的偶然凭据纳入 AKeel 的通用内容扫描职责。

## C-028: Destroy 操作边界与可审批准入复核

> 本条记录对更宽破坏操作（递归删除、目录删除、Git 破坏性操作等）的未来评估方向。单文件非递归裸 `rm` 的有界证明与 `ask` 准入已在 T-0117 / D-071 落地；本候选只保留剩余未证明破坏操作的探索。

- **Why Not Now:** T-0117 已解决日常单文件清理痛点；当前未深入证明递归删除（`-r`）、父级目录影响（`rmdir -p`）、通配符展开、Git 高危子命令（`reset --hard`、`clean -f`、`branch -D`）以及混合 flow 聚合等更宽场景。
- **Exploration Direction:** 在现有单文件有界证明基础上，评估是否能进一步为受限目录删除或特定 Git 丢弃操作建立形式化边界证明，并在证明成立后引入受控的审批合同。复核需覆盖递归影响界限、路径和凭据硬边界、unknown 形态和无 UI 行为。
- **Revisit condition:** 真实工作流反复因无法删除目录或执行特定 Git 清理受阻，且可提供完整的外部语义证据与边界证明方案；或者用户明确启动更宽破坏操作的独立评估。
- **Out of Scope:** 本候选未被进一步采纳前，递归删除、`rmdir`、Git 高危破坏子命令继续永久 hard-deny，不创建实现 Task。

## C-029: 有界静态迭代语义（Shell `for`）复核

> 本条由 C-025 迁入，只记录未来对有限、静态、可证明 Shell 迭代语义的重新评估；不恢复旧 reducer、不追求 legacy parity，也不构成实现承诺。

- **Why Not Now:** 当前 `for` 作为 unsupported compound keyword 处理；D-059 已将 Static Flow 排除在 Greenfield trust path 之外。静态迭代同时牵涉有限词表、变量绑定、循环 body、success/failure、逐轮 CWD、资源预算、effect hard boundary 及 approval/display evidence，尚无真实工作流证据证明应承担这组复杂度。
- **Exploration Direction:** 若未来重新评估，应以新的外部语义合同定义“有界静态迭代”，而不是迁回旧 `for` reducer：
  - 先定义可证明的有限词表边界；动态值、命令/算术替换、运行时 glob、位置参数及未建模展开不得因循环语法本身获得授权。
  - 明确 body 只可组合哪些现有受支持 Shell 形态；嵌套循环、`break`/`continue`、函数/source、pipeline、后台和其他复合控制流需分别证明。
  - 以 D-045 的有界 success/failure CWD 候选为约束，定义空词表、重复词项、逐轮 CWD、body 失败及状态合并语义，并在物化前执行总迭代/命令/CWD 预算。
  - 每轮产生的 read/write/execute/destroy effect 都必须重新进入现行 Policy/Hard Boundary；静态可展开不改变 D-071 的 destroy 永久 hard-deny，也不使 opaque 委托执行获得放行。
  - 若存在 ask，必须重新定义原始循环、展开路径和 bounded evidence 的人类展示关系；不恢复旧 Explanation Replay 或旧 expanded-form 合同。
  - 验证以 Bash/Linux 外部行为、当前 Canonical/Admission/Display public seam 和安全不变量为依据；旧 reducer、旧测试数量及旧输出只能作为历史线索。
- **Current Boundary:** 在本候选被明确采纳前，`for` 继续 fail-closed；不因 C-025 的 parity 清单或旧实现可检索而触发恢复。
- **Revisit condition:** 出现真实工作流因有限静态迭代被阻塞，且可提供不依赖动态值、运行时 glob、命令替换或隐式执行的最小场景与外部语义证据；或者用户明确启动该语义的独立重新设计。
- **Out of Scope:** 完整 Bash 循环语义、动态/运行时词表、旧 reducer 迁移、旧 Explanation Replay、Direct 工具等价物、通用 Static Flow、实现 Task，以及任何未经独立证明的旧循环行为。
- **Origin:** C-025

## C-030: 路径范围表达与旧 Glob 规则处置

> 本条承接 C-025 中关于路径策略语言、旧 glob matcher 与规则顺序的差异核对，只记录未来重新评估方向，不恢复旧 Profile/config 兼容、运行时 glob 或 Shell glob 展开，也不构成实施承诺。

- **Why Not Now:** D-059 在 T-069 中明确排除旧 Profile/config schema 的兼容读取、转换器与迁移期 fallback；D-069 当前以绝对 `allowedRoots`、`blockedRoots`、`blockedPaths` 表达路径范围。当前没有真实工作流证据表明该表达不足，也没有足够证据证明旧 glob 规则可以无损转换。
- **Exploration Direction:** 未来若重新评估，先用真实工作流确认当前路径范围表达的具体缺口，再区分三种不同方向：①运行时接受旧路径 glob；②提供一次性、显式报告不可表达项的迁移器；③只补充当前绝对路径表达的文档。旧 matcher 的 `*`、`?`、`**`、大小写、绝对路径、blocked-pattern 与 first-match，以及 `project/`、`staging/`、`~/` 虚拟命名空间、按操作定义的路径规则和 Profile 继承产生的规则顺序，都只是历史参考；只有确定需要兼容或迁移时，才逐项重新证明。任何迁移结果都不得静默扩大或缩小授权范围，无法等价表达的规则必须报告为未转换。路径规则顺序也必须在当前 Policy Snapshot 与 hard-boundary 语义下重新决定，不自动继承这些旧顺序语义。
- **Revisit condition:** 真实工作流因当前路径表达被阻塞；用户明确要求转换既有旧 policy；或获得一组有界旧规则样本及足够的外部语义证据，能够验证转换是否保持权限范围。
- **Out of Scope:** 在本候选明确采纳前，不恢复运行时 glob 兼容，不提供静默迁移或迁移期 fallback，不恢复旧 Profile/config schema，不改变 D-018 的 Shell glob 边界，不把旧 matcher 测试直接当作当前合同，也不创建实现 Task。
- **Origin:** C-025

## C-031: 异步 child 与无人值守自动多代理流水线

> 本条只记录未来对异步 child 和无人值守自动多代理流水线的独立探索，不构成当前支持、实现承诺或 Herdr 执行面的选择。

- **Why Not Now:** 当前结果仍需既有 Task Owner 裁决的隔离工作可由同步 Herdr child 加预定 artifact 直接满足；可独立验收的长期工作由用户授权新的范围互斥 Task Owner Session，不需要回灌旧 Owner。异步 child 还需额外定义 mailbox、结果发布、重复通知去重、跨重启恢复、资源预算、权限、失败恢复和验收状态，复杂度与上下文成本超过当前收益；确定性资源回收是可独立演进的 C-034，不以采用异步流水线为前提。
- **Exploration Direction:** 若未来出现必须从属于既有 Task、但 Owner 又不能等待的长周期后台工作，再设计最小的异步合同：稳定 run/attempt ID，原子结果与 digest，completion mailbox，ACK/receipt，parent restart 恢复，重复交付去重，abandoned lease，以及 bounded 状态与错误输出。只有多个 child、自动重试或自动结果消费成为真实需求后，才增加 Herdr event subscriber、可信固定 callback、lane 聚合和确定性 orchestration extension；该合同可向 C-034 提供资源所有权与结果 receipt 事实，但不因此授权删除，child verdict 也不自动获得验收、记录、合并或发布权。
- **Revisit condition:** 用户明确启动异步从属工作或无人值守自动流水线；或出现真实长周期后台任务，证明同步 join 与独立 Task Owner Session 都无法满足吞吐、时效或跨重启要求。
- **Out of Scope:** 在本候选被明确采纳前，不提供 detached child、completion mailbox、自动 callback/续跑/重试/结果聚合、定时任务、token/cost budget 或基于 child verdict 的自动发布/合并；确定性 pane/workspace/worktree/临时运行资源回收由 C-034 独立记录。当前委托使用同步 Herdr artifact pull，并由唯一 Task Owner 保留最终裁决。

## C-032: 用户项目 Project Record 容器校验

> 本条只记录未来把容器结构检查覆盖到用户项目的评估方向，不构成拆分现有 validator、增加 skill、引入 CLI 或自动修改用户文件的承诺。

- **Why Not Now:** 当前 `scripts/validate-docs.ts` 是 AKeel 自仓开发入口，硬编码仓库容器、扫描范围和决策引用合同；直接移入 skill 会混合自仓校验与用户项目能力。Pi skill 虽可携带脚本，但 skill 本身不提供自动执行或 CI 接入，且解释器 helper 在 Access Gate 路径边界下没有可靠的 Agent 执行合同。现有 `doc-sync` 已能用 Direct `grep` 加定点 `read` 低负载检查槽位，不需要为尚无第二个稳定执行方的场景提前抽取脚本。
- **Exploration Direction:** 优先评估在现有 `doc-sync` 中以近零上下文增量明确 Direct 容器检查流程：只定位槽位并读取槽位至文件末尾，不加载完整记录正文，不新增 skill 或恒注入原则。若出现确定性复用需求，再比较两种边界：①现有 skill 下无依赖、只读、显式接收项目根的可移植 helper，由 AKeel 自仓 wrapper 继续拥有专属引用与 hygiene 检查；②独立、由用户显式接入项目测试或 CI 的 validator。任何提取都以 Project Record 格式权威仍在 `principles.md`、用户项目缺失可选容器时安全跳过、无自动修复为前提。
- **Revisit condition:** 至少两个真实用户项目反复出现同类槽位结构漂移；用户明确要求确定性 Project Record 校验或 CI 门禁；或 Pi/AKeel 提供可验证的只读 helper 执行 seam，使 skill 脚本成为稳定的第二个 consumer。
- **Out of Scope:** 在触发前不移动或复制 `scripts/validate-docs.ts`，不新增 skill、扩展 hook、常驻提示词、项目模板、自动写入或自动修复，也不把 AKeel 专属源码/测试引用扫描包装成通用用户项目合同。

## C-033: Agent Capability Contract Assessment discipline

- **Why Not Now:** `instruction-editing` 已处理已批准 agent-facing 合同的语义保持型表达，`domain-modeling` 处理术语与长期裁决，当前只有一次 skill 治理证明曾需要从用户价值重新核对能力；尚不能证明这种复评会反复形成完整、独立的调用场景。
- **Proposal:** 评估模型可按需加载的 `capability-assessment` discipline，只面向一个已知 agent capability（尤其 skill 或 workflow），从目标用户、核心场景和可核查价值出发，分别判断名称、触发、能力承诺、边界与内容，并检查五者对齐。结果可建议保持、重命名、重塑边界、重写内容、合并、拆分或移除，每项结论附场景与证据；本候选不直接编辑合同或采纳裁决。
- **Boundary:** `instruction-editing` 继续表达已经批准的当前合同，`domain-modeling` 继续维护术语和长期裁决，`module-design`/`assess-modularity` 继续处理代码模块，`code-review` 继续审查固定变更面。本候选不承诺通用 module、任意产品能力或用户领域能力评估。
- **Revisit condition:** 至少两个不同 skill/workflow 的真实复评再次需要重复组合现有 disciplines，或现有方法持续遗漏目标用户、核心场景、价值证据及名称/触发/承诺/边界/内容对齐中的任一维度；也可在用户明确选择建立该专门能力时复审。

## C-034: Herdr child 资源的确定性自动回收

> 本条只记录未来把 pane、workspace、worktree 和临时运行资源的机械清理从模型记忆移交给非模型 lifecycle owner 的探索，不构成当前支持、实现承诺、Herdr runtime dependency 或删除授权。

- **Why Not Now:** 当前同步 fork-join 仍有存活的 Task Owner 可在拉取并裁决 artifact 后检查和清理资源，尚无反复 orphan 或并发规模证明自动化收益足以覆盖持久状态机成本。Herdr 0.9.0 已提供 worktree 非强制删除、worktree provenance、Agent/pane 生命周期事件、plugin event hook 与 startup hook，但未提供原生 owner/lease/TTL/reaper 或 artifact readiness；`done`/`idle` 不证明成果已落盘，`pane.exited` 不提供充分的成功语义，Git non-force 只保护 dirty/untracked checkout 而不能识别 clean 但未合并的 commit。现在实施必须先新增 owned-run registry、artifact receipt、commit-preservation、重启 reconciliation、幂等和路径复用防护，已超出小型 cleanup hook。
- **Exploration Direction:** 若重新评估，先比较 Herdr 原生 lease/reaper、持久 registry 加 event hook/startup reconciliation 的 Herdr plugin，以及有独立监督需求时的外部 lifecycle controller；优先由资源 owner 承担生命周期。只有 AKeel 在创建时登记并能以稳定 run identity、repo/worktree provenance 和当前 Herdr/Git 事实精确复核的资源可进入候选集合；扫描可用于核验和发现异常，不得按 label、branch 前缀或目录模式认领外来资源。自动回收还必须同时证明 child 已终止、artifact 具有原子 ready/receipt、checkout clean、没有需保留的未合并 commit、当前身份未被路径或 workspace 复用，并且 Herdr non-force 操作可完成；dirty、未合并、unknown、artifact 缺失、provenance 不匹配、仍有活动进程或需要 force 的状态只报告给存活 Owner/用户。事件重复、清理已完成和重启后重放应幂等处理；模型继续裁决异常成果的保留、导入、合并和验收，不承担机械 reaper。
- **Revisit condition:** 同步 child 已反复遗留 pane/workspace/worktree 或临时资源并造成实际维护负担；并行、异步或跨重启 child 使 Owner 手工清理明显不可靠；Herdr 提供可验证的 owner/lease/reaper 合同；或用户明确启动 owned-run registry、artifact receipt 与 commit-preservation 设计。
- **Out of Scope:** 在本候选被明确采纳前，不新增 plugin、daemon、timer、registry 或 AKeel runtime dependency，不自动扫描认领、force-remove、删除 branch、接受 artifact、导入/合并结果、更新 Project Record 或发布；当前仍由存活 Task Owner 检查后执行清理，child 不自删除。

## C-035: 项目 `.env` 的受管写入

- **Why Not Now:** 当前没有用户实证表明 agent 无法便捷写入 `.env` 已成为高频阻塞；普通 write/edit、truncate 或覆盖重定向可能破坏既有配置，而安全追加和定点覆写需要独立定义格式、并发、授权与失败合同。读取掩码不能自动授权写入，D-060 的 Admission 形状也尚未承载受管 append/set 子形态。
- **Exploration Direction:** 分别评估两种最小能力：①只允许单行字面 `K=V` 的 APPEND，不先读、不替换；②只对显式 allow 名集合执行 SET，protected 与 neutral 名拒写。变量名契约可与 C-016 探索共享配置来源，但共享不是预先采纳的实现要求。普通 `>`、truncate、Direct write/edit、递归聚合和未建模 `printf`、多行或 `$'…'` 形态继续 fail-closed。若 Canonical 已区分 append，相关标志必须进入窄 Admission，由 Policy 消费而不重新解析原始 Shell。
- **Safety Boundary:** APPEND 不能检测重复或既有覆盖；SET 必须定义原子 read-modify-write、并发和格式保持。写入字面值已经存在于 agent 的 tool call，掩码不能承诺从宿主调用记录中消除它。该受管子形态不是用户豁免，也不得放宽 D-070、D-071 或路径 hard boundary。
- **Revisit condition:** 用户确认 agent 落盘追加或定点更新项目 `.env` 是真实高频工作流，且现有手工编辑或普通路径策略不能安全满足。

## C-036: 进程环境命令的按名治理

- **Why Not Now:** `env`、`printenv`、`export`、`set`、`declare` 等命令涉及进程环境、Shell builtin 与执行输出，不等同于结构化 `.env` 文件；当前多数未建模形态进入 unknown/opaque，尚无真实工作流证明需要新增独立命令轴。进程输出中的 secret 也受 Pi host logging 边界影响，AKeel 不能仅靠 renderer 提供可靠掩码。
- **Exploration Direction:** 按外部 Shell/程序合同分别核对按名单值读取、全量 dump、赋值、导出与 child 可见性；protected 名的读取/导出应 fail-closed，allow/neutral 的可见性和写入需显式定义。若输出需要掩码，原值必须在可信进程内替换后才可进入 tool result；不能用 Shell 管道事后打码。rc 文件、环境加载器和 delegated child 的父子策略是独立边界，不因 `.env` 名称契约存在而自动解决。
- **Revisit condition:** 出现进程环境或 rc 文件中的敏感值经受管命令泄露、按内容掩码漏判的实证，或真实工作流需要 agent 安全检查或设置特定环境变量。

## C-037: Context watermark 后的自动安全收敛与交接

- **Why Not Now:** AKeel 已有用户手动调用的 `handoff-session`，Pi 也提供 context usage、idle、compaction、shutdown 与 session replacement API；但 token 水位和 `idle` 都不能证明当前 Slice 完成、测试通过、Git 状态可接管或 durable records 已同步。自动停机若误判会留下破碎工作区，当前没有高频证据值得引入这组语义状态机。
- **Exploration Direction:** 当 C-019 的水位信号达到经验证的软阈值后，只进入“不启动新工作”的收敛模式，并等待最近一个可证明的交接点。交接点至少核对当前修改完整、语法/测试状态、Task 证据、Git 保存点和未决风险；无法证明时必须继续当前闭环或请求用户，不得强制截断。交接内容复用 `handoff-session` 的 Goal、Current state、权威记录引用、文件、下一动作与 skill 合同，写入 `/tmp/akeel/handoffs/` 后才可通知或请求 graceful shutdown/session replacement。
- **Out of Scope:** 不从 token 数推导完成状态，不跨 Agent 扫描 session JSONL，不自动接受、提交、合并或发布工作，也不替代 Pi compaction。
- **Revisit condition:** 大型多阶段任务反复因上下文耗尽而在未闭环状态中断，且人工调用 `handoff-session` 与 Pi compaction 无法可靠缓解；或用户明确要求自动收敛与交接。

## C-038: 不可信内容的 provenance 与指令边界

- **Why Not Now:** 网络抓取、PR/Issue 和第三方仓库内容可能携带间接提示词注入，但当前没有统一的 producer provenance、host message label 或可测试的 consuming-agent enforcement seam。把自然语言警告称为隔离会制造超出能力的安全承诺；D-030/D-053 的 Policy 零注入也不等同于一般不可信内容治理。
- **Exploration Direction:** 若宿主提供真实 seam，区分用户/系统指令与外部数据来源，为 web search/fetch、不可信变更说明和第三方文件保留 provenance，并验证 consuming agent 不把其中指令提升为更高权威。未知、丢失或跨工具未传播的 provenance 不得解释为可信。该输入解释权与 C-020 的输出 Content Flow checkpoint、C-021 的 OS confinement 和 Access Gate 的操作准入保持独立。
- **Revisit condition:** 外部不可信内容成为自动化审计或重构的高频输入，并出现间接提示词注入实证；或 Pi 提供可测试的 provenance 与指令权 enforcement seam。

## C-039: 已知外部状态变更的准入边界

> 本条不恢复通用 `network` effect，也不提供网络防火墙；只记录未来对少数可证明外部写入动作的复核。

- **Why Not Now:** Access Gate 是执行前的语义准入系统，无法限制已放行脚本、helper、依赖生命周期或未知命令的运行期 socket。通用 network policy 会混合远程读取、外部写入和 opaque 行为，扩大命令方言与虚假安全承诺；当前 Git 远程/transport 边界已有更窄的 hard-boundary 处理。
- **Open Question:** 若真实工作流证明当前 `opaque` 或既有 hard-boundary 过宽/过窄，是否在 Canonical/Admission 中增加少数“已知外部状态变更”事实，并为 `git push`、package publish/upload 等明确动作定义统一的策略、混合 flow、无 UI 和显示合同。分类必须依赖完整的程序/选项合同，不因命令名称、URL 或参数外观猜测运行期行为。
- **Safety Boundary:** 该候选只保护被静态识别的外部状态变更；未知脚本、helper、依赖执行和任意网络外联仍是 `opaque`，不因该分类获得路径或网络隔离。审批不表示已执行；C-021 拥有执行期隔离，C-020 拥有 payload/lineage，C-038 拥有不可信输入 provenance。
- **Revisit condition:** 真实工作流证明显式外部状态变更需要区别于本地 `write`/`execute`，且现有边界无法合理表达；或用户明确启动该狭窄准入复核。未满足前，不新增 network policy axis 或实现 Task。

## C-040: Pi render-only tool-result renderer 与测试模型视图

> 本条只记录 Pi render-only 接缝与测试模型视图的未来评估；不改变现有 TUI、执行或持久化行为。

- **Why Not Now:** 当前 Pi 的 `registerTool` 与 `renderResult` 仍把渲染定义绑定在工具定义上，没有只装饰内置 `bash` tool result、同时保持执行所有权和 session 持久化不变的公开接口。AKeel 当前已完成 context projection，但没有安全的宿主接缝可实现同一条 TUI 结果中的原始输出与模型视图；现在通过覆盖 `bash`、写入 custom message/entry、处理 `bashExecution` 或 monkey-patch 宿主组件都会越过 D-084 与当前范围边界。
- **Exploration Direction:** 仅在 Pi 提供并验证 render-only seam 后，评估在不接管内置 `bash` 执行、不改变 session 持久化的前提下，从原始结果生成临时模型视图。恢复 session 时从原始消息重新计算，不持久化 projection；宿主组合、fallback、异常和非 TUI 行为由 Pi public seam 测试先行确定。
- **Revisit condition:** Pi 发布可供扩展使用、保持单一执行所有权且能通过测试观察 persistence/render 边界的 render-only tool-result 接口；或用户明确要求重新启动该候选的宿主接口与 TUI 视图评估。
- **Out of Scope:** 在本候选被明确采纳前，不修改 Pi 安装副本，不覆盖或重实现内置 `bash`，不改变 `bashExecution`、Access Gate、session file、tool result details、模型 context projection 或现有 TUI 展示；不创建 T-xxx 实现任务。

## C-041: CONTEXT Architecture 段落的职责重组与负载控制

- **Why Not Now:** 当前清理只处理本次规则变更产生的重复说明；整体 Architecture 段落涉及多个读取面和长期文档归属，立即重写会扩大范围并混入尚未确认的取舍。
- **Exploration Direction:** 在明确复审时，按读取者和权威归属区分 Architecture 中的当前事实、运行时边界、skill 目录职责和流程说明，删除只重复其他权威文档的内容，同时保留会影响行为理解的边界与引用。
- **Revisit condition:** 再次修改 `CONTEXT.md`，或有实际证据表明 Architecture 段落成为主要上下文负载时，重新评估其内容归属和压缩空间。
- **Out of Scope:** 本候选未被明确采纳前，不重写 `CONTEXT.md`，不修改 `principles.md`、skills、插件代码或 Project Record 生命周期，也不把候选内容当作当前架构结论。

## C-044: 非 bounded 程序的参数级隐式执行与选项消费边界

> 本条记录当前基础命令选项合同之外的残留复核；不改变现行 Canonical、Admission、Policy 或 `opaque` 语义。

- **Why Not Now:** 当前已为一组 bounded coreutils 建立命令专属 option/value 合同，`find` 也有独立的 bounded expression analyzer；Git、Python、uv、herdr 和 npm 族仍由各自语义模块及既有 scanner 处理。已知的 Git helper/`-c`、`find -exec` 等形态已有 hard boundary，但未知程序及脚本内容（例如 `awk` 的 `system()`、其他工具的 helper 选项）仍按 `unknown + opaque` 处理。现在引入通用 option engine 或递归解释脚本会扩大 CLI 方言、执行语义和维护成本，且尚无新的安全实证或高频工作流证据要求改变该边界。
- **Open Question:** 是否继续维持“已证明的命令专属合同 + 未证明形态 opaque”的分层，还是为剩余程序族与未知程序重新设计更统一的参数级安全合同。复核必须分别判断：选项值消费是否完整、值是否产生路径事实、参数是否可能启动 helper/子进程、外部状态变更或破坏动作，以及 `opaque` 策略是否足以表达未证明风险；不能把这些问题合并为通用 Shell 解析、网络策略或 OS-level confinement。
- **Scope:** 只复核当前 Git/Python/uv/herdr/npm 族的 option scanner 覆盖与高风险选项边界，并核对未知命令的 `unknown`、`opaque`、路径边界和策略组合。外部实现（包括 pi-guard）只能作为可核查语料或合同参考，不作为正确性 oracle。
- **Safety Boundary:** 不因命令名称或选项外观推断脚本、helper 或运行期访问已经被分析；未知、动态、未消费或无法证明的值不得静默变成 positional path 或更宽授权。任何复核方案都不得削弱 D-018 的 fail-closed 规则、D-067 的 opaque 分层、Git/`find` 现有 hard boundary、D-071 的 destroy 永久拒绝或把 `allowedRoots` 描述为 opaque 运行期强制。
- **Revisit condition:** 出现真实安全证据表明参数级 helper/隐式执行可穿过当前边界，或真实工作流因已知程序的选项消费误判而受阻；或者用户明确启动剩余程序族与未知命令的参数级安全合同复核。

## C-045: 待创建

