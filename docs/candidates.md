# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Revisit condition` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。

## C-008: 子代理 scratch 真隔离

- **Why Not Now:** 当前没有真实证据要求子代理 scratch 对其他本机用户不可读取；现有临时目录约定足以支撑当前工作流，但不承诺物理隔离。`stagingRoot` 是 AKeel runtime 的会话级临时根，不是子代理 scratch 合同；旧 `/tmp/pi-work` 路径也不作为兼容目标。
- **Scope:** 仅评估子代理 scratch 的物理隔离、独立生命周期和本机用户间可见性；不恢复旧 `staging/**` 规则，不改变 `stagingRoot` runtime 语义，不处理父子代理策略传播。
- **Revisit condition:** 子代理场景出现 `/tmp` 共享目录 symlink 攻击实证，或用户要求子代理 scratch 内容不可被本机其他用户读取。
## C-009: execute 档 T2（子代理验证能力）

- **Why Not Now:** Q3 冻结 execute=deny（非交互子代理内 execute=allow = 任意代码执行空白支票，node -e 绕过命令语义建模）；无证据表明 worker 验证摩擦不可接受。
- **Revisit condition:** 真实工作流 prototype 显示 worker 无法自证"测试通过"导致验证闭环不可用（跑一轮 worker 实测后）。
## C-010: docs/CONTEXT.md 子代理写保护

- **Why Not Now:** git diff 是既有防线；默认拒绝会破坏合法文档更新工作流（worker 任务常含文档更新）。
- **Revisit condition:** 出现子代理污染 durable 内容（CONTEXT.md/docs）的事例。
## C-011: pi-guard 共存说明

- **Why Not Now:** 装了 AKeel 再装 pi-guard 会双重拦截同一 tool_call（两者都拦 bash/read/write）；当前无此用户反馈。AKeel 已独立提供 bash/read/write 的访问决策，是否需要与其他 guard 共存仍缺少真实场景证据。
- **Revisit condition:** 出现 pi-guard + AKeel 双重拦截的用户报告。
## C-012: shell effects 不裁剪（当前 Admission effects 边界）

- **Why Not Now:** Shell effects 由 Canonical/Admission 事实承载，并参与当前 Shell policy evaluation；它们仍是命令分类和路径/effect 语义的组成部分。裁剪会让 `write`、`delete`、`cwd-change` 等事实失去承载，并可能破坏 D-060 的一次解释与窄投影边界。当前没有可测性能问题，也没有新的 effect 消费需求。
- **Revisit condition:** 未来 kernel 出现按 effect 决策的真实需求，或 plan 体积成为可测性能问题。
## C-015: 复杂 Shell 语义验证方法收敛（评审停用标准 + Bash 差分语料仲裁）

- **Why Not Now:** 当前没有已采纳的 Shell 语义扩展 Task 需要新增验证机制；现行支持子集已有基于 Bash/Linux 外部合同和 public seam 的测试。独立差分语料会增加 oracle、fixture 与跨版本维护成本，只有未来语义扩展暴露纸面分析无法仲裁的分歧时才值得采用。
- **Proposal:** ①连续两轮评审没有架构级或下近似缺口，且剩余语义疑点均可转化为语料时停止纸面评审；②建立由真实 Bash 行为独立核对的差分语料，以 `literal input → expected Canonical outcome/facts → expected Policy/render result` 锁定当前 public seam；③每个新增 Shell 语义守卫必须附带至少一条能证明其必要性的语料；④按高风险语义垂直切片实施并以差分测试收敛，不以旧实现、旧 reducer 或旧测试输出作为 oracle。
- **Revisit condition:** 已采纳的 Shell 语义扩展（包括 C-029 若未来被采纳）出现纸面模型与真实 Bash 行为无法仲裁的分歧，或用户明确选择建立差分语料体系。
## C-016: 环境变量治理（受管 `.env` 面：单一名份契约 + 按名可靠掩码 + 字面追加/allow 覆写）

