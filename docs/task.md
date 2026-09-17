# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0126: 支持 Shell 确定性与无副作用命令（true/false/:）

- **Kind**: feature
- **Status**: in-progress
- **Origin**: C-025
- **Goal**: 识别并支持 Shell 确定性与无副作用无路径命令（`true`、`false`、`:`），将其归类为无副作用的 inspect 命令（effects 为空，paths 为空，opaquePathAccess 为 false），消除其在条件流（如 `cmd || true`、`test -f file && true`）及独立调用时因 fallthrough 到 unknown 而被 `commands.opaque: deny` 错误拦截的问题。
- **Requirements**:
  - R1: 在命令分类（`commandClass`）中将 `true`、`false`、`:` 识别为确定性 inspect 命令，归入 `inspect` 类别。
  - R2: 确保 `true`、`false`、`:` 在无未知外部路径形式时 `opaquePathAccess` 为 false，effects 为空，paths 为空。
  - R3: 确保 `/bin/true`、`/bin/false`、`/usr/bin/true`、`/usr/bin/false` 规范系统路径识别为已知 system 命令并复用对应裸名语义。
  - R4: 确保 `true`、`false`、`:` 带有重定向时（如 `: > out`、`true 2>&1`、`true 2>/dev/null`），重定向的路径事实与副作用正常生效，不受命令本身零副作用影响。
  - R5: 在条件流（`shellCommandOutcomes`）中将 `:` 与 `true` 一样推导为确定性 `["success"]`（无副作用时），消除其在 `review` 预设下的 `commands.opaque` 误拒。
- **Out of Scope**:
  - `date` 或其他带变异/文件选项的 coreutils 命令：保持在 coreutils 模块按独立选项合同评估。
  - 动态参数展开、复合 Shell 语法或管道并发流：保持现行 fail-closed 语义。
- **Plan**:
  - Slice 1 (Red): 在 `shell-semantics.test.ts` 中补充针对 `true`、`false`、`:` 以及 `/bin/true`、`/usr/bin/false`、重定向形态（如 `: > out`）的语义断言，验证红灯。
  - Slice 2 (Green): 在 `invocation.ts`、`programs/index.ts` 中实现已知程序声明、命令分类及 outcomes 推导，使 Slice 1 测试变绿。
  - Slice 3 (Red & Green): 在 `shell-compile.test.ts` 与 `shell-policy.test.ts` 中增加针对 `true`、`false`、`:` 及其在条件流（如 `echo ok || true`）下的编译与策略准入测试（尤其是 `review` 预设下的放行验证），确保无 opaque 阻断。
  - Slice 4 (Refactor & Verify): 运行相关测试及全套 `npm test`，更新文档与 Task 记录完成验证。

## T-0127: 待创建

