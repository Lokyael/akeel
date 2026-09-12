# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-096: 安全自治的变更预检与提交审查边界

**Kind:** refactor

**Status:** verified

### Goal

在不把整理整个工作区的认知负担转给用户、也不让 Preflight 获得不受控的文件修改权限的前提下，收敛 `change-preflight` 与 `code-review` 的前置合同：只读检查优先，只有具备强 provenance、非敏感且可恢复条件的当前运行残留才允许安全自治处理；明确提交可直接固定审查面。

### Requirements

- `change-preflight` 默认只读，不直接修改、删除、提交或改写 Git 历史。
- 明确提交目标必须基于不可变 OID 固定 Review Surface；无关的脏工作区不得阻断该提交的审查。
- 未提交 Task 的 staged、unstaged 和 untracked 内容必须先分类；无法判断归属且可能影响范围时才阻断并询问用户。
- 只有当前运行明确创建、非敏感、可恢复的残留才能安全自治处理；仓库内残留移入带 `run-id` 的仓外 quarantine，专用临时目录中的一次性残留才可直接清理。
- 用户已有或归属不明的 untracked 文件、疑似敏感文件和不可逆修改不得自动处理。
- 安全自治处理失败、恢复工件无法建立或验证证据缺失时必须 `BLOCKED`，不得继续修改。
- `READY` 必须说明固定范围、Requirements 来源、验证证据、文档/专项门禁状态及实际发生的安全自治处理；任何相关内容变化都使结果失效并要求重跑。
- `code-review` 对明确提交可直接消费固定的只读审查包；对 mutable task surface 继续要求未过期的只读 `READY` 结果。

### Design

将 Preflight 分成只读固定与受限安全自治两阶段。只读阶段收集目标 OID、工作区状态、变更路径、Requirements、文档和验证证据，并按当前 Task 归属分类。默认不修改；仅当外层流程提供当前运行的创建记录与 `run-id`，且残留属于非敏感、可恢复、非语义性类别时才允许处理：专用 `/tmp` 残留可清理，仓库内残留只移入 `/tmp/akeel/preflight/<run-id>/quarantine` 并保存 manifest。未知、用户拥有、敏感或不可恢复内容只报告并阻断。安全自治处理后重新检查，输出 `READY` 或 `BLOCKED`。

将已提交目标与 mutable task surface 分开：提交目标使用 commit OID 和父提交直接建立不可变审查包，当前工作区仅作为范围外观察项；mutable task surface 必须固定完整工作区内容并消费只读 Preflight 结果。Requirements 在同一提交清除时，从父提交或此前冻结的 Task Record 取得，而不是凭当前树重建。

### Out of Scope

- **仓库级历史清理**：仍需用户明确指定范围或批准的 `code-cleanup`，避免扩大当前 Task 的 Review Surface。Revisit when 用户批准独立 maintenance scope。
- **通用文件恢复服务**：quarantine 只覆盖本次运行明确拥有的残留，不承诺恢复用户文件或抵抗操作系统临时目录清理。Revisit when 宿主提供可测试的持久化恢复存储。
- **确定性宿主 hook**：当前只修订 skill 合同，不新增 Pi commit lifecycle enforcement。Revisit when 宿主提供可测试 hook。

### Plan

#### Slice 1: 修订 Preflight 安全自治合同

**Goal:** 只读优先，仅对强 provenance 的残留执行有界、可恢复处理。
**Requirements covered:** 1–7
**Depends on:** none

**Acceptance Criteria:**

- [x] Preflight 明确默认只读和禁止触碰未知/用户内容。
- [x] Preflight 明确提交目标、mutable task surface、分类、quarantine 生命周期和失败阻断条件。
- [x] 相关 skills 与 D-080/CONTEXT 的职责描述一致。
- [x] skill validator 覆盖关键安全合同。

**Files and Seams:**

- Modify: `skills/disciplines/change-preflight/SKILL.md`
- Modify: `skills/disciplines/code-review/SKILL.md`
- Modify: `skills/workflows/implement-work/SKILL.md`
- Modify: `docs/decisions.md`, `CONTEXT.md`
- Test: `tests/validate-skills.test.ts`

**Verification:**

- `npm run test:file -- tests/validate-skills.test.ts`
- `npm test`

**Steps:**

1. 先增加 Preflight、Code Review 和实施编排安全合同的校验测试并确认基线失败。
2. 更新 skills 与决策/当前事实文档。
3. 执行定向校验和全量验证，核对无陈旧引用。

### Evidence

- 原 D-080 要求 Preflight 自动移除残留，但未规定只读默认、创建 provenance、quarantine 或敏感内容边界。
- `code-review` 当前在固定审查面建立前无条件要求 `READY`，无法区分不可变提交目标和 mutable task surface。
- 本次会话确认用户优先接受安全自治，但不接受把不可逆恢复负担转给用户。

### Durable Updates

- [x] D-080 已改为安全自治的 Preflight 与分层 Review Surface 合同。
- [x] `CONTEXT.md` 已反映只读优先和提交目标/工作区的分界。

## T-097: 待创建
