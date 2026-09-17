# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0127: 闭环 Modify 命令操作数基数契约与内核无界修改硬边界

- **Kind**: refactor
- **Status**: in-progress
- **Origin**: C-025
- **Goal**: 闭环 C-025 中关于“无显式路径参数的 modify 命令与隐式 CWD 事实”的架构接缝：
  1. 在 `coreutils.ts` 中对必须携带路径的修改类命令（`mkdir`、`touch`、`cp`、`mv`、`ln`）统筹建立严格的操作数基数（Arity）契约，操作数不足时在语法解析阶段直接以 `unsupported-syntax` 拒绝（fail-closed）；
  2. 在 `compilation/index.ts` 中消除通用编译层对具体命令（`ls`、`find`）的硬编码检测（abstraction leak），由程序分析器全权持有并输出完备的路径事实；
  3. 在 `authorization/index.ts` 中建立修改与破坏操作的对称性硬边界：新增 `isUnboundedModify` 检查，任何带有 `write` effect 且非 `opaquePathAccess` 的操作若无路径事实（`paths.length === 0`），强制按 `hard-boundary` 拒绝，彻底消除路径策略绕过盲区。
- **Requirements**:
  - R1: 在 `coreutils.ts` 中，为 `mkdir`、`touch` 设定最小 1 个操作数，为 `cp`、`mv`、`ln` 设定最小 2 个操作数。当解析到的 operands 低于要求时，返回 `unsupported-syntax` 拒绝。
  - R2: 保持无参 `ls`、`du`、`df` 以及 `grep -r`、`rg` 正常工作，由分析器自身负责发行 `.`（`syntheticPath()`）作为 `source` 路径事实。
  - R3: 在 `compilation/index.ts` 的 `compileShellOperation` 中，移除对 `analysis.executable === "ls" || analysis.executable === "find"` 的通用编排层特定命令检测，由 `analysis.paths` 统一提供路径意图。
  - R4: 在 `authorization/index.ts` 的 `authorizeShell` 中，建立修改与破坏的对偶硬边界，新增 `isUnboundedModify` 拦截：`const isUnboundedModify = (operation.commandClass === "modify" || operation.effects.includes("write")) && !operation.opaquePathAccess && operation.paths.length === 0;`，命中时判决为 `{ kind: "deny", code: "hard-boundary" }`。
  - R5: 在单元测试与全量套件中建立完备的断言，覆盖无参 `touch/mkdir/cp/mv/ln` 的语法拒绝、有参正常准入，以及无路径写入的内核硬边界熔断。
- **Out of Scope**:
  - 为其他未知或复杂程序族建立通用声明式流形（保持在 C-046 独立规划）。
  - 恢复旧版为所有 modify 注入虚假 CWD 写意图的猜想式行为（违反 D-060 语义真实性）。
- **Plan**:
  - Slice 1 (Red): 在 `shell-semantics.test.ts` 中增加针对无参 `touch`、`mkdir`、`cp`、`mv`、`ln` 的语法拒绝测试，在 `shell-tracer.test.ts` 或 authorization 测试中增加针对无路径写操作被 `hard-boundary` 拒止的测试，观察红灯。
  - Slice 2 (Green): 在 `coreutils.ts` 中实现基数校验；在 `authorization/index.ts` 中增加 `isUnboundedModify` 硬边界；在 `compilation/index.ts` 中清理特定命令硬编码，使 Slice 1 测试通过。
  - Slice 3 (Verify & Regressions): 运行单文件测试与全量测试套件 `npm test`，确认零回退。
  - Slice 4 (Durable Update & Task Close): 更新 `docs/candidates.md` 中 C-025 状态记录，更新 `CONTEXT.md` 相应架构事实，清档 `T-0127`。

## T-0128: 待创建