- **Why Not Now:** 未采纳。落地方向成立但需演进 D-060 blocked 语义表述与 Admission 形状（append 标志），并新建命令面治理（env/printenv/export 族目前只有笨重的 unknown→ask）与受管面模块（parse key/value → mask → append → set-allow）；当前无用户实证表明"无法便捷注入 env 配置"已达到不可接受。重设版补充：D-023"拒绝值级掩码"的边界需明确（它拒 deny/ask 渲染面的内容嗅探掩码，不拒受管面**按名**掩码，见下"按名可靠掩码"）。
- **Proposal:** 以**变量名契约为唯一治理轴**，把 `.env` 建成"受管面"（Managed Env Surface）：所有读写经这一个面、用同一份名字契约决策，掩码也由名字契约驱动因而可靠。
  - **名字契约（单源）**：`policy.yaml` 顶层 `env` 段（D-069 加载即校验）——`protected`（掩码+拒写+拒导出，默认表覆盖 key/ip/真实链接/url：`*(KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|BEARER)`、`*(HOST|URL|URI|ENDPOINT|IP|ADDR|CONN*|DBCONN*)` 等）、`allow`（可读可见+可写：`NODE_ENV`/`PORT`/`DEBUG`/`LOG_LEVEL`/`APP_NAME`/`REGION`/`TZ`）、其余 = neutral（可读可见，不可写）。命名约定本身是治理输入；决策只探测键名集合，不取值。
  - **三种能力**：① **MASK-read**（替代整读）解析 `.env` → 逐条 `key=value`；protected 名 → `key=****`，allow/neutral 名 → 原值；② **APPEND** 仅 `>>` 追加单行字面 `K=V`（无先读后写、无替换）；③ **SET-allow** 仅对 allow 名单内 key 覆写为字面值（allow 名按契约即非敏感 → 低危）。原始 `cat .env`/`>`/truncate/write/edit、`grep -r` 递归聚合保持 hard deny。
  - **按名可靠掩码（重设核心，回应"屏蔽 key/ip/真实链接/url 但不影响普通变量"）**：掩码失效源于"按内容猜值像不像 secret"；因 `.env` 是结构化 `K=V`，拆成 (key,value) 对后**按 key 名**判——`API_KEY=****`、`NODE_ENV=production`。名字可枚举、用户声明 → 确定性、无内容启发式、无漏判误判（误伤固定词/漏改编码）。这与 D-023 相容：D-023 拒的是 deny/ask 渲染面"嵌入原始值再打码"（值形态任意、无结构）；受管面面对结构化 key-value + 可声明名字契约，掩码键名而非猜值，是全新且可靠的前提。
  - **掩码位点前置条件（可信掩码的唯一正确实现位点，安全不变量）**：掩码必须发生在 **AKeel 进程内**（受管面 Direct 工具：fs 读 → 按 key 名替换为 `****` → 只把掩码串作为 tool result 返回）。原因：掩码只有在"原始值永不离开可信进程"时才有意义——若是 shell 管道（`cat .env | sed …`），原始内容先经过 shell stdout → host 执行记录（日志）与 LLM tool result，sed 只是给"已读走的原文"打码，**收不回来**，且原始 read 已发生。由此两条硬约束：① `.env` 的读一律走受管面 Direct 工具，**禁止 shell 管道掩码**；② 受管面 **不得 debug-log 原始 `.env` 内容**。**正面承诺（受管面正确实现下）**：进入 LLM 上下文的 `.env` 内容只有两种形态——掩码串（protected 名 `key=****`）与 allow/neutral 名的原值（后者即"普通变量不受影响"的设计意图本身，非泄露）；除此之外的原始值只短暂驻留 AKeel 进程内存，**不写入任何 AKeel 侧记录**（无 debug 日志、无事件流落盘），**不进入任何 tool result**。拒绝/失败路径同样保证：gate 决策前不读取文件。此承诺的边界见"诚实边界"残余段（磁盘本体/写路径字面/host 侧记录不在其内）。gate 决策路径本就安全：Policy Kernel 是纯决策层、不执行文件读（D-060），deny 侧只给类别不给值（D-023），拒绝路径不带原始值。
  - **命令轴治理**：env/printenv/export/set/declare 按名分类；export protected 名 deny（当前无 AKeel 子代理 env 策略）；env 含 protected 名时全量 dump deny；受限 dump 只见 allow/neutral 或全掩码。子代理对 allow 名可见、对 protected 名拿到 `****`，当前不提供父档钳制。
  - **实现方案大纲**（参考，非承诺）：IR 已区分 append 形态（`RedirectionKind.stdoutAppend`），缺口在 compiler 摊平 → 把 append 标志带进授权投影（Admission 形状同步 D-060）；`decidePath` 对 env 家族在 write+append 形态放行进入 policy，其余 blocked（D-060"不可覆盖"不破坏——append/SET-allow 是新增子形态而非用户豁免）；新建受管面模块（`access-gate/env/`，parse → mask → append → set-allow，镜像 tests 分层 D-044）；威胁层 `read_secrets` 与名字契约单源对齐。
  - **诚实边界**：dedup/覆盖检测不可用（读被禁的必然结果，SET-allow 只对 allow 名提供显式覆写）；printf/多行/`$'…'` 形状 v1 不建模 → fail-closed；名字不在 protected 表、值里却嵌真实 IP/URL 的变量按名掩码覆盖不到——缓解是聚合读保持 hard deny（无批量外流通道）+ 用户把该变量名加 protected，按内容值级兜底掩码不作为保证（与 D-023 一致，结局 fail-open，只作显式 opt-in 非保证最佳努力）；rc 文件（`.bashrc` 等）是混合载体，密钥内容可见性属显式通道边界；执行输出里的 secret 属 pi 宿主 logging scrubbing，AKeel out of scope（Negative Space 已声明）。**掩码消除不了的残余**：`.env` 本体在磁盘，其他读者（其他 extension 直接 fs、用户编辑器、被 gate 放行的 shell）可读原始值——AKeel 只保证受管面通道不泄，不保证"无其他读者"（Negative Space：不拦截其他 extension 的 Node fs）；写路径（APPEND/SET-allow）的字面值本就在 agent 自己的 toolCall 里（写配置的意图），非掩码职责；host 侧对工具调用的记录属宿主面，AKeel out of scope。
- **Revisit condition:** 用户确认"agent 需要落盘写项目 `.env` 注入配置"（追加/allow 覆写）为真实高频工作流，或"密钥经 rc 文件/进程 env/按内容掩码漏判"出现实证需求。
## C-019: 会话上下文水位自省与安全交接协议（Context Introspection & Safe Handoff Protocol）

- **Why Not Now:** 当前主要依赖人工对上下文消耗的感知，且对于常规短平快任务，单会话通常在窗口耗尽前已自然结束；自动化交接涉及工作区状态判决（如 git 干净度、测试通过断言）与主动停机策略，需定义清晰的契约边界，目前尚无自动化切分机制，先落档作为机制候选。实测证据已表明：在长会话（尤其是禁用自动压缩的场景）中，缺乏水位自省会导致上下文膨胀至数十万 Tokens（如实测观察到的 50 万 Token 长会话），引发推理延迟激增、缓存成本高昂以及模型因注意力分散而陷入反复自审死循环。
- **Proposal:** 建立面向单 Agent 自省与多 Agent 协作的**上下文水位监控与安全交接机制**：
  - **精准水位探测（真实数据、零开销）**：
    - **自身探测**：直接读取当前会话 `session.jsonl` 末尾的 `usage` 字段（`cacheRead + input`），获取底层真实的窗口占用数据，避免依赖大模型自然语言“估算”自身 Token；或通过 Extension 运行时钩子注入自省状态。
    - **跨 Agent/窗格窥探**：通过文件系统扫描其他活动会话的 `session.jsonl`，或经由 Herdr Socket API（`herdr pane list` / metadata）广播窗格 Token 水位，允许 Supervisor 脚本或人类直观监控全局上下文开销。
  - **安全交接准则（Safe Handoff Boundary）**：
    - **严防半途截断**：严禁在代码修改中途、测试未通过或存在编译语法报错时强行打断交接，避免接盘 Agent 面临破碎状态；
    - **原子闭环触发**：当上下文达到软阈值（如 120k~150k 或 70% 窗口）时，Agent 进入收敛模式，不开启新任务，仅等待最近一个**原子闭环点**（当前 Slice 完成、测试全绿、Git 工作区干净或已建立安全保存点）到达。
  - **交接契约生成（Handoff Contract）**：
    - 自动在 `/tmp/akeel/handoffs/handoff-<timestamp>.md` 生成标准化交接文件，内容严格结构化：① 当前阶段完成状态与验证证据（如测试日志、commit hash）；② 已定案的核心设计决策与边界；③ 下一个新会话启动后的第一明确动作（Next Action）与启动命令。
  - **优雅停机与终端通知**：
    - 写入交接文档后，Agent 主动停止后续执行，在终端输出明确的交接提示（如果在 Herdr 窗格中，可发送 `herdr notification` 提醒），引导人类新开一个干净的会话加载交接文档继续工作。
- **Revisit condition:** 用户确认在大型多阶段特性开发中，上下文膨胀导致的推理退化与循环拉锯成为高频痛点；或用户要求在会话中正式引入自动化水位预警与交接模板生成工具。
## C-020: Content Flow checkpoint governance（仅探索方向）

