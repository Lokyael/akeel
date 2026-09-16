# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0112: 基础 Shell 命令的封闭选项消费合同

- **Kind:** refactor
- **Status:** verified
- **Origin:** C-027
- **Goal:** 在当前 Canonical → Admission → Policy 管线内，消除基础 Shell 命令把选项值误识别为路径的缺陷，并用封闭、命令专属的选项合同替代 `invocation.ts` 的通用猜测与分散补丁。

### Out of Scope

- **完整 POSIX/GNU CLI 兼容：** 方言、长选项缩写、所有短选项簇和全部命令选项会扩大静态证明与维护成本；Revisit when 真实工作流提供明确的有界扩展需求。
- **动态展开与脚本解释：** 变量、命令替换、运行期 glob、解释器脚本和委托子命令不属于本 Task 的静态事实；Revisit when 当前 Canonical 获得可验证的独立解析接缝。
- **Destroy 放行：** `destroy`/`delete` 继续受 D-071 永久 hard boundary 约束；Revisit when 建立独立且完整的破坏范围证明并获得新的 user-boundary 决策。
- **Find 表达式扩展：** `find` 已有独立 bounded expression analyzer，本 Task 只保持其选项值不泄漏为路径；Revisit when 真实工作流需要当前表达式子集之外的搜索语义。
- **pi-guard parity 或旧 adapter 恢复：** 外部实现只可作为语料和合同参考，不能成为当前正确性 oracle；Revisit when 有独立、可核查的外部合同需要对照。

### Requirements

- **R1 — Typed option consumption:** 已支持命令的选项必须在消费后明确区分 `path`、`pattern`、`scalar`/`enum` 和无值 `flag`；非 path 值不得生成路径事实。
- **R2 — Closed syntax boundary:** 已注册命令的未知选项、缺失值、未声明的 equals/separated/attached/cluster 形式在 Canonical 阶段 fail-closed，不得借助 `commands.opaque: allow` 放行。
- **R3 — Operand preservation:** `--` 后的 operand、命令专属 pattern 和文件 operand 必须按各自合同保留；显式 path-valued option 若未支持则拒绝，不得静默丢弃。
- **R4 — Safety effects:** 递归、symlink、helper、写入和破坏性选项不得因通用跳过逻辑被降级；helper/危险形态继续 security-boundary 或 hard-boundary，destroy/delete 继续遵守 D-071。
- **R5 — Existing pipeline compatibility:** 保持 Canonical opaque 制品、窄 Admission、Policy Kernel 不重新解析原始请求；保持裸名与既有固定 path-form identity 的边界。
- **R6 — Public-seam evidence:** 通过现有 program semantics、Shell compile、Shell policy 和 contract tests 验证；不以私有 parser 状态作为验收依据。

### Design

新增一个 bounded option contract 层，提供统一 token consumption，但不实现通用 CLI parser。每个已注册基础命令声明允许的 option name、值性质、允许形式和处置（allow、unsupported 或 security-boundary），解析器发行 typed options 与 positionals；program analyzer 再将 path 值投影为 ProgramPath，将 scalar/pattern/enum 值仅作为消费事实。短选项簇只在命令合同明确声明时解析，`--` 终止选项解析，未知或缺失形态直接返回 Canonical reject。基础命令通过 `programs/` registry 进入命令专属 analyzer，`invocation.ts` 只保留 Shell 结构、重定向和 program-analysis reject 映射；完成迁移后移除基础命令的通用 path extraction 与 `unmodeledPathOption()`。

### Plan

#### Slice 1: 封闭 parser seam 与基础值消费

**Goal:** 建立可观察的 bounded option contract，并先修复 `head`/`tail`/`mkdir`/`touch`/`od` 的分离值、equals 值和允许的 attached 值误判。

**Requirements covered:** R1, R2, R3, R6
**Depends on:** none

**Acceptance Criteria:**
- [x] 分离选项值不再出现在 path facts 中。
- [x] path/pattern/scalar/flag 的消费结果在 program semantics 中保持正确。
- [x] 缺失值、未知选项和未声明形式在 Canonical 阶段拒绝。
- [x] `--` 后的 token 保留为 operand。

