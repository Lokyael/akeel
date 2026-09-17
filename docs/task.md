# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0124: 解耦 Git 子命令契约并纳管安全只读审查与过滤选项（C-025 历史差异落地）

- **Kind:** feature
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** engineering

### Background & Goal
在 C-025 历史差异复核中，`git.ts` 采用扁平全局白名单与命令式扫描，缺失大量常用的安全只读历史与差异排查选项（如 `-S`, `-G`, `--grep`, `--author`, `--since`, `--until`, `--graph`, `--format`, `-L` 等）。
1. **日常代码排查与审查工作流受阻**：在当前默认 `review` 模式下，因 `opaque: deny`，合法的只读审查与历史追溯（如 `git log -S`、`git log --grep`）被一刀切阻断为 `Blocked by access policy`；在 `guided` 模式下退化为频繁盲审。
2. **架构缺乏子命令隔离**：`git.ts` 内部使用扁平共享的 `GIT_SAFE_OPTIONS`，所有子命令的选项混在同一个集合中。带值选项与布尔选项未强类型成对绑定，容易在参数解析中将过滤参数值误泄露为 positional path，或无法对特定子命令实施精准的选项边界。

**目标**：
- 在 `git.ts` 中实现子命令契约解耦，将 `log`, `diff`, `show`, `blame`, `grep` 等 inspect 子命令选项解耦为独立的声明式 Inspect 契约；
- 完整纳管高频安全只读选项（布尔展示 flags 与带值过滤 scalars），确保过滤参数值被严格原子消费，绝不溢出为文件路径；
- 严防高危驱动（`--ext-diff`, `--textconv` 继续 hard-boundary），输出重定向（`--output` 继续纳管为 target 路径）；
- 严格保证子命令作用域隔离：新增的只读过滤选项只对 inspect 子命令生效，严防向 modify/destroy 类子命令（如 `checkout`, `reset`, `commit`）扩散；
- 保持 Git 全局前置选项（`-C`, `--git-dir`, `--work-tree`）与网络传输（`clone`, `push`, `pull`, `fetch`）的现行硬边界不变。

### Out of Scope
- 放宽 Git 破坏性操作（`reset --hard`, `clean -f`, `branch -D` 等维持 D-071 永久硬拒绝）。
- 放宽 Git 远程/网络传输（非 local `file://` 的 clone/fetch/pull/push 维持 hard-boundary）。
- 放宽 Git 配置注入与命令执行（`-c`, `--upload-pack`, `--receive-pack`, `--exec` 维持 hard-boundary）。
- 跨分析器通用流形引擎重构（不在此任务中统一重写 `uv.ts`、`python-tools.ts`，保持局部高内聚切片）。

### Requirements
- **REQ-1 (Inspect 子命令安全选项契约):**
  - 在 `log`, `diff`, `show`, `blame`, `grep` 子命令下支持以下安全展示与过滤选项：
    - 布尔展示标志：`--graph`, `--follow`, `--topo-order`, `--no-merges`, `--reverse`, `-p`, `--patch`, `--diff-filter`；
    - 带值过滤标量：`-S`, `-G`, `--grep`, `--author`, `--committer`, `--since`, `--after`, `--until`, `--before`, `--format`, `--pretty`, `-L`, `--max-count`；
  - 选项扫描器必须正确成对消费上述带值选项（支持 `--opt=val` 与 `--opt val` 两种形态），其参数值绝不作为路径事实发射；
  - 若带值选项位于末尾且缺失参数值，标记 `missingValue` 并触发 `hardBoundary: true`（Fail-closed）。
- **REQ-2 (高危参数与目标路径防护):**
  - `--ext-diff`, `--textconv` 继续触发 `hardBoundary: true`，严禁外部代码执行；
  - `--output`, `-o`, `--output-directory` 继续作为 `target` 角色路径提取并接入写策略；
  - 未在安全白名单中的未知选项继续触发 `opaque: true`（Fail-closed）。
- **REQ-3 (子命令作用域隔离):**
  - Inspect 子命令族独占只读展示与过滤选项，这些选项在 `add`, `commit`, `checkout`, `switch`, `reset`, `clone` 等 modify / transport 子命令下不得放行（仍按 unknown option 判定为 opaque 或 hard-boundary）。
- **REQ-4 (端到端策略求值与工作流验证):**
  - `git log -S "C-025" --oneline` 等只读命令在 `review`、`guided`、`develop` 预设下均判定为纯只读 inspect/read 并正常放行（消灭 `Blocked by access policy` 误伤）；
  - 带有高危选项的命令（如 `git log --ext-diff`）在任何预设下均被系统硬拦截（`hard-boundary`）。

### Plan

#### Slice 1: Git Inspect 子命令契约解耦与选项消费实现 (TDD)
**Goal:** 在 `git.ts` 中构建专属于 Inspect 子命令的选项契约集合，支持安全只读过滤与展示选项，严格成对消费 value，并编写语义解析单元测试。
**Requirements covered:** REQ-1, REQ-2, REQ-3
**Depends on:** none

**Acceptance Criteria:**
- [ ] `git log -S "term"`、`git log --grep="feat"`、`git log --graph` 产生 `commandClass: "inspect"`, `effects: ["read"]`, `opaque: false`, `hardBoundary: false`。
- [ ] `-S "term"` 中的 `"term"` 不会被提取为 ProgramPath。
- [ ] `git log -S` 缺少值时触发 `hardBoundary: true`。
- [ ] `git log --ext-diff` 触发 `hardBoundary: true`。
- [ ] 非 inspect 子命令（如 `git checkout -S "term"`）将 `-S` 判定为 unknown option（`opaque: true`）。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/git.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 2: 端到端策略求值集成测试与工作流验证 (TDD)
**Goal:** 验证端到端策略求值，确保在 `review` 模式下 `git log -S "..."` 放行，高危命令被 Mandatory Boundary 硬拦截。
**Requirements covered:** REQ-4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] `review` 模式下，`git log -S "C-025"` 放行通过（`allow`）。
- [ ] `develop` 与 `guided` 模式下同样正常放行。
- [ ] `git log --ext-diff` 在所有预设下均被 `hard-boundary` 拦截。

**Files and Seams:**
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`

#### Slice 3: 全量回归、文档同步与 Task 清档
**Goal:** 运行全量 `npm test`；同步 `docs/decisions.md`（D-067）与 `docs/candidates.md`（C-025 修剪）；清档 `docs/task.md`。
**Requirements covered:** 全部
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] 全套测试通过（`npm test`）。
- [ ] 文档更新无断链、格式合规。
- [ ] Task 章节清空。

**Files and Seams:**
- Modify: `docs/candidates.md`
- Modify: `docs/decisions.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `docs/decisions.md` — 更新 D-067 记录 Git Inspect 子命令安全选项契约与参数消费不变量
- [ ] `docs/candidates.md` — 修剪 C-025 中已解决的 Git inspect 选项与语义复核项

## T-0125: 待创建
