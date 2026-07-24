# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-001: 命令覆盖层

**Status:** verified

**Target:** 提供轻量 `command-overrides.yaml` 作为 Shell 命令和 Direct 工具的统一扩展入口，支持别名映射、新命令定义和分类微调。

**Scope:**

- 实现 `src/access-gate/command-semantics/overrides.ts`：类型定义、YAML 加载、别名解析、CommandDef 应用、reclassify 应用
- 修改 `src/access-gate/command-semantics/registry.ts`：在 `analyzeSemantics()` 中集成覆盖层
- 测试：`command-overrides.test.ts`（21 个用例覆盖别名、命令定义、reclassify、组合、运行时校验、缓存隔离和边界）

**Background:** 见 [D-024: 命令覆盖层](../docs/decisions.md#d-024-命令覆盖层)

**Verification:**
- `npx tsc --noEmit` 零错误
- 所有现有 adapter 测试通过（78/78，含 `go mod tidy` 修复）
- `command-overrides.test.ts` 21/21 pass

**Durable Updates:**
- [x] D-024 从 proposed 更新为 active，格式和决策内容完全重写
- [x] CONTEXT.md Active Decisions 添加 D-024 条目
- [x] `go mod tidy` 预存缺陷修复（build.ts subcommand 提取改为 join 全部非选项参数）
- [x] reclassify 清除 opaque 标志（用户显式重分类 = 提供了缺失语义知识）
- [x] reclassify.class 运行时校验（与 commands.class 同级防护）
