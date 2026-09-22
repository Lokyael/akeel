# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0163: Pi 0.87 集成现代化

- Kind: maintenance
- Status: in-progress
- Reversal surface: engineering

### Goal

将 AKeel 的 Pi 集成基线升级到 0.87.0，并修复已确认的现代 API、工具 schema、session quota 与生命周期缺口。

### Requirements

- 将开发与归档验证基线升级到 `@earendil-works/pi-coding-agent@0.87.0`，并同步 Pi 溯源记录。
- 将 Guidance 自定义工具的字符串枚举改为 Pi 推荐的 `StringEnum` schema，同时保留 action-specific 运行时校验。
- 为 AKeel 自定义工具提供简洁的 `promptSnippet` 与 `promptGuidelines`，不复制全局原则或安全合同。
- 使 Artifact Exchange 的每-session run quota 在 Pi reload、resume 与 extension 重建后仍然有效。
- 避免 Artifact Exchange 在 extension factory 阶段创建 runs 根目录。
- 保持 `before_agent_start` 的 section patch、`context` 的模型视图投影、Access Gate 的 unknown runtime validation、user_bash 排除边界和 session handoff 的 fresh replacement context。
- 增加覆盖 Pi 0.87 prompt/session/context/schema/lifecycle 合同的回归测试。
- 更新受影响的 `docs/traceability.md`，不改变当前 CONTEXT 架构或安全边界。

### Design

- 开发依赖精确锁定 0.87.0；能力包继续按 Pi package 规则使用 `peerDependencies: "*"`。
- 字符串枚举使用 `@earendil-works/pi-ai` 的 `StringEnum`；复杂 handoff discriminated union 先保留，使用 schema 证据决定是否进一步拆分。
- Artifact quota 以 Pi session custom entry 作为持久 authority，extension-local Map 只不再承担 quota 真相；reserve 工具保持 sequential。
- Artifact Exchange 根目录惰性创建，首次实际 artifact 操作时建立受控目录。
- 不采用 `context_with_system`、`ContextEditEntry` 或 `user_bash` enforcement，因为它们超出当前已批准合同。

### Out of Scope

- **user_bash enforcement**：改变 AKeel 明确的模型 tool-call 权限边界；仅在用户批准新的安全决策后重新讨论。
- **context_with_system / ContextEditEntry migration**：当前 context-pruner 只做临时模型视图投影；仅在需要持久 context omission 时重新讨论。
- **顶层 handoff object-union 拆分**：当前证据只确认字符串枚举问题；待 provider schema matrix 提供拒绝证据后再处理。
- **P2 UI renderer 与 headless 输出重构**：不影响本次 Pi 0.87 核心集成和安全合同；在新增 host-mode 输出需求时重新讨论。

### Plan

#### Slice 1: Pi 0.87 基线与 schema contract

**Goal:** 依赖、溯源和自定义工具 schema 以 Pi 0.87 作为可验证基线。
**Requirements covered:** Pi 0.87 baseline; StringEnum schema; traceability.
**Depends on:** none

**Acceptance Criteria:**
- [x] lockfile resolves Pi 0.87.0 and matching Pi core packages.
- [x] Guidance string enum schemas emit provider-compatible `enum` values rather than `anyOf`/`const` patterns.
- [x] Package archive smoke validation stages the required Pi 0.87 host packages.
- [x] `docs/traceability.md` records the current Pi release and revision.

**Files and Seams:**
- Modify: `package.json`, `package-lock.json`, `packages/guidance/package.json`, `scripts/validate-package-archives.ts`.
- Modify: `packages/guidance/src/artifact-exchange/pi-composition.ts`.
- Test: `tests/guidance/artifact-exchange/pi-composition.test.ts`, `tests/validate-packages.test.ts`.

**Verification:**
- `npm run test:file -- tests/guidance/artifact-exchange/pi-composition.test.ts tests/validate-packages.test.ts`
- `npm test`

**Steps:**
1. Add failing schema and archive-host tests.
2. Upgrade the exact Pi dependency and matching lockfile graph.
3. Migrate string enum schema definitions and add the required Pi AI peer host.
4. Update archive staging and traceability, then run focused and full validation.

#### Slice 2: Durable Artifact Exchange quota and lazy lifecycle

**Goal:** Per-session run limits survive extension reconstruction and no artifact root is created during passive extension loading.
**Requirements covered:** durable run quota; lazy factory lifecycle.
**Depends on:** Slice 1

**Acceptance Criteria:**
- [x] Loading the extension without artifact operations does not create the runs root.
- [x] A session cannot exceed the run limit after the extension is reconstructed with the same session entries and session ID.
- [x] Existing owner/capability/receipt behavior remains unchanged.

**Files and Seams:**
- Modify: `packages/guidance/src/artifact-exchange/index.ts`, `packages/guidance/src/artifact-exchange/pi-composition.ts`.
- Test: `tests/guidance/artifact-exchange/artifact-exchange.test.ts`, `tests/guidance/artifact-exchange/pi-composition.test.ts`.

**Verification:**
- `npm run test:file -- tests/guidance/artifact-exchange/artifact-exchange.test.ts tests/guidance/artifact-exchange/pi-composition.test.ts`
- `npm test`

**Steps:**
1. Add failing tests for passive load and same-session reconstruction quota.
2. Make root initialization lazy.
3. Persist and restore reservation authority through session custom entries while keeping the exchange filesystem contract bounded.
4. Run focused and full validation.

#### Slice 3: Prompt, context, handoff, and latest-host integration regression coverage

**Goal:** Existing modern Pi integrations are explicitly protected against 0.87 lifecycle changes.
**Requirements covered:** prompt patch; context projection; session handoff; latest-host validation.
**Depends on:** Slice 1 and Slice 2

**Acceptance Criteria:**
- [x] Custom tools expose concise modern prompt metadata.
- [x] Pi 0.87 runtime preserves AKeel prompt sections and active tool declarations through context projection and session replacement.
- [x] Handoff remains correct when newer session entry types are present.
- [x] Full package archive and public runtime tests execute against the updated host baseline.

**Files and Seams:**
- Modify: `packages/guidance/src/artifact-exchange/pi-composition.ts`.
- Test: `tests/guidance/bootstrap/bootstrap.test.ts`, `tests/context-pruner/index.test.ts`, `tests/guidance/artifact-exchange/pi-composition.test.ts`, `tests/pi-host/integration.test.ts`.

**Verification:**
- `npm test`
- `npm run validate:package-archives`

**Steps:**
1. Add failing assertions for tool prompt metadata and Pi 0.87 context/session behavior.
2. Add only the metadata and integration fixtures required by those assertions.
3. Run focused tests, then full validation and record the final checkpoint.

### Durable-update checklist

- [x] Update `docs/traceability.md` for Pi 0.87.0 and its fixed git revision.
- [x] Re-check `CONTEXT.md` architecture and Negative Space; do not add process history.
- [x] Validate all Project Record containers.
- [ ] Clear this Task in the completion change after all verification passes.

## T-0164: 待创建