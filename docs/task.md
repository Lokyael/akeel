# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0114: 旧路径范围表达的历史处置确认

- **Kind:** investigation
- **Status:** in-progress
- **Origin:** C-025
- **Goal:** 核对重构前路径范围表达与当前 Policy 路径范围合同的差异，确认每项历史语义是已被当前模型吸收、已明确退役、仍由 C-030 停放、与存活 Decision 不一致，还是仅缺文档说明。

### Out of Scope

- 不恢复旧 Profile/config schema、runtime glob、first-match 或迁移 fallback。
- 不设计或实施 C-023 的项目级 Policy、C-026 的敏感路径分类或 C-030 的未来路径表达方案。
- 不把旧实现或旧测试作为正确性 oracle，也不修改 Access Gate 生产行为。

### Requirements

- **R1 — Historical evidence:** 从 `c52bd1d` 重构前实现与测试中识别旧路径 glob、绝对路径、blocked-pattern、规则顺序及配置来源的可核查行为，不从文件名或候选摘要推断合同。
- **R2 — Current evidence:** 核对当前实现、测试、README、D-059 与 D-069 对 `allowedRoots`、`blockedRoots`、`blockedPaths`、配置加载、路径 canonicalization 和 hard-boundary 优先级的实际约束。
- **R3 — Explicit disposition:** 对每项差异给出且只给出一个当前处置：被当前模型吸收、明确退役、由 C-030 停放、实现与存活 Decision 不一致、仅缺文档说明。
- **R4 — Boundary preservation:** 区分“退出当前合同”与“永久排除”；C-030 保留的未来探索不得被误写为当前支持或永久退役。
- **R5 — Evidence-backed discussion:** 将证据、未决冲突和建议处置提交用户确认；未经用户明确选择，不采纳新能力、不改 Decision、不启动实现。

### Plan

#### Slice 1: 旧路径规则证据清单

**Goal:** 从重构前代码与测试建立只覆盖路径范围表达的历史行为清单。

**Requirements covered:** R1, R4
**Depends on:** none

**Acceptance Criteria:**
- [ ] 每项旧行为均有具体历史文件或测试证据。
- [ ] 排除与路径表达无关的敏感路径分类、项目配置和运行期隔离问题。

#### Slice 2: 当前合同与实现对照

**Goal:** 把历史行为逐项映射到当前 Decision、实现、测试和用户文档。

**Requirements covered:** R2, R3, R4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 每项差异具有当前证据及唯一建议处置。
- [ ] 明确标出任何实现与 D-059/D-069 不一致或用户文档缺口。

#### Slice 3: 用户裁决与记录收敛

**Goal:** 与用户确认处置，并只更新由裁决要求的权威记录或候选边界。

**Requirements covered:** R3, R5
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] 用户已确认或修正每项建议处置。
- [ ] 必要的 durable updates 完成；无必要更新时明确记录该结论。

### Durable Update Checklist

- [ ] 依据最终裁决更新或收敛 C-025/C-030；不重复保存已确认的历史细节。
- [ ] 仅在发现当前事实或长期决策变化时更新 `CONTEXT.md`/`docs/decisions.md`。
- [ ] 调查验证并完成 durable updates 后清空 Task 章节。

## T-0115: 待创建

