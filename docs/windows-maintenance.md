# Native Windows 11 Maintenance

本文是原生 Windows 11 平台迁移与并行维护的工作入口。它可能在迁移期存在较长时间，但不替代：

- [`docs/task.md`](task.md) 中 T-0168 的批准范围、设计和验收门禁；
- [`docs/decisions.md`](decisions.md) 中 D-035 的长期平台边界；
- [`CONTEXT.md`](../CONTEXT.md) 中已经成立的当前事实和 Negative Space；
- [`README.md`](../README.md) 中发布版本的用户合同。

当前发布的 Access Gate 仍是 Linux-only。本文件描述已批准的 Windows 目标和维护操作，不得被引用为“Windows 已受支持”的证据。

## 固定平台组合

AKeel 的 Windows profile 固定为：

```text
Operating system: native Windows 11
Terminal:         Windows Terminal
Model Shell:      PowerShell Core >=7.4 <8 (pwsh.exe)
Direct tools:     Pi native read/write/edit/find/grep/ls after Windows path verification
```

Windows session 必须正向确认实际 executable 是 PowerShell Core `>=7.4 <8`。AKeel Windows composition 注册同名 `powershell` replacement，冻结 `pwsh.exe` identity，并让 syntax/evidence host 与模型命令 executor 使用同一 executable。Pi built-in 在找不到 `pwsh.exe` 时回退 Windows PowerShell 的行为不进入本 profile；ownership、identity、version、FullLanguage 或 tool source 任一核对失败即保持 profile 未初始化并给出静态纠正路径。

目标 Pi 配置：

```json
{
  "defaultTools": ["read", "powershell", "edit", "write", "grep", "find", "ls"]
}
```

Direct 工具只有在各自 Windows native path 合同通过验收、且最终 Pi tool source 仍为预期 built-in 后才进入支持清单。模型工具集中不得出现 `bash`，Windows 维护环境不配置 Pi `shellPath`。Settings 提供初始 loadout，Windows composition 在 session start 再核对/收敛 active tools；Access Gate off 也不重新暴露模型 `bash`。

依赖来源与包管理器不是 Windows profile 合同的一部分。WinGet、Scoop、Chocolatey、官方 MSI 或其他主流来源均可使用，前提是最终 executable、版本、参数传递和文件系统证据通过同一套正向验证；不要因为包管理器名称改变授权语义。Scoop 等来源可能通过 shim 暴露 `pwsh.exe`，resolver 会先执行 PATH 入口完成握手，再冻结 PowerShell 报告的最终 `pwsh.exe` 路径，后续不再重新解析可变 shim。

Pi 0.87.1 中，模型只有在 `bash` tool 激活时才会调用 Bash，同名 extension tool 可以替换 built-in。Windows profile 不信任配置作为唯一 enforcement：AKeel 拥有最终 `powershell` definition，并为获准调用发行绑定 tool-call ID、command digest 与 workspace identity 的单次 execution ticket；executor 必须消费 exact ticket 才能 spawn。交互式 `!` / `!!`、RPC `bash`、低层 SDK Bash API 和第三方 Bash backend 不属于普通 AKeel Windows 工作流或其支持保证。

PowerShell-only 约束只指定 Pi 的 host Shell。由已准入 PowerShell 命令启动的 `git.exe`、编译器、构建工具、script host 或 helper 继续由 Access Gate 的程序语义、路径 facts、Mandatory Boundary 与 opaque policy 管理。

## Windows 主机预检

