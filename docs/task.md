# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-069: Canonical Compilation 重建与旧架构移除

**Kind:** refactor
**Status:** draft
**Goal:** 以 Canonical Compilation 作为唯一事实来源，直接重建 Operation Admission plan 与 Static Flow Graph，并删除既有 compiler API、旧 plan 模块和 cfc8071 shadow integration，不保留兼容入口或旧模块。

### Architecture

本记录完成设计落档，不实施代码。D-059 已记录本次 breaking migration 的事实归属和旧架构移除结论。当前分支 `content-flow-redesign` 基于 `ef026a4`；`archive/cfc8071-shadow` 和当前 `main` 保留 cfc8071 的完整历史，仅作参考，不属于新实现的兼容目标。

Shell/Direct 的解析、语义分析、路径意图、cwd 候选、for reduction、资源预算和 compilation reject 全部迁移到新的 `src/access-gate/canonical-compile/`。该模块一次生成 ordered canonical operation facts、Operation Admission 所需 metadata 和静态 Flow contribution facts。新 Operation Admission plan 直接从 canonical result 生成；Static Flow Composer 直接消费 canonical flow facts、显式 Composition Root links，并且是唯一的 Graph writer/sealing boundary。

```text
Shell / Direct request
          |
          v
Canonical Compilation
  - ordered operation facts
  - plan metadata
  - local flow contribution facts
  - stable internal operation references
          |
          +-------------------------------+
          v                               v
Operation Admission Plan           Static Flow Composer
          |                               |
          v                               v
new sealed admission plan         sealed Static Flow Graph
          |                               |
          v                               v
Policy Kernel                      future Content Flow consumers
```

新 plan 与 Static Flow Graph 是独立领域对象：共享同一 canonical result 中的事实，但不共享 brand、validator、lifecycle、Profile、GateDecision、runtime Evidence、payload、authorization 或 receipt。Graph 不从 Boundary、Port、path、URL、时间或 insertion order 推导 operation semantics；跨 Boundary link 始终由明确的 Composition Root 声明。

旧的 `src/access-gate/gate/plan/` compiler、`CompleteAccessPlan`、`compileShellCall()`、`compileDirectToolCall()`、`compileToolCall()`、旧 plan brand/verifier，以及 cfc8071 的 `content-flow/integration/`、`operation-projection/`、外部 `OperationRegistry` 和 parity shadow 都不保留。仓库内消费者、Kernel、renderer、host 和测试在同一次 breaking migration 中改用新 public seam；不提供 shim、re-export、deprecated wrapper 或 runtime migration path。

### Design Alternatives

#### A. Canonical Compilation + 直接 plan/graph 生成（采用）

Canonical Compilation 是唯一事实来源；新的 Operation Admission plan 和 Static Flow Graph 各自直接从 canonical result 构建。Static Flow Composer 直接承担 contribution composition、link validation、budget、unknown propagation、deep-freeze 和 sealing。

**Why:** 每一种事实只生成一次；新调用方不接触旧类型或 registry；Graph Composer 是有独立领域职责的深模块，plan builder 与 Graph Composer 都不充当兼容 adapter。

#### B. 保留旧 plan/API 并由 canonical 层投影（不采用）

保留 `CompleteAccessPlan` 和旧 compiler API，让它们调用 canonical compiler。

**Why rejected:** 用户明确不保留旧 API 或旧模块；即使事实来源倒置，旧模块、双类型和双入口仍构成无收益的兼容表面，并会让未来消费者继续依赖旧架构。

#### C. 新增独立 Static Flow Adapter（不采用）

在 Canonical Compilation 和 Composer 之间建立 `flow-adapter.ts`。

**Why rejected:** canonical result 已提供最小 flow contribution facts，Composer 可直接消费；单纯转发层没有组合、验证、sealing 或领域转换职责，是 shallow module。

#### D. Static Flow Graph 作为唯一来源（不采用）

先构造 Graph，再从 Graph 推导 Operation Admission plan。

**Why rejected:** Graph 的 opaque operation references 与 topology 不包含 plan metadata、资源统计、coverage、reject evidence 和 admission 语义；通过 Boundary/Port 反推 command/path semantics 会混淆两个决策域。

#### E. cfc8071 的旧 compiler → Flow parity shadow（不采用）

旧 compiler 先生成 plan，调用方再提供 assembly 和 registry，Content Flow 最后对账。

**Why rejected:** 旧 compiler 仍是事实来源；生产接口要求调用方从旧 plan 反向建 registry；parity facade 只能验证复刻，无法实现架构接管。

### Out of Scope

