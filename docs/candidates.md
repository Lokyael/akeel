# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Revisit condition` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。

## C-009: delegated child 的任务能力分层与风险边界

- Why Not Now: 当前没有真实 delegated workflow 证明现有能力不足以完成任务，或证明 child 必须自行执行验证才能形成可审计结果；宽泛 execute 仍可能变成任意代码执行授权，`node -e` 等形态不能因“验证”名义获得能力。
- Scope: 评估按任务类型授予最小能力：只读调查、受限修改和有界验证分别处理；删除、发布和任意执行不作为普通 child 能力。子代理能力不得超过父会话，授权关系不明时不得放宽；不预设 T0/T1/T2、角色映射、策略传播或具体执行面，也不把 worktree 隔离解释为执行授权。
- Revisit condition: 真实 delegated workflow 证明当前能力分层无法完成必要任务或形成可审计结果，且现有同步 Owner 验证或其他受限替代不能合理闭环。

## C-015: 复杂 Shell 语义验证方法收敛（停止判据 + Bash 差分语料仲裁）

- Why Not Now: 当前没有已采纳的 Shell 语义扩展 Task 需要新增验证机制；现行支持子集已有基于 Bash/Linux 外部合同和 public seam 的测试。独立差分语料会增加 oracle、fixture 与跨版本维护成本，只有未来语义扩展暴露纸面分析无法仲裁的分歧时才值得采用。
- Proposal: ①当架构级与下近似疑点均已转化为可执行语料，继续纸面评审不再能区分替代语义时停止纸面评审，不采用固定评审轮数；②建立由真实 Bash 行为独立核对的差分语料，以 `literal input → expected Canonical outcome/facts → expected Policy/render result` 锁定当前 public seam；③每个新增 Shell 语义守卫必须附带至少一条能证明其必要性的语料；④按高风险语义垂直切片实施并以差分测试收敛，不以旧实现、旧 reducer 或旧测试输出作为 oracle。
- Revisit condition: 已采纳的 Shell 语义扩展（包括 C-029 若未来被采纳）出现纸面模型与真实 Bash 行为无法仲裁的分歧。

## C-016: 项目 `.env` 的受管读取与按名掩码

- Why Not Now: 当前没有真实需求证明 agent 必须批量读取项目 `.env`，也没有已采纳的结构化读取工具合同。把掩码放在 deny/ask renderer 或 Shell 管道中会先暴露原值；按内容猜测 secret 又无法形成可靠保证。该能力还需重新核对 D-023 的渲染边界、D-060 的纯决策职责和 D-069 的配置输入，不能从现有路径准入顺手放宽。
- Exploration Direction: 若采用，应把 `.env` 建成独立 Managed Env Read Surface：AKeel 进程内读取结构化 `K=V`，仅按受校验的变量名契约分类，并在任何 tool result、日志或事件产生前把 protected 名替换为 `key=****`；allow/neutral 名是否返回原值需由明确合同决定。原始 `cat .env`、Shell 管道掩码、递归聚合读取和普通 Direct read 不因该受管面获得放行。历史 proposal 把 `protected`、`allow` 与 neutral 作为三类：protected 曾包含 `*(KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|BEARER)` 与 `*(HOST|URL|URI|ENDPOINT|IP|ADDR|CONN*|DBCONN*)` 等候选模式，allow 曾列出 `NODE_ENV`、`PORT`、`DEBUG`、`LOG_LEVEL`、`APP_NAME`、`REGION`、`TZ`，其余为可见但不可写的 neutral；这些模式、默认值、IP/URL 分类、用户覆盖和与写能力是否共用配置都只是复审输入，必须在采纳时重新证明。
- Safety Boundary: 只有“原始值不离开可信进程”时才可声称掩码；受管面不得 debug-log 原始内容，拒绝路径在读取文件前完成。按名掩码不覆盖名称未分类但值中含 secret、IP 或 URL 的变量；不提供按内容兜底保证。磁盘本体、其他 extension 的 Node fs、用户编辑器、被放行的 Shell、host 侧工具调用记录和进程输出仍在 AKeel 保证之外。
- Revisit condition: 用户需要 agent 检查项目 `.env` 的非敏感配置且普通整读因泄露风险不可接受，或出现可验证的按名掩码受管读取需求。

## C-020: Content Flow checkpoint governance（仅探索方向）

> 本条只记录 Content Flow checkpoint 的未来探索；不改变现有 Access Gate 行为。