- Windows Terminal profile 直接启动 PowerShell Core `>=7.4 <8`，并以 `$PSVersionTable.PSEdition`、`$PSVersionTable.PSVersion`、`[Environment]::ProcessPath` 与 LanguageMode 正向验证当前进程；只看到 `powershell.exe`、Desktop edition、旧版本或非 FullLanguage 时停止。
- 可使用 WinGet、Scoop、Chocolatey、官方 MSI 等来源安装 Node.js、Git 和 PowerShell；来源无关，但同一台验收机不要同时用多个来源安装同一个 executable。
- 启用 Windows Developer Mode 和 Win32 long paths，为 reparse/symlink 与长路径 contract tests 提供现代 Windows 基线；具体工具仍以实测结果为准。
- repository 位于本地 NTFS，并与 Linux 使用独立 checkout。
- Git maintenance 使用 native `git.exe`；分发方式只需通过 AKeel 必需的 repository、worktree、credential 和 package 流程。
- Windows Terminal 保留 Pi 的 Windows 快捷键基线：`Ctrl+Q` 用于 follow-up。若需要 `Shift+Enter`，按 Pi Windows Terminal 文档发送扩展键序列，而不是依赖普通回车重写。
- CJK IME 候选窗口或输入定位异常时启用 Pi `showHardwareCursor`; 该设置属于终端输入兼容，不改变 Access Gate 或 Shell 合同。

## 迁移启动顺序

首个 Windows tracer 不是对既有适配的预先验收。迁移先实现一个最小、默认 fail-closed 的 Windows bootstrap，再到独立原生 Windows checkout 验证该 bootstrap；不得把“尚未实现 Windows profile”误当成跳过 native evidence 的理由，也不得要求在任何代码存在前证明最终行为。

1. **Bootstrap implementation**：加入一次性平台选择、AKeel-owned 同名 `powershell` replacement、final tool source/active-set 核对、`pwsh.exe` identity/version handshake、single-use execution-ticket primitive 与 bounded executor seam。平台无关部分和静态合同测试可在非 Windows checkout 编写。
2. **Native tracer acceptance**：通过 Git 把已提交源码带入独立 Windows 11/NTFS checkout，pack/install 最终 package，并核对 replacement ownership、无 model `bash`、fixed setup、ticket missing/replay/mutation 的 pre-spawn rejection，以及固定 `git.exe`、`node.exe`、`npm.cmd`/必要 shim vectors 的 `Standard` 参数行为。
3. **Broader migration**：只有 native tracer 证明 Pi host seam 与目标工具链兼容后，才开始 platform-runtime foundation、Linux parity migration、Windows path/runtime 和完整 PowerShell Canonical 集成；不兼容证据先返回用户裁决。

Bootstrap 期间普通模型 PowerShell 调用保持拒绝。固定 tracer vectors 只能由 native contract-test harness 调用 executor seam，不得通过 production flag、环境变量或隐藏 policy 建立运行时 test mode。Tracer 通过只证明宿主接缝可行，不发行一般 Windows 支持结论；完整 Canonical/Admission 后续只能为成功授权的 exact input 发行 production ticket。

## 上游 Pi 事实基线

当前开发依赖固定到 Pi `0.87.1`。截至该版本：

- Pi 有独立的原生 Windows 文档和 Windows Terminal 配置；
- `powershell` 是内建的可选模型工具和 SDK tool factory；
- PowerShell tool 优先解析 `pwsh.exe`，随后才回退到 Windows PowerShell；
- `defaultTools` 可以用 `powershell` 替换模型可见的 `bash`；
- `powershell` 与 `bash` 均获得 Pi session environment、动态 cwd、时长展示和 constrained-sampling 集成；
- 用户 `!` / `!!` 与 RPC `bash` 仍是独立 Bash 入口；它们不属于 AKeel Windows 的正常工作流。

Pi 没有发布带里程碑的 Windows roadmap。公开 Windows 反馈线程仍在讨论原生 PowerShell 是否应成为默认值，以及是否进一步让用户 Shell/RPC execution 可完全脱离 Bash；当前没有承诺日期。AKeel 只依赖已经发布的 tool replacement、extension metadata 与 shell-result public contract，不等待 Pi 改变默认值，也不采用 built-in PowerShell fallback。

## Windows Platform Runtime Authority

Windows profile 通过内部 `akeel-platform-runtime` support package 共享 path、private-filesystem、process 与 runtime-root contracts。该 package 不声明 Pi extension/skill，不增加用户能力入口；Access Gate 和 Guidance 仍分别拥有 Policy、session 与 run lifecycle。

