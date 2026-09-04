# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Trigger` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。

## C-008: staging scope scratch（子代理 scratch 真隔离）

- **Why Not Now:** `/tmp/pi-work` 约定已够用（Direct write 自动建父目录、与 principles.md 既有约定一致）；staging 需向模型暴露随机路径，提示词面/API 改动面大。
- **Trigger:** 子代理场景出现 `/tmp` 共享目录 symlink 攻击实证，或用户要求子代理 scratch 内容不可被本机其他用户读取。
## C-009: execute 档 T2（子代理验证能力）

- **Why Not Now:** Q3 冻结 execute=deny（非交互子代理内 execute=allow = 任意代码执行空白支票，node -e 绕过命令语义建模）；无证据表明 worker 验证摩擦不可接受。
- **Trigger:** 真实工作流 prototype 显示 worker 无法自证"测试通过"导致验证闭环不可用（跑一轮 worker 实测后）。
## C-010: docs/CONTEXT.md 子代理写保护

- **Why Not Now:** git diff 是既有防线；默认拒绝会破坏合法文档更新工作流（worker 任务常含文档更新）。
- **Trigger:** 出现子代理污染 durable 内容（CONTEXT.md/docs）的事例。
## C-011: pi-guard 共存说明

- **Why Not Now:** 装了 AKeel 再装 pi-guard 会双重拦截同一 tool_call（两者都拦 bash/read/write）；当前无此用户反馈。AKeel 即 pi-subagents 官方期望的 bash guard 角色（permissions.ts 硬编码外包），且语义更强。
- **Trigger:** 出现 pi-guard + AKeel 双重拦截的用户报告。
## C-012: shell effects 不裁剪（D-048 关联）

- **Why Not Now:** shell 命令的 effects 在 kernel 无直接决策消费（D-022 已记录「effects 只在 Direct-origin 被消费」），但它们是 D-022「effect 被安全解释」安全不变量的承载体、plan 完整性/审计数据、以及 50+ 测试断言锁定的语义提取契约。裁剪会让领域知识（如 git rm→delete）无处安放（deletion test 平移失败）；惰性视图违背 sealed 不可变 plan（deep-freeze/D-046 品牌化）。已由 D-048 的 requires 证明侧强化（effects 覆盖其类要求获 seal 边界运行时证明）。
- **Trigger:** 未来 kernel 出现按 effect 决策的真实需求，或 plan 体积成为可测性能问题。
## C-015: 复杂特性验证方法收敛（评审停用标准 + bash 差分语料仲裁）

- **Why Not Now:** T-062（for 归约建模）纸面评审已历多轮且仍能发现新边角——bash 语义无穷、纸面阅读的边际发现率不归零；且归约产生的语法合法但语义偏离类问题（如双引号内 `\$` 误替换）**只有对照真 bash 才能仲裁**，纸面审查结构性盲区。议题内容为验证方法论候选，未与当前架构决策绑定，采用与否待用户在当前会话明确选择。
- **Proposal:** ①评审停用标准——连续两轮无架构级/下近似级发现，且所有语义存疑均可落成语料用例，即停止纸面评审；②**bash oracle 差分语料**提升为独立仲裁任务（排 T-062 Task 6 归约器之后）：`(input → 期望归约文本 → 期望 gate 判定)` 语料表每条经真 bash 核过、单测锁表，dev 侧 bash -c 交叉核对；③**新守卫准入规则**——任何新守卫必须带一条语料条目才能进计划，防“纸面猜边角→加标记”的无限循环；④**垂直切片先行 + 架构冻结**——优先跑通 A0-1 + region pass + compound-command（风险最高新代码）并以差分测试收敛，剩余发现由测试驱动。
- **Trigger:** 实施阶段出现"纸面评审未覆盖的语义分歧"实证，或用户决定启用差分语料仲裁。
## C-016: 环境变量治理（受管 `.env` 面：单一名份契约 + 按名可靠掩码 + 字面追加/allow 覆写）

