# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0115: 路径策略文档最小化清理

- **Kind:** maintenance
- **Status:** in-progress
- **Goal:** 删除上一轮路径范围历史处置中新增的实现术语与重复说明，同时完整保留当前用户合同和 C-030 的未来复审边界。

### Out of Scope

- 不改变 Policy、路径匹配或配置加载行为。
- 不重新裁决 C-025 的 policy path canonicalization 检查点或 C-030 的未来设计方向。

### Requirements

- **R1 — README locality:** README 只保留用户理解配置输入所需的绝对路径、glob 与 `~/` 限制，不重复无效配置回退，也不暴露内部 Path Evidence 术语。
- **R2 — Candidate zero-loss:** C-030 保留 first-match、Profile 继承顺序及当前 seam 下重新证明顺序语义的完整边界，删除同句重复枚举。
- **R3 — Behavior preservation:** 不修改代码、测试、Decision 或当前架构事实。

### Plan

#### Slice 1: 文档最小化与验证

**Goal:** 对 README 与 C-030 做两处定点压缩并验证记录结构和全量测试。

**Requirements covered:** R1, R2, R3
**Depends on:** none

**Acceptance Criteria:**
- [ ] 两处冗余已移除且语义清单无损。
- [ ] `npm test` 通过。

### Durable Update Checklist

- [ ] `README.md` 与 `docs/candidates.md` 完成最小化更新。
- [ ] 验证后清空 Task 章节。

## T-0116: 待创建
