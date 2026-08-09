# 安全边界记录

本文记录当前未由用户态 access gate 完全消除的安全边界，不定义实现任务、验收标准或执行顺序。

## R-02：Node 路径检查与真实对象

**状态：** 部分实现。

`access-gate/path/resolve.ts` 会检查现有目标、父目录、canonical path 和 symlink escape。它可以拒绝项目路径通过 symlink 指向项目外部，但它不能把 pathname check 变成基于 file descriptor 的原子访问。

## R-08：Node-only TOCTOU

**状态：** by design。

路径检查与实际文件操作之间存在时间窗口。其他进程可以在 `realpath`/access check 通过后替换文件、symlink 或父目录，使后续 pathname-based read/write/edit 操作作用于不同目标。

消除该边界需要由**实际操作方**——pi 宿主，而非 pi-keel——使用 fd-based 或 OS-level 原子机制。access gate 是纯决策层，不执行文件操作（R-10），与执行方之间没有 fd 传递通道，gate 打开的 fd 无法被宿主使用；因此该消除结构性超出 pi-keel 能力范围，引入窗口只能是 pi 宿主提供 fd/原子机制接口（外部事件，本仓库只观察不触发）。当前不引入此类机制，也不将 Node-only path checks 描述为已消除 TOCTOU 风险。

## R-12：受限 Shell 语法范围

**状态：** by design，部分语法仍未覆盖。

Shell IR 不是完整 Bash 语法树；当前只对简单命令、已知 wrapper、控制操作符、重定向和已支持的字面量参数建模。`for`、`while`、`if`、函数定义等结构化控制流没有对应的安全语义。命令中的动态 token（例如 `$f`、命令替换和未引用 glob）会在 Profile 决策前 hard deny。对于原子文件检查，Direct `read`、`grep`、`find` 和 `ls` 是首选入口；安全可分析的字面 Shell inspect 命令仍可使用。拒绝的 Shell 形式应根据反馈改用 Direct 工具或拆分操作，不应原样重试。

没有动态 token 的未知命令仍可能按 `shellPolicy.unknown` 进入 deny、ask 或 allow，这不代表结构化 Shell 语法已经得到验证。需要批量检查文件时，应使用直接 `read`、`grep`、`find` 或 `ls` tool call；这是受支持的访问入口，不是绕过 Shell gate。

## 范围声明

pi-keel 的 Profile、命令分类 adapter 和路径 gate 是用户态策略，不提供容器、VM、seccomp、Landlock、网络 namespace 或其他 kernel-level isolation。

## R-09：非 gate 入口绕过

**状态：** by design。

access-gate 只拦截并理解受管的 Pi `tool_call` surface。`user_bash`（`!`/`!!`）、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 和其他 Extension 的 handler 不在 enforcement 范围内；不在 `TOOL_SCHEMAS` 中的未知 Direct tool surface 会 passthrough。用户安装的其他 Extension 可直接调用 Node fs/child_process。

## R-10：审批后的实际 side effect

**状态：** by design。

用户批准 ask tool call 后，该 tool call 内部的实际文件操作仍由操作系统权限决定。access-gate 只做前置策略检查，不控制执行后的行为。

## R-11：审批详情信息边界

**状态：** implemented。

deny/编译失败的 reason 不携带用户派生值：path 证据在 deny 侧只渲染为操作类型分类（`read path denied`、`write path denied`），原始路径只存在于 ask 侧（人类同意面）与命令的 literal form；command 证据只含可执行名，编译失败 subject 为固定诊断/威胁 id。subject 被截断到 1,024 字符，reason 总长度 ≤ 2,048。模型侧（block reason）不重复命令文本、不重复具体路径——模型已持有自己提出的命令（toolCall 参数），不需要 gate 重复。ask 决策保留完整 evidence 供人类否决：path 证据含完整路径（Direct 工具无 literal form，路径是唯一同意信息），command 证据追加完整 literal form（不脱敏）。renderer 不做完整 security log scrubbing；执行记录（`BashExecutionMessage.command`）由 pi 负责，不在此承诺内。

## R-13：Compiler-issued plan 真实性

**状态：** implemented。

`CompleteAccessPlan` 只能由 `compiler-entry.ts` 的官方 compiler sealing boundary 发行；Shell/Direct compiler 只产生不可提交的 draft。sealing boundary defensive-copy、deep-freeze plan 后加入私有 WeakSet，`access-plan-verifier.ts` 只执行无副作用的完整性和 resource budget proof。Kernel 通过 `isCompleteAccessPlan()` 验证 WeakSet 成员资格、递归冻结、exact coverage correspondence 和所有 analysis budgets，拒绝复制、伪造或 over-budget plan。

