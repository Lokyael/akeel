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
Model Shell:      PowerShell 7 (pwsh.exe)
Direct tools:     Pi native read/write/edit/find/grep/ls after Windows path verification
```

Windows session 必须正向确认实际 executable 是 PowerShell 7。Pi 在找不到 `pwsh.exe` 时会回退到 Windows PowerShell；该回退不满足 AKeel Windows profile，应在 AKeel composition 初始化时失败关闭并给出静态纠正路径。

目标 Pi 配置：

```json
{
  "defaultTools": ["read", "powershell", "edit", "write", "grep", "find", "ls"]
}
```

Direct 工具只有在各自 Windows native path 合同通过验收后才进入最终支持清单。模型工具集中不得出现 `bash`。Windows 维护环境不配置 Pi `shellPath`。

Pi 0.87.1 中，模型只有在 `bash` tool 激活时才会调用 Bash；Windows profile 通过 `defaultTools` 和 Access Gate 保证模型只看到 PowerShell。交互式 `!` / `!!`、RPC `bash`、低层 SDK Bash API 和第三方 Bash backend 不属于普通 AKeel Windows 工作流；除非实际使用证明仅靠配置不能保持隔离，否则不为这些未使用入口增加额外拦截层。

PowerShell-only 约束只指定 Pi 的 host Shell。由已准入 PowerShell 命令启动的 `git.exe`、编译器、构建工具、script host 或 helper 继续由 Access Gate 的程序语义、路径 facts、Mandatory Boundary 与 opaque policy 管理。

## Windows 主机预检

- Windows Terminal profile 直接启动 PowerShell 7，并以 `$PSVersionTable.PSEdition` 与 `$PSVersionTable.PSVersion` 正向验证当前进程；只看到 `powershell.exe` 或 Desktop edition 时停止。
- 启用 Windows Developer Mode 和 Win32 long paths，为 reparse/symlink 与长路径 contract tests 提供现代 Windows 基线；具体工具仍以实测结果为准。
- repository 位于本地 NTFS，并与 Linux 使用独立 checkout。
- Git maintenance 使用 native `git.exe`；分发方式只需通过 AKeel 必需的 repository、worktree、credential 和 package 流程。
- Windows Terminal 保留 Pi 的 Windows 快捷键基线：`Ctrl+Q` 用于 follow-up。若需要 `Shift+Enter`，按 Pi Windows Terminal 文档发送扩展键序列，而不是依赖普通回车重写。
- CJK IME 候选窗口或输入定位异常时启用 Pi `showHardwareCursor`; 该设置属于终端输入兼容，不改变 Access Gate 或 Shell 合同。

## 上游 Pi 事实基线

当前开发依赖固定到 Pi `0.87.1`。截至该版本：

- Pi 有独立的原生 Windows 文档和 Windows Terminal 配置；
- `powershell` 是内建的可选模型工具和 SDK tool factory；
- PowerShell tool 优先解析 `pwsh.exe`，随后才回退到 Windows PowerShell；
- `defaultTools` 可以用 `powershell` 替换模型可见的 `bash`；
- `powershell` 与 `bash` 均获得 Pi session environment、动态 cwd、时长展示和 constrained-sampling 集成；
- 用户 `!` / `!!` 与 RPC `bash` 仍是独立 Bash 入口；它们不属于 AKeel Windows 的正常工作流。

Pi 没有发布带里程碑的 Windows roadmap。公开 Windows 反馈线程仍在讨论原生 PowerShell 是否应成为默认值，以及是否进一步让用户 Shell/RPC execution 可完全脱离 Bash；当前没有承诺日期。AKeel 只依赖已经发布的 `powershell` public contract，不等待 Pi 改变默认值。

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

| 类别 | 必须处理的事实 |
|---|---|
| 绝对路径 | drive-absolute、UNC、namespace/device path、rooted-without-drive、drive-relative |
| identity | 大小写折叠、分隔符、尾点/空格、per-drive cwd |
| 特殊名称 | reserved device names、alternate data streams、控制字符 |
| traversal | symbolic link、junction、其他 reparse point、循环和深度预算 |
| aliases | 8.3 short name、hard link/file identity 对敏感边界的影响 |
| path length | long-path-aware 与非参与工具的差异 |
| scope | credential、capability、blocked path/root、access root 与 staging root 比较 |

未建立完备证据的 path class 必须 fail-closed。不得把非 Windows 路径文本中央转换后当作 Windows canonical evidence；display 可保留 literal form，但授权比较只消费 Windows adapter 发行的平台标记证据。

Policy path 由 Windows-native path adapter 解析并规范为平台内 identity；drive-relative、device/stream、UNC 和其他特殊形式分别建立明确语义，未证明的形式 fail-closed。Decoded roots 保持平台作用域，不能被 Linux session 消费。

## Windows 文件系统控制

Linux 的 owner/mode 检查不能作为 Windows 私有目录证明。Windows runtime 需要独立证明：

- owner SID 与预期用户/进程身份一致；
- DACL 不向非预期主体授予写、改、删或接管权限；
- 路径组件和受控 root 不是未批准的 reparse traversal；
- 新建 session/run/control/artifact 文件具有预期继承或显式 ACL；
- no-clobber publication、rename/link、cleanup 和 retention 的实际 Win32/Node 行为；
- 打开文件、杀毒扫描或索引器导致的共享/删除失败不造成错误认领或越界清理；
- process liveness 与 lock provenance 使用 Windows 行为验证。

受控 runtime root 从 native environment 派生，不写死物理临时路径。任何文档、receipt 或 Guidance 都应使用角色化名称，例如 `session staging root`、`workflow run root`，除非展示当前平台 adapter 返回的实际路径。

## PowerShell 7 编译边界

PowerShell 车道从 PowerShell 7 外部合同独立设计，不能复用 Bash tokenizer、flow parser、redirection 或 executable identity。第一版采用封闭子集：只有完整消费命令、参数、路径和 effect 后的形态才能成为普通 inspect/modify/execute。

至少需要区分：

- cmdlet、alias、function 与 external executable；
- native filesystem path 与非 filesystem provider path；
- pipeline 与对象流；
- input/output/error redirection；
- `&` invocation、dot sourcing、script block 和 subexpression；
- `.ps1`、module/profile/source 等脚本加载；
- `Start-Process` 等 process launch；
- nested PowerShell 或其他 Shell；
- variable、wildcard、dynamic command/path 和 runtime expansion；
- destructive cmdlet 及递归、force、provider-specific effect。

不完整、动态或超出预算的形式保持 hard boundary 或明确的 opaque/unknown 分类。`commands.opaque: allow` 不证明路径边界、ACL、网络或 child process confinement。

## Repository portability gate

仓库需提交 root `.gitattributes`，使所有文本在 index 与两个工作区都使用 LF；未来二进制资源必须显式标记。维护不依赖个人 `core.autocrlf`。PowerShell fixture 或脚本同样必须保存为 UTF-8 no BOM + LF；测试创建文件时显式指定 `utf8NoBOM`，而不是继承 locale 或 redirection default。

新增 tracked-path validator，检查 Unicode case-fold collision、Windows-invalid tracked path、mixed EOL 和任何 tracked text BOM。Symlink 与异常长路径只在仓库实际引入时增加对应合同，不预先禁止。

迁移前源树探针结果：144 个 tracked path 全为 LF；无 BOM、tracked symlink、case-fold collision 或 Windows-invalid path；最长 tracked relative path 为 104 UTF-16 code units。新增 `.gitattributes` 后 tracked count 会变化；该结果只是迁移起点，不替代持续 validator。

## PowerShell configuration and Chinese support

Windows profile 面向英语和简体中文 Windows 使用同一套现代 PowerShell 7 配置。Pi 以 `-NoProfile` 启动 tool，因此配置由 Windows composition 的 bounded prefix 提供，而不依赖用户 profile。

UTF-8 无 BOM 是 Windows profile 的强制文本编码合同：源文件、fixture、生成文本、PowerShell 写入的文件和采集的文本制品均使用 UTF-8 no BOM。该选择优先现代跨平台语义，不为兼容旧版 Windows PowerShell 或旧软件而添加 BOM；实现和测试必须显式选择 `utf8NoBOM`。

目标配置包括：

```powershell
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$PSDefaultParameterValues['*:Encoding'] = 'utf8NoBOM'
$PSNativeCommandArgumentPassing = 'Standard'
```

以上设置是 Windows profile 的运行时合同，不是仅供用户阅读的建议。由于 Pi 使用 `-NoProfile`，Windows composition 必须通过受控的 bounded startup prefix、`spawnHook` 或等价的 PowerShell operations，在每次受管调用的同一进程中注入并验证这些设置；不得依赖用户 profile 或此前残留的 PowerShell 会话。`Windows` 和 `Legacy` argument-passing mode 不属于支持配置；只支持旧模式的工具不能通过切换兼容模式进入验收。

PowerShell 的这些设置控制字符编码和 native 参数传递，不是字体；字体由 Windows Terminal profile 独立选择，必须覆盖英文、简体中文和所需符号。源文件与生成文本必须保持 UTF-8 no BOM。

共享验收矩阵覆盖 PowerShell cmdlet 和 native-process stdout/stderr、显式 `utf8NoBOM` 文件 encoding、LF/no-BOM enforcement、ASCII/中文 path/content、localized diagnostics、Windows Terminal CJK IME、package loading、session persistence 和 Context Pruner。若英语与中文环境无法使用同一产品行为或保证，必须把证据和选择提交用户决定。其他 locale 暂不进入验收矩阵。

## 子系统迁移检查

### Access Gate

- [ ] host adapter 接受并验证 Windows cwd；
- [ ] Windows composition 正向确认 PowerShell 7；
- [ ] Windows composition 在每次受管 PowerShell 调用中注入并正向验证 UTF-8 no BOM 与 `Standard` native argument-passing 配置；
- [ ] package/host tests 记录模型 tool set，并证明 Windows profile 未激活模型 `bash`；
- [ ] Linux composition 仍拒绝 `powershell`；
- [ ] Windows composition 拒绝 `bash`，包括 Gate off；
- [ ] Direct compilation 使用 Windows Path Evidence；
- [ ] credential/capability/workspace 三域在 Windows 重新证明；
- [ ] policy absolute paths 接受 Windows native schema，且 policy 文件不跨平台复用已解析 roots；
- [ ] approval/display 保留 PowerShell literal form 和静态 bounded guidance。

### Session and temporary resources

- [ ] Project Context、Gate Session、Artifact Owner、Continuation Capsule 接受平台标记的 Windows cwd；
- [ ] staging/run root 由 native runtime root 派生；
- [ ] controlled-directory proof 使用 SID/DACL/reparse evidence；
- [ ] lock、retention、quota、cleanup 与 crash residue 有 Windows 合同测试；
- [ ] Artifact Exchange no-clobber publication 和 receipt 在 Windows 文件系统上验证；
- [ ] Session Handoff 继续只使用 Pi session entries，不新增跨平台外部目录。

### Guidance and context projection

- [ ] skills 不把 Linux 临时路径或 opener 写成 Windows 操作要求；
- [ ] Context Pruner 能识别受支持的 PowerShell test tool result，而不混淆 Bash command grammar；
- [ ] Prompt Surface 只注入所有平台都成立的原则；Windows 操作细节留在本维护文档或专属 runtime guidance；
- [ ] README 只在全部验收完成后发布 Windows 用户步骤。

### Packaging and CI

- [ ] root `.gitattributes` 与 portability validator 固定 LF、path/case/BOM 合同；
- [ ] packed capability packages 能在 native Windows 11 上安装和加载；
- [ ] documentation/skill/package validation 在 Windows 通过；
- [ ] platform-neutral tests 在 Linux 和 Windows 都运行；
- [ ] Linux contract tests 只在真实 Linux/Bash 跑；
- [ ] Windows contract tests 只在真实 Windows/PowerShell 跑；
- [ ] 同一 PowerShell 7 配置下的英语与简体中文 locale matrix 全量通过；任何不可统一差异交由用户决定；
- [ ] CI 不用一个平台 mock 代替另一平台的路径、ACL、Shell 或 process evidence。

### Final workflow acceptance

- [ ] 前述 core、path、ACL、PowerShell、packaging 和英语/简体中文共享 locale 门禁稳定后，最后验证 native Herdr workflow；
- [ ] reserve→packet→bind→PowerShell child→publish→collect 的 receipt/binding 完整；
- [ ] workspace/worktree cwd、environment binding 与 cleanup 在 NTFS 上符合现有 Owner authority；
- [ ] Herdr Windows 的平台限制不会被描述为 Access Gate、Artifact Exchange 或结果验收保证。

## 发布门禁

只有同时满足以下条件，README 和 CONTEXT 才能把 Windows 从“已采纳目标”更新为“发布支持”：

1. native Windows package install/load evidence 通过；
2. PowerShell 7 identity 与 model unsupported-shell boundary 通过；
3. Windows Direct path、case alias、reserved/device、ADS、reparse traversal 和 sensitive-domain tests 在本地 NTFS 上通过；
4. PowerShell admitted subset 与 dynamic/script/provider/pipeline/process/destructive boundary tests 通过；
5. ACL、temporary resource、publication、cleanup、retention、cancellation 和 open-file failure tests 通过；
6. Repository portability gate 与英语/简体中文共享 locale/encoding matrix 通过；不可统一差异已由用户明确裁决；
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