- Why Not Now: 当前项目只有 Operation Admission 信任链，没有可验证的 Content Flow producer/consumer、payload capture、enforcement 或 receipt seam。现在实现会把宿主的 substitution/projection 误称为发布控制，并制造超出实际能力的安全承诺。
- Exploration Direction: 若未来具备真实 seam，重新探索以下边界：Operation Admission 与 Content Flow 独立；静态 Normalized Flow 与运行时 Evidence 分离；Publication、Network Send、Process Start、File Commit 各自拥有 checkpoint 规则、授权、enforcement 和 receipt；只有受控绑定的 `exact` evidence 才能参与进一步判断，`unknown`/`unavailable`/`no-coverage` 不得解释为 clean、safe 或 permit；payload、lineage 和运行时授权不进入 `CompleteAccessPlan`。
- Revisit condition: 宿主提供可测试的发布/发送/进程/提交 enforcement seam，并出现真实 producer/consumer 工作流。

## C-021: 受管执行的 OS-level confinement

> 本条只记录宿主执行期物理隔离的未来探索；不把 sandbox runtime 纳入当前 Access Decision Core。

- Why Not Now: Access Gate 当前只拥有 tool-call 准入权，不拥有已放行进程、helper、子进程或 socket 的执行控制权。仅增加 `network` 标签、preset 或路径策略不能限制运行期外联；Pi 也尚未提供可验证的执行包装与隔离 seam。
- Exploration Direction: 只有宿主提供实际执行接缝后，才比较由独立 provider 建立的 Linux 隔离配置。provider 必须能证明文件系统、网络、凭据可见性、子进程、进程树终止和输出处理；Access Gate 只声明所需能力，不自行调用 Shell 包装器。若策略要求隔离而 provider 不可用，结果必须是拒绝；`prefer` 式降级只能明确表示“未隔离”，不能继续作出隔离承诺。
- Boundary: provider 不改变 Canonical、Admission、Mandatory Boundary 或 Policy 的语义；worktree、path admission、preset 和 Gate disabled 都不能被描述为 OS sandbox。C-039 只处理已知外部状态变更，C-020/C-038 分别处理内容流与不可信输入权威。
- Revisit condition: 外部不可信仓库自动化审计或供应链脚本执行成为真实高频威胁，且 Pi 提供可测试的物理执行隔离接缝。


## C-023: 项目级 Policy 单向收紧

> 本条只记录未来项目局部安全声明的探索，不构成当前配置合同、实现承诺或项目文件信任保证。

- Why Not Now: D-069 当前只接受全局 `policy.yaml`，尚未定义项目配置的发现、信任、合成、错误处理或审计合同。过早增加项目规则会同时扩大配置来源和静态证明负担；当前也没有复杂仓库反复误碰核心文件的实证。
- Exploration Direction: 只探索在全局 Policy 与系统 hard boundary 之上追加项目局部限制，不允许项目配置扩大任何权限。复审必须定义可信项目、配置位置、全局与项目规则合成、非法或不可读配置的 fail-closed 行为、preset 切换关系，以及项目内容不能通过自带配置解除宿主边界。发布脚本、分支配置等项目工件只是可能用例，不预先形成默认清单。
- Out of Scope: 网络副作用授权由 C-039 评估；参数级隐式执行由对应程序语义合同评估；`.env` 受管面由 C-016/C-035/C-036 评估，OS confinement 由 C-021 评估，历史敏感路径已由 D-070/D-090 三域模型吸收，不在本记录内组成统一“多维策略”。
- Revisit condition: 真实复杂仓库反复出现需要项目局部限制、且全局 policy 无法合理表达的误操作风险。

## C-028: Destroy 操作边界与可审批准入复核

> 本条记录对更宽破坏操作（递归删除、目录删除、Git 破坏性操作等）的未来评估方向。单文件非递归裸 `rm` 的有界证明与 `ask` 准入已在 T-0117 / D-071 落地；本候选只保留剩余未证明破坏操作的探索。

- Why Not Now: T-0117 已解决日常单文件清理痛点；当前未深入证明递归删除（`-r`）、父级目录影响（`rmdir -p`）、通配符展开、Git 高危子命令（`reset --hard`、`clean -f`、`branch -D`）以及混合 flow 聚合等更宽场景。
- Exploration Direction: 在现有单文件有界证明基础上，评估是否能进一步为受限目录删除或特定 Git 丢弃操作建立形式化边界证明，并在证明成立后引入受控的审批合同。复核需覆盖递归影响界限、路径和凭据硬边界、unknown 形态和无 UI 行为。
- Revisit condition: 真实工作流反复因无法删除目录或执行特定 Git 清理受阻，且可提供完整的外部语义证据与边界证明方案。
- Out of Scope: 本候选未被进一步采纳前，递归删除、`rmdir`、Git 高危破坏子命令继续永久 hard-deny，不创建实现 Task。

## C-029: 有界静态迭代语义（Shell `for`）复核

> 本条只记录未来对有限、静态、可证明 Shell 迭代语义的重新评估；不恢复旧 reducer、不追求 legacy parity，也不构成实现承诺。

