# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0113: 单用户 Staging 生命周期与孤儿回收

- **Kind:** refactor
- **Status:** in-progress
- **Goal:** 在本地单用户环境下统一 staging 目录管理，建立支持 7 天排查回溯与配额兜底的孤儿回收机制。

### Out of Scope

- **跨主机文件同步：** 仅管理本地文件系统临时目录；Revisit when 出现多节点协同需求。
- **自定义清理守护进程：** 清理逻辑内嵌于会话生命周期自驱；Revisit when 有独立系统服务编排需求。

### Requirements

- **R1 — Unified staging parent:** 运行时 staging 根目录固定为 `/tmp/akeel/staging/`，各会话在此目录下创建 `stage-<random>` 临时目录。
- **R2 — Retention window:** 历史 staging 目录默认保留 7 天，供任务中断现场排查与运行轨迹核验。
- **R3 — Resource budget:** 设立容量上限（500MB）与目录数量上限（200 个）；超出配额时按最后修改时间执行 LRU 淘汰。
- **R4 — Active session protection:** 目录创建时写入包含进程标识的锁文件；回收过程通过进程存活探测排除活跃会话目录。
- **R5 — Non-blocking lifecycle:** 回收逻辑在会话启动时按每日至多一次节流执行，不阻塞主会话启动与工具交互。
- **R6 — Safe path jail:** 清理目标严格限定在 `/tmp/akeel/staging/` 内部且名称匹配 `stage-*` 的实体子目录，跳过符号链接。

### Design

在 `runtime/` 建立 `staging-retention.ts` 模块，提供锁文件写入、进程存活探活、节流检查与配额清理函数。`project-lifecycle.ts` 将 staging 父目录固定为 `/tmp/akeel/staging/`，并在创建会话临时目录（`stage-*`）后写入锁文件与触发非阻塞清理检查。清理逻辑按 7 天 TTL 与容量/数量配额对历史孤儿目录进行安全回收。

### Plan

#### Slice 1: Staging 路径统一与保留策略实现

**Goal:** 实现 `staging-retention.ts` 核心逻辑，将 `project-lifecycle.ts` 统一收敛至 `/tmp/akeel/staging/stage-*`。

**Requirements covered:** R1, R2, R3, R4, R5, R6
**Depends on:** none

**Acceptance Criteria:**
- [ ] staging 目录统一生成在 `/tmp/akeel/staging/stage-*`。
- [ ] 会话创建时自动写入 `.session.lock`。
- [ ] 存活会话目录不被清理。
- [ ] 超过 7 天或超过容量/数量配额的孤儿目录正确回收。
- [ ] 清理调度每日至多执行一次且不阻塞主流程。

**Files and Seams:**
- Add: `packages/access-gate/src/access-gate/access-decision/runtime/staging-retention.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/runtime/project-lifecycle.ts`
- Test: `tests/access-gate/access-decision/runtime/staging-retention.test.ts`
- Test: `tests/access-gate/access-decision/runtime/project-lifecycle.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/runtime/project-lifecycle.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/runtime/staging-retention.test.ts`

**Steps:**
1. 编写 `staging-retention.test.ts` 测试用例，覆盖锁文件格式、进程存活探测、TTL 超期筛选、LRU 配额淘汰、节流跳过与路径沙箱断言。
2. 实现 `staging-retention.ts` 核心模块与导出函数。
3. 修改 `project-lifecycle.ts`，将临时目录收敛至 `/tmp/akeel/staging/stage-*`，接入锁写入与异步清理调度。
4. 更新 `project-lifecycle.test.ts` 中的路径断言，运行定向测试验证通过。

#### Slice 2: 全量验证与生命周期核验

**Goal:** 运行全套测试验证回归，确认文档与实现一致。

**Requirements covered:** R1, R2, R3, R4, R5, R6
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 全套测试通过（`npm test`）。
- [ ] 文档一致性校验通过。

**Files and Seams:**
- Modify: `docs/task.md` — 记录验证证据并进入 verified 状态
- Test: `npm test`

**Verification:**
- `npm test`

**Steps:**
1. 运行 `npm test` 执行全套测试、TypeScript 编译检查和文档规范校验。
2. 确认 `git status --short` 与 `git diff --check` 无多余残留。
3. 补充证据字段并等待清档。

### Durable Update Checklist

- [x] 在 `docs/decisions.md` 中记录 D-088 决策。
- [x] 在 `CONTEXT.md` 中同步当前架构与活跃决策索引。
- [ ] 验证通过后在完成提交中清空 Task 章节。

## T-0114: 待创建

