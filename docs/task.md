# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0120: 补充 Bounded Coreutils 只读检查命令族（diff, file, du, df）（C-025 第二阶段落地）

- **Kind:** feature
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** engineering

### Background & Goal
在完成 T-0119（`wc`, `cut`, `stat`）之后，C-025 中的 Read adapter 历史差异清单剩余四项只读检查命令：`diff`（差异对比）、`file`（文件类型探测）、`du`（目录空间统计）与 `df`（文件系统空间统计）。当前这些命令在 Canonical Shell 阶段仍退化为 `unknown + opaque execute`，在 `review` 模式下被直接拦截，而在 `develop` 模式下缺乏路径证据。本任务通过形式化的 `BoundedOptionContract` 将这四个命令纳入 `inspect` 分类与只读效果，严格封锁 `diff --diff-program`（外部代码执行）、`file -z`（解压执行）和 `file -C`（隐式写文件）等高危选项，将 `du` 建立为固有递归检查命令受控于 recursive path boundary，从而彻底关闭 C-025 中 Read adapter 命令族的存量差异。

### Out of Scope
- **交互式分页工具 (`less`, `more`)**: 维持退役状态，继续 fail-closed。
- **动态/间接参数**: `diff --exclude-from`、`du --files0-from`、`file -f` 等从文件动态读取列表的参数继续 fail-closed。
- **格式脚本与预处理器选项**: `diff -D`、`--line-format` 等复杂脚本生成选项继续 fail-closed。

### Requirements
- **REQ-1 (Bounded Option Contracts):**
  - `diff`: 支持常规比对与展示选项（`-u`, `-c`, `-i`, `-w`, `-b`, `-B`, `-t`, `-s`, `-N`, `-a`, `-q`, `-y`, `--normal`，标量 `-U`, `-C`, `--label`, `-W`，递归标志 `-r`, `-R`, `--recursive`）；强制拦截 `--diff-program`, `-D, --ifdef`, `--line-format`。
  - `file`: 支持常规探测标志（`-b`, `-i`, `--mime`, `--mime-type`, `--mime-encoding`, `-k`, `-L`, `-h`, `-s`, `-N`, `-p`）；强制拦截 `-z, --uncompress`, `-C, --compile`, `-f, --files-from`, `-m, --magic-file`。
  - `du`: 支持常用空间统计标志（`-a`, `-b`, `-c`, `-h`, `-k`, `-m`, `-l`, `-L`, `-P`, `-s`, `-S`, `-x`, `--si`, `-0`）与标量（`-d, --max-depth`, `-B`, `--threshold`）；强制拦截 `--files0-from`, `--exclude-from`。
  - `df`: 支持常用文件系统统计标志（`-a`, `-h`, `-H`, `-i`, `-k`, `-l`, `-P`, `--sync`, `--no-sync`, `-v`）与标量（`-B`, `-t`, `-x`）；强制拦截 `--output`, `--total`。
- **REQ-2 (Operands & Path Semantics):**
  - `diff`: 必须且只能包含 2 个操作数（支持 `-` 作为 stdin），提取为 `role: "source"`；操作数不为 2 时作为 `unsupported-syntax` 拒绝。若包含 `-r/-R/--recursive`，标记 `recursive = true`。
  - `file`: 至少包含 1 个操作数，提取为 `role: "source"`；无操作数时作为 `unsupported-syntax` 拒绝。
  - `du`: 支持 0 或多个操作数，提取为 `role: "source"`；无操作数时缺省为当前目录（合成 `.`）；无论是否显式传递 `-s`，语义恒为 `recursive = true`，强制进入递归边界检查。
  - `df`: 支持 0 或多个操作数，提取为 `role: "source"`；无操作数时缺省为当前目录（合成 `.`）；`recursive = false`。
- **REQ-3 (Invocation Integration):** 在 `core/compilation/shell/invocation.ts` 的 `inspectionCommands` 中追加 `"diff"`, `"file"`, `"du"`, `"df"`。
- **REQ-4 (Policy Enforcement):**
  - 在 `review` 模式下，对合法路径的简单与递归调用正常 `allow`。
  - 对触及 `blockedPaths`、`blockedRoots` 或凭据路径的操作数坚决触发 `hard-boundary` 拦截（包括 `du` 对含屏蔽后代的目录遍历）。
  - 外部 path-form 调用（如 `/usr/bin/diff`）维持 opaque execute 收敛。

### Design
1. 在 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`：
   - 添加 `diff`, `file`, `du`, `df` 的 `BoundedOptionContract`；
   - 在 `analyzeCoreutilsComplete` 的 `inspection` Set 中加入四个命令；
   - 针对 `du`/`df` 处理缺省 `syntheticPath()`，`du` 强制 `recursive = true`；
   - 针对 `diff` 处理 2 操作数约束与 `-r` 递归标志；
   - 针对 `file` 校验操作数非空。
2. 在 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`：
   - 将四个命令加入 `inspectionCommands`。
3. 扩展单测与端到端测试。

### Plan

#### Slice 1: Coreutils 语义与有界合同实现 (TDD)
**Goal:** 实现 `diff`, `file`, `du`, `df` 的合同与解析，编写单测验证正常提取与高危选项拒绝。
**Requirements covered:** REQ-1, REQ-2, REQ-3
**Depends on:** none

**Acceptance Criteria:**
- [ ] `diff a.txt b.txt` 提取两个 source paths，`commandClass: "inspect"`。
- [ ] `diff a.txt` 或 `diff a b c` 被拒绝（`unsupported-syntax`）。
- [ ] `diff --diff-program=prog a b` 被拒绝（`unsupported-syntax`）。
- [ ] `file package.json` 提取 source path；`file -z file` 与 `file -C file` 被拒绝。
- [ ] `du` 与 `du src` 标记 `recursive: true`，空操作数缺省为 `.`。
- [ ] `df` 空操作数缺省为 `.`，`recursive: false`。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 2: Policy 授权与边界集成测试
**Goal:** 验证在 `review` 模式下的准入放行，以及对 `blockedPaths`/`blockedRoots` 的坚决拦截（包括 `du` 递归阻断）。
**Requirements covered:** REQ-4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 在 `review` 模式下 `diff a b`、`du -sh .`、`file README.md` 直接 `allow`。
- [ ] `du` 遍历含凭据或屏蔽后代的目录触发 `hard-boundary` deny。
- [ ] `file /etc/passwd` 触发 `hard-boundary` deny。

**Files and Seams:**
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`
- Test: `tests/access-gate/index.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`
- `npm run test:file -- tests/access-gate/index.test.ts`

#### Slice 3: 全量回归、C-025 清单彻底关闭与 Task 清档
**Goal:** 更新 `docs/candidates.md` 将 Read adapter 清单彻底关闭，执行全量回归，清空 Task 章节。
**Requirements covered:** 全部
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] `docs/candidates.md` 中 C-025 的 Read adapter 状态标记为已完全解决。
- [ ] `npm test` 全量通过。
- [ ] 清空 Task 章节。

**Files and Seams:**
- Modify: `docs/candidates.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `docs/candidates.md` — 更新 C-025 Read adapter family 为已完全解决

## T-0121: 待创建
