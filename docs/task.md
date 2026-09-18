# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0137: 迁移包管理器与 uv 分析器至分段解析架构并修正选择器路径伪溢出

- **Kind:** refactor
- **Status:** in-progress
- **Reversal surface:** engineering

### Background & Goal

在 T-0136 中，我们成功构建了纯语法的确定性分段参数解析原语（`segment-parser.ts`）并在 `herdr.ts` 与 `python-tools.ts` 完成了试点。
当前 `package-managers.ts` 与 `uv.ts` 仍在使用基于 `option-scanner.ts` 的旧扫描方式，并遗留了架构评审中发现的缺陷：
1. `package-managers.ts` 将 `--workspace` 与真实文件系统路径（`--prefix`、`--cwd` 等）混杂，导致 package manifest 名称（如 `@scope/pkg`）被当作普通文件路径提取为 `ShellPath`，可能触发伪路径拦截；
2. `uv.ts` 将 `--python` 的版本/解释器标量值（如 `3.12`）与真实路径选项一同提取为 source path。

本任务目标：
1. 将 `uv.ts` 迁移至 `segment-parser.ts`，区分真实文件路径与版本标量，消除伪路径提取；
2. 将 `package-managers.ts` 迁移至 `segment-parser.ts`，严格区分路径选项（`--prefix`、`--cwd` 等）与包选择器（`--workspace`、`-w`、`--filter`），根除 `--workspace` 伪路径溢出缺陷；
3. 使所有非 Git 的已知子命令程序统一收敛至两阶段解析架构；
4. 确保全量测试无回归。

### Out of Scope

- 不重构 `git.ts`（留待后续独立评估）。
- 不修改 coreutils、chmod、find 等平坦命令分析器。
- 不改变现行 Canonical 编译、Admission 或 Policy 求值规则。

### Requirements

- **REQ-1 (uv 分析器迁移与路径脱敏):**
  - 使用 `segment-parser.ts` 解析 `uv` 参数；
  - 仅将 `--directory`、`--project`、`--cache-dir`、`--config-file`、`-C` 提取为 source path；`--python` / `-p`、`--allow-insecure-host` 等标量值严禁作为路径事实发射；
  - 保持 `uv run`（execute + opaque）、`uv help`（inspect + read）以及版本标志的原有语义不变；
  - 未知选项严格截断并标记为 `opaque: true`（Fail-closed）。
- **REQ-2 (包管理器分析器迁移与工作区选择器脱敏):**
  - 使用 `segment-parser.ts` 解析 `npm`、`pnpm`、`yarn`、`npx` 参数；
  - 严格区分文件路径与包名选择器：`--prefix`、`--cache`、`--userconfig`、`--globalconfig`、`--cwd`、`--dir`、`-C` 作为路径事实提取；`--workspace`、`-w`、`--filter`、`-F`、`--registry` 仅作为选择器/标量消费，绝不作为 `ProgramPath` 发射；
  - 保持所有子命令类别（inspect、modify、execute、unknown）及全局标志 `-g` 的原有映射逻辑不变；
  - 未知选项严格截断并标记为 `opaque: true`（Fail-closed）。
- **REQ-3 (安全与零回归):**
  - 编写单元测试证明 `npm --workspace=@scope/pkg run test` 不再将 `@scope/pkg` 提取为路径；
  - 全量 503+ 测试用例全部绿灯通过。

### Plan

#### Slice 1: uv 分析器迁移与标量脱敏 (TDD)
- 在 `shell-semantics.test.ts` 中增加 `uv --python 3.12 help` 验证不发射 `3.12` 路径事实的测试；
- 重构 `uv.ts` 接入 `segment-parser.ts`；
- 验证 uv 相关测试通过。

#### Slice 2: 包管理器迁移与工作区选择器脱敏 (TDD)
- 在 `shell-semantics.test.ts` 中增加 `npm --workspace=@scope/pkg test` 验证不发射 `@scope/pkg` 路径事实的测试；
- 重构 `package-managers.ts` 接入 `segment-parser.ts`；
- 验证包管理器相关测试通过。

#### Slice 3: 全量回归与清档
- 运行全量 `npm test`；
- 清档 `docs/task.md`。

### Durable Updates Checklist
- [ ] 代码层 — `uv.ts` 与 `package-managers.ts` 完成两阶段解耦并消除伪路径
- [ ] 测试层 — 包含工作区选择器脱敏与 uv python 脱敏的语义测试
- [ ] `docs/task.md` — 验证全绿后清档

## T-0138: 待创建

