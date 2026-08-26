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

- **Why Not Now:** 装了 pi-keel 再装 pi-guard 会双重拦截同一 tool_call（两者都拦 bash/read/write）；当前无此用户反馈。pi-keel 即 pi-subagents 官方期望的 bash guard 角色（permissions.ts 硬编码外包），且语义更强。
- **Trigger:** 出现 pi-guard + pi-keel 双重拦截的用户报告。
## C-012: shell effects 不裁剪（D-048 关联）

- **Why Not Now:** shell 命令的 effects 在 kernel 无直接决策消费（D-022 已记录「effects 只在 Direct-origin 被消费」），但它们是 D-022「effect 被安全解释」安全不变量的承载体、plan 完整性/审计数据、以及 50+ 测试断言锁定的语义提取契约。裁剪会让领域知识（如 git rm→delete）无处安放（deletion test 平移失败）；惰性视图违背 sealed 不可变 plan（deep-freeze/D-046 品牌化）。已由 D-048 的 requires 证明侧强化（effects 覆盖其类要求获 seal 边界运行时证明）。
- **Trigger:** 未来 kernel 出现按 effect 决策的真实需求，或 plan 体积成为可测性能问题。
## C-015: 复杂特性验证方法收敛（评审停用标准 + bash 差分语料仲裁）

- **Why Not Now:** T-062（for 归约建模）纸面评审已历多轮且仍能发现新边角——bash 语义无穷、纸面阅读的边际发现率不归零；且归约产生的语法合法但语义偏离类问题（如双引号内 `\$` 误替换）**只有对照真 bash 才能仲裁**，纸面审查结构性盲区。议题内容为验证方法论候选，未与当前架构决策绑定，采用与否待用户在当前会话明确选择。
- **Proposal:** ①评审停用标准——连续两轮无架构级/下近似级发现，且所有语义存疑均可落成语料用例，即停止纸面评审；②**bash oracle 差分语料**提升为独立仲裁任务（排 T-062 Task 6 归约器之后）：`(input → 期望归约文本 → 期望 gate 判定)` 语料表每条经真 bash 核过、单测锁表，dev 侧 bash -c 交叉核对；③**新守卫准入规则**——任何新守卫必须带一条语料条目才能进计划，防“纸面猜边角→加标记”的无限循环；④**垂直切片先行 + 架构冻结**——优先跑通 A0-1 + region pass + compound-command（风险最高新代码）并以差分测试收敛，剩余发现由测试驱动。
- **Trigger:** 实施阶段出现"纸面评审未覆盖的语义分歧"实证，或用户决定启用差分语料仲裁。
## C-016: 环境变量治理（受管 `.env` 面：单一名份契约 + 按名可靠掩码 + 字面追加/allow 覆写）

