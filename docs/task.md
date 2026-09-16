# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0116: Delegated child artifact 交接与临时资源命名空间

- **Kind:** feature
- **Status:** draft
- **Goal:** 为 AKeel/Herdr delegated child 提供在 `review` preset 下仍可使用的正式 artifact 交接，并按 lifecycle owner 与信任面重建 `/tmp/akeel` 临时资源结构。
- **Requirements:**
  - **R1 — 正式交接:** child 通过预定、单 slot、单次、有时限的 capability 发布有界文本 artifact；Owner 只有在身份、receipt、长度与 digest 均核验后才取得正式结果。`herdr agent read` 只用于诊断。
  - **R2 — 独立授权:** artifact capability 是自授权 Pi tool surface，不改变内置 `review` 或任何普通 path/command Policy；child 不提供 path、run ID、覆盖、追加或权限参数。
  - **R3 — 生命周期分类:** `/tmp/akeel` 只承载 session-owned `sessions/`、结果返回同一 Task Owner 的 workflow `runs/`，以及 source 向 successor 转交上下文的 `handoffs/`。测试 fixture、第三方 cache 和普通探测不创建生产顶层目录。
  - **R4 — 信任面分类:** run 内分开可信 control、Owner packet、child artifacts、recoverable quarantine 与 Herdr transport diagnostics；child 不能写 receipt，quarantine/transport 不能自动当作结果。
  - **R5 — 安全与预算:** 新受控目录默认 `0700`、文件 `0600`；核对 owner、symlink 与 containment；artifact 限 UTF-8 文本、每 slot 1 MiB、每 run 4 slots、每 Owner session 8 runs，并覆盖碰撞、篡改、过期、重放、并发和部分写入。
  - **R6 — 生命周期责任:** session staging 正常 shutdown 删除，crash residue 保持 D-088 的 TTL/数量/容量回收；run 与 handoff 初版不自动 GC，未知或 provenance 不匹配的资源不认领、不删除。
  - **R7 — 包边界:** Access Gate 独占 session/staging lifecycle；Guidance 的 Artifact Exchange 独占 runs，Handoff Store 独占 handoffs；不建立跨独立安装包的总管，也不引入 Herdr runtime dependency。
  - **R8 — 既有变更隔离:** 保留并独立验证三处已暂存 Herdr analyzer/test 变更，不把它们混入本 Task checkpoint 或实施 commit。
- **Design:**
  - **Filesystem taxonomy:** `/tmp/akeel/sessions/session-<random>/{session.json,lock.json,staging/}`；`/tmp/akeel/runs/run-<random>/{control/,packet/,artifacts/,quarantine/,transport/herdr/}`；`/tmp/akeel/handoffs/handoff-<random>/{handoff.json,handoff.md,receipt.json}`。不再产生按 skill 命名的生产顶层目录，既有未知内容不迁移或删除。
  - **Domain separation:** session 与 workflow run 是多对多关系，不共用实例 envelope；handoff 的 consumer 与 owner 会转移，也不伪装成普通 run。Run 是临时 workflow attempt，不是 Task Record。
  - **Run control:** immutable manifest 记录 schema、随机 run ID、kind、Owner Pi session、cwd、slot、publisher、media type、上限、expiry 与 capability digest；raw capability 不落盘。`control/bindings` 绑定 Herdr workspace/pane/agent，`control/receipts` 由可信扩展在原子发布后最后写入。
  - **Pi surfaces:** Guidance runtime 注册 Owner run tool，以及只在 `--akeel-artifact-capability <opaque>` 有效时激活的 child publish tool。Owner surface 提供 reserve、put、bind、status、collect；collect 只允许原 Owner 并在一次调用中核验后返回内容。Handoff 使用独立 Store，但复用 Guidance 内私有安全根检查和原子文本发布机制。
  - **Atomic publication:** publisher 先验证 capability、binding、session/Herdr topology、expiry 与 byte budget，再排他创建临时文件，完整写入并 fsync，以 no-clobber 方式发布 artifact，计算 digest，最后原子发布 receipt。有效 receipt 耗尽 capability；同结果重试只能返回 already-published，不一致一律失败。
  - **Package locality:** Access Gate retention 只扫描 `sessions/`；Guidance 只管理 `runs/` 与 `handoffs/`。各 package 不扫描其他 subtree，共享规则由 Decision 与跨包行为测试固定，而非新增浅层 runtime package。
  - **Failure contract:** collision 重试；无效、过期、重放、topology 不符在写入前失败；settled child 无有效 receipt 仍失败；timeout 不证明 prompt 未送达；partial/tampered artifact 不可 collect；Owner 消失时保留现场并要求人工恢复。
  - **Public seams:** session 通过 `createProjectLifecycle`/retention；run、handoff 与 publication 通过目录 `index.ts` facade；Pi 组合通过 fake `ExtensionAPI` 与 review integration；skills 通过 validator 与行为测试。
