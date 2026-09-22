# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0164: Artifact Exchange reservation quota 修复

- Kind: bug
- Status: in-progress
- Reversal surface: engineering

### Goal

修复 Artifact Exchange 的 per-session reservation quota，使分支切换、reload/resume 和 reservation 写入失败都不能绕过 8 次上限或留下未计数的 workflow run。

### Requirements

- quota 必须统计整个 Pi session 的 reservation authority，不受当前 session tree branch 影响。
- reservation authority 必须在 run 对外可见前持久化；持久化失败不得留下未计数的 run。
- 现有 owner/capability/receipt、lazy root 和 package 分发合同保持不变。
- 增加覆盖 branch resume 与 reservation 持久化失败边界的回归测试。

### Design

- Composition adapter 从 `SessionManager.getEntries()` 恢复 reservation authority；继续在成功 append 后维护当前 extension 的 bounded local snapshot。
- Artifact Exchange 在创建 run 目录前调用 quota recorder。recorder 失败时不物化 run；recorder 成功但后续物化失败时，reservation 保守占用 quota，避免留下未计数 run。
- 保留现有 `ArtifactRunQuota` public seam；不引入跨文件数据库、自动 GC 或 reservation rollback 协议。

### Out of Scope

- **Workflow run 自动 GC**：D-089 明确要求保留至用户批准清理；仅修复 quota authority 一致性。后续需要生命周期策略时重新讨论。
- **跨进程/多 Owner 并发锁**：当前 Owner tool 为 sequential，且本修复不扩大并发模型。出现多进程共享 run root 需求时重新讨论。

### Plan

#### Slice 1: Branch-independent durable quota

**Goal:** session tree branch 改变后，已持久化 reservation 仍计入 quota。
**Requirements covered:** whole-session quota; branch resume regression.
**Depends on:** none

**Acceptance Criteria:**
- [x] quota 从全部 session entries 恢复，而非当前 branch。
- [x] 8 次 reservation 后从较短 branch resume 仍拒绝第 9 次。

**Files and Seams:**
- Modify: `packages/guidance/src/artifact-exchange/pi-composition.ts` — Owner quota adapter.
- Test: `tests/guidance/artifact-exchange/pi-composition.test.ts` — public tool execution seam.

**Verification:**
- `npm run test:file -- tests/guidance/artifact-exchange/pi-composition.test.ts`

**Steps:**
1. 添加模拟 branch 与 full session entries 不同的 failing test。
2. 改为使用 `getEntries()` 恢复 quota authority。
3. 运行 focused test。

#### Slice 2: Crash-safe reservation ordering

**Goal:** reservation persistence failure cannot leave an uncounted materialized run.
**Requirements covered:** pre-materialization authority; failure regression.
**Depends on:** Slice 1

**Acceptance Criteria:**
- [x] quota recorder 失败时不创建 run directory。
- [x] quota recorder 成功后现有 reserve/put/bind/publish/collect 行为保持不变。

**Files and Seams:**
- Modify: `packages/guidance/src/artifact-exchange/index.ts` — `reserve` public exchange seam.
- Test: `tests/guidance/artifact-exchange/artifact-exchange.test.ts` — injected `ArtifactRunQuota` seam.

**Verification:**
- `npm run test:file -- tests/guidance/artifact-exchange/artifact-exchange.test.ts`

**Steps:**
1. 添加 recorder 失败且断言无 run directory 的 failing test。
2. 将 authority record 移到 run 物化前。
3. 运行 focused test 和现有 artifact exchange tests。

### Durable-update checklist

- [x] Re-check `CONTEXT.md` 与 D-089 是否仍准确。
- [x] Validate all Project Record containers。
- [x] Run full validation。
- [ ] Clear this Task in the completion commit。

## T-0165: 待创建