- Why Not Now: 当前 `for` 作为 unsupported compound keyword 处理；D-059 已将 Static Flow 排除在 Greenfield trust path 之外。静态迭代同时牵涉有限词表、变量绑定、循环 body、success/failure、逐轮 CWD、资源预算、effect hard boundary 及 approval/display evidence，尚无真实工作流证据证明应承担这组复杂度。
- Exploration Direction: 若未来重新评估，应以新的外部语义合同定义“有界静态迭代”，而不是迁回旧 `for` reducer：
  - 先定义可证明的有限词表边界；动态值、命令/算术替换、运行时 glob、位置参数及未建模展开不得因循环语法本身获得授权。
  - 明确 body 只可组合哪些现有受支持 Shell 形态；嵌套循环、`break`/`continue`、函数/source、pipeline、后台和其他复合控制流需分别证明。
  - 以 D-045 的有界 success/failure CWD 候选为约束，定义空词表、重复词项、逐轮 CWD、body 失败及状态合并语义，并在物化前执行总迭代/命令/CWD 预算。
  - 每轮产生的 read/write/execute/destroy effect 都必须重新进入现行 Policy/Hard Boundary；静态可展开不改变 D-071 的 destroy 永久 hard-deny，也不使 opaque 委托执行获得放行。
  - 若存在 ask，必须重新定义原始循环、展开路径和 bounded evidence 的人类展示关系；不恢复旧 Explanation Replay 或旧 expanded-form 合同。
  - 验证以 Bash/Linux 外部行为、当前 Canonical/Admission/Display public seam 和安全不变量为依据；旧 reducer、旧测试数量及旧输出只能作为历史线索。
- **Current Boundary:** 在本候选被明确采纳前，`for` 继续 fail-closed；不因旧实现可检索而触发恢复。
- Revisit condition: 出现真实工作流因有限静态迭代被阻塞，且可提供不依赖动态值、运行时 glob、命令替换或隐式执行的最小场景与外部语义证据。
- Out of Scope: 完整 Bash 循环语义、动态/运行时词表、旧 reducer 迁移、旧 Explanation Replay、Direct 工具等价物、通用 Static Flow、实现 Task，以及任何未经独立证明的旧循环行为。

## C-031: 异步 child 与无人值守自动多代理流水线

> 本条只记录未来对异步 child 和无人值守自动多代理流水线的独立探索，不构成当前支持、实现承诺或 Herdr 执行面的选择。

- Why Not Now: 当前结果仍需既有 Task Owner 裁决的隔离工作可由同步 Herdr child 加预定 artifact 直接满足；可独立验收的长期工作由用户授权新的范围互斥 Task Owner Session，不需要回灌旧 Owner。异步 child 还需额外定义 mailbox、结果发布、重复通知去重、跨重启恢复、资源预算、权限、失败恢复和验收状态，复杂度与上下文成本超过当前收益；确定性资源回收是可独立演进的 C-034，不以采用异步流水线为前提。
- Exploration Direction: 若未来出现必须从属于既有 Task、但 Owner 又不能等待的长周期后台工作，再设计最小的异步合同：稳定 run/attempt ID，原子结果与 digest，completion mailbox，ACK/receipt，parent restart 恢复，重复交付去重，abandoned lease，以及 bounded 状态与错误输出。只有多个 child、自动重试或自动结果消费成为真实需求后，才增加 Herdr event subscriber、可信固定 callback、lane 聚合和确定性 orchestration extension；该合同可向 C-034 提供资源所有权与结果 receipt 事实，但不因此授权删除，child verdict 也不自动获得验收、记录、合并或发布权。
- Revisit condition: 出现真实长周期后台任务，证明同步 join 与独立 Task Owner Session 都无法满足吞吐、时效或跨重启要求。
- Out of Scope: 在本候选被明确采纳前，不提供 detached child、completion mailbox、自动 callback/续跑/重试/结果聚合、定时任务、token/cost budget 或基于 child verdict 的自动发布/合并；确定性 pane/workspace/worktree/临时运行资源回收由 C-034 独立记录。当前委托使用同步 Herdr artifact pull，并由唯一 Task Owner 保留最终裁决。

## C-033: Agent Capability Contract Assessment discipline

- Why Not Now: `instruction-editing` 已处理已批准 agent-facing 合同的语义保持型表达，`domain-modeling` 处理术语与长期裁决，当前只有一次 skill 治理证明曾需要从用户价值重新核对能力；尚不能证明这种复评会反复形成完整、独立的调用场景。
- Proposal: 评估模型可按需加载的 `capability-assessment` discipline，只面向一个已知 agent capability（尤其 skill 或 workflow），从目标用户、核心场景和可核查价值出发，分别判断名称、触发、能力承诺、边界与内容，并检查五者对齐。结果可建议保持、重命名、重塑边界、重写内容、合并、拆分或移除，每项结论附场景与证据；本候选不直接编辑合同或采纳裁决。
- Boundary: `instruction-editing` 继续表达已经批准的当前合同，`domain-modeling` 继续维护术语和长期裁决，`module-design`/`assess-modularity` 继续处理代码模块，`code-review` 继续审查固定变更面。本候选不承诺通用 module、任意产品能力或用户领域能力评估。
- Revisit condition: 至少两个不同 skill/workflow 的真实复评再次需要重复组合现有 disciplines，或现有方法持续遗漏目标用户、核心场景、价值证据及名称/触发/承诺/边界/内容对齐中的任一维度。

