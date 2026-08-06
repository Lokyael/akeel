# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。编号取末尾最大 `T-xxx` + 1，不复用历史 ID。

## T-035: 新增内置 date 命令语义

**Kind:** feature
**Status:** in-progress
**Goal:** 将 `date` 加入内置命令语义（新 adapter `system.ts` + 族测试），分类：默认 inspect、`-s/--set` 为 modify、`-r/-f` 产生文件 read intent、`+FORMAT` 与选项值不产生路径、未知选项 opaque。

### Architecture

date 语义超出 noop（有 -s 副作用）与 read（有 modify 类）的既有模式，新建 `system.ts` adapter（未来可承载系统类命令）。选项处理：值选项 `-d/--date`、`-s/--set`、`-r/--reference`、`-f/--file`（含 `--xxx=VALUE` 与短选项附加值形式）；`-r/-f` 的值产生 read intent；`-s` 升级 class 为 modify；`+FORMAT` 位置参数跳过；未知选项 opaque（沿用 tx 的安全先例）。族测试按 T-034 驱动模式写入 `command-semantics-system.test.ts`（TDD：先 RED 后 GREEN）。

### Out of Scope

- 不处理系统时区/硬件时钟的特殊语法（`-s` 仅 class 升级，不建模效果明细）。
- 不改其他 adapter；不评估 C-001 泄漏类问题。
- `date` 不进入 shell-builtins（它是 /bin/date 外部命令）。

### Requirements

1. 新建 `src/access-gate/command-semantics/adapters/system.ts`：date 条目（inspect/modify 二态 + read intents + opaque）。
2. `registry.ts` 注册 `systemAdapter`。
3. 新建 `tests/access-gate/command-semantics-system.test.ts`（T-034 驱动）：默认/格式/`-d`/`-s`/`-r`/`-f`/`-u`/`-Iseconds`/`--bogus`/`+FORMAT` 用例。
4. `npm test` 全绿；tsc 零错。

### Verification

- TDD：先写测试行 → 运行确认 date 当前为 unknown（RED）→ 实现 adapter 后转 GREEN。
- `npm test` 全绿（518 → 518 + date 用例数）。
- 语义核对：`-r file` 产生 read intent；`-s` 为 modify；`+%F` 不产生路径；`--bogus` opaque。

### Durable Update Checklist

- [ ] 验证通过后：更新本记录 Status → `verified`，并清空 Plan 节；Task Record 编号不复用。
- [ ] 无长期信息变更（新增命令语义不改变来源映射/安全承诺；无需更新 CONTEXT.md / decisions.md / security-boundaries.md / traceability.md）。
