# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-065: Canonical Compilation 与 Content Flow 归属重做

**Kind:** refactor
**Status:** draft
**Goal:** 将规范化编译结果设为操作事实的唯一来源，使既有 `CompleteAccessPlan` 与 Static Content Flow Graph 都由新架构分别适配生成，而不是由 Content Flow 反向兼容既有 compiler。

### Architecture

本任务只记录设计，不实施代码。当前 `content-flow-redesign` 分支基于 `ef026a4`；原 `cfc8071` 保存在 `archive/cfc8071-shadow`，而 `main` 仍保留原提交，作为未改写的工作基线。新设计不以旧 compiler 作为 Content Flow 的输入，不以 parity facade 包裹旧 compiler，也不要求调用方从旧 plan 手工建立 operation registry。

新增一个位于现有 `gate/` 与 Content Flow 之间的中性 Canonical Compilation 层。Shell/Direct 的解析、语义分析、路径意图、cwd 候选和归约结果在该层形成规范化 facts；该层同时向两个独立领域提供输出：Legacy Plan Adapter 生成既有 `CompleteAccessPlan`，Static Flow Adapter/Composer 生成 sealed `StaticFlowGraph`。旧的 compiler API 若继续保留，只能作为新 canonical 层的适配输出，不能继续拥有事实来源地位。

```text
Shell / Direct request
          |
          v
Canonical Compilation
  - ordered AccessOperation facts
  - operation identity/reference binding
  - static flow contributions
  - compilation metadata
          |
          +----------------------+----------------------+
          v                      v                      v
Legacy Plan Adapter       Static Flow Composer      future adapters
          |                      |
          v                      v
CompleteAccessPlan       Sealed Static Flow Graph
          |
          v
existing Policy Kernel / Gate
```

`CompleteAccessPlan` 与 Static Flow Graph 仍然是两个独立决策域。Canonical Compilation 可以共享规范化 operation facts，但不把 Graph、runtime Evidence、payload、authorization、receipt、Profile 或 GateDecision 塞进 plan，也不让 Static Flow Graph 推导 command/path 语义。跨 Boundary link 仍由明确的 Composition Root 声明；Boundary、Port、URL、path、时间、registry insertion order 都不能作为 operation identity 或授权事实的推导来源。

### Design Alternatives

#### A. Canonical Compilation 双适配输出（推荐）

Canonical Compilation 生成一次规范化结果；Legacy Plan Adapter 和 Static Flow Adapter 分别消费同一结果。既有 compiler 函数可以暂时保留，但其内部只负责调用 canonical 层并将结果适配为旧返回类型。

**优点：**事实来源单一；Shell/Direct 可共享；旧 Gate 的 plan 形状与 Flow Graph 的领域边界保持独立；不需要生产 parity comparison，也不需要调用方手工维护 registry。

**代价：**需要把当前 Shell/Direct draft 逻辑拆到中性层，并重新定义错误、身份和 sealing 的边界；旧 plan adapter 与 Flow adapter 需要各自测试。

#### B. Static Flow Graph 作为唯一来源

先构造 Graph，再从 Graph 推导 `CompleteAccessPlan`。

**不采用原因：**Graph 只有 opaque operation references 与静态流关系，不能自然承载 plan 的 `resourceUsage`、compiler metadata、plan coverage 和既有 sealing 约束；从 Boundary/Port 反推 command/path semantics 会混淆 Content Flow 与 Operation Admission。

#### C. 保留 `integrateStaticFlow()` 作为旧 compiler 的 shadow facade

旧 compiler 先生成 `CompleteAccessPlan`，调用方再提供 assembly 和 registry，Content Flow 最后对账。

**不采用原因：**旧 compiler 继续拥有事实来源；新架构只能证明自己复刻旧结果，无法接管旧代码；registry 是从旧 plan 反向重建的测试支架，不是稳定的生产边界；parity comparison 会成为永久适配层而不是迁移阶段工具。

### Out of Scope

- **本任务不实现 runtime Content Flow capability：** 不创建或启用 Publication、Network Send、Process Start、File Commit checkpoint、Payload Lease、Evidence Ingress、Artifact lineage、authorization、enforcement 或 receipt；这些需要真实 host/enforcement seam 的独立任务。
- **本任务不把 Graph 放进 `CompleteAccessPlan`：** 两者继续保持独立类型、验证器、品牌和生命周期；共享只限于 canonical operation facts。
- **本任务不改变 Profile、config、shellPolicy、pathPolicy、command classification 或现有 `network` effect：** 新架构先改变事实归属和适配方向，不借此引入新的授权语义。
- **本任务不承诺保留全部旧 compiler 入口：** 是否保留 `compileShellCall()`、`compileDirectToolCall()` 和 `compileToolCall()`，由迁移阶段根据实际消费者决定；若保留，它们是 compatibility surface，而不是 canonical architecture。
- **本任务不从 `cfc8071` 直接修补：** archived shadow 实现、operation projection registry、integration facade 和对应 parity tests 不作为新生产接口；有价值的验证场景可以迁移为 canonical/adapter 测试。

