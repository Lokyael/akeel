# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-051: 子代理 Profile 映射实施（D-039）

**Kind:** feature

**Status:** verified

实施完成：T0/T1 档内置 profile（builtins.json）、`subagentProfiles` 覆盖键（validate/load/resolve 全链）、session_start env 检测 + `PI_KEEL_PARENT_TIER` 传播 + 钳制（min）、git.ts `branch -m/-M` 修复。npm test 666 全绿（新增 subagent-tiers/subagent-session/git 回归测试；profile-chain 不变式更新含子代理档）。与 D-039/R-17 一致，无文档修订。用户侧配置（scout 删 write+bash；researcher 不动）见 D-039 Impact。

## T-052: 架构深化——子代理编排收敛 + git branch 解析器 + 类型精确化（architecture review）

**Kind:** refactor

**Status:** verified

实施完成：C1 新建 `session/subagent-init.ts`（applySubagentProfile/publishParentTier，env 参数化）+ index.ts 两处一行调用 + isSubagentProcess 参数化，新增 subagent-init.test.ts 函数级 10 用例；C2 `analyzeGitBranch` 正向解析（delete>force>move>upstream>copy>list>create 优先级）从 GIT_CMDS 摘出 branch 规则，修正创建/复制/upstream 误分类，补 5 条 branch 矩阵用例；C3 RawProfiles.subagentProfiles → `Record<string,string>`（诚实形状）、mergeSources cast 消除、窄化断言移至 resolve（validate 后安全位置）。npm test 682 全绿。集成测试（subagent-session 8 用例）保留且行为不变。

## T-053: 架构深化#2——测试 env 样板统一 + git 解析器注册表 + /profile 渲染迁移（architecture review #2）

**Kind:** refactor

**Status:** draft

**Requirements:**
- **C1 env 样板统一**：`harness.ts` 加 `makeEnv(overrides?)` 与 `withEnv(env, fn)`（save→apply→await fn→finally restore，undefined=删除）；subagent-tiers 的 isSubagentProcess 测试手写 save/restore → withEnv；subagent-init 本地 makeEnv 删除 → 共享；subagent-session 的 snapshot/restore 删除 → 8 测试 withEnv 包装。生产代码零触碰。
- **C2 git 解析器注册表**：`GIT_SUBCOMMAND_PARSERS: Map<首词, (subcmd, subArgs) => CommandSemantics>`，config/branch 注册（analyze 内 slice 逻辑传入）；analyze() 的 if 分发改为注册表命中 + GIT_CMDS 表兜底；行为零变化。
- **C3 /profile status 迁移**：`profileStatus` 原样迁移至 `ui/profile-status.ts` 导出（签名不变）；index.ts 减函数体 + import；ui/ 依赖 session/profile-state。

**Design:** architecture review #2 2026-08-09 决策树结论（grill 全确认）：C1 签名/范围；C2 形态；C3 移动不重构。

**Plan:** C1 → C2 → C3。

**Evidence:** `npm test` 全绿（含 tsc/validate-docs/validate-skills）；既有用例锁定行为零变化。

**Out of Scope:** C2 不新增注册用例（既有 51 条 git 用例全覆盖）；C3 不新增测试（index.test.ts 断言不变）。

## T-054: 待创建
