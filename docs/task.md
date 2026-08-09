# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-051: 子代理 Profile 映射实施（D-039）

**Kind:** feature

**Status:** verified

实施完成：T0/T1 档内置 profile（builtins.json）、`subagentProfiles` 覆盖键（validate/load/resolve 全链）、session_start env 检测 + `PI_KEEL_PARENT_TIER` 传播 + 钳制（min）、git.ts `branch -m/-M` 修复。npm test 666 全绿（新增 subagent-tiers/subagent-session/git 回归测试；profile-chain 不变式更新含子代理档）。与 D-039/R-17 一致，无文档修订。用户侧配置（scout 删 write+bash；researcher 不动）见 D-039 Impact。

## T-052: 待创建