### Proposed Contracts

以下接口是待确认的设计草案，不是当前代码契约。

```ts
interface CanonicalCompilation {
  readonly operations: readonly AccessOperation[];
  readonly operationRefs: readonly string[];
  readonly flow: CanonicalFlowFacts;
  readonly metadata: CanonicalCompilationMetadata;
}

interface CanonicalFlowFacts {
  readonly contributions: readonly BoundaryContribution[];
  readonly links: readonly LinkDeclaration[];
}

interface CanonicalCompilationMetadata {
  readonly source: "bash" | ToolSurface;
  readonly projectRoot: string;
  readonly stagingDir: string;
  readonly inputLength: number;
  readonly coverage: PlanCoverage;
  readonly expansion?: ExpansionData;
}

type CanonicalCompileResult =
  | { readonly kind: "complete"; readonly compilation: CanonicalCompilation }
  | CompilationReject;
```

需要在设计确认时解决的边界：

1. **operation identity：** canonical compiler 在生成 operation 时同时生成稳定的内部 reference；reference 只绑定同一份 canonical result，不从 path、命令名或 registry 顺序推导。
2. **Flow contribution 的来源：** Shell/Direct canonical compiler 负责生成自身可证明的局部 contribution；Composition Root 负责显式补充跨 Boundary links，不由 adapter 猜测。
3. **错误归属：** Shell/Direct 无法安全解析时仍返回既有 compilation reject；canonical result 完成但 Graph assembly 失败时，失败属于 Flow adapter，不得改写为 plan permit 或重新解释为 GateDecision。
4. **sealing：** canonical result 不直接伪装成 `CompleteAccessPlan` 或 sealed Graph；Legacy Plan Adapter 与 Composer 各自复制、验证并 sealing，避免一个领域的 brand 被另一个领域接受。
5. **旧 API 策略：** 先盘点仓库内和分发面消费者；若保留旧入口，测试必须证明它调用 canonical 层，而不是 canonical 层调用它。若没有外部消费者，允许在同一迁移中删除旧入口并迁移测试。

### Proposed Implementation Slices

#### Slice 1: 锁定 canonical contract（只写测试与类型）

**Files:**
- Create: `src/access-gate/canonical-compile/types.ts`
- Create: `src/access-gate/canonical-compile/index.ts`
- Test: `tests/access-gate/canonical-compile/contract.test.ts`
- Modify: `docs/task.md`（仅在设计确认后补充执行证据）

**Interface:** 定义 `CanonicalCompilation`、`CanonicalFlowFacts`、`CanonicalCompilationMetadata` 和 `CanonicalCompileResult`。测试通过 public index 验证操作顺序、operation reference 绑定、独立 Flow facts 和 reject 形状；不导入 Profile、Policy Kernel 或旧 `CompleteAccessPlan` brand。

**Acceptance:** 类型和测试明确 canonical result 不包含 decision、authorization、runtime evidence 或 Graph writer；Shell/Direct 都能表达同一 ordered operation facts。

#### Slice 2: 提取 Shell/Direct canonical compiler

**Files:**
- Create/Modify: `src/access-gate/canonical-compile/shell.ts`
- Create/Modify: `src/access-gate/canonical-compile/direct.ts`
- Modify: `src/access-gate/gate/plan/shell-compiler.ts`
- Modify: `src/access-gate/gate/plan/direct-tool-compiler.ts`
- Test: `tests/access-gate/canonical-compile/shell.test.ts`
- Test: `tests/access-gate/canonical-compile/direct.test.ts`

**Interface:** 将现有 lexer/parser、command semantics、path intents、cwd candidates、for reduction 和输入限制复用到 canonical 层；canonical 层只返回 canonical result 或 compilation reject。旧 `compileShellDraft()` / `compileDirectToolDraft()` 不再作为 Content Flow 的输入。

**Acceptance:** Shell inspect、Shell hard-path、Shell command ask、Direct read、Direct write 和归约场景的 operation facts 与既有语义一致；但测试比较的是 canonical facts，不是由旧 plan 反向生成的 registry。

#### Slice 3: 让旧 Plan API 适配 canonical result

**Files:**
- Modify: `src/access-gate/gate/plan/compiler-entry.ts`
- Modify: `src/access-gate/gate/plan/builder.ts` 或新建 `src/access-gate/gate/plan/legacy-plan-adapter.ts`
- Modify: `src/access-gate/gate/plan/index.ts`
- Test: `tests/access-gate/plan/access-request.test.ts`
- Test: `tests/access-gate/decision/gate-policy-matrix.test.ts`