每个活动 session 使用一个 private Windows evidence host：TypeScript client 通过有版本、预算与超时的 JSONL stdio 协议调用同一个 verified `pwsh.exe`，host 以 `-NoLogo -NoProfile -NonInteractive` 运行，使用官方 `System.Management.Automation.Language.Parser`，并加载 AKeel 自有 managed Win32 assembly 取得 handle-based final path、volume/file ID、reparse tag、SID/DACL、process creation identity 与原子文件操作。Host 不执行模型命令；模型命令由持有 execution ticket 的独立 PowerShell executor 在 fresh process 中运行。协议错误、host exit、超时、未知 Win32 evidence 或预算超限均 fail-closed。

Package discovery、archive dry-run 和仅加载 extension 的 smoke test 不启动 host；`session_start` 获取资源，`session_shutdown` 幂等释放。Windows evidence 可异步获取，授权只在 sealed evidence 完整后执行同步纯投影。

## 平台隔离清单

Linux 与 Windows 之间只交换 Git 中的源码和记录。以下内容保持物理独立：

- repository checkout 与 `.git/index`；
- dependency installation、executable shim 和 generated output；
- `PI_CODING_AGENT_DIR`；
- `PI_CODING_AGENT_SESSION_DIR`；
- AKeel `policy.yaml` 与其中的绝对路径；
- provider credentials 和 Pi authentication state；
- Pi package installation/storage；
- AKeel session staging、workflow runs、temporary files 和 retention metadata；
- compiler/test caches 与 CI caches。

Windows checkout 使用独立的本地目录。不要把同一工作区、session、temporary root 或 package store 同时用于两个平台。CI/cache identity 至少包含 OS、architecture、runtime version 和 lockfile identity。

## Windows 文件系统基线

Windows 文件系统基线是本地 NTFS 与 fully-qualified native path；其他存储形态不扩大首个验证范围。实现与测试必须覆盖或明确拒绝：

| 输入/证据类别 | Windows v1 行为 |
|---|---|
| relative、drive-absolute | 进入证据解析；relative 只绑定 fixed session cwd |
| `/`、`\\` separator | 接受并保留 literal display；只发行一个 canonical identity |
| UNC、drive-relative、rooted-without-drive、device/namespace input | reject |
| ADS、reserved device name、control、尾点/尾空格 | reject |
| 非 NTFS volume、case-sensitive NTFS directory | reject |
| known symbolic link/junction reparse tag | 有界解析 lexical/final traversal 与 object identity |
| unknown reparse tag、loop、depth/budget overflow | reject |
| 8.3 alias | final long-name 与 object evidence 完整才可进入授权 |
| existing hard link | 记录 volume/file ID/link count；v1 对 multi-link file mutation hard-deny |
| missing leaf | 证明 deepest existing ancestor，并验证剩余 lexical components |
| long path | evidence host 内部使用 namespace-safe form；执行工具另做 native contract test |

Windows Path Authority 对每个 source token 只解析一次并发行 sealed Platform Path Proof：platform domain、literal/display、canonical location、traversed/terminal identity、risk flags，以及和 bounded session Root Catalog 的 `equal/descendant/ancestor/traversed` 关系。Catalog 包含 access/staging/runtime、credential、capability 与全部 preset roots。公共 Mandatory Boundary/Policy 只消费 root IDs 和 relations，不解析字符串；recursive blocked descendant 使用 `ancestor` relation。Input namespace forms 即使能被 host 内部表示也不获得准入。

Policy path 由 Windows authority 异步解析并编译为同域 root ID；resolved snapshot 不能被 Linux session 或另一 Windows profile state 消费。Existing credential artifacts 同时按 canonical location 与 file identity 防别名访问；multi-link mutation 的保守拒绝防止从工作区 hard link 写穿 capability/credential object。Gate 不传递已验证 handle 给 Pi Direct tool，故仍明确保留 pathname evidence 与实际操作之间的 TOCTOU residual risk。

## Windows 文件系统控制