## C-034: Herdr child 资源的确定性自动回收

> 本条只记录未来把 pane、workspace、worktree 和临时运行资源的机械清理从模型记忆移交给非模型 lifecycle owner 的探索，不构成当前支持、实现承诺、Herdr runtime dependency 或删除授权。

- Why Not Now: 当前同步 fork-join 仍有存活的 Task Owner 可在拉取并裁决 artifact 后检查和清理资源，尚无反复 orphan 或并发规模证明自动化收益足以覆盖持久状态机成本。Herdr 0.9.0 已提供 worktree 非强制删除、worktree provenance、Agent/pane 生命周期事件、plugin event hook 与 startup hook，但未提供原生 owner/lease/TTL/reaper 或 artifact readiness；`done`/`idle` 不证明成果已落盘，`pane.exited` 不提供充分的成功语义，Git non-force 只保护 dirty/untracked checkout 而不能识别 clean 但未合并的 commit。现在实施必须先新增 owned-run registry、artifact receipt、commit-preservation、重启 reconciliation、幂等和路径复用防护，已超出小型 cleanup hook。
- Exploration Direction: 若重新评估，先比较 Herdr 原生 lease/reaper、持久 registry 加 event hook/startup reconciliation 的 Herdr plugin，以及有独立监督需求时的外部 lifecycle controller；优先由资源 owner 承担生命周期。只有 AKeel 在创建时登记并能以稳定 run identity、repo/worktree provenance 和当前 Herdr/Git 事实精确复核的资源可进入候选集合；扫描可用于核验和发现异常，不得按 label、branch 前缀或目录模式认领外来资源。自动回收还必须同时证明 child 已终止、artifact 具有原子 ready/receipt、checkout clean、没有需保留的未合并 commit、当前身份未被路径或 workspace 复用，并且 Herdr non-force 操作可完成；dirty、未合并、unknown、artifact 缺失、provenance 不匹配、仍有活动进程或需要 force 的状态只报告给存活 Owner/用户。事件重复、清理已完成和重启后重放应幂等处理；模型继续裁决异常成果的保留、导入、合并和验收，不承担机械 reaper。
- Revisit condition: 同步 child 反复遗留资源并造成实际维护负担，并行或异步 child 使手工清理不可靠，且 Herdr 提供可验证的 owner/lease/reaper 合同。
- Out of Scope: 在本候选被明确采纳前，不新增 plugin、daemon、timer、registry 或 AKeel runtime dependency，不自动扫描认领、force-remove、删除 branch、接受 artifact、导入/合并结果、更新 Project Record 或发布；当前仍由存活 Task Owner 检查后执行清理，child 不自删除。

## C-035: 项目 `.env` 的受管写入

- Why Not Now: 当前没有用户实证表明 agent 无法便捷写入 `.env` 已成为高频阻塞；普通 write/edit、truncate 或覆盖重定向可能破坏既有配置，而安全追加和定点覆写需要独立定义格式、并发、授权与失败合同。读取掩码不能自动授权写入，D-060 的 Admission 形状也尚未承载受管 append/set 子形态。
- Exploration Direction: 分别评估两种最小能力：①只允许单行字面 `K=V` 的 APPEND，不先读、不替换；②只对显式 allow 名集合执行 SET，protected 与 neutral 名拒写。变量名契约可与 C-016 探索共享配置来源，但共享不是预先采纳的实现要求。普通 `>`、truncate、Direct write/edit、递归聚合和未建模 `printf`、多行或 `$'…'` 形态继续 fail-closed。若 Canonical 已区分 append，相关标志必须进入窄 Admission，由 Policy 消费而不重新解析原始 Shell。
- Safety Boundary: APPEND 不能检测重复或既有覆盖；SET 必须定义原子 read-modify-write、并发和格式保持。写入字面值已经存在于 agent 的 tool call，掩码不能承诺从宿主调用记录中消除它。该受管子形态不是用户豁免，也不得放宽 D-070、D-071 或路径 hard boundary。
- Revisit condition: 用户确认 agent 落盘追加或定点更新项目 `.env` 是真实高频工作流，且现有手工编辑或普通路径策略不能安全满足。

## C-036: 进程环境命令的按名治理

