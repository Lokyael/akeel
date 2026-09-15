# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0109: 本地 Git 有界提交准入与控制面路径写保护

**Kind:** feature
**Status:** in-progress

### Goal

在坚守凭据安全与零网络外发的前提下，通过对 Git 控制面文件（Hooks、Git Config、Git Attributes）实施绝对写保护，解耦本地索引/提交与网络/凭据操作，为 `git add` 和 `git commit -m` 提供有界的策略准入，解除对本地安全提交的硬拦截。

### Requirements

- **R1 — Git 控制面绝对写保护：** 在路径准入判定中，将 `.git/hooks/**`、`.husky/**`、`.githooks/**`、`.lefthook/**`、`.git/config*`、`.gitattributes` 纳入系统级 Hard Boundary。对这些路径的任何 Direct `write`/`edit` 操作，或 Shell 具有 `write`/`delete` effect 的操作，一律返回 `hard-boundary` deny，不可被 Policy Preset 放宽。
- **R2 — Git Commit 有界语义准入：** 在 `git.ts` 分析器中，将 `commit` 移出 `GIT_HELPER_COMMANDS`，并增加严格的有界性守卫：
  1. 必须显式携带 `-m` 或 `--message`（或 `--file`/`-F`）；
  2. 严禁交互式挂起（无 message 或包含 `-e`/`--edit`/`-p`/`--patch`/`-i`/`--interactive`）；
  3. 严禁携带 `-c` 选项（防止覆盖 `core.hooksPath` 或 `gpg.program`）；
  4. 严禁外部驱动参数（`--ext-diff`, `--textconv`）。
  不满足守卫的调用保持 `hardBoundary = true`。满足守卫的调用归为 `modify` 类命令，其效果为 `write`，进入常规策略求值。
- **R3 — Git Add 有界语义准入：** 在 `git.ts` 分析器中，将 `add` 移出 `GIT_HELPER_COMMANDS`。仅允许有界的工作区路径，禁止交互式暂存（`-p`, `-i`, `-e`），禁止未建模的 `--pathspec-from-file` 等参数。满足守卫的调用归为 `modify` 类命令，效果为 `write`，进入常规策略求值。
- **R4 — 网络与远端操作硬边界不变：** `git push`、`git fetch`、`git pull`、`git remote`、`git clone`、`git submodule` 及 `git config` 继续保持 `hardBoundary = true`。
- **R5 — 策略预设分层验证：** 在 `develop` 预设下，符合 R2/R3 的 `git add` 和 `git commit` 返回 `kind: "allow"`；在 `review` 预设下返回 `kind: "deny", code: "policy-denied"`；在 `guided` 预设下返回 `kind: "approval-required"`。

### Design

1. **控制面硬拦截（`authorization/index.ts`）**：
   定义 `isGitControlArtifact(candidatePath: string): boolean`：
   检查路径是否属于 `.git/hooks` 及其后代、`.husky` 及其后代、`.githooks` 及其后代、`.lefthook` 及其后代、`.git/config` 及其变体、或 `.gitattributes`。
   在 `authorizeDirect` 中：若操作为 `write` 或 `edit` 且目标路径命中 Git 控制工件，直接返回 `{ kind: "deny", code: "hard-boundary" }`。
   在 `authorizeShell` 中：若操作包含 `write` 或 `delete` effect，且任一路径命中 Git 控制工件，直接返回 `{ kind: "deny", code: "hard-boundary" }`。读操作（如 inspect、read、cat）不被该拦截器阻止。
2. **Git 分析器重构（`programs/git.ts`）**：
   - 从 `GIT_HELPER_COMMANDS` 中移除 `add` 和 `commit`；
   - 在子命令解析处为 `commit` 添加有界守卫：检查是否存在 `-m`、`--message`、`-F`、`--file`（包括 separated 与 equals 形式）；若缺少消息，或包含 `-c`、`-e`、`--edit`、`-p`、`--patch`、`--interactive`、`--ext-diff`、`--textconv`，则标记 `hardBoundary = true`；
   - 为 `add` 添加有界守卫：若包含 `-i`、`-p`、`-e`、`--interactive`、`--patch`、`--edit` 或未建模选项，标记 `hardBoundary = true`；
   - 保持 `push`、`fetch`、`pull`、`remote`、`clone`、`submodule`、`config`、`init`、`apply` 等操作的 `hardBoundary = true` 不变。
3. **测试迁移与断言对齐**：
   更新 `tests/access-gate/access-decision/core/shell-policy.test.ts`、`program-semantics.test.ts` 中原本将 `git commit -m` 和 `git add` 断言为 hard-boundary 的用例，增加在 `develop`/`review`/`guided` 下的分层测试，以及对 Hook 写保护的完整拦截测试。

### Out of Scope

