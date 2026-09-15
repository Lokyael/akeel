# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0111: bounded `find` expression subset

- **Kind:** feature
- **Origin:** C-025
- **Why:** 当前受管 Shell 将所有 `find` 的 `-` 开头参数拒绝，导致可静态证明的只读查询无法进入 Canonical → Admission → Policy；本 Task 只恢复一个封闭、有限的表达式子集，不恢复完整 GNU `find` 语义。
- **Requirements:**
  - **R1 Safe predicates:** `find` 支持静态 start path，以及 `-name`、`-iname`、`-path`、`-ipath`、`-type`、`-maxdepth`、`-mindepth` 的受限形式；predicate 的值被消费，不被误判为 path。
  - **R2 Path admission:** 所有 start path（缺省时为当前目录 `.`）进入现有 recursive path evidence 与 policy/hard-boundary 检查；predicate pattern 和 numeric value 不产生 path fact。
  - **R3 Dangerous actions:** `-exec`、`-execdir`、`-ok`、`-okdir`、`-delete`、`-fls`、`-fprint`、`-fprint0`、`-fprintf` 继续在 Canonical 阶段 security-boundary 拒绝。
  - **R4 Conservative rejection:** 未知 predicate、缺失/歧义值、动态 Shell word、symlink-following 选项、布尔/复合表达式和其他未建模形态继续 fail-closed。
  - **R5 Regression evidence:** 通过现有 Shell compilation/public policy seams 覆盖允许的只读查询、值消费、递归路径边界和危险/未建模形态。
- **Design:** 为 `core/compilation/shell/programs/` 增加独立 `find` analyzer；它发行 inspect/read、recursive 和 start-path facts。invocation 只负责把 analyzer 的结构化 rejection 映射到既有 Canonical reject contract，不把 `find` 表达式复用为通用 option engine。保持 D-018、D-067、D-071 的 fail-closed、path boundary 与 destroy hard-boundary 约束。
- **Out of Scope:**
  - **完整 GNU `find` 表达式：** 表达式组合、括号、`-o`/`!`、`-prune`、`-quit` 等需要独立控制流证明；在真实工作流提出前不实现。
  - **Symlink-following：** `-L`、`-H`、`-P`、`-follow` 改变 traversal 语义；当前 path evidence 未为该模式建立合同，继续拒绝。
  - **Side-effect/output actions：** `-printf`、`-print`、`-ls` 及其他输出动作不在本 Slice 放行，避免混入输出/内容边界；需要真实需求时另行评估。
  - **External execution and deletion：** `-exec` 家族与 `-delete` 不因本 Task 放宽 D-071 或执行边界。
  - **Generic option engine：** 不恢复旧 `option-parse`/`config-parse`，不处理其他命令族的选项扩展。
- **Plan:**
  #### Slice 1: Safe `find` predicate compilation

  **Goal:** 可静态证明的简单只读 `find` 查询完成编译，并正确发行 start-path facts。
  **Requirements covered:** R1, R2, R4
  **Depends on:** none

  **Acceptance Criteria:**
  - [ ] `find . -name marker`、`-type`、`-path`、`-maxdepth` 等受限查询不再因 predicate 被拒绝。
  - [ ] predicate values 不出现在编译结果 paths 中，start paths 保持 source role，缺省 start path 为 `.`。
  - [ ] 未知、缺值、symlink-following 和复合表达式继续 fail-closed。

  **Files and Seams:**
  - Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/find.ts` — `analyzeFindProgram` and bounded parser
  - Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts` — program registry
  - Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts` — rejection mapping and base path extraction boundary
  - Test: `tests/access-gate/access-decision/core/shell-compile.test.ts` — Shell public compilation seam
  - Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts` — program semantic seam

  **Verification:**
  - `npm run test:file -- tests/access-gate/access-decision/core/shell-compile.test.ts`
  - `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

  **Steps:**
  1. Add one failing public-seam test for a static `find` predicate.
  2. Implement the smallest analyzer and registry integration.
  3. Add value-consumption and conservative-rejection cases, running the focused tests after each slice.
  4. Run policy and full validation, then synchronize durable documentation.

## T-0112: 待创建