- **Runtime Content Flow capability：** 不创建 Publication、Network Send、Process Start、File Commit checkpoint、Payload Lease、Evidence Ingress、Artifact lineage、authorization、enforcement 或 receipt。只有真实 host/enforcement seam 可测试且失败默认值锁定后，才可另立 Task。
- **新的授权规则：** 不在本任务改变 Profile、config、shellPolicy、pathPolicy、command classification 或 `network` effect 的决策语义；该任务只替换事实生成与模块结构。
- **旧 API/模块兼容：** 不发布 deprecation wrapper、re-export、shim、dual write、dual reader 或 runtime migration path；旧实现和 API 在同一 migration 中移除。
- **修补 cfc8071：** 归档分支保留完整历史；新实现可迁移仍然成立的领域约束和测试场景，但不迁移旧 integration facade、registry projection、旧 compiler 事实来源或它们的文档结论。

### Proposed Contracts

以下是待实施前复核的目标接口；它们描述新架构，不兼容旧 `CompleteAccessPlan`。

```ts
interface CanonicalCompilation {
  readonly operations: readonly CanonicalOperation[];
  readonly plan: CanonicalPlanFacts;
  readonly flow: CanonicalFlowFacts;
}

interface CanonicalPlanFacts {
  readonly source: CanonicalSource;
  readonly projectRoot: string;
  readonly stagingDir: string;
  readonly inputLength: number;
  readonly coverage: CanonicalCoverage;
  readonly expansion?: CanonicalExpansion;
}

interface CanonicalFlowFacts {
  readonly contributions: readonly BoundaryContribution[];
}

interface StaticFlowCompositionInput {
  readonly compilation: CanonicalCompilation;
  readonly links: readonly LinkDeclaration[];
  readonly limits: StaticAssemblyLimits;
}

type CanonicalCompileResult =
  | { readonly kind: "complete"; readonly compilation: CanonicalCompilation }
  | CanonicalCompilationReject;
```

Required boundaries:

1. **Operation identity:** Canonical Compilation creates internal opaque references while it creates each operation. A reference is only valid within its sealed canonical result and is never inferred from path, command name, port name, URL, time or collection order.
2. **Local Flow facts:** Shell/Direct canonical compilers generate only their own provable local contributions. The Composition Root supplies explicit cross-Boundary links. Neither plan generation nor Composer invents a relation.
3. **Failure categories:** parse/preflight/resource failures return `CanonicalCompilationReject`; Graph composition failures return closed flow composition failures and never become an admission permit, Profile result or partial Graph.
4. **Sealing:** Canonical result, admission plan and Graph have distinct validators, brands and immutable copies. No domain accepts another domain's sealed object as its own proof.
5. **Public surface:** callers consume only `canonical-compile` and the new plan/flow public indexes. No public export retains an old compiler function, `CompleteAccessPlan`, `OperationRegistry`, integration facade, compatibility type alias or old plan module path.

### Proposed Implementation Slices

#### Slice 1: Define new canonical and admission contracts

**Files:**
- Create: `src/access-gate/canonical-compile/types.ts`
- Create: `src/access-gate/canonical-compile/index.ts`
- Create: `src/access-gate/admission-plan/types.ts`
- Create: `src/access-gate/admission-plan/index.ts`
- Test: `tests/access-gate/canonical-compile/contract.test.ts`
- Test: `tests/access-gate/admission-plan/contract.test.ts`

**Interface:** Define new `CanonicalOperation`, canonical metadata, flow facts, reject types, new sealed admission plan and their public indexes. Do not import any old `gate/plan` type or symbol.

**Acceptance:** Tests prove ordered operation facts, reference binding, closed reject shape, immutable sealing and domain separation. No new type exports Profile, GateDecision, runtime Evidence, payload, authorization, receipt or Graph writer.

#### Slice 2: Move Shell and Direct compilation into Canonical Compilation

**Files:**
- Create: `src/access-gate/canonical-compile/shell.ts`
- Create: `src/access-gate/canonical-compile/direct.ts`
- Create/Modify: `src/access-gate/canonical-compile/builder.ts`
- Create/Modify: `src/access-gate/canonical-compile/preflight.ts`
- Delete after migration: `src/access-gate/gate/plan/shell-compiler.ts`
- Delete after migration: `src/access-gate/gate/plan/direct-tool-compiler.ts`
- Delete or migrate: old plan compiler tests
- Test: `tests/access-gate/canonical-compile/shell.test.ts`
- Test: `tests/access-gate/canonical-compile/direct.test.ts`

**Interface:** Reuse lexer/parser, command semantics, path intent, cwd analysis, for reduction and input limits, but produce only canonical result or canonical reject. Shell/Direct complete facts must include all information required by both new admission plan generation and local Flow contributions.

