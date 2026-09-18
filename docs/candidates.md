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

> 本条只记录未来对有限、静态、可证明 Shell 迭代语义的重新评估；不恢复旧 reducer、不追求 legacy parity，也不构成实现承诺。

- **Why Not Now:** 当前 `for` 作为 unsupported compound keyword 处理；D-059 已将 Static Flow 排除在 Greenfield trust path 之外。静态迭代同时牵涉有限词表、变量绑定、循环 body、success/failure、逐轮 CWD、资源预算、effect hard boundary 及 approval/display evidence，尚无真实工作流证据证明应承担这组复杂度。
- **Exploration Direction:** 若未来重新评估，应以新的外部语义合同定义“有界静态迭代”，而不是迁回旧 `for` reducer：
  - 先定义可证明的有限词表边界；动态值、命令/算术替换、运行时 glob、位置参数及未建模展开不得因循环语法本身获得授权。
  - 明确 body 只可组合哪些现有受支持 Shell 形态；嵌套循环、`break`/`continue`、函数/source、pipeline、后台和其他复合控制流需分别证明。
  - 以 D-045 的有界 success/failure CWD 候选为约束，定义空词表、重复词项、逐轮 CWD、body 失败及状态合并语义，并在物化前执行总迭代/命令/CWD 预算。
  - 每轮产生的 read/write/execute/destroy effect 都必须重新进入现行 Policy/Hard Boundary；静态可展开不改变 D-071 的 destroy 永久 hard-deny，也不使 opaque 委托执行获得放行。
  - 若存在 ask，必须重新定义原始循环、展开路径和 bounded evidence 的人类展示关系；不恢复旧 Explanation Replay 或旧 expanded-form 合同。
  - 验证以 Bash/Linux 外部行为、当前 Canonical/Admission/Display public seam 和安全不变量为依据；旧 reducer、旧测试数量及旧输出只能作为历史线索。
- **Current Boundary:** 在本候选被明确采纳前，`for` 继续 fail-closed；不因旧实现可检索而触发恢复。
- **Revisit condition:** 出现真实工作流因有限静态迭代被阻塞，且可提供不依赖动态值、运行时 glob、命令替换或隐式执行的最小场景与外部语义证据；或者用户明确启动该语义的独立重新设计。
- **Out of Scope:** 完整 Bash 循环语义、动态/运行时词表、旧 reducer 迁移、旧 Explanation Replay、Direct 工具等价物、通用 Static Flow、实现 Task，以及任何未经独立证明的旧循环行为。

## C-030: 路径范围表达与旧 Glob 规则处置

> 本条只记录未来对路径策略语言、旧 glob matcher 与规则顺序的重新评估方向，不恢复旧 Profile/config 兼容、运行时 glob 或 Shell glob 展开，也不构成实施承诺。

- **Why Not Now:** D-059 在 T-069 中明确排除旧 Profile/config schema 的兼容读取、转换器与迁移期 fallback；D-069 当前以绝对 `allowedRoots`、`blockedRoots`、`blockedPaths` 表达路径范围。当前没有真实工作流证据表明该表达不足，也没有足够证据证明旧 glob 规则可以无损转换。
- **Exploration Direction:** 未来若重新评估，先用真实工作流确认当前路径范围表达的具体缺口，再区分三种不同方向：①运行时接受旧路径 glob；②提供一次性、显式报告不可表达项的迁移器；③只补充当前绝对路径表达的文档。旧 matcher 的 `*`、`?`、`**`、大小写、绝对路径、blocked-pattern 与 first-match，以及 `project/`、`staging/`、`~/` 虚拟命名空间、按操作定义的路径规则和 Profile 继承产生的规则顺序，都只是历史参考；只有确定需要兼容或迁移时，才逐项重新证明。任何迁移结果都不得静默扩大或缩小授权范围，无法等价表达的规则必须报告为未转换。路径规则顺序也必须在当前 Policy Snapshot 与 hard-boundary 语义下重新决定，不自动继承这些旧顺序语义。
- **Revisit condition:** 真实工作流因当前路径表达被阻塞；用户明确要求转换既有旧 policy；或获得一组有界旧规则样本及足够的外部语义证据，能够验证转换是否保持权限范围。
- **Out of Scope:** 在本候选明确采纳前，不恢复运行时 glob 兼容，不提供静默迁移或迁移期 fallback，不恢复旧 Profile/config schema，不改变 D-018 的 Shell glob 边界，不把旧 matcher 测试直接当作当前合同，也不创建实现 Task。

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