- **Why Not Now:** 未采纳。落地方向成立但需演进 D-017 blocked 语义表述（append 子形态）与 D-022 plan 形状（append 标志），并新建命令面治理（env/printenv/export 族目前只有笨重的 unknown→ask）与受管面模块（parse key/value → mask → append → set-allow）；当前无用户实证表明"无法便捷注入 env 配置"已达到不可接受。重设版补充：D-023"拒绝值级掩码"的边界需明确（它拒 deny/ask 渲染面的内容嗅探掩码，不拒受管面**按名**掩码，见下"按名可靠掩码"）。
- **Proposal:** 以**变量名契约为唯一治理轴**，把 `.env` 建成"受管面"（Managed Env Surface）：所有读写经这一个面、用同一份名字契约决策，掩码也由名字契约驱动因而可靠。
  - **名字契约（单源）**：`config.yaml` 顶层 `env` 段（D-041 加载即校验）——`protected`（掩码+拒写+拒导出，默认表覆盖 key/ip/真实链接/url：`*(KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|BEARER)`、`*(HOST|URL|URI|ENDPOINT|IP|ADDR|CONN*|DBCONN*)` 等）、`allow`（可读可见+可写：`NODE_ENV`/`PORT`/`DEBUG`/`LOG_LEVEL`/`APP_NAME`/`REGION`/`TZ`）、其余 = neutral（可读可见，不可写）。命名约定本身是治理输入；决策只探测键名集合，不取值。
  - **三种能力**：① **MASK-read**（替代整读）解析 `.env` → 逐条 `key=value`；protected 名 → `key=****`，allow/neutral 名 → 原值；② **APPEND** 仅 `>>` 追加单行字面 `K=V`（无先读后写、无替换）；③ **SET-allow** 仅对 allow 名单内 key 覆写为字面值（allow 名按契约即非敏感 → 低危）。原始 `cat .env`/`>`/truncate/write/edit、`grep -r` 递归聚合保持 hard deny。
  - **按名可靠掩码（重设核心，回应"屏蔽 key/ip/真实链接/url 但不影响普通变量"）**：掩码失效源于"按内容猜值像不像 secret"；因 `.env` 是结构化 `K=V`，拆成 (key,value) 对后**按 key 名**判——`API_KEY=****`、`NODE_ENV=production`。名字可枚举、用户声明 → 确定性、无内容启发式、无漏判误判（误伤固定词/漏改编码）。这与 D-023 相容：D-023 拒的是 deny/ask 渲染面"嵌入原始值再打码"（值形态任意、无结构）；受管面面对结构化 key-value + 可声明名字契约，掩码键名而非猜值，是全新且可靠的前提。
  - **掩码位点前置条件（可信掩码的唯一正确实现位点，安全不变量）**：掩码必须发生在 **pi-keel 进程内**（受管面 Direct 工具：fs 读 → 按 key 名替换为 `****` → 只把掩码串作为 tool result 返回）。原因：掩码只有在"原始值永不离开可信进程"时才有意义——若是 shell 管道（`cat .env | sed …`），原始内容先经过 shell stdout → host 执行记录（日志）与 LLM tool result，sed 只是给"已读走的原文"打码，**收不回来**，且原始 read 已发生。由此两条硬约束：① `.env` 的读一律走受管面 Direct 工具，**禁止 shell 管道掩码**；② 受管面 **不得 debug-log 原始 `.env` 内容**。**正面承诺（受管面正确实现下）**：进入 LLM 上下文的 `.env` 内容只有两种形态——掩码串（protected 名 `key=****`）与 allow/neutral 名的原值（后者即"普通变量不受影响"的设计意图本身，非泄露）；除此之外的原始值只短暂驻留 pi-keel 进程内存，**不写入任何 pi-keel 侧记录**（无 debug 日志、无事件流落盘），**不进入任何 tool result**。拒绝/失败路径同样保证：gate 决策前不读取文件。此承诺的边界见"诚实边界"残余段（磁盘本体/写路径字面/host 侧记录不在其内）。gate 决策路径本就安全：gate 是纯决策层、不执行文件读（D-022），deny 侧只给类别不给值（D-023），拒绝路径不带原始值。
  - **命令轴治理**：env/printenv/export/set/declare 按名分类；export protected 名 deny（防 D-039 子代理 env 传播）；env 含 protected 名时全量 dump deny；受限 dump 只见 allow/neutral 或全掩码。子代理对 allow 名可见、对 protected 名拿到 `****`，叠加父档钳制（D-039）多层收敛。
  - **实现方案大纲**（参考，非承诺）：IR 已区分 append 形态（`RedirectionKind.stdoutAppend`），缺口在 compiler 摊平 → 把 append 标志带进 `PathAccessOperation`（plan 形状同步 D-022/D-046）；`decidePath` 对 env 家族在 write+append 形态放行进入 profile，其余 blocked（D-017"不可覆盖"不破坏——append/SET-allow 是新增子形态而非用户豁免）；新建受管面模块（`access-gate/env/`，parse → mask → append → set-allow，镜像 tests 分层 D-044）；威胁层 `read_secrets` 与名字契约单源对齐。
  - **诚实边界**：dedup/覆盖检测不可用（读被禁的必然结果，SET-allow 只对 allow 名提供显式覆写）；printf/多行/`$'…'` 形状 v1 不建模 → fail-closed；名字不在 protected 表、值里却嵌真实 IP/URL 的变量按名掩码覆盖不到——缓解是聚合读保持 hard deny（无批量外流通道）+ 用户把该变量名加 protected，按内容值级兜底掩码不作为保证（与 D-023 一致，结局 fail-open，只作显式 opt-in 非保证最佳努力）；rc 文件（`.bashrc` 等）是混合载体，密钥内容可见性属显式通道边界；执行输出里的 secret 属 pi 宿主 logging scrubbing，pi-keel out of scope（Negative Space 已声明）。**掩码消除不了的残余**：`.env` 本体在磁盘，其他读者（其他 extension 直接 fs、用户编辑器、被 gate 放行的 shell）可读原始值——pi-keel 只保证受管面通道不泄，不保证"无其他读者"（Negative Space：不拦截其他 extension 的 Node fs）；写路径（APPEND/SET-allow）的字面值本就在 agent 自己的 toolCall 里（写配置的意图），非掩码职责；host 侧对工具调用的记录属宿主面，pi-keel out of scope。
- **Trigger:** 用户确认"agent 需要落盘写项目 `.env` 注入配置"（追加/allow 覆写）为真实高频工作流，或"密钥经 rc 文件/进程 env/按内容掩码漏判"出现实证需求。
## C-017: 归约路径单解析收敛（C2）

- **Why Not Now:** 纯内部重构、外部可观测行为零变化（拒绝码/判定/展示全不变，corpus 锁死），性能收益微秒级（gate 每 tool_call 支配项是路径解析/语义分析而非 parse）。C1/D-056 已把 `compileFlatPipeline` 签名收敛为 `(command, input, expansion?)`，C2 是同方向下一步，但需动 `reduceToFlat` 返回形状（自校验产物 program 进文本级 API，与 shell-parse 类型耦合）或只收结构双查（收益变小）；当前无正确性/安全/体验压力驱动它立即单做。
- **Proposal:** 归约路径目前三次解析——① `compileShellDraft` 结构扫描、② `reduceToFlat` 自校验（lex+parse）、③ `compileFlatPipeline` 编译主体（lex+parse）。②③ 之间对同一 text 的解析与 `dynamic`/`loopScopes`/`opaqueRegions`/`unsafeSyntax` 结构检查是确定性重复（纯函数同输入同输出）；③ 独有的 maxCommands/preflight/control-flow/逐命令编译不可归并。方案：拆 `compileParsedProgram(program, input, expansion?)` 共享主体，归约路径以自校验产物（已 parse program）作编译入口，非归约路径 parse 后走同一主体——「归约产物已自校验」成为编译入口结构不变量（编译期 parse 失败 = 合成器 bug 而非用户输入分类），动态/opaque/loopScopes 保证从双处检查收敛为合成器契约 + 注释。自校验不可移出 reduce（其 null → compound-command 分类契约是 fail-closed 组成部分，`residual dynamic` 测试锁定）。先例：D-046 验证收敛 seal、scanVarRefs/prefixedCommand 单源。
- **Trigger:** 下次触碰 compile 装配（扩展归约形态、预算调整、guard 准入）时顺带实施；或用户在当前会话选定为独立小任务（30–60 分钟）。
## C-018: 待创建