**Interface:** `compileShellCall()`、`compileDirectToolCall()` 和 `compileToolCall()`（若确认保留）调用 canonical compiler，再由 Legacy Plan Adapter 生成并 sealing `CompleteAccessPlan`。Kernel、Profile 和 renderer 不改接口。

**Acceptance:** 旧入口的所有现有 decision、brand、冻结状态、coverage、resourceUsage 和 reject evidence 保持明确测试覆盖；静态依赖检查证明 canonical compiler 不依赖 legacy plan adapter。

#### Slice 4: 从 canonical flow facts 组装 Static Flow Graph

**Files:**
- Create/Modify: `src/access-gate/content-flow/static-flow/composer.ts`
- Create/Modify: `src/access-gate/content-flow/static-flow/types.ts`
- Create/Modify: `src/access-gate/content-flow/static-flow/index.ts`
- Create/Modify: `src/access-gate/content-flow/flow-adapter.ts`
- Test: `tests/access-gate/content-flow/static-flow.test.ts`
- Test: `tests/access-gate/content-flow/flow-adapter.test.ts`

**Interface:** Flow adapter 接收 canonical compilation 的 flow facts 和明确的 Composition Root links，调用唯一 Composer/sealing boundary，返回 sealed Graph。operation refs 直接来自 canonical result；不接收旧 `CompleteAccessPlan`、Profile 或外部 registry，不重新推导操作语义。

**Acceptance:** contribution/link budget、unknown coverage、immutability、sealing、显式跨 Boundary link 和 malformed input 通过 public seam 验证；Graph assembly 失败不会生成 partial Graph，也不会改变 plan adapter 的结果。

#### Slice 5: 删除 shadow facade 并验证双适配输出

**Files:**
- Delete or replace: `src/access-gate/content-flow/integration/`
- Delete or replace: `src/access-gate/content-flow/operation-projection/`
- Delete or migrate: `tests/access-gate/content-flow/integration.test.ts`
- Delete or migrate: `tests/access-gate/content-flow/operation-projection.test.ts`
- Create/Modify: `tests/access-gate/content-flow/canonical-parity.test.ts`

**Interface:** 新测试从同一个 canonical compilation 分别调用 Legacy Plan Adapter 与 Flow Adapter，验证两种输出共享 operation facts 但不共享领域对象；不再测试“旧 compiler 结果 + registry + Graph 的事后 parity facade”。

**Acceptance:** 仓库中不存在 Content Flow 调用 `compileShellCall()` / `compileDirectToolCall()` 的生产路径；不存在从旧 plan 反向建立 operation registry 的生产接口；未调用 Flow adapter 时旧 Gate 行为仍由 canonical→plan adapter 直接提供。

#### Slice 6: 文档与验证收尾

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/decisions.md`
- Modify: `docs/task.md`

**Interface:** 只在实现和验证完成后，把已确认的架构事实提炼进 `CONTEXT.md`，把已采纳的长期取舍记录进 `docs/decisions.md`，并清理本 Task Record 的过程内容；在此之前不把本草案写成 active Decision。

**Acceptance:** `npm test`、`tsc --noEmit`、文档校验、import-boundary 检查、`git diff --check` 和安全边界审查均有 fresh evidence；没有 runtime capability 或授权语义被误报为已实现。

### Confirmation Points

在实施前需要用户确认以下取舍：

- 是否采用 **Canonical Compilation 双适配输出** 作为唯一目标，拒绝 Graph→Plan 和旧 compiler→Flow 两种方向。
- 旧 `compileShellCall()` / `compileDirectToolCall()` / `compileToolCall()` 是暂时保留为薄适配入口，还是在本次迁移中直接删除并迁移消费者。
- canonical 层是否直接复用现有 `AccessOperation`、`PlanCoverage`、`ExpansionData` 类型，还是先建立完全中性的 facts 类型再由两个 adapter 映射。
- Static Flow Graph 的跨 Boundary links 由哪个 Composition Root 提供，以及本任务是否只实现编译期局部 contribution、不实现任何 runtime checkpoint。
- 是否允许把 archived `cfc8071` 的静态 composer 校验测试迁移到新接口；不迁移其 integration facade、registry projection 和“旧 plan 是 source of truth”的文档结论。

### Evidence

尚未实施；本记录只完成 Git 分支整理和设计草案落档，不声明任何代码、测试或架构迁移已经完成。

### Durable Updates Checklist

- [ ] 用户确认 canonical ownership 与旧 API 适配策略。
- [ ] 根据确认结果更新本 Task Record，并在实施前形成无歧义的接口与文件计划。
- [ ] 仅在验证完成后更新 `CONTEXT.md` 与 `docs/decisions.md`。
- [ ] 清除 archived shadow 方案在当前文档中的 active/approved 表述。

## T-069: 待创建