## C-045: 受管会话临时文件创建与系统临时路径准入（mktemp 语义评估）

> 本条只记录未来对受管会话临时文件创建（如 `mktemp`）及系统临时路径准入的重新评估，不放宽全局 `/tmp/` 访问，不改变现有 `stagingRoot` 生命周期，也不构成实现承诺。

- **Why Not Now:** 当前工作流优先推荐在项目工作区内生成可跟踪工件，或利用会话生命周期的 `stagingRoot` 处理内部临时状态；无界的系统全局 `/tmp/` 缺乏会话隔离和清理保证，盲目放开容易引入符号链接攻击、文件冲突或跨进程信息泄露。目前尚无真实工作流因缺少 Shell `mktemp` 命令受阻。
- **Exploration Direction:** 若未来重新评估，探索以下方向：
  - 临时路径作用域锚定：将 `mktemp` 生成的目标路径默认约束在当前会话的 `stagingRoot` 或受管临时前缀下，而非全局开放任意 `/tmp/`；
  - 选项与形态有界收敛：仅支持安全且有界的前缀模板及目录创建标志（如 `-d`），严禁包含未建模或不安全路径注入的选项；
  - 生命周期与自动回收：明确临时文件的清理契约，与现有 retention sweep 或会话结束机制对齐；
  - 权限与策略求值：在 Policy Kernel 中仍作为 `modify` 或受管临时写入处理，绝不通过放宽全局 `allowedRoots` 妥协安全底线。
- **Revisit condition:** 真实工作流或关键外部构建工具必须依赖 Shell `mktemp` 且无法通过直接写入或现有 staging 替代；或用户明确要求启动受管临时文件准入设计。
- **Out of Scope:** 全局 `/tmp/` 目录的随意读写放宽、跨用户共享临时文件、不安全命名模板展开、破坏性清理操作或实现 Task。

## C-046: 分层子命令声明式流形与跨程序语义归并（Subcommand Program Manifest）

> 本条记录未来将分层子命令（如 Git、uv、Python 工具、包管理器）的解析机制从命令式手写循环归并为声明式流形的架构探索，不改变现行命令分析器行为，也不构成实现承诺。

- **Why Not Now:** T-0124 已通过子命令作用域解耦与选项/操作数原子分离彻底解决了 `git.ts` 内部的高频审查痛点与伪路径溢出，当前所有功能与全量测试均已绿灯闭环；现存 `uv.ts`、`python-tools.ts` 与 `package-managers.ts` 虽然仍保留基于 `option-scanner.ts` 的手写循环与 ad-hoc 索引跳跃，但在当前支持子集下行为稳定，尚未出现阻塞性缺陷。过早发动跨 5 个文件的大一统通用抽象重写会扩大变更面，并带来过度工程风险。
- **Exploration Direction:** 若未来重新评估或扩展新分层程序（如 `cargo`/`go`），探索建立轻量、正交、以数据驱动的声明式流形原语（`SubcommandProgramManifest`），取代分散的手工状态机：
  - **全局上下文提取器 (Global Context Extractor)**：统一消费前置全局选项（如 `git -C`、`uv --directory`、`npm --prefix`），自动维护 `cwdChanges` 与全局路径事实；
  - **子命令路由器 (Subcommand Router)**：精确识别子命令 token 并分派至独立子命令族契约，彻底消除选项跨子命令污染；
  - **角色感知选项规范 (Role-Aware Option Spec)**：扩展 `bounded-options.ts`，在选项声明中直接绑定路径角色（如 `sourcePath`、`targetPath`）与安全拦截（`securityBoundary`），底层解析器直接发行带正确角色的 `ProgramPath`，消灭各命令内部手写 `if (name === '--output') paths.push(...)` 的样板逻辑；
  - **声明式操作数位置策略 (Declarative Positional Policy)**：将操作数提取规则规范化为不可变策略枚举（如 `--` 分隔符后提取、尾部目标操作数、全部源操作数、禁止路径操作数等），消除手写下标运算；
  - **领域微调逃生舱 (Domain Tailoring Hooks)**：保留纯函数定制钩子，优雅接纳 Git `-C` 叠加状态机、local `file://` transport 校验等特异性边界，避免大一统框架陷入僵化。