> 本条只记录未来探索方向，不构成当前需求、路线图、架构采纳或实施承诺；不得据此修改现有 Access Gate 行为。

- **Why Not Now:** 当前项目只有 Operation Admission 信任链，没有可验证的 Content Flow producer/consumer、payload capture、enforcement 或 receipt seam。现在实现会把宿主的 substitution/projection 误称为发布控制，并制造超出实际能力的安全承诺。
- **Exploration Direction:** 若未来具备真实 seam，重新探索以下边界：Operation Admission 与 Content Flow 独立；静态 Normalized Flow 与运行时 Evidence 分离；Publication、Network Send、Process Start、File Commit 各自拥有 checkpoint 规则、授权、enforcement 和 receipt；只有受控绑定的 `exact` evidence 才能参与进一步判断，`unknown`/`unavailable`/`no-coverage` 不得解释为 clean、safe 或 permit；payload、lineage 和运行时授权不进入 `CompleteAccessPlan`。
- **Revisit condition:** 用户明确启动 Content Flow 方向的探索，或宿主提供可测试的发布/发送/进程/提交 enforcement seam，并出现真实 producer/consumer 工作流。

## C-021: 智能体多维访问注入防御与内核级纵深安全架构（Injection Defense & OS-Confinement Architecture）

> 本条只记录未来探索方向，不构成当前需求、路线图、架构采纳或实施承诺；当前不创建 Task、不修改代码、不引入 bwrap/DSH 依赖，也不启动任何实现。

- **Why Not Now:** 当前门禁通过严格的 Shell AST 解析、bounded 程序选项分类与软链组件解析，已能阻断已知的路径逃逸与非恶意语法越权；但对抗性推演已证实：**纯应用层 TypeScript AST 存在结构性盲区，无法防御更底层的复合注入攻击**（包括间接提示词注入操纵、依赖生命周期钩子 `preinstall`/`build.rs` 隐式代码执行、命令参数级任意代码执行 `git -c`/`find -exec`、以及环境变量加载器劫持）。引入 OS 级轻量沙盒（如 Linux `bwrap`）需要处理宿主环境依赖检测，当前先作为防御深度升级候选完整立档。
- **Exploration Direction:** 仅在触发条件满足后，探索面向 AI 编码智能体的**四层纵深注入防御架构（Defense-in-Depth for Agent Access）**，从“单一用户态语法检查”升级为“语义识别 + 物理兜底”；在此之前不据此实施：
  - **数据/指令边界隔离（Data/Instruction Boundary）**：对网络抓取内容（web search/fetch）、不可信 PR/Issue、第三方数据文件打上不可信数据标签；维持 D-030/D-053 的 Policy 零数据注入原则，防止包含间接提示词注入（IPI）的恶意外部文本被直接解释为最高优先级的系统指令。
  - **参数级代码执行封杀（Argument ACE Whitelist & Promotion）**：扩充高危命令选项库，严格封杀具有隐式执行子进程能力的参数组合（如 `find -exec`、`git -c`、`tar --checkpoint-action`、`awk 'system()'`、`vim -c` 等）；包含此类参数的命令一律从 `inspect`/`modify` 强制提升为 `execute`（默认 deny）或直接阻断，消除“合法命令壳内藏恶意执行”的绕过空间。
  - **文件系统与符号链接物理目标追踪（Filesystem Invariants）**：严禁仅做纯词法路径归一化，准入前必须基于真实文件系统进行分段 `readlink` 解析，解析链条中任一部分跨越 `allowedRoots` 立即 Fail-Closed；递归搜索工具（`grep -R`、`rg -L`、`ls -LR`）默认禁止跟链递归，防范第三方恶意仓库自带的软链投毒。
  - **内核级非特权物理隔离兜底（OS-Level Confinement via bwrap）**：在 Linux 平台（D-035）下为命令执行可选挂载 **Bubblewrap (`bwrap`)** 轻量非特权沙盒（无需 root 权限，零守护进程，纳秒级启动）：
    - **物理挂载遮蔽**：将工作区以读写挂载，系统核心以只读挂载，将 `~/.ssh`、`~/.gnupg`、`~/.aws`、`/etc/shadow` 等敏感凭据直接挂载为空的只读 tmpfs，在操作系统内核层面终结私钥与凭据窃取通道；
    - **网络隔离执行**：本地单测或构建阶段默认剥夺网络命名空间（`--unshare-net`），阻断供应链构建钩子向外网回传数据的能力。
  - **内核抽离与双底座（Pi × DSH）可插拔适配**：将门禁纯逻辑抽离为通用 `@keel/core`（宿主无关、纯函数求值）；针对 Pi 维持毫秒级 TUI 交互拦截；针对 DSH 封装为标准的 Cordis 插件（利用微内核依赖注入与 `bail` 熔断机制），实现安全底座的跨平台复用。
- **Revisit condition:** 用户正式启动对外部不可信开源仓库的自动化审计/重构流水线，或间接提示词注入（IPI）与供应链构建脚本注入成为实际业务场景的高频威胁；或用户决定正式引入 `bwrap` 强化执行期隔离。
- **References:**
  - **Bubblewrap (`bwrap`)**: `containers/bubblewrap`（Linux 非特权用户命名空间文件系统挂载与网络隔离基准）
  - **Landlock LSM**: Linux 内核级无特权访问控制接口（`landlock.io`）
  - **SWE-agent (ACI)**: `princeton-nlp/SWE-agent`（Agent-Computer Interface：以结构化受限工具代替原生 Shell 的范式）
  - **OpenHands**: `All-Hands-AI/OpenHands`（`SecurityAnalyzer` 风险分级评估器与插拔式 Runtime 抽象）
  - **Claude Code**: Anthropic 终端 Agent 的 Glob-based 路径授权与命令模式匹配引擎
  - **Cordis**: `shigma/cordis`（DSH 底座所依托的微内核依赖注入与 Reversible Effects 插件架构）


## C-023: 多维策略精细化与安全边界纵深治理（Fine-Grained Policy & Scope Governance）

> 本条只记录未来探索方向，不构成当前需求、路线图、架构采纳或实施承诺；当前不创建 Task、不修改代码，也不启动任何实现。