- **Plan:**

  #### Slice 1: 独立收敛既有 Herdr 变更并保存 Task checkpoint
  **Goal:** 独立保存已确认 staged 变更，再建立完整 T-0116 checkpoint。
  **Requirements covered:** R8
  **Depends on:** none
  **Acceptance Criteria:**
  - [ ] Herdr 定向测试和 `npm test` 通过。
  - [ ] 三处 staged 变更独立提交；随后 Task checkpoint 只保存本记录。
  **Files and Seams:** 既有 `herdr.ts`、`shell-policy.test.ts`、`shell-semantics.test.ts`；`docs/task.md`。
  **Verification:** `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts tests/access-gate/access-decision/core/shell-policy.test.ts`；`npm test`。
  **Steps:** 1. 定向与全量验证。2. 单独提交 staged surface。3. 单独提交 Task checkpoint。

  #### Slice 2: Session-owned staging envelope
  **Goal:** staging 进入 `sessions/session-<random>/staging/`，保留清理与 retention 行为。
  **Requirements covered:** R3, R5–R7
  **Depends on:** Slice 1
  **Acceptance Criteria:**
  - [ ] public lifecycle seam 可观察 envelope、metadata、permissions 与 stagingRoot。
  - [ ] retention 只认领合法 session，保留 active、unknown、symlink 与 provenance mismatch。
  - [ ] 7 天、200 目录、500MB 行为保持。
  **Files and Seams:** `project-lifecycle.ts`、`staging-retention.ts` 及对应 runtime tests。
  **Verification:** `npm run test:file -- tests/access-gate/access-decision/runtime/project-lifecycle.test.ts tests/access-gate/access-decision/runtime/staging-retention.test.ts`。
  **Steps:** 1. 新行为 RED。2. 最小迁移 GREEN。3. 补齐 retention 安全回归并重构。

  #### Slice 3: Run Store 与原子 artifact publication
  **Goal:** Guidance facade 提供 reserve/put/bind/publish/status/collect。
  **Requirements covered:** R1–R7
  **Depends on:** Slice 1
  **Acceptance Criteria:**
  - [ ] 只操作预声明 slot，child API 不接受路径。
  - [ ] collision、symlink、owner mismatch、expiry、replay、concurrency、partial 与 tamper 均 fail closed。
  - [ ] artifact/receipt no-clobber，collect 同步核验并返回内容。
  **Files and Seams:** 新增 `packages/guidance/src/artifact-exchange/` 与 `tests/guidance/artifact-exchange/`。
  **Verification:** `npm run test:file -- tests/guidance/artifact-exchange/*.test.ts`。
  **Steps:** 1. reserve/manifest RED→GREEN。2. binding/capability/publication RED→GREEN。3. collect、并发和故障注入后重构。

  #### Slice 4: Pi capability composition 与 review integration
  **Goal:** Owner/child 仅看到角色工具，Herdr native Pi argument 激活 publisher，普通 review 不变。
  **Requirements covered:** R1, R2, R5, R7
  **Depends on:** Slice 3
  **Acceptance Criteria:**
  - [ ] 无 capability 不暴露 publisher；child capability session 不暴露 Owner authority。
  - [ ] Herdr Pi flag 与 workspace/pane 环境可核对 binding。
  - [ ] review 普通 `write` 仍拒绝，capability publish/Owner collect 成功。
  - [ ] Guidance 与 root manifests 各加载 Artifact Exchange 一次。
  **Files and Seams:** Guidance/root manifests、`types/pi-coding-agent.d.ts`、artifact Pi composition tests、package tests。
  **Verification:** `npm run test:file -- tests/guidance/artifact-exchange/pi-composition.test.ts tests/validate-packages.test.ts`。
  **Steps:** 1. role/flag RED。2. 最小注册并验证 Herdr tracer。3. review integration RED→GREEN。

  #### Slice 5: Handoff Store 与 Prompt Surface
  **Goal:** handoff 使用 transfer lifecycle；delegation/review/grill/preflight 使用 run contract。
  **Requirements covered:** R1, R3, R4, R6, R7
  **Depends on:** Slice 3, Slice 4
  **Acceptance Criteria:**
  - [ ] Handoff Store 原子发布 manifest、handoff、receipt，successor 可按路径核验读取。
  - [ ] `agent read` 只保留诊断用途，不再创建按 skill 命名的顶层目录。
  - [ ] 既有审批、worktree、清理与唯一 Owner 守卫保持完整。
  **Files and Seams:** 新增 `packages/guidance/src/handoff-store/` 与 tests；修改 `herdr`、`code-review`、`change-preflight`、`grill-docs`、`handoff-session` skills。
  **Verification:** `npm run test:file -- tests/guidance/handoff-store/*.test.ts tests/validate-skills.test.ts`；`npm run validate-skills`。
  **Steps:** 1. handoff seam RED→GREEN。2. 建立 instruction 语义清单。3. 重写路径/交接并验证守卫。

  #### Slice 6: Durable records、文档与最终验证
  **Goal:** 长期合同、当前事实和用户文档与实现一致，完成审查闭环。
  **Requirements covered:** R1–R8
  **Depends on:** Slice 2, Slice 4, Slice 5
  **Acceptance Criteria:**
  - [ ] D-075、D-086、D-088 与新 capability Decision 形成单一合同。
  - [ ] `CONTEXT.md`、README、traceability 与 package docs 无旧生产路径或能力陈述。
  - [ ] `npm test`、doc-sync、security review、preflight 与独立 review 无 blocker。
  **Files and Seams:** `docs/decisions.md`、`CONTEXT.md`、README、traceability、适用 instructions 与全量测试。
  **Verification:** `npm test`。
  **Steps:** 1. 更新 Decisions/current truth。2. doc-sync 与 security review。3. 全量验证、preflight、独立 review，修改后重入闭环。
