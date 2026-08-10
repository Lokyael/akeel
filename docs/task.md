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

## T-053: 待创建