- **Why Not Now:** 未采纳。落地方向成立但需演进 D-060 blocked 语义表述（append 子形态）与 D-022 plan 形状（append 标志），并新建命令面治理（env/printenv/export 族目前只有笨重的 unknown→ask）与受管面模块（parse key/value → mask → append → set-allow）；当前无用户实证表明"无法便捷注入 env 配置"已达到不可接受。重设版补充：D-023"拒绝值级掩码"的边界需明确（它拒 deny/ask 渲染面的内容嗅探掩码，不拒受管面**按名**掩码，见下"按名可靠掩码"）。
- **Proposal:** 以**变量名契约为唯一治理轴**，把 `.env` 建成"受管面"（Managed Env Surface）：所有读写经这一个面、用同一份名字契约决策，掩码也由名字契约驱动因而可靠。
  - **名字契约（单源）**：`config.yaml` 顶层 `env` 段（D-062 加载即校验）——`protected`（掩码+拒写+拒导出，默认表覆盖 key/ip/真实链接/url：`*(KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|BEARER)`、`*(HOST|URL|URI|ENDPOINT|IP|ADDR|CONN*|DBCONN*)` 等）、`allow`（可读可见+可写：`NODE_ENV`/`PORT`/`DEBUG`/`LOG_LEVEL`/`APP_NAME`/`REGION`/`TZ`）、其余 = neutral（可读可见，不可写）。命名约定本身是治理输入；决策只探测键名集合，不取值。
  - **三种能力**：① **MASK-read**（替代整读）解析 `.env` → 逐条 `key=value`；protected 名 → `key=****`，allow/neutral 名 → 原值；② **APPEND** 仅 `>>` 追加单行字面 `K=V`（无先读后写、无替换）；③ **SET-allow** 仅对 allow 名单内 key 覆写为字面值（allow 名按契约即非敏感 → 低危）。原始 `cat .env`/`>`/truncate/write/edit、`grep -r` 递归聚合保持 hard deny。
  - **按名可靠掩码（重设核心，回应"屏蔽 key/ip/真实链接/url 但不影响普通变量"）**：掩码失效源于"按内容猜值像不像 secret"；因 `.env` 是结构化 `K=V`，拆成 (key,value) 对后**按 key 名**判——`API_KEY=****`、`NODE_ENV=production`。名字可枚举、用户声明 → 确定性、无内容启发式、无漏判误判（误伤固定词/漏改编码）。这与 D-023 相容：D-023 拒的是 deny/ask 渲染面"嵌入原始值再打码"（值形态任意、无结构）；受管面面对结构化 key-value + 可声明名字契约，掩码键名而非猜值，是全新且可靠的前提。
  - **掩码位点前置条件（可信掩码的唯一正确实现位点，安全不变量）**：掩码必须发生在 **AKeel 进程内**（受管面 Direct 工具：fs 读 → 按 key 名替换为 `****` → 只把掩码串作为 tool result 返回）。原因：掩码只有在"原始值永不离开可信进程"时才有意义——若是 shell 管道（`cat .env | sed …`），原始内容先经过 shell stdout → host 执行记录（日志）与 LLM tool result，sed 只是给"已读走的原文"打码，**收不回来**，且原始 read 已发生。由此两条硬约束：① `.env` 的读一律走受管面 Direct 工具，**禁止 shell 管道掩码**；② 受管面 **不得 debug-log 原始 `.env` 内容**。**正面承诺（受管面正确实现下）**：进入 LLM 上下文的 `.env` 内容只有两种形态——掩码串（protected 名 `key=****`）与 allow/neutral 名的原值（后者即"普通变量不受影响"的设计意图本身，非泄露）；除此之外的原始值只短暂驻留 AKeel 进程内存，**不写入任何 AKeel 侧记录**（无 debug 日志、无事件流落盘），**不进入任何 tool result**。拒绝/失败路径同样保证：gate 决策前不读取文件。此承诺的边界见"诚实边界"残余段（磁盘本体/写路径字面/host 侧记录不在其内）。gate 决策路径本就安全：gate 是纯决策层、不执行文件读（D-022），deny 侧只给类别不给值（D-023），拒绝路径不带原始值。
  - **命令轴治理**：env/printenv/export/set/declare 按名分类；export protected 名 deny（当前无 AKeel 子代理 env 策略）；env 含 protected 名时全量 dump deny；受限 dump 只见 allow/neutral 或全掩码。子代理对 allow 名可见、对 protected 名拿到 `****`，当前不提供父档钳制。
  - **实现方案大纲**（参考，非承诺）：IR 已区分 append 形态（`RedirectionKind.stdoutAppend`），缺口在 compiler 摊平 → 把 append 标志带进 `PathAccessOperation`（plan 形状同步 D-022/D-046）；`decidePath` 对 env 家族在 write+append 形态放行进入 profile，其余 blocked（D-060"不可覆盖"不破坏——append/SET-allow 是新增子形态而非用户豁免）；新建受管面模块（`access-gate/env/`，parse → mask → append → set-allow，镜像 tests 分层 D-044）；威胁层 `read_secrets` 与名字契约单源对齐。
  - **诚实边界**：dedup/覆盖检测不可用（读被禁的必然结果，SET-allow 只对 allow 名提供显式覆写）；printf/多行/`$'…'` 形状 v1 不建模 → fail-closed；名字不在 protected 表、值里却嵌真实 IP/URL 的变量按名掩码覆盖不到——缓解是聚合读保持 hard deny（无批量外流通道）+ 用户把该变量名加 protected，按内容值级兜底掩码不作为保证（与 D-023 一致，结局 fail-open，只作显式 opt-in 非保证最佳努力）；rc 文件（`.bashrc` 等）是混合载体，密钥内容可见性属显式通道边界；执行输出里的 secret 属 pi 宿主 logging scrubbing，AKeel out of scope（Negative Space 已声明）。**掩码消除不了的残余**：`.env` 本体在磁盘，其他读者（其他 extension 直接 fs、用户编辑器、被 gate 放行的 shell）可读原始值——AKeel 只保证受管面通道不泄，不保证"无其他读者"（Negative Space：不拦截其他 extension 的 Node fs）；写路径（APPEND/SET-allow）的字面值本就在 agent 自己的 toolCall 里（写配置的意图），非掩码职责；host 侧对工具调用的记录属宿主面，AKeel out of scope。