- **Why Not Now:** 当前基于 5 类命令语义分类与路径黑白名单的基础模型已能阻断已知越权；过早引入微观命令过滤或复杂匹配规则会增加静态证明负担与配置复杂度。
- **Exploration Direction:** 探索面向高危动作与复杂工程上下文的分层精细化治理架构：
  - **空间精细化（项目级安全叠加）**：支持项目内局部安全声明，严格遵循“单向收敛原则”，项目配置仅允许在全局基线之上追加黑名单（如保护特定发布脚本或分支配置），严禁突破全局安全底线；
  - **行为精细化（网络外发与提权动作隔离）**：将带有外部网络副作用的动作（如代码远端推送、依赖发布）从常规本地修改中解耦并独立设防；封杀利用合法命令参数进行隐式子进程提权的复合操作；
  - **载体精细化（敏感凭据专道防护）**：联动既有受管面候选（C-016 环境变量单名契约、D-075 delegated-write Worktree 隔离、C-021 内核级非特权沙盒），对真实敏感文件提供结构化单向保护而非简单的一刀切阻断。
- **Revisit condition:** 用户在复杂仓库中遇到“误碰工程核心文件”或“需阻断未经授权的网络外发操作”等真实安全痛点，或出现不可信第三方依赖隐式越权的实证。

## C-024: 子代理策略管理与父子权限收紧

> 本条只记录未来探索方向，不构成当前需求、路线图、架构采纳或实施承诺；当前不创建 Task、不修改代码，也不启动任何实现。

- **Why Not Now:** 当前 AKeel 不注册或管理 subagent tier/parent-tier，Pi host 也尚未提供可冻结的父子 Policy Snapshot 绑定合同；在缺少真实宿主 seam 时实现会把策略传播、降权和生命周期语义猜进 Access Gate。
- **Exploration Direction:** 在 Policy Kernel 仍只消费不可变 Policy Snapshot 的前提下，探索父会话到子会话的单向权限收紧：子代理只能获得不超过父会话的策略，不能自行切换到更宽 preset；父子绑定在 runtime/adapters 创建时冻结，preset 名称和策略内容不注入模型上下文，并为无 UI、会话结束和子代理重启定义 fail-closed 行为。
- **Revisit condition:** Pi host 提供可验证的父子会话策略 seam，或真实多代理工作流出现子代理需要独立降权、且当前全局 policy 无法表达的需求。
- **Origin:** C-022

## C-025: Access Decision 重构前后功能差异复核与取舍

> 本条只记录 `c52bd1d` 重构前实现与当前 Access Decision Pipeline 的功能差异清单，不构成恢复旧功能、追求 parity 或修改当前实现的承诺。任何一项进入实施前，必须由用户在当前会话明确选择并迁移到 Task 或 Decision。