- Why Not Now: `env`、`printenv`、`export`、`set`、`declare` 等命令涉及进程环境、Shell builtin 与执行输出，不等同于结构化 `.env` 文件；当前多数未建模形态进入 unknown/opaque，尚无真实工作流证明需要新增独立命令轴。进程输出中的 secret 也受 Pi host logging 边界影响，AKeel 不能仅靠 renderer 提供可靠掩码。
- Exploration Direction: 按外部 Shell/程序合同分别核对按名单值读取、全量 dump、赋值、导出与 child 可见性；protected 名的读取/导出应 fail-closed，allow/neutral 的可见性和写入需显式定义。若输出需要掩码，原值必须在可信进程内替换后才可进入 tool result；不能用 Shell 管道事后打码。rc 文件、环境加载器和 delegated child 的父子策略是独立边界，不因 `.env` 名称契约存在而自动解决。
- Revisit condition: 出现进程环境或 rc 文件中的敏感值经受管命令泄露、按内容掩码漏判的实证，或真实工作流需要 agent 安全检查或设置特定环境变量。

## C-038: 不可信内容的 provenance 与指令边界

- Why Not Now: 网络抓取、PR/Issue 和第三方仓库内容可能携带间接提示词注入，但当前没有统一的 producer provenance、host message label 或可测试的 consuming-agent enforcement seam。把自然语言警告称为隔离会制造超出能力的安全承诺；D-030/D-053 的 Policy 零注入也不等同于一般不可信内容治理。
- Exploration Direction: 若宿主提供真实 seam，区分用户/系统指令与外部数据来源，为 web search/fetch、不可信变更说明和第三方文件保留 provenance，并验证 consuming agent 不把其中指令提升为更高权威。未知、丢失或跨工具未传播的 provenance 不得解释为可信。该输入解释权与 C-020 的输出 Content Flow checkpoint、C-021 的 OS confinement 和 Access Gate 的操作准入保持独立。
- Revisit condition: 外部不可信内容成为自动化审计或重构的高频输入，并出现间接提示词注入实证；或 Pi 提供可测试的 provenance 与指令权 enforcement seam。

## C-039: 已知外部状态变更的准入边界

> 本条不恢复通用 `network` effect，也不提供网络防火墙；只记录未来对少数可证明外部写入动作的复核。

- Why Not Now: Access Gate 是执行前的语义准入系统，无法限制已放行脚本、helper、依赖生命周期或未知命令的运行期 socket。通用 network policy 会混合远程读取、外部写入和 opaque 行为，扩大命令方言与虚假安全承诺；当前 Git 远程/transport 边界已有更窄的 hard-boundary 处理。
- **Open Question:** 若真实工作流证明当前 `opaque` 或既有 hard-boundary 过宽/过窄，是否在 Canonical/Admission 中增加少数“已知外部状态变更”事实，并为 `git push`、package publish/upload 等明确动作定义统一的策略、混合 flow、无 UI 和显示合同。分类必须依赖完整的程序/选项合同，不因命令名称、URL 或参数外观猜测运行期行为。
- Safety Boundary: 该候选只保护被静态识别的外部状态变更；未知脚本、helper、依赖执行和任意网络外联仍是 `opaque`，不因该分类获得路径或网络隔离。审批不表示已执行；C-021 拥有执行期隔离，C-020 拥有 payload/lineage，C-038 拥有不可信输入 provenance。
- Revisit condition: 真实工作流证明显式外部状态变更需要区别于本地 `write`/`execute`，且现有边界无法合理表达。未满足前，不新增 network policy axis 或实现 Task。

## C-040: Pi render-only tool-result renderer 与测试模型视图

> 本条只记录 Pi render-only 接缝与测试模型视图的未来评估；不改变现有 TUI、执行或持久化行为。

- Why Not Now: 当前 Pi 的 `registerTool` 与 `renderResult` 仍把渲染定义绑定在工具定义上，没有只装饰内置 `bash` tool result、同时保持执行所有权和 session 持久化不变的公开接口。AKeel 当前已完成 context projection，但没有安全的宿主接缝可实现同一条 TUI 结果中的原始输出与模型视图；现在通过覆盖 `bash`、写入 custom message/entry、处理 `bashExecution` 或 monkey-patch 宿主组件都会越过 D-084 与当前范围边界。
- Exploration Direction: 仅在 Pi 提供并验证 render-only seam 后，评估在不接管内置 `bash` 执行、不改变 session 持久化的前提下，从原始结果生成临时模型视图。恢复 session 时从原始消息重新计算，不持久化 projection；宿主组合、fallback、异常和非 TUI 行为由 Pi public seam 测试先行确定。
- Revisit condition: Pi 发布可供扩展使用、保持单一执行所有权且能通过测试观察 persistence/render 边界的 render-only tool-result 接口。
- Out of Scope: 在本候选被明确采纳前，不修改 Pi 安装副本，不覆盖或重实现内置 `bash`，不改变 `bashExecution`、Access Gate、session file、tool result details、模型 context projection 或现有 TUI 展示；不创建 T-xxx 实现任务。

## C-044: 非 bounded 程序的参数级隐式执行与选项消费边界