- **Trigger:** 用户确认"agent 需要落盘写项目 `.env` 注入配置"（追加/allow 覆写）为真实高频工作流，或"密钥经 rc 文件/进程 env/按内容掩码漏判"出现实证需求。
## C-017: 归约路径单解析收敛（C2）

- **Why Not Now:** 纯内部重构、外部可观测行为零变化（拒绝码/判定/展示全不变，corpus 锁死），性能收益微秒级（gate 每 tool_call 支配项是路径解析/语义分析而非 parse）。C1/D-056 已把 `compileFlatPipeline` 签名收敛为 `(command, input, expansion?)`，C2 是同方向下一步，但需动 `reduceToFlat` 返回形状（自校验产物 program 进文本级 API，与 shell-parse 类型耦合）或只收结构双查（收益变小）；当前无正确性/安全/体验压力驱动它立即单做。
- **Proposal:** 归约路径目前三次解析——① `compileShellDraft` 结构扫描、② `reduceToFlat` 自校验（lex+parse）、③ `compileFlatPipeline` 编译主体（lex+parse）。②③ 之间对同一 text 的解析与 `dynamic`/`loopScopes`/`opaqueRegions`/`unsafeSyntax` 结构检查是确定性重复（纯函数同输入同输出）；③ 独有的 maxCommands/preflight/control-flow/逐命令编译不可归并。方案：拆 `compileParsedProgram(program, input, expansion?)` 共享主体，归约路径以自校验产物（已 parse program）作编译入口，非归约路径 parse 后走同一主体——「归约产物已自校验」成为编译入口结构不变量（编译期 parse 失败 = 合成器 bug 而非用户输入分类），动态/opaque/loopScopes 保证从双处检查收敛为合成器契约 + 注释。自校验不可移出 reduce（其 null → compound-command 分类契约是 fail-closed 组成部分，`residual dynamic` 测试锁定）。先例：D-046 验证收敛 seal、scanVarRefs/prefixedCommand 单源。
- **Trigger:** 下次触碰 compile 装配（扩展归约形态、预算调整、guard 准入）时顺带实施；或用户在当前会话选定为独立小任务（30–60 分钟）。
## C-018: pi-subagents 工业级工程驯化方案（熔断护栏 + Worktree 有界自治 + Herdr 异步解耦）

