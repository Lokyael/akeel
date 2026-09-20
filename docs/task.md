# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0155: 修复会话接力异常冻结并收敛未推送变更记录

- Kind: maintenance
- Status: verified
- Reversal surface: engineering

### Background & Goal

修复当前未推送变更审查发现的 Session Handoff 异常路径工具未冻结问题，并为 `which` 的安全收紧和历史未推送变更补齐可追溯的 Task 权威。保持已验证的 Pi 原生接入、Access Gate hard-boundary、Git inspect、Herdr opaque policy 与 Project Record 校验行为不变。

### Out of Scope

- 不恢复未经证明的 `which` PATH lookup 放行；
- 不扩展 Shell 语法、PATH 根发现、网络策略或 OS sandbox；
- 不改写 Git 历史或重做已完成的 Pi 0.86 接入；
- 不改变 Handoff 成功交接、reconciliation 或 Artifact capability 的既有合同。

### Requirements

- REQ-1: Handoff 写入 `switch-intent` 后，replacement 成功前 source 不得继续暴露模型工具；用户明确取消时才可追加 cancellation 并恢复原工具集合。
- REQ-2: replacement、setup 或 successor 初始化异常时，source 必须保持 fail-closed；不得留下可继续工作的 split-brain source。
- REQ-3: 对上述异常路径增加通过公开 Pi composition seam 可观察的回归测试，并保持成功 replacement 与取消路径通过。
- REQ-4: 将 `which <bare-command-name>` 的 hard-boundary 收紧记录为当前批准的安全语义；说明其与既有 T-0149 放行目标的修订关系，不恢复无界 PATH 查询。
- REQ-5: 当前 Task 保持 Git 可达 checkpoint，验证完成后清档；Project Record 容器保持合法唯一 trailing slot，且不再仅推进空槽位。

### Design

Source Handoff 在发出 `switch-intent` 后保存当前 active tool 集合并立即冻结。`newSession()` 返回取消时追加 `switch-cancelled` 并恢复保存的工具集合；任何异常或状态不明均不恢复工具，保持 source 冻结。Successor 的 `setup`/`withSession` 成功路径继续只使用 successor context。

`which` 保持 `inspect/read` 的静态分类和无路径事实，但由 Mandatory Boundary 以 hard-boundary 拒绝，直到 PATH lookup roots 获得可证明的 bounded 合同。该安全收紧由本 Task 记录，不通过恢复旧放行测试来解决。

### Plan

#### Slice 1: Handoff 异常冻结

**Goal:** replacement 失败或 setup 异常时 source 进入可观察的 fail-closed 状态。

**Requirements covered:** REQ-1, REQ-2, REQ-3

**Depends on:** none

**Acceptance Criteria:**
- [x] `newSession()` 抛错后 source 工具为空，且保留 switch intent。
- [x] setup 异常后 source 不恢复工具。
- [x] 用户取消 replacement 时 source 工具恢复，且写入 cancellation。
- [x] 成功 replacement 与 successor reconciliation 现有测试继续通过。

**Files and Seams:**
- Modify: `packages/guidance/src/artifact-exchange/pi-composition.ts` — `/handoff` command and active-tool lifecycle.
- Test: `tests/guidance/artifact-exchange/pi-composition.test.ts` — command replacement failure/cancellation seam.

**Verification:**
- `npm run test:file -- tests/guidance/artifact-exchange/pi-composition.test.ts`

**Steps:**
1. Add a failing regression test for replacement rejection and source tool freeze.
2. Implement immediate freeze, cancellation restoration, and fail-closed exception handling.
3. Re-run focused tests and the existing handoff suite.

#### Slice 2: Record and requirement reconciliation

**Goal:** current change has an authoritative Task and the `which` safety revision is explicit.

**Requirements covered:** REQ-4, REQ-5

**Depends on:** Slice 1

**Acceptance Criteria:**
- [x] `docs/task.md` contains this Task and exactly one next-ID slot.
- [x] `which` hard-boundary behavior and its rationale are documented without restoring unsafe allow semantics.
- [x] Decision and context references remain valid.

**Files and Seams:**
- Modify: `docs/task.md`, `CONTEXT.md`, `docs/decisions.md` as needed.
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`, `tests/access-gate/access-decision/core/shell-policy.test.ts` — current which boundary.

**Verification:**
- `akeel_validate_records`
- `npm test`
- `git diff --check`

**Steps:**
1. Preserve the safety-tightening tests and record the revised requirement in this Task.
2. Check all changed record references and current architecture statements.
3. Mark the Task verified only after fresh validation, then clear it in the completion change.

### Verification Evidence

- Focused Handoff suite: 16 passed, 0 failed.
- Full `npm test`: 594 passed, 0 failed; includes TypeScript, docs, skills, package, Access Gate and Guidance checks.
- Source `validateRecordContainers(process.cwd())`: passed for all three standard containers.
- `npx tsx scripts/validate-docs.ts`: passed; 44 live Decision references resolve.
- `git diff --check`: passed.

### Durable Updates Checklist

- [x] `packages/guidance/src/artifact-exchange/pi-composition.ts`
- [x] `tests/guidance/artifact-exchange/pi-composition.test.ts`
- [x] `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/which.ts`
- [x] `tests/access-gate/access-decision/core/shell-semantics.test.ts`
- [x] `tests/access-gate/access-decision/core/shell-policy.test.ts`
- [x] `CONTEXT.md`
- [x] `docs/decisions.md`
- [x] `docs/task.md`

## T-0156: 待创建
