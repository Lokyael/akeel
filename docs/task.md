# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0119: 补充 Bounded Coreutils 只读检查命令族（wc, cut, stat）（C-025 细项落地）

- **Kind:** feature
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** engineering

### Background & Goal
在受管 Shell 中，`wc`（行/词/字节统计）、`cut`（字段/流切分）和 `stat`（文件元数据查询）是高频且零副作用的基础只读命令。当前 Access Gate 未在 `programs/coreutils.ts` 中注册这三个命令，导致其在 Canonical 阶段退化为 `unknown + opaque execute`。这引发两个问题：① 在只读模式（`review`）下被直接拦截，严重阻碍常规检查工作流；② 在允许 opaque 的模式（`develop`）下被放行但丢失路径证据，无法受控于 `allowedRoots` 与 `blockedPaths` 路径策略。本任务为 `wc`、`cut`、`stat` 在 `coreutils.ts` 中建立形式化的 `BoundedOptionContract`，将其纳入 `inspect` 分类与只读效果，受控于路径安全边界，并对危险选项（如 `wc --files0-from`）fail-closed。

### Out of Scope
- **第二阶段高危/复杂只读工具 (`diff`, `file`, `du`)**: 涉及双操作数匹配、固有递归目录遍历以及 `--diff-program`、`-z` 等外部执行选项，留待下一阶段评估与实施。
- **交互式分页工具 (`less`, `more`)**: 破坏 Agent 自动化，继续保持 fail-closed 并退役。
- **GNU 间接路径选项 (`wc --files0-from=F`)**: 从外部文件动态加载待检路径列表，当前不予建模，强制 fail-closed。
- **非 coreutils 程序与写入命令**: 不扩展其他未建模命令。

### Requirements
- **REQ-1 (Bounded Option Contracts):** 为 `wc`, `cut`, `stat` 定义封闭的 `BoundedOptionSpec`：
  - `wc`: 支持 `-c`, `--bytes`, `-m`, `--chars`, `-l`, `--lines`, `-w`, `--words`, `-L`, `--max-line-length`；`--files0-from` 标记为 `unsupported`。
  - `cut`: 支持 `-b, --bytes`, `-c, --characters`, `-d, --delimiter`, `-f, --fields`, `-s, --only-delimited`, `--complement`, `-z, --zero-terminated`, `--output-delimiter`；标量选项正确消费值。
  - `stat`: 支持 `-L, --dereference`, `-f, --file-system`, `-c, --format`, `--printf`, `-t, --terse`。
- **REQ-2 (Program Semantics & Role):**
  - 命令类别为 `inspect`，effects 为 `["read"]`，`recursive: false`。
  - 路径参数提取为 `role: "source"`。
  - `wc` 与 `cut` 在无操作数时支持从 stdin 消费（`paths: []`）。
  - `stat` 在无操作数时作为语法不支持（`unsupported-syntax`）拒绝，避免无操作数导致错误通过。
- **REQ-3 (Invocation Integration):** 在 `core/compilation/shell/invocation.ts` 的 `inspectionCommands` 集合中加入 `"wc"`, `"cut"`, `"stat"`，确保 fallback 分类与 effect 派生一致。
- **REQ-4 (Policy Enforcement):**
  - 在 `review` 预设下，对合法工作区路径的 `wc`, `cut`, `stat` 正常 `allow`。
  - 对触及 `blockedPaths`、`blockedRoots` 或凭据路径的操作数坚决实施 `hard-boundary` 拦截。
  - 外部 path-form 调用（如 `/usr/bin/wc`）依然保持 D-067 的 opaque execute 收敛，不因 basename 逃逸。

### Design
1. 在 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`：
   - 在 `contracts` Map 中添加 `wc`, `cut`, `stat` 的规范；
   - 在 `analyzeCoreutilsComplete` 的 `inspection` Set 中加入 `wc`, `cut`, `stat`；
   - 在 `analyzeCoreutilsProgram` 中，若 `name === "stat" && parsed.operands.length === 0`，返回 `unsupported-syntax` reject。
2. 在 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`：
   - 在 `inspectionCommands` 中加入 `wc`, `cut`, `stat`。
3. 测试接缝：
   - `tests/access-gate/access-decision/core/shell-semantics.test.ts`
   - `tests/access-gate/access-decision/core/shell-policy.test.ts`

### Plan

#### Slice 1: Coreutils 合同与语义编译实现
**Goal:** 补全 `wc`, `cut`, `stat` 的 BoundedOptionContract 及 invocation inspection 集成，TDD 验证编译和错误拒绝。
**Requirements covered:** REQ-1, REQ-2, REQ-3
**Depends on:** none

**Acceptance Criteria:**
- [ ] `wc -l README.md` 提取 `README.md` 为 source path，`commandClass: "inspect"`, `effects: ["read"]`。
- [ ] `wc --files0-from=file` 被拒绝（`unsupported-syntax`）。
- [ ] `cut -d: -f1 README.md` 正确消费选项值，提取 `README.md` 为 source path。
- [ ] `stat package.json` 提取 `package.json` 为 source path，无参数 `stat` 拒绝（`unsupported-syntax`）。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 2: Policy Snapshot 授权与端到端拦截测试
**Goal:** 验证在 `review` 模式下合法路径的 `wc`, `cut`, `stat` 正常放行，敏感与越界路径触发 hard-boundary。
**Requirements covered:** REQ-4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 在 `review` 模式下 `wc -l /workspace/project/README.md` 直接 `allow`。
- [ ] 在 `review` 模式下 `stat /workspace/project/.git/config` 触发 `hard-boundary` deny。
- [ ] `/usr/bin/wc README.md` 作为 opaque execute 拒绝。

**Files and Seams:**
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`

#### Slice 3: 全量回归、文档与候选同步及 Task 清档
**Goal:** 更新 C-025 清单，运行全量验证，清空 Task 章节。
**Requirements covered:** 全部
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] `docs/candidates.md` 更新 C-025 中的 Read adapter 状态。
- [ ] `npm test` 全量通过。
- [ ] 清空 Task 章节。

**Files and Seams:**
- Modify: `docs/candidates.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `docs/candidates.md` — 更新 C-025 中 Read adapter 条目说明

## T-0120: 待创建