- **Why Not Now:** 当前主要在单会话内做高频交互式敏捷开发，全自主多代理流水线仍需对既有扩展 `pi-subagents` 进行系统化配置调优；此前实测已暴露未经驯化的严重病灶（无熔断导致的 5 小时 31 轮审查死循环、前台同步阻塞导致终端卡死、缺乏统一 Worktree 隔离导致工作区混淆等）。此前探讨的“彻底废弃插件并收敛为极简只读脚本”虽然极度轻量，但剥夺了子代理的代码修改权与 TDD 编译/单测自愈闭环，在大型重构与异步无人值守中吞吐受限。本方案选择保留并驯化成熟基础设施（Worktree 生命周期、Herdr 原生桥接、后台异步恢复），待出现高频异步长任务与复杂重构刚需时正式启用。
- **Proposal:** 拒绝轻率重造轮子，不修改 `pi-subagents` 源码本身，通过**“配置调优 + 物理边界守卫 + 规则注入”**完成工业级驯化，形成“微观全放权，宏观守门禁”的有界自治流水线：
  - **刚性熔断阀（消灭无限审查死循环）**：在配置中设置 `maxSubagentSpawnsPerRun: 3` 与 `maxSubagentDepth: 1`；在 Prompt/Skill 纪律中硬性约束“审查最多允许 2 轮，第 2 轮后的次要建议必须作为 Advisory 写入交接文档停机，严禁触发第 3 轮循环修复”，杜绝失控拉锯。
  - **Worker 强制 Git Worktree 物理隔离（微观全自治）**：严格贯彻有界自治原则，所有涉及代码修改与测试执行的子任务强制声明 `worktree: true`。子代理在独立检出的 Worktree 物理目录内享有 100% 的修改代码、运行编译、执行单测与报错自愈自由，全程零审批弹窗、零工作区踩踏；主 Agent 与人类无需微观干涉，仅在最终提交时做 PR/Diff 宏观验收。
  - **强制默认异步与 Herdr 旁观解耦**：在扩展配置中开启 `asyncByDefault: true` 与 `forceTopLevelAsync: true`，彻底消灭前台同步阻塞（`async: false`）对交互 TUI 的锁死；前台保持低延迟交互心流，后台状态通过 Herdr 原生 Socket 与 `H` 键侧边窗实现全透明旁观与随时干预。
  - **角色精简收敛（消除戏服）**：通过 `disableBuiltins` 停用同质化冗余角色（oracle/researcher/delegate），全生命周期收敛为 3 个生产力核心：`worker`（Worktree 内全自治攻坚与 TDD 自愈）、`scout`（只读快速扫库压缩事实）、`reviewer`（交付前单次对抗性门禁审查）。
  - **打通 AKeel 空间准入策略**：在 `policy.yaml` 中将 Worktree 专属目录（如 `/tmp/pi-work/**` 或 `.pi/worktrees/**`）配置为 `write: allow`，系统高危操作保持 `deny`，解决后台无头子代理在无 UI 环境下因 `write: ask` 产生权限死锁的结构性矛盾。
- **Trigger:** 用户正式启动需要长周期后台攻坚、复杂并发重构或夜间无人值守的大型特性开发；或用户决定正式应用上述配置对当前 `pi-subagents` 运行环境进行生产级调优。
- **References:**
  - **pi-subagents**: `NicoBailon/pi-subagents`（Git Worktree 生命周期管理、Manifest 补丁追踪与 Herdr 状态桥接实现）
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
    - 自动在 `/tmp/pi-work/handoffs/handoff-<timestamp>.md` 生成标准化交接文件，内容严格结构化：① 当前阶段完成状态与验证证据（如测试日志、commit hash）；② 已定案的核心设计决策与边界；③ 下一个新会话启动后的第一明确动作（Next Action）与启动命令。
  - **优雅停机与终端通知**：
    - 写入交接文档后，Agent 主动停止后续执行，在终端输出明确的交接提示（如果在 Herdr 窗格中，可发送 `herdr notification` 提醒），引导人类新开一个干净的会话加载交接文档继续工作。
- **Trigger:** 用户确认在大型多阶段特性开发中，上下文膨胀导致的推理退化与循环拉锯成为高频痛点；或用户要求在会话中正式引入自动化水位预警与交接模板生成工具。
## C-020: Content Flow checkpoint governance（仅探索方向）

> 本条只记录未来探索方向，不构成当前需求、路线图、架构采纳或实施承诺；不得据此修改现有 Access Gate 行为。

- **Why Not Now:** 当前项目只有 Operation Admission 信任链，没有可验证的 Content Flow producer/consumer、payload capture、enforcement 或 receipt seam。现在实现会把宿主的 substitution/projection 误称为发布控制，并制造超出实际能力的安全承诺。
- **Exploration Direction:** 若未来具备真实 seam，重新探索以下边界：Operation Admission 与 Content Flow 独立；静态 Normalized Flow 与运行时 Evidence 分离；Publication、Network Send、Process Start、File Commit 各自拥有 checkpoint 规则、授权、enforcement 和 receipt；只有受控绑定的 `exact` evidence 才能参与进一步判断，`unknown`/`unavailable`/`no-coverage` 不得解释为 clean、safe 或 permit；payload、lineage 和运行时授权不进入 `CompleteAccessPlan`。
- **Trigger:** 用户明确启动 Content Flow 方向的探索，或宿主提供可测试的发布/发送/进程/提交 enforcement seam，并出现真实 producer/consumer 工作流。

## C-021: 智能体多维访问注入防御与内核级纵深安全架构（Injection Defense & OS-Confinement Architecture）