- **Evidence:** Herdr 0.9.0 官方合同提供 native arguments、settled state 与 terminal read，但没有结构化 artifact API；Pi extension 合同提供 custom tool、custom flag、session identity 与动态 tool activation。当前仓库只有 Access Gate staging lifecycle，且 `review` 正确拒绝普通写入。
- **Out of Scope:**
  - **自动回收 run、handoff、Herdr 资源或未合并 commit:** 需要终态、跨重启 reconciliation 与 commit-preservation，仍由 C-034 承载。Revisit when 用户显式采纳该生命周期。
  - **异步 child/mailbox:** 当前只实现 D-075 同步 fork-join。Revisit when C-031 被采纳或同步 join 有实证不足。
  - **父子 Policy 传播或普通 child 能力分层:** capability 只授权单次结果发布。Revisit when C-009 被采纳或宿主提供策略 seam。
  - **二进制、流式或多段 artifact:** 当前结果可用 bounded UTF-8 文本表达。Revisit when出现真实非文本需求。
  - **旧 `/tmp/akeel` 内容迁移或删除:** 来源与 owner 无法统一证明。Revisit only with explicit inventory and cleanup approval.
  - **跨 Owner session 自动 adoption:** 会破坏唯一 Owner。Revisit when replacement-owner recovery 获得设计批准。
  - **多用户、恶意同 uid 隔离或完整 TOCTOU 消除:** 当前不提供 OS sandbox/fd broker。Revisit under C-008/C-021 evidence or a host seam.
- **Durable updates:**
  - [ ] 更新或 supersede D-075、D-086、D-088，并记录 artifact capability Decision。
  - [ ] 同步 `CONTEXT.md` Glossary、Architecture、Active Decisions 与 Negative Space。
  - [ ] 同步 Prompt Surface、README、traceability 和 package manifests。

## T-0117: 待创建