- **`git push` / `git fetch` 放行**：涉及网络外发与凭据助手调用，在引入物理网络沙箱前坚决不予放行。
- **交互式 `git commit` / `git add -p`**：不支持无 TTY 交互式选择与编辑器拉起。
- **动态 Git Config 修改**：`git config` 修改命令继续保持硬拦截。

### Plan

#### Slice 1: Git 控制面文件不可变硬边界 (R1)
**Goal:** 在 Authorization 层对 Hook、Git Config 与 Git Attributes 的写/改/删操作实施系统级 Hard Boundary 拦截。
**Requirements covered:** R1
**Depends on:** none
**Acceptance Criteria:**
- Direct `write` 或 `edit` 写入 `.git/hooks/pre-commit`、`.husky/pre-commit`、`.git/config`、`.gitattributes` 返回 `kind: "deny", code: "hard-boundary"`。
- Shell 重定向或修改操作命中上述路径时返回 `kind: "deny", code: "hard-boundary"`。
- 读操作（如 Direct `read` 或 Shell inspect）不受此写拦截影响。
**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/authorization/index.ts`
- Test: `tests/access-gate/access-decision/core/authorization/direct-tracer.test.ts`, `tests/access-gate/access-decision/core/shell-policy.test.ts`
**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`
**Steps:**
1. 在 `shell-policy.test.ts` 与 `direct.test.ts` 编写针对 Hook 与 Git 配置路径写保护的失败测试（Red）。
2. 在 `authorization/index.ts` 实现 `gitControlArtifact` 检查并在写/改/删路径执行硬拦截（Green）。
3. 验证单测全部通过。

#### Slice 2: Git 程序分析器有界 Add 与 Commit 语义 (R2, R3, R4)
**Goal:** 重构 `git.ts`，移出 `add`/`commit` 的无条件硬拦截，增加 `-m` 强制守卫、`-c` 阻断与交互式参数阻断。
**Requirements covered:** R2, R3, R4
**Depends on:** Slice 1
**Acceptance Criteria:**
- `git commit -m "msg"` 的 `hardBoundary` 为 `false`，分类为 `modify`，效果为 `["write"]`。
- `git commit`（无 `-m`）、`git commit -c core.hooksPath=...`、`git commit -p` 的 `hardBoundary` 保持 `true`。
- `git add <file>` 的 `hardBoundary` 为 `false`，分类为 `modify`，效果为 `["write"]`。
- `git add -p`、`git add -i` 的 `hardBoundary` 保持 `true`。
- `git push`、`git fetch`、`git remote` 等操作保持 `hardBoundary = true`。
**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/git.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`, `tests/access-gate/access-decision/core/program-semantics.test.ts`
**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`
**Steps:**
1. 在 `shell-semantics.test.ts` 中针对 `commit` 有界参数守卫与 `add` 编写测试用例（Red）。
2. 修改 `git.ts` 移除 `GIT_HELPER_COMMANDS` 中的 `add`/`commit` 并注入守卫（Green）。
3. 确保分析器测试通过。

#### Slice 3: Policy 授权管线与集成验证 (R5)
**Goal:** 验证在不同 Policy Preset 下对 `git add` 和 `git commit` 的授权行为，并保持既有安全性不变。
**Requirements covered:** R5
**Depends on:** Slice 2
**Acceptance Criteria:**
- 在 `develop` 预设下：`git add src/app.ts` 与 `git commit -m "msg"` 判定为 `kind: "allow"`。
- 在 `review` 预设下：判定为 `kind: "deny", code: "policy-denied"`。
- 在 `guided` 预设下：判定为 `kind: "approval-required"`。
- 全量测试 `npm test` 零失败通过。
**Files and Seams:**
- Modify: `tests/access-gate/access-decision/core/shell-policy.test.ts`
**Verification:**
- `npm test`
**Steps:**
1. 更新 `shell-policy.test.ts` 中的断言集合，区分放行用例与硬拦截用例。
2. 运行全量测试并修复任何潜在断言不一致。

#### Slice 4: 架构决策与系统文档同步
**Goal:** 更新 D-067 长期决策，记录本地受管提交与控制面路径写保护，保持文档合规。
**Requirements covered:** R1, R2, R3, R4, R5
**Depends on:** Slice 3
**Acceptance Criteria:**
- `docs/decisions.md` 中的 D-067 更新完整，准确表述有界 `add`/`commit` 语义与 Hook 写保护。
- `CONTEXT.md` 架构与术语同步。
- `npx tsx scripts/validate-docs.ts` 与 `scripts/validate-skills.ts` 零错误通过。
**Files and Seams:**
- Modify: `docs/decisions.md`, `CONTEXT.md`
**Verification:**
- `npm test`
**Steps:**
1. 更新 `docs/decisions.md` 与 `CONTEXT.md`。
2. 运行 `npm test`，确认所有校验与测试通过。

### Evidence

- 待实施验证。

### Durable Updates

- [ ] 更新 `docs/decisions.md` (D-067)
- [ ] 更新 `CONTEXT.md`

## T-0110: 待创建
