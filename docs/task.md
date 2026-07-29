# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-003: Access Plan outcome 收敛与运行时验证

**Kind:** refactor
**Status:** in-progress
**Goal:** 将 compiler 的完整计划、不可分析形式、安全阻断和输入错误建模为单一类型系统，并让 Policy Kernel 只消费经过 verifier 验证的计划。

### Architecture

保留现有 Shell IR 和 Direct tool schema，先将 `CompleteAccessRequest` 作为兼容名称迁移为 `CompleteAccessPlan`。compiler 返回带 `category` 的封闭 outcome；`evaluate.ts` 按 category 直接渲染，不再丢弃 compiler 分类后按 DecisionCode 猜测。完整计划的发行和完整性校验集中到 `access-plan-verifier.ts`，旧验证函数只作为兼容别名。

### Out of Scope

- **Shell glob 安全展开**：没有逐路径展开和 coverage 证明，继续 hard deny 并建议 Direct 工具。
- **自动 Shell-to-Direct 重写**：命令语义和输出格式可能改变，当前不定义等价性证明。
- **完整 Shell AST 替换**：保留现有 parser/IR，待本任务的 typed outcome 和 verifier seam 稳定后单独决策。
- **强制 Direct-only 路由**：Direct-first 仍是模型工具选择原则，不改变授权语义。

### Implementation Tasks

#### Task 1: Typed compiler outcome

**Files:** `src/access-gate/gate/access-request-types.ts`, `src/access-gate/gate/access-request.ts`, `tests/access-gate/access-request.test.ts`

- 新增 `CompilationCategory = "unsupported-form" | "security-block" | "invalid-request"`。
- 将 complete 分支命名为 `plan`，reject 分支保留 `kind: "reject"` 兼容外部测试，但增加不可省略的 `category`；删除 `failureKind`。
- `reject()` 通过唯一的 `compilationCategoryFor(code)` 构造 category。
- 测试 dynamic、threat、invalid input、resource limit 分别断言 category。

#### Task 2: Verified plan seam

**Files:** `src/access-gate/gate/access-plan-verifier.ts`, `src/access-gate/gate/access-request.ts`, `src/access-gate/gate/evaluate-request.ts`, `src/access-gate/gate/index.ts`

- 将完整 request 类型导出为 `CompleteAccessPlan`，保留 `CompleteAccessRequest` type alias。
- 新增 `isCompleteAccessPlan()`，集中执行现有 brand、WeakSet、freeze、coverage 和 budget 校验。
- `isCompleteAccessRequest()` 委托给 `isCompleteAccessPlan()`。
- Policy Kernel 通过 `isCompleteAccessPlan()` 验证输入。

#### Task 3: Outcome-to-host boundary

**Files:** `src/access-gate/gate/evaluate.ts`, `src/access-gate/gate/guidance-catalog.ts`, `src/access-gate/gate/render-decision.ts`, `tests/access-gate/guidance.test.ts`

- `evaluate.ts` 按 typed compilation category 直接进入 renderer，并保留内部 DecisionCode 作为结构化 code。
- unsupported-form 只允许恢复性静态文案；security-block 永远不提供替代入口；invalid-request 使用输入修正文案。
- 增加所有 DecisionCode 的分类覆盖测试。

#### Task 4: Full verification

- 运行各个新增测试并确认先 RED 后 GREEN。
- 运行 `npx tsc --noEmit`、完整 `npm test` 和 `git diff --check`。
- 新 Pi 会话验证实际加载的 extension 不再渲染旧 GuidanceId 和永久阻断文案。
- 将完成事实和未完成边界同步到 `CONTEXT.md`、`docs/decisions.md`、`docs/security-boundaries.md`，验证后清理本 Task Record。

### Current Evidence

- `npm test`：24 个技能校验和全部 Access Gate、Shell parser、command semantics、index、footer 测试通过。
- `npx tsc --noEmit`：通过。
- `git diff --check`：通过。
### Security Review

**Scope:** 当前 Access Plan、compiler outcome、renderer、Direct/Shell 共享 Kernel 及安全边界文档。

**Result:** 未发现需要立即升级为高危漏洞的未记录边界。当前边界的适合处理方式如下：

- **R-11 审批详情敏感信息：适合渐进改善。** deny 已脱敏和限长，但 ask evidence 仍可能包含完整路径；可以增加 approval-specific redaction 和独立 security log scrubbing，但不应在没有用户可审计详情时静默隐藏审批范围。
- **R-12 受限 Shell 语法：适合改善覆盖率，不适合在当前模型下直接放宽。** 可以后续引入更完整的 AST、coverage proof 和 per-expansion path proof；在此之前 dynamic token、opaque control flow 和未建模重定向继续 hard deny。该边界已在 `docs/security-boundaries.md`、D-025 和本 Task 的 Out of Scope 中记录。
- **R-09 非 gate 入口：只有改变 enforcement 架构才适合解决。** 当前记录准确描述了 `user_bash`、prefix、spawn hook、tool override 和其他 Extension 不受拦截；“by design”应理解为“当前 enforcement 范围外”，不代表这些入口安全地继承了 Access Gate。
- **R-02/R-08 pathname 与 TOCTOU：不适合由当前用户态 Gate 单独消除。** 需要实际执行方提供 fd-based/openat 或 OS-level isolation；当前 `partial/deferred` 状态和残余风险描述准确。
- **R-10 审批后的 side effect：不适合由前置 compiler/kernel 消除。** 需要执行适配器或 sandbox 控制实际 side effect；当前 `by design` 记录准确。
- **OS-level isolation、network policy 和 Direct-only 强制路由：当前不适合纳入 pi-keel。** 这些边界已经在 `CONTEXT.md` Negative Space、`docs/security-boundaries.md` 范围声明和 D-025 中记录。

**Follow-up:** 新 Pi 会话的 extension reload 仍是 T-003 的运行时验证项，不属于新的安全边界；在 reload 前不宣称 host runtime 已加载本次 renderer。

## T-001: 命令覆盖层

**Status:** verified

**Target:** 提供轻量 `command-overrides.yaml` 作为 Shell 命令和 Direct 工具的统一扩展入口，支持别名映射、新命令定义和分类微调。

**Scope:**

- 实现 `src/access-gate/command-semantics/overrides.ts`：类型定义、YAML 加载、别名解析、CommandDef 应用、reclassify 应用
- 修改 `src/access-gate/command-semantics/registry.ts`：在 `analyzeSemantics()` 中集成覆盖层
- 测试：`command-overrides.test.ts`（21 个用例覆盖别名、命令定义、reclassify、组合、运行时校验、缓存隔离和边界）

**Background:** 见 [D-024: 命令覆盖层](../docs/decisions.md#d-024-命令覆盖层)

**Verification:**
- `npx tsc --noEmit` 零错误
- 所有现有 adapter 测试通过（78/78，含 `go mod tidy` 修复）
- `command-overrides.test.ts` 21/21 pass

**Durable Updates:**
- [x] D-024 从 proposed 更新为 active，格式和决策内容完全重写
- [x] CONTEXT.md Active Decisions 添加 D-024 条目
- [x] `go mod tidy` 预存缺陷修复（build.ts subcommand 提取改为 join 全部非选项参数）
- [x] reclassify 清除 opaque 标志（用户显式重分类 = 提供了缺失语义知识）
- [x] reclassify.class 运行时校验（与 commands.class 同级防护）