- **Why Not Now:** 当前实现已按 D-059/D-060 完成 Greenfield trust path 与生产切换，目标不是复刻旧 `command-semantics/gate/profile` 行为；旧实现只作为历史线索，不能作为正确性 oracle。一次性恢复全部旧功能会混入互相独立的安全、配置、UI、可用性和子代理议题，扩大验证面并削弱当前 fail-closed 边界。
- **Comparison Points:** 当前列出高层待核对点，覆盖保留不变、增强、收窄和删除项。条目粒度按后续可独立判断“保留现状 / 恢复 / 文档同步 / 明确退役”划分，而不是按旧测试数量 parity。命令、选项、输入边界和测试用例等细节均归入对应功能族或横切检查项，不在此逐条展开。
- **Resolved cluster:** `Project root and session lifecycle` 与横切的 `Home resolution authority` 已由用户采纳并记录为 [D-072](decisions.md#d-072-session-启动-cwd-作为访问根与-home-的受限-tilde-语义)。C-025 保持为未采纳的其余差异清单，不再把 Git-root 前置或额外 host `home` 字段作为开放恢复问题。
  - **Migrated cluster:** `Bounded static iteration semantics` 已迁移至 C-029，作为独立的未来语义探索；C-025 不再承担该细项的完整边界设计。
  - **Production entry:** 当前入口只调用 `installGlobalPiAccessDecision()`。候选问题：是否需要重新暴露更丰富的 runtime 装配层。
  - **Direct managed surfaces:** 旧版与当前均管理 `read`、`write`、`edit`、`find`、`grep`、`ls`；当前 host adapter 规范化为 `read/write/edit/list/search`。候选问题：是否补充 surface 映射文档。
  - **Direct tool argument schema:** 旧版 Direct schema 允许 `grep.glob`，且 `read.offset/limit` 最小值按旧 schema 可为 0；旧 `find.path` 与 `find.pattern` 均可省略。当前 search 只接受 `path`/`pattern`，`list` 与 `search` 的 `path` 均可省略并默认当前 cwd，但统一 `search.pattern` 必须为非空字符串，`read.offset/limit` 必须为正整数，并对 `write/edit/search` 文本、NUL 与 key 集更严格。候选问题：是否恢复特定参数兼容、修正文档，或明确收窄。
  - **Effect vocabulary / policy axis:** 旧版封闭 effect 词汇含 `read/search/write/delete/permissionChange/execute/network/cwdChange`，并区分 path/shell effect axis；当前 Shell effect 收敛为 `read/write/delete/execute/cwd-change`，Policy Kernel 对每个 operation 同时按 effect（`read`/`cwd-change` 使用 read policy，`write`/`delete` 使用 write policy）与 command class 决策，`delete`/`destroy` 仍优先进入 hard boundary。候选问题：是否明确退役旧 effect 轴、恢复部分 effect 词汇，或把差异写入架构文档。
  - **Resource and analysis limits:** 旧版主要由 parser/plan 结构失败与旧 preflight 约束；当前新增显式资源上限，包括 Direct 文本字节、Shell command 字节、Shell command 数、cwd state 数与 edit entry 数。候选问题：是否把这些上限作为新安全/性能合同文档化，并确认默认值是否合适。
  - **Path scope expression:** 旧版路径规则与当前绝对路径范围的独立未来处置方向已移至 C-030；本条仅保留该差异作为复核索引。
  - **Policy path canonicalization:** 旧版配置路径规则作为 glob/virtual path 规则加载；当前 `allowedRoots`、`blockedRoots`、`blockedPaths` 在 policy adapter 加载时经 `resolveExistingPath` 规范化，并在 symlink 解析失败时拒绝配置。候选问题：是否把配置侧 canonicalization 作为独立安全合同、迁移约束或实现细节记录。
  - **Symlink/traversal:** 旧版有 path resolve 与 blocked glob；当前 Canonical resolution 同时保留 lexical 与 symlink-target traversal prefixes，Direct search 与 Shell recursive path 在 blocked descendants 上 fail-closed。候选问题：是否把该增强写成迁移说明中的“非 parity 安全提升”。
  - **Shell grammar:** 旧版受限 Shell IR 覆盖更多形态；当前支持更小的 simple flow 与有界 `&&/||/;`，pipeline/background/compound/newline 多数 fail-closed。候选问题：是否恢复部分旧 Shell 形态，或保持 Greenfield 收窄。
  - **CWD / control-flow tracing:** 旧版 `control-flow.ts` 建模 `cd`、`cd -`、`pushd/popd`、`&&/||/;/newline` 下的 cwd 候选与 opaque 分支；当前 `shell-flow.ts` 追踪有界 reachable commands 与 `cd` 后 cwd states，但 newline 不作为 flow operator，`pushd/popd` 不再作为专门 cwd 变异族。候选问题：逐项确认旧 cwd 候选语义是否需要恢复、文档化退役，或仅保留当前 bounded flow seam。
  - **Wrapper handling:** 旧版建模 `env`、`timeout`、`command`、`nohup`、`exec` wrapper 链；当前仍有 wrapper 集合并测试底层语义保留。候选问题：是否补齐旧 wrapper 边角语料。
  - **Redirection:** 旧版支持重定向且 `<>/2<>` 按 write 侧建模；当前保留 read-write redirection write-side contract，unsupported clobber fail-closed。候选问题：是否补全 README 的重定向支持矩阵。
  - **Shell base inspection commands:** 当前基础集合保留 `cat/head/tail/grep/rg/find/ls/od` 等 inspect 命令；候选问题：逐项确认旧 read/search adapter 的 inspect 用例是否已由基础集合或 program semantics 覆盖。
  - **Shell base modification commands:** 当前基础集合保留 `mkdir/touch/cp/mv` 等 modify 命令；候选问题：逐项确认旧 filesystem adapter 中同类写入命令是否需要恢复。
  - **Shell base destructive commands:** 当前基础集合保留 `rm/rmdir` destroy 分类且 destructive command hard-boundary 优先；候选问题：逐项确认旧 filesystem destroy 行为是否已充分覆盖。
  - **Shell deterministic/noop commands:** 当前保留 `true/false/echo/printf` 等确定性或无路径命令；旧版 noop 还包含 `:`，当前 `:` 落入 unknown。候选问题：对照旧 noop/date/read adapter，确认哪些 inspect-only 命令应恢复。
  - **Filesystem adapter family:** 旧版 filesystem adapter 覆盖 `rm/rmdir/touch/mkdir/cp/mv/ln/tee/dd/chmod/chown/install/mktemp/truncate/shred` 等文件系统操作；当前只保留较小基础子集，`tee`/`dd` 等未建模形态进入更保守的边界处理。候选问题：逐项判断缺失命令是否恢复或退役。
  - **Permission-change effect:** 旧版 `chmod/chown` 等权限类操作可承载 `permissionChange` effect；当前没有独立 permission-change effect，相关命令多落入未建模/unknown 或被更窄命令集合拒绝。候选问题：是否恢复权限变更专门分类、并定义其与 write/destroy 的策略关系。
  - **Read adapter family:** 旧版 read adapter 实际覆盖 `cat/head/tail/wc/cut/diff/less/more/file/stat/du/df/od`；当前只保留部分基础 inspect 命令。候选问题：逐项判断缺失读命令是否恢复或改用 Direct 工具。
  - **Search adapter family:** 旧版 search adapter 覆盖 `find/tree/grep/rg/ls` 等，并建模部分输出文件/action 选项；当前保留 `find/grep/rg/ls` 的较小可证明子集，`find -exec/-delete` 等 fail-closed。候选问题：逐项判断高级搜索选项是否恢复。
  - **Text-transform adapter family:** 旧版 text-transform adapter 覆盖 `sed/awk/sort/uniq/tr` 等，含 in-place/output 选项建模；当前未见等价专用家族。候选问题：是否恢复只读 transform 与写入 transform 的分层语义。
  - **Build adapter family:** 旧版 build adapter 覆盖 cargo/go/make 等构建工具语义；当前未见等价专用家族。候选问题：是否按真实构建工作流恢复，或依赖 execute/unknown 策略处理。
  - **Date adapter family:** 旧版 date adapter 区分 inspect 与 `--set` modify；当前未见等价专用家族。候选问题：是否明确退役或恢复 inspect-only 支持。
  - **Shell builtins adapter family:** 旧版 `source`/`.` 归为 execute；当前 compound/解释器边界更保守。候选问题：是否补充 shell builtin 分类矩阵。
  - **User command overrides:** 旧版 `commands/aliases/reclassify` 允许用户声明式扩展命令语义；当前无等价入口。候选问题：是否在新 Canonical 架构下重新设计用户扩展 seam，或明确不支持。
  - **Git semantics:** 旧版 Git adapter 覆盖较广但重构任务记录了 path-boundary 风险；当前重点强化 `-C`、`--git-dir`、`--work-tree`、local `file://`、clone/fetch/pull/push/submodule 等 hard-boundary 回归。候选问题：是否只补可证明 Git 子集，而非追求旧 adapter parity。
  - **Package managers:** 旧版 npm/pnpm/yarn/npx adapter 更宽；当前分类常见 inspect/modify/execute，脚本、install、npx 等委托执行 opaque，在 path boundary 下 hard-deny。候选问题：是否按真实用例增加 bounded package-manager 子命令。
  - **Network effect:** 旧版 Git/package/build 语义会为 `fetch/pull/push/clone/ls-remote/submodule`、`npm install/publish/audit/whoami/ping`、`cargo/go` 联网子命令等标注 `network`，并可触发网络侧审批；当前没有独立 network effect 或 network policy 轴，网络风险由 execute/opaque/hard-boundary 与 Negative Space 承担。候选问题：是否明确退役网络 effect，或作为未来细粒度策略重新设计。
  - **uv:** 旧版已有 `uv run` execute 语义；当前保留 `uv run` execute/opaque、help/version inspect、未知 fail-closed。候选问题：是否扩展 uv 其他顶层子命令。
  - **Python tools:** 旧版覆盖 `ruff/mypy/black/isort/pylint/pytest/pyright` 等；当前保留同族核心分类，但 `pytest` 与委托执行 opaque，`ruff clean` destroy。候选问题：是否按工具逐项补 option/path matrix。
  - **Interpreters:** 旧版区分 interpreter info 与 execute；当前保留，并把脚本 operand 纳入 path admission，`-e/-c` 等脚本选项 fail-closed。候选问题：是否补文档说明“脚本路径可见但内联代码不执行分析”。
  - **Threat scan / hard preflight:** 旧版有 `threat-scan.ts`、下载管道执行硬规则、prompt-injection 文本扫描；当前未见等价 threat scanner，部分风险由更窄 Shell 语法、pipeline fail-closed 和解释器脚本选项 fail-closed 覆盖。候选问题：是否恢复 token-level threat scanner，或将其退役并同步决策。
  - **Decision code and guidance taxonomy:** 旧版拥有较细的 DecisionCode、evidence kind、response kind 与 GuidanceId 映射，如 `dynamic-shell`、`compound-command`、`opaque-command`、`blocked-path`、`symlink-escape`、`profile-restriction`；当前 host-facing block code 更少，失败文案为静态 bounded reason，并新增只读策略切换提醒。候选问题：是否维持收敛后的 host 合同、恢复更细诊断，或把旧码表退役写入决策。
  - **Approval UX:** 旧版 `ask` 走 UI select 的 Allow once/Deny；当前 `ask` 走 `ui.confirm`，无 UI 时 deny，批准摘要 bounded 且 Shell 包含 literal command。候选问题：是否恢复双按钮文案或保留 host confirm 合同。
  - **Subagent tier:** 旧版有 `subagentProfiles`、T0/T1 与 env 钳制；agent 映射遵循显式配置 > 内置映射 > `*` fallback > scratch，缺失/非法父 tier fail-closed，并通过 `PI_KEEL_PARENT_TIER` 向后代传播；当前明确不提供 AKeel 管理的 subagent tier/parent-tier。候选问题：与 C-024 合并评估，不在 access-decision parity 中顺手恢复。
  - **Test strategy:** 旧版测试覆盖 legacy 层级；当前新 public seam 测试已覆盖现行 Canonical、Policy、runtime 和 host 合同。候选问题：不是按数量 parity，而是挑旧测试中仍有价值的外部行为转写到新 seam。
- **Supplementary cross-cutting checks:** 以下横切行为尚未在高层点中单独拆项，纳入本候选的待核对范围：
  - **Shared option/config parsing:** 旧 `option-parse.ts`、`config-parse.ts` 统一处理 separated/equals/attached/cluster/`--`、值消费、未知选项 opaque 和 Git/npm config 目标；当前 `program-semantics` 的 scanner 与各命令族实现需逐项对照。
  - **Command prefix normalization:** 旧 `normalize.ts`、`prefix.ts`、`args.ts` 处理 `builtin`、`time`、`!`、env assignment、wrapper positional 和位置参数；当前 wrapper/命令分类是否保留同等边界需核对。
  - **Executable identity normalization:** 旧 registry 会把路径形式 executable 取 basename 后匹配内置 adapter（如 `/usr/bin/cat`）；当前只有已注册的 program-semantic family 走 basename 归一化，未建模路径形式命令可能落入 `execute`/opaque。需逐项确认这是刻意收窄还是遗漏。
  - **Redirection matrix:** 除 `<>`/`2<>` 和 clobber 外，还需逐项核对 `2>`、`&>`、`&>>`、fd duplicate/close、heredoc、here-string、循环级重定向及 source/target 顺序。
  - **Host boundary and passthrough:** 旧 Gate 与当前 host adapter 对未知工具 passthrough、无效 host context、非法输入和受管 surface 的边界行为需逐项对照。
  - **Canonical trust boundary:** 旧 CompleteAccessPlan/verifier/coverage 与当前一次 Canonical 编译、sealed Admission、Display 分离、伪造对象拒绝之间的安全和可观察差异需单独记录。
  - **Approval evidence contract:** 路径证据聚合去重、literal command 展示、bounded reason、无 UI deny，以及 deny 路径/内容不回显等行为需与旧 approval/render contract 对照。
  - **Shell lexer/parser fidelity:** 旧低层 parser/lexer 测试覆盖 scan-time source span、重复 raw value span 稳定性、comment stripping 边界、quoted env-assignment 判别、numeric fd-prefix 与 quoted digit redirect disambiguation；这些不是当前 public seam，若恢复更宽 Shell 前端需先判定哪些是外部合同。
  - **Command registry internals:** 旧 registry 测试覆盖 duplicate registration fail-fast、`scopeKey` 精确/前缀/最长前缀/`./` 归一化和非真前缀不命中；若重新设计用户命令扩展 seam，需把这些作为候选行为重新证明，而非隐式继承。
  - **Read-only guidance narrow trigger:** 当前只读策略切换提醒只在 `review` 下 Direct `write`/`edit` 的普通 policy deny 生效，不覆盖 Shell、硬边界、未知、破坏性或敏感路径拒绝；后续文档/实现复核需保持这个窄触发，或显式重新设计。
  - **Runtime trace observer seam:** 当前 service 有 ordered runtime trace events（adapt/compile/admission/evaluate/display/render 等）；若被外部消费者依赖，需决定它是 public diagnostic seam、测试 seam 还是可删除实现细节。
  - **Git hard-boundary/destructive subforms:** 当前 Git 语义对 `-c`、未知 global option、`pathspec-from-file`/NUL、upload/receive/exec hooks、global/system config、remote/archive/submodule hazard，以及 `push --force`、`reset --hard`、branch delete、stash clear 等 destructive 子形态有更细 hard-boundary/destroy 分类；后续 Git parity 不应只按“Git adapter”大项模糊处理。
  - **Path input normalization and invalid forms:** 旧 resolver 还处理 `@` 前缀、拒绝 CR/LF 与 Windows/UNC 路径；当前 Direct canonicalization 与 Shell path resolver 主要显式拒绝 NUL、相对/绝对路径按新 seam 解析。需确认这些旧输入边界是公共兼容行为、安全合同，还是旧实现细节。
  - **Special device/discard handling:** 旧 gate 测试把 `2>/dev/null` 作为 stderr discard 特例允许，同时不把其他外部重定向写入一并放宽；当前 redirection 与 path policy 需确认 `/dev/null`、stdin/stdout/stderr、fd duplicate/close 是否作为稳定合同、Linux 设备特例或实现细节处理。
  - **Direct/Shell equivalence invariants:** 旧测试把 Shell grep 与 Direct grep、Shell read 与 Direct read、写入拒绝等行为作为跨 surface 等价，并锁定“增加 path intent 不得使决策变弱”。当前 Canonical/Admission seam 需确认这些是公共安全不变量、测试 seam，还是随新 surface 收窄而重写的内部证明目标。
  - **Implicit CWD path intent:** 旧 Shell compiler 对无显式路径/重定向的 modify 命令追加 conservative cwd write intent；当前只为 recursive/`ls`/`find` 等命令补 implicit path，其他无路径 modify 形态不再发行同等 cwd write fact。需确认这是刻意收窄、已由其他 hard boundary 吸收，还是遗漏。
  - **Stable legacy code contract:** 旧 `task2-contract` 锁定 headless approval、user denial、path policy deny、shell policy deny 等稳定 code；当前 host-facing block code 收敛且 reason 静态。后续若外部消费者依赖旧 code，需明确兼容、映射或退役，而不是只按 guidance taxonomy 大项处理。
  - **Distribution and bootstrap identity:** 若比较范围包含整个 `c52bd1d..HEAD` 产品 diff，还需记录 `pi-keel`→`akeel` 的 package/install 名称、bootstrap marker、`.pi-keel/`→`.akeel/` runtime artifact 目录及被移除的分组测试脚本；若 C-025 仅限 Access Decision，则应明确将其排除。
  - **Hard preflight subforms:** 旧 preflight 测试逐项覆盖 literal download-to-interpreter、quote-split interpreter、downloader later in a pipe/line、nested wrapper、`eval` command substitution、comment/string literal 排除与 threat token table。当前更窄 Shell grammar 覆盖部分风险，但若恢复 threat scanner 或解释器/pipeline 子集，需逐项重新采纳或退役这些硬规则。
- **Decision reset / refresh queue:** 存活 Decision 与既有候选中凡是仍携带重构前结构、旧 Profile/config/schema、旧 plan/verifier/adapter/glob/for-reduction、T-069 前“当前基线”或其他已被 Greenfield Pipeline 重置的术语与结论，都需要逐一重审；未重审前只作为候选议题处理，不作为恢复旧行为的授权。重审时应按当前 Canonical/Admission/Display/Policy seam 迁移仍成立的安全意图，合并已被新决策吸收的内容，并把未承接部分退役或继续留作候选。
- **Revisit condition:** 用户明确要求开展“重构前后功能 parity/取舍”任务；或出现旧行为缺失导致真实工作流阻塞；或安全复核确认当前实现与存活 Decision（尤其默认敏感路径边界）存在不一致。

## C-026: 旧敏感路径清单的独立分类与边界重建

> 本条只记录未来对旧版敏感路径清单进行重新分类和重新证明的探索方向，不恢复旧 `DEFAULT_BLOCKED_PATHS`，不改变 D-070 当前边界，也不构成实现承诺。

- **Why Not Now:** 旧清单混合了 Git 元数据、项目环境文件、用户凭据目录、混合配置和系统文件；整体恢复会误伤当前 Git/配置工作流，也会把模板、公开元数据和实时凭据错误地归入同一 hard boundary。当前没有足够的工件角色 metadata 或真实工作流证据支持一次性重建完整清单。
- **Exploration Direction:** 以工件职责、所有权和可验证路径身份为分类轴，逐类判断 hard boundary、preset/path policy 或明确退役；优先区分实时凭据、混合配置、模板、Git 元数据和系统文件。复核时保留以下边界：不做值级 secret sniffing，不递归扩大到父目录后代，不把 opaque Shell 访问解释成已覆盖，并分别评估 `read/list/search/write/edit` 与 Shell path evidence。`.git/**`、`.env*`、整棵 SSH/AWS/GnuPG/Kube/Docker/GCloud 目录、系统账户文件和混合 provider 配置不得因旧清单存在而整体恢复。
- **Revisit condition:** 出现明确的凭据泄露或误操作实证、真实工作流因当前边界阻塞，或获得可验证的宿主工件角色 metadata seam；或者用户明确启动旧敏感路径清单的逐类重新采纳。
- **Out of Scope:** 不修改当前 D-070；不恢复旧清单或旧 glob 语义；不新增默认 policy 字段；不创建实现 Task；不把其他文件中的偶然凭据纳入 AKeel 的通用内容扫描职责。

## C-027: 程序选项消费与值性质分类边界复核

> 本条承接一项已从 Decision 寄存器退回的旧命令语义决策；它只记录待重新证明的安全意图与候选边界，不构成当前实现合同、命令扩展路线图或恢复旧 adapter 的承诺。

- **Why Not Now:** 当前 `core/program-semantics/` 已在新的 Canonical 管线中覆盖部分 Git、Python、uv、解释器和 npm 族语义，但旧方案同时混合了 command adapter、用户 overrides、完整 option engine 和未迁移的 CLI 方言。直接恢复旧方案会把旧配置模型、实现内部表和未经当前 Canonical seam 重新证明的 path intent 一并带回。
- **Exploration Direction:** 在当前 Canonical → Admission → Policy 边界下重新核对以下安全意图：
  - 取值选项区分 `file`、`expression` 和无值 `flag`；file 值产生受统一 boundary 约束的 read/write path intent，expression 值只消费而不伪造路径。
  - 选项值必须先被可靠消费；separated、equals、attached、cluster 和 `--` 形态的支持范围需由各程序族单独声明，未建模形态不得把值泄漏为 positional path。
  - positional file operand 不能被整体忽略；命令写选项可将输入路径升级为 write intent，但歧义时必须沿 fail-closed 方向处理。
  - 未知选项、未知子命令、动态值和无法确定路径基准的形态不得因宽松 command mode 而获得未声明的访问范围。
  - inspect/modify/execute/destroy 的调节必须按风险优先级收敛；任何隐式写入或破坏性选项都不能被误分类为 inspect。
- **Current Boundary to Recheck:** 当前 option scanner 只覆盖已形成 public Canonical seam 的 bounded 程序族；Git command-local path、package-manager path option、解释器脚本 operand 和委托执行 opaque 由 D-067、D-052 及现行测试分别约束。旧 `commands/aliases/reclassify`、完整 `config-parse`、旧 registry 和旧 full-subcommand 规则不自动恢复。
- **Historical User Extension Scope:** 旧方案还允许用户声明新命令、别名和分类微调；其候选匹配原则包括精确键优先、显式路径前缀按最长匹配、别名不链式、路径形式不隐式 basename 回退。Direct 工具 schema、路径字段和 effect 证明不应由该候选覆盖层代替。
- **Open Choices:** 重新设计声明式 option/value 语义表；只扩展真实高频程序族；或维持当前窄 scanner 并将其余行为明确退役。选择必须以独立外部语义证据和 public seam 测试重新证明，不能以旧测试 parity 作为授权。
- **Revisit condition:** 出现真实工作流因已知程序选项误拒或漏建路径事实而受阻，或需要扩展当前 bounded program-semantics 覆盖。
- **References:** [D-052](decisions.md#d-052-git-clone-目标路径与选项边界)、[D-067](decisions.md#d-067-canonical-程序语义族与委托执行边界)、C-025 的 `Shared option/config parsing` 横切检查。

## C-028: Destroy 操作边界与可审批准入复核

> 本条记录未来重新评估 D-071 的探索方向，不构成恢复 destroy 审批、修改当前 hard boundary 或创建实施任务的承诺。

- **Why Not Now:** 当前所有 `destroy`/`delete` 永久 hard-deny 已足够满足现阶段需求；本轮没有深入证明递归删除、`rmdir -p` 父级影响、未知删除选项、blocked descendants、凭据/路径边界、无 UI 和 mixed flow 聚合等场景。
- **Exploration Direction:** 在新的 Canonical → Admission → Policy seam 下，重新判断是否能为明确、有界的破坏操作建立完整路径与影响范围证明，并在证明成立后设计每次用户确认的 `ask` 合同。复核应覆盖可支持的命令/选项 allowlist、递归和父级删除范围、路径与凭据 hard boundary、unknown/opaque 形态、混合 flow 聚合、用户批准/拒绝和无 UI 行为；同时重新决定 `commands.destroy: allow` 的配置值是否继续保留及其语义。
- **Revisit condition:** 用户明确要求重新评估 D-071，或真实工作流因永久拒绝 destroy 而受阻，并能提供足够的外部语义证据与 public seam 验证方案。
- **Out of Scope:** 在该候选被明确采纳前，不修改 D-071、不放行或审批任何 destroy/delete 操作、不创建实现 Task，也不把旧实现或旧测试当作正确性 oracle。

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
- **Exploration Direction:** 未来若重新评估，先用真实工作流确认当前路径范围表达的具体缺口，再区分三种不同方向：①运行时接受旧路径 glob；②提供一次性、显式报告不可表达项的迁移器；③只补充当前绝对路径表达的文档。旧 matcher 的 `*`、`?`、`**`、大小写、绝对路径、blocked-pattern 与 first-match 等语义只是历史参考；只有确定需要兼容或迁移时，才逐项重新证明。任何迁移结果都不得静默扩大或缩小授权范围，无法等价表达的规则必须报告为未转换。路径规则顺序也必须在当前 Policy Snapshot 与 hard-boundary 语义下重新决定，不自动继承旧 first-match 行为。
- **Revisit condition:** 真实工作流因当前路径表达被阻塞；用户明确要求转换既有旧 policy；或获得一组有界旧规则样本及足够的外部语义证据，能够验证转换是否保持权限范围。
- **Out of Scope:** 在本候选明确采纳前，不恢复运行时 glob 兼容，不提供静默迁移或迁移期 fallback，不恢复旧 Profile/config schema，不改变 D-025 的 Shell glob 边界，不把旧 matcher 测试直接当作当前合同，也不创建实现 Task。
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

## C-033: Capability Assessment discipline

- **Why Not Now:** 当前已有 `module-design`、`domain-modeling`、`assess-modularity` 与 `code-review` 分别承载接口设计、术语校准、结构发现和变更审查；本轮 skill 治理提供了一次组合使用证据，仍需确认“从用户价值重新推导能力并检查四项对齐”是否会在不同对象上反复形成完整、独立的调用场景。
- **Proposal:** 评估模型可按需加载的 `capability-assessment` discipline。它面向一个已知 skill、workflow、module 或用户能力，从目标用户、核心场景和可核查价值出发，分别判断名称、能力承诺、边界与内容，并检查四者对齐，交付明确结论和具体调整方案。评估结果可选择保持、重命名、重塑边界、重写内容、合并、拆分或移除；每项结论附带场景与证据。
- **Boundary:** `assess-modularity` 继续发现仓库级未知结构问题，`module-design` 继续设计已知模块与接口，`domain-modeling` 继续维护领域术语和长期裁决，`code-review` 继续审查固定变更面；本候选只承担已知能力的 first-principles 复评及四项对齐。
- **Revisit condition:** 至少两个不同对象的真实复评再次需要重复组合现有 skills，或现有方法持续遗漏目标用户、核心场景、价值证据和四项对齐中的任一维度；也可在用户明确选择建立该通用能力时复审。

## C-034: Herdr child 资源的确定性自动回收

> 本条只记录未来把 pane、workspace、worktree 和临时运行资源的机械清理从模型记忆移交给非模型 lifecycle owner 的探索，不构成当前支持、实现承诺、Herdr runtime dependency 或删除授权。

- **Why Not Now:** 当前同步 fork-join 仍有存活的 Task Owner 可在拉取并裁决 artifact 后检查和清理资源，尚无反复 orphan 或并发规模证明自动化收益足以覆盖持久状态机成本。Herdr 0.9.0 已提供 worktree 非强制删除、worktree provenance、Agent/pane 生命周期事件、plugin event hook 与 startup hook，但未提供原生 owner/lease/TTL/reaper 或 artifact readiness；`done`/`idle` 不证明成果已落盘，`pane.exited` 不提供充分的成功语义，Git non-force 只保护 dirty/untracked checkout 而不能识别 clean 但未合并的 commit。现在实施必须先新增 owned-run registry、artifact receipt、commit-preservation、重启 reconciliation、幂等和路径复用防护，已超出小型 cleanup hook。
- **Exploration Direction:** 若重新评估，先比较 Herdr 原生 lease/reaper、持久 registry 加 event hook/startup reconciliation 的 Herdr plugin，以及有独立监督需求时的外部 lifecycle controller；优先由资源 owner 承担生命周期。只有 AKeel 在创建时登记并能以稳定 run identity、repo/worktree provenance 和当前 Herdr/Git 事实精确复核的资源可进入候选集合；扫描可用于核验和发现异常，不得按 label、branch 前缀或目录模式认领外来资源。自动回收还必须同时证明 child 已终止、artifact 具有原子 ready/receipt、checkout clean、没有需保留的未合并 commit、当前身份未被路径或 workspace 复用，并且 Herdr non-force 操作可完成；dirty、未合并、unknown、artifact 缺失、provenance 不匹配、仍有活动进程或需要 force 的状态只报告给存活 Owner/用户。事件重复、清理已完成和重启后重放应幂等处理；模型继续裁决异常成果的保留、导入、合并和验收，不承担机械 reaper。
- **Revisit condition:** 同步 child 已反复遗留 pane/workspace/worktree 或临时资源并造成实际维护负担；并行、异步或跨重启 child 使 Owner 手工清理明显不可靠；Herdr 提供可验证的 owner/lease/reaper 合同；或用户明确启动 owned-run registry、artifact receipt 与 commit-preservation 设计。
- **Out of Scope:** 在本候选被明确采纳前，不新增 plugin、daemon、timer、registry 或 AKeel runtime dependency，不自动扫描认领、force-remove、删除 branch、接受 artifact、导入/合并结果、更新 Project Record 或发布；当前仍由存活 Task Owner 检查后执行清理，child 不自删除。

## C-035: 待创建

