# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0125: 完备化标准流重定向矩阵与丢弃流支持

- **Kind**: feature
- **Status**: in-progress
- **Origin**: C-025
- **Goal**: 完备化 Shell 车道中的标准流重定向识别（支持 `1>`、`1>>`、`2>`、`2>>` 文件写入，`2>/dev/null` 丢弃流，以及字面 `2>&1` 合流修饰符），消除日常排错与输出处理中的语法硬阻断，同时维持严格的 fail-closed 安全边界。
- **Requirements**:
  - R1: 词法层支持识别 `1>`、`1>>`、`2>`、`2>>`、`2>&1`，未建模描述符（如 `3>` 等）、Heredoc（`<<`、`<<<`）及输入复制（`<&`）维持 fail-closed。
  - R2: 针对 `1>`、`1>>`、`2>`、`2>>`，消费后置路径 token 并提取为 `target` 写入路径事实与 `write` effect，继续受路径策略与系统硬边界管辖。
  - R3: 泛化 `/dev/null` 丢弃流：当目标为规范字面 `/dev/null` 时，无论是 `>`、`1>` 还是 `2>`、`2>>`，均作为丢弃流豁免路径事实与写入副作用，不污染写策略，使 `cmd 2>/dev/null` 在只读/审查策略下顺利作为 inspect 准入。
  - R4: 识别字面 `2>&1` 作为流复制修饰符，不产生新的 target 路径事实，不污染写入 effect；若前置或后置存在文件写入重定向，仍按既有写目标受审；无文件重定向时流向终端。
- **Out of Scope**:
  - **Pipelines**: 管道（`|`）并发子进程模型与数据流隔离留待独立候选（C-040）评估。
  - **Heredoc / Here-string**: 多行输入（`<<`、`<<<`）及动态内容展开不在本次范围。
- **Plan**:
  - Slice 1: 更新 `language.ts` 词法分词与操作符识别，并编写 `shell-language.test.ts` 覆盖测试。
  - Slice 2: 更新 `invocation.ts` 调用分析中的重定向角色、丢弃流及合流修饰符处理，并编写 `shell-semantics.test.ts` 测试。
  - Slice 3: 更新编译与授权层测试（`shell-compile.test.ts`、`shell-policy.test.ts`），确保路径核验与硬边界正确生效。
  - Slice 4: 运行全量 `npm test`，同步更新文档，完成验证。

## T-0126: 待创建