> 本条只记录未来探索方向，不构成当前需求、路线图、架构采纳或实施承诺；当前不创建 Task、不修改代码、不引入 bwrap/DSH 依赖，也不启动任何实现。

- **Why Not Now:** 当前门禁通过严格的 Shell AST 解析、选项分类（D-040）与软链组件解析，已能阻断已知的路径逃逸与非恶意语法越权；但对抗性推演已证实：**纯应用层 TypeScript AST 存在结构性盲区，无法防御更底层的复合注入攻击**（包括间接提示词注入操纵、依赖生命周期钩子 `preinstall`/`build.rs` 隐式代码执行、命令参数级任意代码执行 `git -c`/`find -exec`、以及环境变量加载器劫持）。引入 OS 级轻量沙盒（如 Linux `bwrap`）需要处理宿主环境依赖检测，当前先作为防御深度升级候选完整立档。
- **Exploration Direction:** 仅在触发条件满足后，探索面向 AI 编码智能体的**四层纵深注入防御架构（Defense-in-Depth for Agent Access）**，从“单一用户态语法检查”升级为“语义识别 + 物理兜底”；在此之前不据此实施：
  - **数据/指令边界隔离（Data/Instruction Boundary）**：对网络抓取内容（web search/fetch）、不可信 PR/Issue、第三方数据文件打上不可信数据标签；维持 D-030/D-053 的 Profile 零数据注入原则，防止包含间接提示词注入（IPI）的恶意外部文本被直接解释为最高优先级的系统指令。
  - **参数级代码执行封杀（Argument ACE Whitelist & Promotion）**：扩充高危命令选项库，严格封杀具有隐式执行子进程能力的参数组合（如 `find -exec`、`git -c`、`tar --checkpoint-action`、`awk 'system()'`、`vim -c` 等）；包含此类参数的命令一律从 `inspect`/`modify` 强制提升为 `execute`（默认 deny）或直接阻断，消除“合法命令壳内藏恶意执行”的绕过空间。
  - **文件系统与符号链接物理目标追踪（Filesystem Invariants）**：严禁仅做纯词法路径归一化，准入前必须基于真实文件系统进行分段 `readlink` 解析，解析链条中任一部分跨越 `allowedRoots` 立即 Fail-Closed；递归搜索工具（`grep -R`、`rg -L`、`ls -LR`）默认禁止跟链递归，防范第三方恶意仓库自带的软链投毒。
  - **内核级非特权物理隔离兜底（OS-Level Confinement via bwrap）**：在 Linux 平台（D-035）下为命令执行可选挂载 **Bubblewrap (`bwrap`)** 轻量非特权沙盒（无需 root 权限，零守护进程，纳秒级启动）：
    - **物理挂载遮蔽**：将工作区以读写挂载，系统核心以只读挂载，将 `~/.ssh`、`~/.gnupg`、`~/.aws`、`/etc/shadow` 等敏感凭据直接挂载为空的只读 tmpfs，在操作系统内核层面终结私钥与凭据窃取通道；
    - **网络隔离执行**：本地单测或构建阶段默认剥夺网络命名空间（`--unshare-net`），阻断供应链构建钩子向外网回传数据的能力。
  - **内核抽离与双底座（Pi × DSH）可插拔适配**：将门禁纯逻辑抽离为通用 `@keel/core`（宿主无关、纯函数求值）；针对 Pi 维持毫秒级 TUI 交互拦截；针对 DSH 封装为标准的 Cordis 插件（利用微内核依赖注入与 `bail` 熔断机制），实现安全底座的跨平台复用。
- **Trigger:** 用户正式启动对外部不可信开源仓库的自动化审计/重构流水线，或间接提示词注入（IPI）与供应链构建脚本注入成为实际业务场景的高频威胁；或用户决定正式引入 `bwrap` 强化执行期隔离。
- **References:**
  - **Bubblewrap (`bwrap`)**: `containers/bubblewrap`（Linux 非特权用户命名空间文件系统挂载与网络隔离基准）
  - **Landlock LSM**: Linux 内核级无特权访问控制接口（`landlock.io`）
  - **SWE-agent (ACI)**: `princeton-nlp/SWE-agent`（Agent-Computer Interface：以结构化受限工具代替原生 Shell 的范式）
  - **OpenHands**: `All-Hands-AI/OpenHands`（`SecurityAnalyzer` 风险分级评估器与插拔式 Runtime 抽象）
  - **Claude Code**: Anthropic 终端 Agent 的 Glob-based 路径授权与命令模式匹配引擎
  - **Cordis**: `shigma/cordis`（DSH 底座所依托的微内核依赖注入与 Reversible Effects 插件架构）

## C-022: 待创建