WeakSet 在进程生命周期内保持，plan 不跨调用缓存或持久化。

## R-14：Guidance 注入

**状态：** implemented。

Guidance 只能从源码内置的静态 `GuidanceId` catalog 映射，不拼接原始 Shell、glob、用户输入或文件路径。blocked path、threat 和 symlink escape 不提供绕过建议。renderer 不调用替代 tool、不生成可执行命令。

## R-15：工具外部配置文件写入

**状态：** 部分实现。

`git config`/`npm config`/`pnpm config` 的写操作已建模配置层级目标（T-037）：`--global`→`~/.gitconfig`、`--system`→`/etc/gitconfig`、`--file=`/`-f`/`--userconfig`/`--globalconfig`→精确路径，产出 write intent 进入 PathPolicy；无层级/`--local` 的目标 `$cwd/.git/config` 落在 blocked paths（`project/.git/**`），写入被硬拒。外部配置文件写入不再绕过 PathPolicy。

读型 config（`git config <key>`/`--list`/`--get` 等）不产生路径 intent，与 git status/log 等 inspect 命令同规则：`.git/**` blocked paths 只拦截直接文件访问（Direct 工具、重定向），不拦截 git 命令自身的 .git 内部读取（输出经命令过滤）；读型靠 shellPolicy inspect 决策。

未建模的配置写手（yarn config、pip config、uv、cargo 等）仍按 modify + cwd 保守写检查处理，其外部配置文件写入不经过 PathPolicy 检查——语义扩充属用户 `command-overrides.yaml`（D-024），不内置。

## R-16：命令语义的平台假设

**状态：** by design。

内置命令语义面向 GNU coreutils / GNU git / npm 生态的常用选项建模，平台边界为**仅保证支持 Linux（以 Arch Linux 为基准工具链）**：Windows、macOS、BSD 不在支持范围，不建模其路径语义与选项方言；其他 Linux 发行版的工具链版本差异不在保证范围。选项解析固定按 GNU 语义处理（选项表以 Arch 工具链为准），不提供按平台或发行版检测方言并切换选项表的机制（D-035）。BSD 工具与 GNU 的选项歧义（`stat -f` 为格式参数、`du -d` 在 BSD 无对应、`df -t` 在 BSD 为 flag）在 GNU 语义下可能被误判为位置参数或忽略——BSD 平台上的行为不在承诺范围，不构成残余风险。

## R-17：子代理会话残余风险

**状态：** by design。

pi-keel 在 pi-subagents 子代理会话内只提供路径轴 + shell 分类（D-039），以下边界不消除：

- **内容级**：write 工具仍可写任意**内容**（policy layer 管路径不管内容，同 R-10）；子代理工作区改动靠父会话 git diff 审查。
- **read-anywhere**：子代理可读全盘，源码内硬编码密钥不在 blocked paths 覆盖范围（只挡 `.env` 类约定文件）。
- **durable 内容**：`docs/`、`CONTEXT.md` 可被子代理 Direct 写（T1 `project` 档的 `project/**` 写面包含），防中毒靠父会话 git diff。
- **`/tmp/pi-work` 非隔离**：外部 scope 路径无 symlink-escape 检查（R-02/R-08 范畴），且为 sticky 共享目录；staging scope 真隔离为候选 C-008。
- **父档位钳制基于 env 快照**：`PI_KEEL_PARENT_TIER` 在 spawn 时快照，已 spawn 的子代理不随父会话 `/profile` 切换变化；父档位号按"写规则覆盖 `project/src`/`project/tests`（或 `project/`）"近似判定——keel-code 类档只授权 src/tests/docs，而 T1 `project` 档为 `project/**` 全写（略宽）。子代理可改写自身进程 env 影响其后代档位（孙代理继承），威胁前提是子代理有 spawn 能力且恶意——钳制是授权语义（防父会话无意放大）非防恶意模型边界，后代产物仍经父会话 git diff 审核。
- **读面不钳制**：T0/T1 读全盘，父档读面限制（如 keel-plan 只读 project）不传导子代理——侦察结果经输出转述父会话（信息侧信道），依赖显式委派意图与输出可见性。
- **bash 分类平台假设**：同 R-16（GNU 工具链基准）。
