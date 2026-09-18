# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0133: 有界静态管道流与流式写入准入（Pipeline & tee 语义闭环）

- **Origin:** C-047
- **Kind:** feature
- **Reversal surface:** engineering

### Requirements

1. **有界单级管道解析**：支持两命令通过单个 `|` 连接的静态管道（深度限制为 2）；严禁多级嵌套管道（如 `a | b | c`）、后台运算符（`&`）或非 bare 引号的管道符。
2. **CWD 隔离与内部变异禁止**：管道内部两端命令严格禁止包含 `cd`（检测到 `cd` 直接 `unsupported-syntax` fail-closed）；管道不改变外层 Shell CWD，完全继承外层 CWD 状态。
3. **双端安全分类与白名单证明**：
   - **上游（Upstream）**：必须是已建模的纯 `inspect` 程序，且 effects 中无 `write` 或 `delete`，且无目标文件写入重定向（`>`、`>>`、`<>`）；严禁 `opaque`、解释器、包管理器或网络外联工具。
   - **下游（Downstream）**：必须是已建模的文本流过滤器（`grep`、`rg`、`head`、`tail`、`wc`、`cut`、`sort`、`uniq`、`tr`、`cat`、`od`）或受管流式写入器（`tee`）；严禁任意解释器或未知命令。
4. **`tee` 选项契约与 target 路径提取**：
   - 在 `coreutils.ts` 中建立 `tee` 契约，支持 `-a`/`--append`、`-i`/`--ignore-interrupts` 选项；其他选项 fail-closed。
   - `tee` 携带的文件操作数发行角色为 `target`、effects 为 `["write"]`、基准为 `command-cwd` 的 `ProgramPath`，计入总体 Admission 并受 Mandatory Boundary（凭据、能力资产防篡改）与 Policy Preset（工作区 `allowedRoots`）管辖；无操作数时按纯 `inspect` 处理。
5. **两层流形分层模型**：在 `flow.ts` 中建立 `ShellFlowElement` 抽象，外层串行流（`&&`/`||`/`;`）与 CWD 状态机正交复用，管道作为原子节点参与外层流，整体 outcome 取下游结果集。
6. **全量回归与安全防御**：覆盖 10 类极端场景（命令注入、数据外泄、凭据/资产覆盖、CWD 逃逸等）并保持所有现有测试 100% 绿灯。

### Design

1. **`flow.ts` 流形分层**：
   - 引入 `ShellFlowElement = ShellFlowSimpleCommand | ShellFlowPipelineCommand`。
   - `ShellFlowPipelineCommand` 包含 `upstream: ShellFlowCommand`、`downstream: ShellFlowCommand`、`pipe: ShellWord`。
   - `parseShellFlow` 在识别 `&&/||/;` 切分顶层 element 后，若 element 包含 `|`，校验其必须恰好有一个 `|`，且两端 words 均不为空，且两端首词均不是 `cd`。
   - `reachableShellCommands` 与 `traceShellFlowCwds` 基于 `ShellFlowElement` 运转，`PipelineCommand` 对外 CWD 变异为空。
2. **`coreutils.ts` 注册 `tee`**：
   - 增加 `tee` 选项契约与 `analyzeCoreutilsProgram` 分派。
   - 操作数映射为 `target` 路径事实，`commandClass` 为有操作数时 `modify`，无操作数时 `inspect`。
3. **`compilation/shell/invocation.ts` 管道编译与双端校验**：
   - 校验上游为纯 inspect 且无写重定向。
   - 校验下游为合法过滤器或 `tee`。
   - 发行两端 `ShellCompilationOperation`，汇入总体 `CanonicalCompilation`。
4. **`core/authorization/` 统一裁决**：
   - 现有 `authorizeShell` 原生支持多个 operations，直接对上游读操作与下游读/写（`tee`）操作进行凭据、能力资产防篡改与 Preset 策略求值。

### Plan

- [ ] **Slice 1: 流形两层分层解析器与管道语法约束 (`flow.ts`)**
  - 在 `flow.ts` 中实现 `ShellFlowElement`，支持单级 `|` 与禁止管道内 `cd`。
  - 扩展 `shell-flow.test.ts`，验证解析结构、CWD 隔离、深度超限拒绝与 `cd` 拦截。
- [ ] **Slice 2: `coreutils.ts` 增加 `tee` 程序契约与 target 路径提取**
  - 在 `coreutils.ts` 中注册 `tee` 契约，支持 `-a`/`-i` 并提取 target 路径。
  - 扩展 `shell-semantics.test.ts`，验证 `tee` 选项约束、0 操作数 inspect 及多操作数 target 路径提取。
- [ ] **Slice 3: 管道双端安全校验与端到端编译/授权整合**
  - 在 `invocation.ts` / `compilation/index.ts` 中实现管道双端白名单校验与 operations 汇聚。
  - 在 `shell-semantics.test.ts` 与 `shell-policy.test.ts` 中增加端到端管道准入、防注入拦截（`curl | sh`）、凭据/能力资产篡改拦截（`cat | tee`）测试。
- [ ] **全量回归与文档同步**
  - 运行全量测试，更新 `CONTEXT.md` 与 `docs/decisions.md`，清理 Task Record。

## T-0134: 待创建