> 本条记录当前基础命令选项合同之外的残留复核；不改变现行 Canonical、Admission、Policy 或 `opaque` 语义。

- Why Not Now: 当前已为一组 bounded coreutils 建立命令专属 option/value 合同，`find` 也有独立的 bounded expression analyzer；Git、Python、uv、herdr 和 npm 族仍由各自语义模块及既有 scanner 处理。已知的 Git helper/`-c`、`find -exec` 等形态已有 hard boundary，但未知程序及脚本内容（例如 `awk` 的 `system()`、其他工具的 helper 选项）仍按 `unknown + opaque` 处理。现在引入通用 option engine 或递归解释脚本会扩大 CLI 方言、执行语义和维护成本，且尚无新的安全实证或高频工作流证据要求改变该边界。
- **Open Question:** 是否继续维持“已证明的命令专属合同 + 未证明形态 opaque”的分层，还是为剩余程序族与未知程序重新设计更统一的参数级安全合同。复核必须分别判断：选项值消费是否完整、值是否产生路径事实、参数是否可能启动 helper/子进程、外部状态变更或破坏动作，以及 `opaque` 策略是否足以表达未证明风险；不能把这些问题合并为通用 Shell 解析、网络策略或 OS-level confinement。
- Scope: 只复核当前 Git/Python/uv/herdr/npm 族的 option scanner 覆盖与高风险选项边界，并核对未知命令的 `unknown`、`opaque`、路径边界和策略组合。外部实现（包括 pi-guard）只能作为可核查语料或合同参考，不作为正确性 oracle。
- Safety Boundary: 不因命令名称或选项外观推断脚本、helper 或运行期访问已经被分析；未知、动态、未消费或无法证明的值不得静默变成 positional path 或更宽授权。任何复核方案都不得削弱 D-018 的 fail-closed 规则、D-067 的 opaque 分层、Git/`find` 现有 hard boundary、D-071 的 destroy 永久拒绝或把 `allowedRoots` 描述为 opaque 运行期强制。
- Revisit condition: 出现真实安全证据表明参数级 helper/隐式执行可穿过当前边界，或真实工作流因已知程序的选项消费误判而受阻。

## C-045: 受管会话临时文件创建与系统临时路径准入（mktemp 语义评估）

- Why Not Now: 静态 Shell 词法不支持变量与命令替换，生成的随机临时文件名无法被后续命令消费；Pure Gate 亦不修改进程环境，裸 `mktemp` 必然落入越界的全局 `/tmp`。
- Exploration Direction: 仅在支持有界选项（如 `-d`、`-p`）并将目标路径显式约束在会话 `stagingRoot` 或工作区的前提下，评估受管临时文件创建语义。
- Revisit condition: 出现能在静态无变量 Shell 下消费随机临时文件的可行方案，或宿主提供进程环境重写接缝。

## C-050: 无人值守 Session 自动换页与长周期自主接力

> 本条记录未来将 Session 接力从单命令触发进一步推进为无人值守自动换页的探索；不改变当前需要显式触发的会话生命周期。

- Why Not Now: 当前 Pi 宿主的 `ctx.newSession()` 在架构上仅对人类交互的 `ExtensionCommandContext` 开放，在事件回调或后台中直接调用存在宿主死锁风险；此外，无人值守换页需要系统具备完全自动化的静止点（Quiescence）判定、会话高频震荡（Churning）防御与自愈熔断机制。目前用户意图仍需长期安全约束，过早开放完全无人的自动换页会引入失控风险与不可控的 API 消耗。
- Exploration Direction: 若未来宿主提供安全的非阻塞/后台会话替换接缝，探索基于上下文预算或 Slice 静止点的自主换页：系统自动侦测安全断点，就地合成胶囊并自动轮转至新会话接力，无需人类实时执行命令；用户仅保留异步或周期性的长期审计（Long-term Inspection & Audit），不参与日常微观审批。需设计换页频率预算门禁、工作区冲突自动熔断与异步告警通道。
- Safety Boundary: 无人值守换页不得绕过 Access Gate 路径策略与 Mandatory Boundaries；出现工作区冲突、reconciliation 失败或测试严重异常时必须立即挂起并等待人类介入，严禁无限循环自动重启；父子会话冷归档与回退能力（Rollback）必须持续保持。
- Revisit condition: Pi 官方发布支持后台/事件安全调用的会话替换接缝，或真实大型无人值守流水线证明单命令交互无法满足长期运行吞吐且可提供完备的熔断防御方案。

## C-051: AKeel TUI 运行状态可观测性增强