- **Revisit condition:** `uv.ts`、`python-tools.ts` 或 `package-managers.ts` 出现选项与操作数混淆、参数值伪路径泄露或子命令选项污染的真实缺陷实证；或引入新的复杂子命令程序（如 `cargo`）需要统一架构支撑；或用户明确要求启动 Shell 语义分析层的架构一体化归并。
- **Out of Scope:** 在本候选被明确采纳前，不重写现有各命令分析器，不引入通用动态 AST 引擎或动态 CLI 解释器，不改变现行 Canonical、Admission、Mandatory Boundary 或 Policy 决策语义。

## C-048: 构建工具族（cargo/go/make）语义与委托执行边界（探索方向）

> 本条只记录未来对构建工具族（如 `cargo`、`go`、`make`）语义分类、有界检查与委托执行边界的探索，不改变当前命令分类行为，不构成实现承诺。

- **Why Not Now:** 当前 AKeel 尚无真实工作流实证表明必须为构建工具族引入专用分析器，目前没有必要在核心中新增此类专用工具族。构建工具（如 `cargo build/test`、`go test`、`make`）涉及编译期图灵完备代码执行（`build.rs`、Makefile、测试二进制派生）及隐式依赖拉取，无法在纯准入层做出静态安全证明；若日常开发需要运行，可通过现有 `develop` 预设的 `commands.opaque` 策略或临时 `/policy off` 处理，过早引入专用家族会增加维护负担并产生虚假安全保证。
- **Exploration Direction:** 若未来重新评估，探索建立类似 `package-managers` 的分层语义模型：
  - 信息与只读检查层：将纯元信息与版本调用（`--version`、`--help`、`help`）及明确的无副作用查询（如 `cargo metadata`、`cargo tree`、`go version`、`go env`、`make -p -q`）识别为 `inspect + read` 并安全放行；
  - 破坏性清理层：将 `cargo clean`、`make clean` 等批量/目录清理归入 `destroy + delete`，维持系统硬拒绝；
  - 有界构建/测试委托执行：将 `build`、`test`、`run` 等归入 `execute + opaque`，消费工作区变异参数（如 `cargo --manifest-path`、`make -C`、`go -C`）并提取工作区路径事实，受预设 `commands.opaque` 与 Mandatory Boundary 管辖，避免因 `unknown` 触发无界路径硬拦截。
- **Boundary & Scope:** 不做通用语言工具链深度 AST 解释；不将测试/构建伪装为只读 `inspect`；不放宽 Mandatory Boundary（凭据与 Git 控制面写保护）。
- **Revisit condition:** 真实多语言开发工作流因缺少构建工具语义而受阻，且现有 `commands.opaque` 或会话策略无法满足需求；或用户明确要求引入特定构建工具族的有界支持。
- **Out of Scope:** 在本候选被明确采纳前，不新增构建工具分析器，不改变现行 `unknown + opaque` 分类行为，不创建实现 Task。

## C-050: 待创建