**Acceptance:** Shell inspect, hard-path, command ask, Direct read/write and reduction scenarios are tested through canonical public functions; no test calls old compiler APIs.

#### Slice 3: Build the new Operation Admission plan and migrate consumers

**Files:**
- Create: `src/access-gate/admission-plan/build.ts`
- Create: `src/access-gate/admission-plan/seal.ts`
- Create: `src/access-gate/admission-plan/verifier.ts`
- Modify: `src/access-gate/gate/decision/`
- Modify: `src/access-gate/gate/host.ts`
- Modify: `src/access-gate/gate/index.ts`
- Delete: `src/access-gate/gate/plan/`
- Delete or migrate: `tests/access-gate/plan/`
- Test: `tests/access-gate/admission-plan/`
- Test: `tests/access-gate/decision/`

**Interface:** Build the new sealed admission plan directly from `CanonicalCompilation`; migrate Kernel, renderer and host to the new plan guard/types. Remove all imports, exports and tests for `CompleteAccessPlan`, old plan brands and old compiler entry points.

**Acceptance:** Existing admission behavior (hard deny, ask, allow, evidence and renderer output) is asserted via the new public seam; static dependency checks confirm no source file imports `gate/plan` or an old compiler name.

#### Slice 4: Add Static Flow Composer directly over canonical facts

**Files:**
- Create: `src/access-gate/content-flow/static-flow/types.ts`
- Create: `src/access-gate/content-flow/static-flow/composer.ts`
- Create: `src/access-gate/content-flow/static-flow/views.ts`
- Create: `src/access-gate/content-flow/static-flow/index.ts`
- Test: `tests/access-gate/content-flow/static-flow.test.ts`

**Interface:** `assembleStaticFlowGraph(input: StaticFlowCompositionInput)` directly receives a canonical compilation plus explicit links and limits. Composer is the only Graph writer and sealer; it validates contribution/link shape, operation-reference validity, budgets, duplicate/conflicting identities and unknown coverage, then publishes deeply immutable facet views.

**Acceptance:** Tests cover explicit content/control links, malformed local facts, malformed references, link incompatibility, duplicate identities, budgets, unknown propagation and no partial graph. No `flow-adapter.ts`, `integrateStaticFlow()`, `OperationRegistry` or old plan import exists.

#### Slice 5: Remove every old public/API/module surface and migrate tests

**Files:**
- Delete: `src/access-gate/gate/plan/`
- Delete: any old compiler re-exports from `src/access-gate/gate/`
- Do not create: `src/access-gate/content-flow/integration/`
- Do not create: `src/access-gate/content-flow/operation-projection/`
- Delete or migrate: all tests named for old plan compiler, integration facade or operation projection
- Modify: all remaining imports under `src/` and `tests/`

**Interface:** The repository exposes only canonical compilation, new admission plan and Static Flow Composer surfaces. All consumers import these new surfaces; no compatibility alias or retained module path remains.

**Acceptance:** repository-wide source/import scans find no `CompleteAccessPlan`, `compileShellCall`, `compileDirectToolCall`, `compileToolCall`, `gate/plan`, `OperationRegistry`, `projectOperations`, `integrateStaticFlow`, `content-flow/integration` or `content-flow/operation-projection` outside archival Git history.

#### Slice 6: Validate and synchronize durable documents

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/decisions.md`
- Modify: `docs/task.md`

**Interface:** Only after implementation and fresh validation, describe the new canonical ownership and current Static Flow capability in `CONTEXT.md`; retain D-059 as the durable decision; clear T-069 process content when its lifecycle completes.

**Acceptance:** Run `npm test`, `tsc --noEmit`, documentation validation, import-boundary scans, `git diff --check` and a security/boundary review. Do not claim runtime Content Flow capability or altered authorization semantics without independent evidence.

### Confirmed Direction

- Canonical Compilation is the sole fact source.
- No old API, old compiler module, old plan module, compatibility adapter or shadow facade remains.
- No separate Static Flow Adapter is created; Static Flow Composer directly consumes canonical flow facts.
- Static Flow Graph does not generate or contain the new admission plan.
- Runtime checkpoints and authorization remain outside this refactor.

### Evidence

No implementation has begun. Git branches were prepared, D-059 and this Task Record were written, and document validation was run successfully before this record was finalized.

### Durable Updates Checklist

- [x] Record canonical ownership, explicit old-module removal and no-compatibility decision in D-059.
- [x] Record the breaking migration design and remove the obsolete compatibility alternatives from this Task Record.
- [ ] Migrate source, tests and public exports according to the confirmed design.
- [ ] Verify the new architecture and then update `CONTEXT.md` from fresh evidence.
- [ ] Clear this completed Task Record according to its lifecycle.

## T-070: 待创建
