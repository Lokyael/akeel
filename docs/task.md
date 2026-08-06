# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。编号取末尾最大 `T-xxx` + 1，不复用历史 ID。

## T-034: command-semantics 测试重组为按命令族表格驱动

**Kind:** refactor
**Status:** in-progress
**Goal:** 将 command-semantics adapter 语义测试从两个命令式样板文件（243 用例）重组为按命令族组织的表格驱动测试（11 族 + 共享驱动），intents 断言完整化，平台边界明确为仅 POSIX。

### Architecture

共享驱动 `SemCase`（cmd/name/cls/opaque/effects/intents/ctx/analyze）入 `helpers.ts`：字段出现即断言，intents 为完整有序列表（`Partial<PathIntent>` 子集匹配，省略字段不锁），effects 为成员语义，`analyze` 注入分析入口（normalize 解包），`defineSemanticTests` 按行生成 node:test 用例。族文件镜像 `src/access-gate/command-semantics/adapters/` 结构（fs/tx/search/read/git/pkg/build/interp/shellbuiltins/noop/registry）。期望独立手写（falsifiability，不从 adapter 表派生）；POSIX-only 约束记录于 CONTEXT.md Negative Space 与 security-boundaries.md R-16。

### Out of Scope

- 不改 src 代码（候选 B 路径构建器抽取暂缓；泄漏类行为发现另立 bugfix 任务评估）。
- 不引入 skip 字段（POSIX-only 撤平台理由；违反绿提交纪律）。
- 不做 intents 投影/顺序无关断言（check 逃生口可表达）。

### Requirements

1. helpers.ts 新增 `SemCase` / `assertSemanticCase` / `defineSemanticTests` / `defineAdapterTests` / `analyzeCommand` / `analyzeNormalizedCommand`；intents 结构化差异诊断。
2. 驱动自测 `command-semantics-driver.test.ts`：正向 + 负向控制（防驱动静默全过）。
3. 删除 2 旧文件，创建 11 族文件；238 族行覆盖原 243 用例（合并 2 处重复用例、拆分混合期望用例）。
4. intents 完整化：部分/投影断言补齐为完整有序列表；转换期"表期望 vs 实际"分歧按实际裁决并记录发现。
5. CONTEXT.md Negative Space + security-boundaries.md R-16 记录仅 POSIX 平台边界。
6. `npm test` 全绿；tsc 零错。

### Verification

- `npm test`：518 pass / 0 fail（原 516 − 243 旧 + 245 新）。
- 覆盖核对：逐用例转录，合并 2 处重复（find . -type f ×2、go mod tidy ×2），拆分混合期望（git clean/npm cache/npm config/interp venv/tsx/tx positional）。
- tsc --noEmit 零错误；行数全部低于参考线。
- 完整化揭示的泄漏类行为（见 git log 中本任务 diff 的 intents 完整列表）：`truncate -s 0` 的 "0"、`install -m 755` 的 "755"、sed/awk 经典形式程序串、`find -exec/-execdir/-ok` 的 exec 参数泄漏为路径 intent——全部按现状行为固化，作为候选 bugfix 项记录，不在本任务修改行为。

### Durable Update Checklist

- [ ] 验证通过后：更新本记录 Status → `verified`，并清空 Plan 节；Task Record 编号不复用。
- [ ] 长期信息：POSIX 平台边界已入 CONTEXT.md / security-boundaries.md；泄漏类发现待评估（候选 bugfix），不写入权威容器（未采纳结论）。