Linux 的 owner/mode 检查不能作为 Windows 私有目录证明。Windows runtime 从 `%LOCALAPPDATA%` 派生 `AKeel/runtime`，并在采用前证明其位于 local NTFS。受控 root 使用封闭安全描述符：owner 是 current-user SID，DACL protected/不继承，只向 current-user SID 与 `SYSTEM` 授予 Full Control，root 非 reparse；不尝试接受任意“看起来安全”的 ACL。Session/run 后代继承同一合同。

Lock 保存 PID 与 process creation time，二者同时匹配才表示同一 live process；access denied 或未知状态保守视为 live。Windows no-clobber publication 在 destination directory create-new temp，写 UTF-8 no BOM，flush 后 same-volume no-replace/write-through rename content，并以同一协议最后发布 receipt。已有相同 owner/publisher/digest 可幂等恢复；sharing violation、打开文件、杀毒/索引器干扰、rename/delete/cleanup failure 不发行成功且保留精确 residue 进入 retention。

物理 runtime root 不进入共享领域规则。任何文档、receipt 或 Guidance 使用 `session staging root`、`workflow run root` 等角色名称，或直接使用 platform authority/tool 返回的 exact path；不得自行拼接 `/tmp`、`%TEMP%` 或 `%LOCALAPPDATA%`。

## PowerShell 7 编译边界

PowerShell 车道使用 verified runtime 中的官方 `Parser.ParseInput`，把 AST 投影为有界 `PowerShellSyntaxIR`；它不复用 Bash tokenizer/flow/redirection，不手写等价 parser，也不执行 command discovery。只有 IR 完整表示 invocation kind、literal arguments、parameters、source extents 与 redirection 的形态才进入 TypeScript semantic analyzers。

v1 admitted grammar 是一个 simple command：参数必须是 fixed literal，double-quoted string 只有在 AST 无 interpolation 时才是 literal。初始普通 cmdlet 只包括已证明的 module-qualified filesystem inspection commands，路径参数要求 `-LiteralPath`；external lane 支持通过 identity 和完整参数合同的 `git.exe`、`node.exe`、`npm.cmd`/`npx.cmd`、package/build tools 与最终 Herdr executable/shim。真正共享的 external CLI analyzer 接收 platform-neutral `ProgramInvocation`，PowerShell cmdlet/provider/shim 语义保持 Windows 私有。

以下形态在 v1 通过负向合同稳定拒绝：pipeline、redirection、compound statement、assignment、variable/wildcard、alias/function、provider path、`&` invocation、dot sourcing、script block、subexpression、`.ps1`、unknown `.cmd`/`.bat`、`Start-Process`、nested shell 与 destructive cmdlet。测试“覆盖”这些类别表示证明拒绝，不表示放行。Exact unknown `.exe` 最多进入现有 opaque axis；`commands.opaque: allow` 仍不证明路径边界、ACL、网络或 child process confinement。

每个获准 call 发行 single-use execution ticket。Executor 对 tool-call ID、command digest 和 workspace identity 精确匹配后，在独立 fresh process 中注入/复核固定 runtime setup 再执行 original literal form；missing/replayed/mutated ticket 在 spawn 前失败。Evidence host 只解析 AST，不执行该命令。

## Repository portability gate

仓库需提交 root `.gitattributes`，使所有文本在 index 与两个工作区都使用 LF；未来二进制资源必须显式标记。维护不依赖个人 `core.autocrlf`。PowerShell fixture 或脚本同样必须保存为 UTF-8 no BOM + LF；测试创建文件时显式指定 `utf8NoBOM`，而不是继承 locale 或 redirection default。

新增 tracked-path validator，检查 Unicode case-fold collision、Windows-invalid tracked path、mixed EOL 和任何 tracked text BOM。Symlink 与异常长路径只在仓库实际引入时增加对应合同，不预先禁止。

迁移前源树探针结果：144 个 tracked path 全为 LF；无 BOM、tracked symlink、case-fold collision 或 Windows-invalid path；最长 tracked relative path 为 104 UTF-16 code units。新增 `.gitattributes` 后 tracked count 会变化；该结果只是迁移起点，不替代持续 validator。

## PowerShell configuration and Chinese support