- Why Not Now: 当前 Access Gate 已通过状态栏与通知展示 policy 状态，handoff 也提供显式命令与状态查询；尚无真实工作流证据证明操作员无法据此判断当前策略、session authority 或 handoff 状态，也没有已采纳的稳定展示合同。
- Scope / Exploration Direction: 评估 policy、handoff 与 semantic ledger 的只读状态展示，使用户能区分当前策略、source/successor authority、reconciliation 状态与阻断原因；展示不得改变授权、session lifecycle、持久化语义或向模型注入 policy 数据。
- Boundary / Out of Scope: 不覆盖 render-only tool-result projection、模型 context 裁剪、Access Gate 决策本身或 OS-level sandbox；不因增加展示而扩大工具权限或自动执行能力。
- Revisit condition: 出现可复现的真实工作流，证明现有状态栏、通知和状态查询不足以判断上述运行状态，且 Pi 提供可测试的只读 TUI renderer/widget 接缝。

## C-052: Session fork/clone 与 Task Owner authority

- Why Not Now: 当前 D-075、D-092 与 D-093 定义了唯一 Owner、原生 session replacement 和 successor receipt，但没有定义 Pi `/fork`、`/clone` 复制 session branch 后的 Owner 归属、工具能力与恢复边界；改变该行为会触及 user-boundary、session lifecycle 和现有 handoff 合同，不能作为当前资源或 UI 优化的附带修改。
- Scope / Exploration Direction: 独立评估 Pi `session_before_fork` 与 `session_start(reason: "fork")` 的 Owner 语义，区分无活动 authority 的普通探索 session 与已捕获 live semantic/handoff authority 的 Task session，并保持 source/successor 不并行持有同一 Owner authority。
- Boundary / Out of Scope: 本候选未被促进前不改变 `/fork`、`/clone`、`/handoff` 或工具装载行为；不引入第二个并行 Owner、observer/claim 协议、自动 reconciliation 或后台 session 编排。
- Revisit condition: 仓库形成了关于 fork/clone Owner 归属的独立批准 Requirements/Design，并有覆盖 Pi pre-fork 取消、session replacement 不误阻断和 authority 唯一性的可执行测试接缝。

## C-053: 阻塞式 AKeel UI 的取消传播

- Why Not Now: 当前 Access Gate 与 `/policy` UI 没有已承诺的 abort-propagation 实现 Task，也没有覆盖 TUI/RPC 宿主取消行为的稳定测试合同；把取消语义并入其他授权或资源变更会扩大当前变更边界。
- Scope / Exploration Direction: 独立评估工具审批、策略确认和策略选择器在 Pi session/agent 取消时的生命周期行为，保持取消不产生授权、不执行工具，并与无 UI、用户拒绝和 UI 异常保持可区分的静态阻断语义。
- Boundary / Out of Scope: 本候选未被促进前不修改 Access Gate、`/policy`、Pi host UI、timeout、block reason 或其他 session 生命周期；不使用手工 Promise race 作为隐式 UI 管理机制。
- Revisit condition: 仓库形成了覆盖工具审批与 `/policy` 阻塞式 UI、TUI/RPC 取消行为及“不执行”结果的独立批准 Requirements/Design 和可执行测试接缝。

## C-054: Pi 类型 API 与 AKeel adapter 类型收敛

- Why Not Now: 当前 Access Gate 的 `unknown` host adapter 是为 malformed input fail-closed 保留的安全边界，未出现 Pi 类型缺失导致的运行时缺陷；工具 schema 与 execute 参数类型的重复虽可整理，但尚无独立的类型漂移证据或已承诺的 cleanup Task。
- Scope / Exploration Direction: 独立评估使用 TypeBox `Static` 消除 custom tool 参数重复，同时保留 runtime adapter validation；重新判断 Pi `ToolCallEvent`、`isToolCallEventType` 与 `defineTool` 在不削弱安全 seam 前提下的局部使用价值。
- Boundary / Out of Scope: 不把 Access Gate 的 unknown adapter 替换为未经 runtime validation 的 Pi 类型，不引入 `defineTool` 包装层，不改变 tool-call、schema、授权或 malformed input 合同。
- Revisit condition: 出现可复现的 schema 与 execute 参数类型漂移，或形成具有独立 Requirements、Design 和验证范围的类型收敛 Task。

## C-055: Pi final tool-call authorization seam

- Why Not Now: Pi 当前允许后续 `tool_call` handler 修改 `event.input`，并没有 AKeel 可依赖的最终不可变 pre-execution hook 或 handler priority；冻结输入、依赖加载顺序或自行重验都不能形成稳定安全证明，且可能破坏其他 extension 的合法 input mutation。
- Scope / Exploration Direction: 独立评估 Pi 是否提供最终执行输入快照、不可变 preflight 或可验证的 handler ordering，使 AKeel 能对实际即将执行的 tool input 建立单一授权证明；保持 custom backend、tool override 与其他 extension 的所有权边界明确。
- Boundary / Out of Scope: 本候选未被促进前不冻结 `event.input`、不依赖 extension 加载顺序、不增加第二次本地 parser、不声称覆盖后续 handler、tool override、custom backend 或执行后的行为。
- Revisit condition: Pi 发布并提供可测试的最终不可变 tool-call pre-execution seam，且该 seam 能证明授权输入与实际执行输入一致。