**Files and Seams:**
- Add: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/bounded-options.ts` — bounded option contract seam
- Add: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts` — coreutils contracts and analyzers
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/types.ts` — program analysis result
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts` — program dispatch
- Test: `tests/access-gate/access-decision/core/program-semantics.test.ts` — option contract behavior
- Test: `tests/access-gate/access-decision/core/shell-compile.test.ts` — canonical path evidence

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/program-semantics.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/core/shell-compile.test.ts`

**Steps:**
1. Add one failing public-seam test for a separated scalar value and one for unknown/missing option handling.
2. Verify the focused test fails for the current generic extraction.
3. Implement the smallest bounded parser contract and migrate the first command family.
4. Verify the focused tests pass and retain the existing low-level option scanner behavior for Git, Python, uv and package-manager analyzers.

#### Slice 2: 基础 inspect 与 filesystem analyzer 迁移

**Goal:** 让基础 inspect/filesystem 命令通过命令专属 analyzer 消费选项，消除 `invocation.ts` 的通用路径猜测。

**Requirements covered:** R1, R2, R3, R4, R5
**Depends on:** Slice 1

**Acceptance Criteria:**
- [x] `cat`、`head`、`tail`、`ls`、`od` 的 scalar/pattern/flag 选项不会伪造路径。
- [x] `mkdir`、`touch`、`cp`、`mv`、`ln` 的 option/path 角色按合同发行。
- [x] 未建模 path-valued、symlink 或 effect-changing 选项继续拒绝或进入既有安全边界。
- [x] 现有 `grep`、`rg`、`find` 的专属安全行为不被通用迁移削弱。

**Files and Seams:**
- Add/modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/` — command analyzers and bounded contracts
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts` — remove generic base-command extraction
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts` — registry
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts` — semantic paths/effects
- Test: `tests/access-gate/access-decision/core/shell-compile.test.ts` — rejection and path evidence
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts` — policy/boundary behavior

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/core/shell-compile.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`

**Steps:**
1. Add falsifiable tests for each confirmed false path class and for high-risk options that must remain rejected.
2. Migrate one command family at a time through the registry.
3. Preserve command-specific positional rules and effect facts.
4. Remove the generic fallback only after every in-scope command has a bounded analyzer.

#### Slice 3: 全量验证与文档同步

**Goal:** 证明选项消费修复未削弱当前 Access Decision 边界，并同步当前事实与外部合同记录。

**Requirements covered:** R4, R5, R6
**Depends on:** Slice 2

**Acceptance Criteria:**
- [x] 选项值误判回归测试、未知选项 fail-closed 测试和 `--` 测试均通过。
- [x] Direct/Shell 路径边界、credential/Git control boundary、recursive boundary 和 destroy boundary 保持通过。
- [x] 文档不再描述已移除的通用路径猜测，Candidate/Task 生命周期和外部来源记录一致。
- [x] 全量测试、TypeScript 检查和项目验证入口通过。

**Files and Seams:**
- Modify: `CONTEXT.md` — current architecture/option contract facts if changed
- Modify: `docs/decisions.md` — only if the adopted implementation changes a load-bearing contract
- Modify: `docs/traceability.md` — fixed GNU Coreutils source mapping if external contract is retained
- Modify: `docs/task.md` — evidence and final lifecycle clearing
- Test: `npm test` — repository validation gate

**Verification:**
- `npm test`
- `git diff --check`
- `git status --short`

**Steps:**
1. Run focused regressions and the full suite after the final code change.
2. Reconcile `CONTEXT.md`, Decisions, Candidates, traceability and this Task against the resulting code.
3. Apply fix-validation and change-preflight before commit; clear this Task only with durable documentation updates in the same change.

#### Slice 4: 独立安全审查缺陷修复

**Goal:** 消除安全审查确认的可选参数吞 operand、symlink 选项边界削弱和 source/target 角色错误。

**Requirements covered:** R1, R3, R4
**Depends on:** Slice 3

**Acceptance Criteria:**
- [x] `od` 的可选参数形式不会消费后续独立文件 operand；`od -w <path>`、`od --strings <path>` 保留 `<path>` 的路径事实。
- [x] `ln -L`/`--logical` 继续 fail-closed，除非建立独立 symlink 语义证明。
- [x] `cp`、`mv`、`ln` 的 source 与 target path role 正确分区，并通过 policy seam 验证。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/bounded-options.ts` — optional-value form contract
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts` — od/ln/operand contracts
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts` — regression semantics
- Test: `tests/access-gate/access-decision/core/shell-compile.test.ts` — preserved path evidence
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts` — boundary and role behavior

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/core/shell-compile.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`

**Steps:**
1. Add failing regressions for optional `od` arguments, `ln -L`, and copy-like source/target roles.
2. Verify each regression fails before the production fix.
3. Apply one coherent contract fix without widening unsupported command forms.
4. Re-run focused tests, the full suite, and independent security review.

### Security Review

- **Status:** `PASS`
- **Artifact:** run-scoped temporary security-review artifact outside the repository
- **SEC-01 — RESOLVED:** `od` optional-value forms no longer consume a separate file operand; path facts remain subject to authorization boundaries.
- **SEC-02 — RESOLVED:** `ln -L`/`--logical` is fail-closed.
- **SEC-03 — RESOLVED:** `cp`/`mv`/`ln` partition source and target operands.
- **Gate:** Independent read-only security review found no outstanding HIGH/MEDIUM findings after remediation.

### Evidence

- `npm test` — passed: document validation, skill validation, TypeScript check, and 399 tests.
- Focused Shell semantic, compile, and policy tests — passed after each implementation slice.
- `git diff --check` — passed.
- GNU Coreutils manual and local Coreutils `9.11` were used as the option-contract reference; no implementation code was copied.

### Durable Update Checklist

- [x] If the bounded option contract is a lasting architecture boundary, update `CONTEXT.md` and/or `docs/decisions.md`.
- [x] Remove the promoted C-027 record and stale references when promoting this Task.
- [x] Record fixed external command-contract sources in `docs/traceability.md` if they remain part of the adopted behavior.
- [ ] Clear this Task after verification and preserve the completed checkpoint in Git history.

## T-0113: 待创建