Windows profile 面向英语和简体中文 Windows 使用同一套现代 PowerShell Core `>=7.4 <8` 配置。AKeel-owned executor 以 `-NoProfile` 启动每次模型调用，并由 fixed bounded prefix 提供配置，不依赖用户 profile。

UTF-8 无 BOM 是 Windows profile 的强制文本编码合同：源文件、fixture、生成文本、PowerShell 写入的文件和采集的文本制品均使用 UTF-8 no BOM。该选择优先现代跨平台语义，不为兼容旧版 Windows PowerShell 或旧软件而添加 BOM；实现和测试必须显式选择 `utf8NoBOM`。

目标配置包括：

```powershell
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$PSDefaultParameterValues['*:Encoding'] = 'utf8NoBOM'
$PSNativeCommandArgumentPassing = 'Standard'
```

以上设置是 Windows profile 的运行时合同，不是用户建议。AKeel-owned executor 在每次受管调用的 fresh process 中插入 fixed bounded prefix，先验证 PowerShell identity/configuration，再执行已获 execution ticket 的 original command；不得依赖用户 profile、persistent shell state 或 Pi built-in fallback。`Windows` 和 `Legacy` argument-passing mode 不属于支持配置；只支持旧模式的工具不能通过切换兼容模式进入验收。

PowerShell 的这些设置控制字符编码和 native 参数传递，不是字体；字体由 Windows Terminal profile 独立选择，必须覆盖英文、简体中文和所需符号。源文件与生成文本必须保持 UTF-8 no BOM。

共享验收矩阵覆盖 PowerShell cmdlet 和 native-process stdout/stderr、显式 `utf8NoBOM` 文件 encoding、LF/no-BOM enforcement、ASCII/中文 path/content、localized diagnostics、Windows Terminal CJK IME、package loading、session persistence 和 Context Pruner。若英语与中文环境无法使用同一产品行为或保证，必须把证据和选择提交用户决定。其他 locale 暂不进入验收矩阵。

## 子系统迁移检查

### Access Gate

- [ ] host adapter 接受 profile-tagged Windows workspace identity；
- [ ] Windows composition 正向确认并冻结 PowerShell Core `>=7.4 <8` executable，evidence host 与 executor 使用同一 identity；
- [ ] AKeel-owned `powershell` replacement 的 final tool source、active set 和 supported Direct tool sources 均通过核对；
- [ ] 每次受管 PowerShell 调用消费绑定 call ID/digest/workspace 的 single-use ticket，并注入/正向验证 UTF-8 no BOM 与 `Standard` 配置；
- [ ] package/host tests 证明 Windows profile 未激活模型 `bash`，mutation/replay/missing ticket 不 spawn；
- [ ] Linux composition 仍拒绝 `powershell`；
- [ ] Windows composition 拒绝 `bash`，包括 Gate off；
- [ ] Direct compilation 使用 handle-based Windows Path Proof 与 bounded Root Catalog，不把 native string 交给公共 Policy comparer；
- [ ] credential/capability/workspace 三域在 Windows 重新证明；
- [ ] policy absolute paths 接受 Windows native schema，且 policy 文件不跨平台复用已解析 roots；
- [ ] approval/display 保留 PowerShell literal form 和静态 bounded guidance。

### Session and temporary resources

- [ ] Project Context、Gate Session、Artifact Owner、Continuation Capsule 接受并持久化可重验证的平台标记 workspace identity；
- [ ] staging/run root 由 verified local-NTFS `%LOCALAPPDATA%` runtime root 派生，shared contracts 不写死 physical path；
- [ ] controlled-directory proof 使用 current-user owner、protected DACL、current-user+SYSTEM ACE 与 non-reparse evidence；
- [ ] lock 绑定 PID+creation time；retention、quota、sharing violation、cleanup 与 crash residue 有 Windows 合同测试；
- [ ] Artifact Exchange 使用 flush→same-volume no-replace rename→receipt-last，并在 Windows open-file/AV-style interference 下不误报成功；
- [ ] Session Handoff 继续只使用 Pi session entries，不新增跨平台外部目录。

### Guidance and context projection