## C-056: Pi custom tool prompt discoverability

- Why Not Now: 当前 custom tool schema 仍会提供给模型，尚无可复现证据表明缺少 `promptSnippet` 已导致 AKeel 工具误用或不可发现；补充 prompt surface 还需独立核对静态措辞、工具启用状态和 system prompt 测试。
- Scope / Exploration Direction: 独立评估为 `akeel_handoff`、Artifact Exchange 与 Record Validator 增加静态短工具摘要，改善 Pi Available tools 列表中的 discoverability；不重复写入策略、权限或完整操作流程。
- Boundary / Out of Scope: 本候选未被促进前不修改 tool description、schema、promptGuidelines、授权、active-tools 生命周期或 runtime behavior；不把动态路径、policy、digest、artifact 内容写入 prompt metadata。
- Revisit condition: 出现可复现的 active AKeel custom tool 未进入 Pi Available tools 导致模型无法稳定发现或选择工具的证据，且形成独立的 prompt-surface 验证范围。

## C-057: RPC UI 与 Policy mode boundary

- Why Not Now: 当前 D-069 与 D-097 已采用 TUI-only 的 Policy selector/关闭确认边界；虽然 Pi RPC context 具备 `hasUI` 能力，但改用 `hasUI` 会改变 user-boundary，不能作为普通 host API 适配直接替换。
- Scope / Exploration Direction: 独立评估 TUI、支持 UI 的 RPC host 与 headless/JSON 模式下，Policy preset 选择、`accessGate: off` 确认和状态查询的统一能力合同；保持策略数据不进入模型 context，并区分显式命令与人工 UI confirmation。
- Boundary / Out of Scope: 本候选未被促进前不改变 `mode === "tui"` 判断，不自动向 RPC 开放 preset selector，不改变 `accessGate: off`、Policy Snapshot 或模型上下文隔离语义。
- Revisit condition: 仓库形成了覆盖 TUI、交互式 RPC 与 headless mode 的批准 Policy UI Requirements/Design，并有可验证的 host UI 与安全边界测试。

## C-058: 有界子代理审查编排与资源回收

- Why Not Now: 当前没有已采纳的统一 delegated-review budget、超时后续处理、Review Surface 复用、子代理终止和 run/workspace 回收合同；把这些约束临时散落在各个 Task 中会形成新的流程副本和不一致清理责任。
- Scope / Exploration Direction: 独立评估子代理审查的最大 run/agent 预算、超时与 blocked 状态、不可复用 Review Surface 的失效规则、重复启动抑制、settled agent 终止和用户授权清理；目标是在最终 surface 稳定后只产生必要的审查拓扑，并把异常资源变成可追踪的 bounded residue。
- Boundary / Out of Scope: 本候选未被促进前不修改 Pi、Herdr 或 Artifact Exchange runtime，不自动删除 run 目录，不把 idle/done 当作结果或进程终止，不绕过 Access Gate，也不赋予 child 结果验收、发布或清理权。
- Revisit condition: 仓库形成并通过可执行测试验证统一的 delegated-review budget、timeout/blocked 状态机、重复启动抑制和显式资源回收合同。

## C-059: Git rename/copy 检测的执行期资源预算与有界准入

- Why Not Now: 当前 Access Gate 只拥有静态 tool-call 准入，不控制已放行 Git 进程的 CPU、内存、执行时长或子进程生命周期；人工、低频、可信工作区审查尚无证据证明现有准入造成实际资源事故。把运行时成本估算塞进 Canonical parser 不能形成执行期安全保证，也会扩大当前 Git 语义合同。
- Scope / Exploration Direction: 评估 `--find-renames`/`--find-copies` 与更昂贵的 `--find-copies-harder` 的候选规模、`diff.renameLimit`/`-l` 约束、阈值校验、宿主超时、取消/强制终止、CPU/内存预算、输出上限及 review/guided/develop 策略关系。优先比较宿主执行预算、显式候选上限和需审批三种方案，区分静态准入证据与运行时 enforcement；不得把普通 inspect 自动等同于低成本。
- Boundary / Out of Scope: 本候选未被促进前不改变当前两个 bounded diff 选项的准入、不恢复 `--find-copies-harder`、不新增 OS sandbox 或独立 network policy，不在 Access Gate 中包装 Shell/Git 进程，也不把测试模板或静态命令字节预算描述为运行时资源控制。
- Revisit condition: 出现可复现的 Git rename/copy 检测超时、CPU/内存耗尽，或不可信大型仓库/高频自动审查成为受支持工作负载；并且 Pi/宿主提供可测试的进程执行、超时取消和资源结果接缝，足以验证拒绝、终止、输出截断与策略 verdict 的一致性。

## C-060: 待创建
