# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0156: 简化 Task 生命周期状态

- Kind: refactor
- Status: draft
- Reversal surface: engineering

### Background & Goal

简化 Project Record 中 Task 的持久化生命周期，移除容易滞留且无法可靠执行的 `verified` 状态。保留 Requirements、Design、Plan、验证证据、Git checkpoint 和最终审查门禁；完成时在最终落地提交中原子清除 Task Record。

### Out of Scope

- 不改写 Git 历史或补造历史 Task 状态；
- 不删除 Git 可达 checkpoint、Verification Evidence 或 Durable Updates Checklist；
- 不改变 Candidate、Decision、Session Handoff 或 Artifact Exchange 的 verified 语义；
- 不新增 `blocked`、`abandoned` 或其他 Task 状态。

### Requirements

- REQ-1: 当前 Task 状态只允许 `draft` 和 `in-progress`；新记录不得使用 `verified`。
- REQ-2: Task 验证完成后，最终落地提交必须同时完成 durable updates 与 Task 清档，不留下已验证但未清档的持久状态。
- REQ-3: `principles.md`、`survey-context`、`implement-work`、`doc-sync`、validator 与测试必须表达同一生命周期，不保留冲突的 `verified` Task 路由。
- REQ-4: Project Record 容器保持唯一合法 trailing slot；当前已完成 T-0155 先完成 checkpoint 与清档，再以 T-0156 的 draft 记录本变更。
- REQ-5: 运行现有文档、技能、类型与测试验证，证明生命周期收敛没有破坏规划、实施、验证和清档门禁。

### Design

Task 持久状态收敛为 `draft → in-progress → cleared`；`cleared` 由当前树中移除 Task Record 表达，不写入 Status。验证结果继续记录在 Verification Evidence、审查结果和 durable-update checklist 中；最终提交直接清除 Task。`draft` 保留用于 implementation-planning，`in-progress` 覆盖实施、测试、文档同步、审查与 finding 修复阶段。

### Plan

#### Slice 1: Validator contract

**Goal:** validator 拒绝新 `verified` 状态，只接受 `draft` 与 `in-progress`。

**Requirements covered:** REQ-1, REQ-5

**Depends on:** none

**Acceptance Criteria:**
- [ ] validator 接受 `draft` 与 `in-progress`；
- [ ] validator 拒绝 `verified` 并给出合法状态提示；
- [ ] 测试通过公共 `checkTaskHygiene` seam 证明该行为。

**Files and Seams:**
- Modify: `packages/guidance/src/record-containers/validator.ts` — `TASK_STATUSES` and `checkTaskHygiene`;
- Test: `tests/guidance/record-containers/validator.test.ts` — Task status hygiene seam。

**Verification:**
- `npm run test:file -- tests/guidance/record-containers/validator.test.ts`

**Steps:**
1. Add the failing rejection test for `verified`.
2. Remove `verified` from the accepted status vocabulary.
3. Run the focused validator suite.

#### Slice 2: Lifecycle guidance convergence

**Goal:** all lifecycle guidance routes completion directly to clearing without a persisted `verified` state。

**Requirements covered:** REQ-2, REQ-3

**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] principles lifecycle uses `draft → in-progress → cleared`;
- [ ] survey-context no longer routes `verified` Tasks;
- [ ] implement-work clears in the final landing surface without setting `verified`;
- [ ] doc-sync checks active-or-cleared reality without requiring `verified`。

**Files and Seams:**
- Modify: `packages/guidance/src/bootstrap/principles.md`, `packages/guidance/skills/workflows/survey-context/SKILL.md`, `packages/guidance/skills/workflows/implement-work/SKILL.md`, `packages/guidance/skills/disciplines/doc-sync/SKILL.md`;
- Test: `tests/validate-skills.test.ts` — skill lifecycle contract seam。

**Verification:**
- `npm run test:file -- tests/validate-skills.test.ts`
- `npx tsx scripts/validate-skills.ts`

**Steps:**
1. Replace persisted verified-state instructions with evidence-plus-atomic-clear instructions.
2. Update skill contract tests and run the focused validation.
3. Scan repository references for stale Task `verified` routing.

#### Slice 3: Records and full verification

**Goal:** the current record containers and durable Decision state match the simplified lifecycle。

**Requirements covered:** REQ-4, REQ-5

**Depends on:** Slice 1, Slice 2

**Acceptance Criteria:**
- [ ] T-0155 is cleared after its checkpoint is reachable;
- [ ] T-0156 is a complete implementation-ready Task Record with one trailing slot;
- [ ] D-095 and CONTEXT active index record the adopted lifecycle decision;
- [ ] full repository validation passes。

**Files and Seams:**
- Modify: `docs/task.md`, `docs/decisions.md`, `CONTEXT.md`;
- Test: `tests/guidance/record-containers/validator.test.ts`, `tests/validate-docs.test.ts` — record and reference seams。

**Verification:**
- `npx tsx -e 'import {validateRecordContainers} from "./packages/guidance/src/record-containers/validator.ts"; console.log(validateRecordContainers(process.cwd()))'`
- `npx tsx scripts/validate-docs.ts`
- `npm test`
- `git diff --check`

**Steps:**
1. Validate and clear T-0155, then retain T-0156 as the current Task.
2. Synchronize the adopted Decision and active index.
3. Run focused checks and the complete test suite before final review.

### Verification Evidence

- Pending implementation.

### Durable Updates Checklist

- [ ] `packages/guidance/src/record-containers/validator.ts`
- [ ] `packages/guidance/src/bootstrap/principles.md`
- [ ] `packages/guidance/skills/workflows/survey-context/SKILL.md`
- [ ] `packages/guidance/skills/workflows/implement-work/SKILL.md`
- [ ] `packages/guidance/skills/disciplines/doc-sync/SKILL.md`
- [ ] `tests/guidance/record-containers/validator.test.ts`
- [ ] `tests/validate-skills.test.ts`
- [ ] `CONTEXT.md`
- [ ] `docs/decisions.md`
- [ ] `docs/task.md`

## T-0157: 待创建