- [ ] skills 只消费工具返回的 runtime role paths，不把 Linux 临时路径、`%LOCALAPPDATA%` 拼接或 platform opener 写成跨平台要求；
- [ ] Context Pruner 能识别受支持的 PowerShell test tool result，而不混淆 Bash command grammar；
- [ ] Prompt Surface 只注入所有平台都成立的原则；Windows 操作细节留在本维护文档或专属 runtime guidance；
- [ ] README 只在全部验收完成后发布 Windows 用户步骤。

### Packaging and CI

- [ ] root `.gitattributes` 与 index-driven portability validator 固定 LF、valid UTF-8、path/case/BOM/binary-classification 合同；
- [ ] platform-runtime managed assembly 可重现构建，packed dependency 和 Windows host assets 从最终安装解析并加载；
- [ ] packed capability packages 能在 native Windows 11 上安装和加载；
- [ ] documentation/skill/package validation 在 Windows 通过；
- [ ] platform-neutral tests 在 Linux 和 Windows 都运行；
- [ ] Linux contract tests 只在真实 Linux/Bash 跑；
- [ ] hosted Windows smoke 不冒充 release evidence；Windows contract/release suite 在独立 ephemeral native Windows 11 x64 en-US/zh-CN runners 上跑；
- [ ] 同一 PowerShell Core `>=7.4 <8` 配置下的英语与简体中文 automated locale matrix 全量通过；任何不可统一差异交由用户决定；
- [ ] Windows Terminal CJK IME/font/cursor/shortcut 作为 human release evidence，不伪装成 headless CI；
- [ ] CI 不用一个平台 mock 代替另一平台的路径、ACL、Shell 或 process evidence。

### Final workflow acceptance

- [ ] 前述 core、path、ACL、PowerShell、packaging 和英语/简体中文共享 locale 门禁稳定后，最后验证 native Herdr workflow；
- [ ] reserve→packet→bind→PowerShell child→publish→collect 的 receipt/binding 完整；
- [ ] workspace/worktree cwd、environment binding 与 cleanup 在 NTFS 上符合现有 Owner authority；
- [ ] Herdr Windows 的平台限制不会被描述为 Access Gate、Artifact Exchange 或结果验收保证。

## 发布门禁

只有同时满足以下条件，README 和 CONTEXT 才能把 Windows 从“已采纳目标”更新为“发布支持”：

1. `akeel-platform-runtime` 与三个 capability packages 的 final packed install/load 在 ephemeral native Windows 11 x64 en-US/zh-CN 环境通过；
2. AKeel `powershell` ownership、PowerShell Core `>=7.4 <8` frozen identity、execution ticket、fixed runtime setup 与 model unsupported-shell boundary 通过；
3. Windows Direct Path Proof/Root Catalog 对 closed v1 path matrix、reparse/file-ID/hard-link 与 sensitive domains 的本地 NTFS 测试通过；
4. official-AST PowerShell admitted subset 与 assignment/dynamic/script/provider/pipeline/redirection/process/destructive rejection tests 通过；
5. exact protected DACL、PID+creation lock、temporary resource、receipt-last publication、cleanup、retention、cancellation、sharing/open-file failure tests 通过；
6. Repository portability gate 与英语/简体中文共享 automated locale/encoding matrix 通过，Windows Terminal/IME human evidence 完成；不可统一差异已由用户明确裁决；
7. Linux full suite 保持通过且 Linux contract 未被 Windows 语义改写；
8. native Herdr workflow 在最后验收阶段通过或以明确 residual boundary 阻止 Windows 发布；
9. 用户文档列出精确支持范围和残余风险；
10. T-0168 的 durable update checklist 完成并清档。

## 外部参考

本工作使用以下上游公开合同作为事实来源，具体版本与采用范围记录在 [`docs/traceability.md`](traceability.md)：

- Pi Windows、PowerShell tool、settings、environment variables 与 extension/SDK 文档；
- Node.js Windows/path/filesystem APIs；
- Microsoft Windows file naming、path namespace、long paths、reparse point 与 access-control 文档；
- PowerShell 7 language、native-command invocation、provider 和 redirection 文档。
