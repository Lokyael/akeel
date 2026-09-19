# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0146: 适配 Git status 聚合短选项（-sb 等）与独立 Inspect 选项合同

- **Kind:** bug
- **Status:** in-progress
- **Reversal surface:** engineering

### Background & Goal

在当前 Access Gate 的 Git 分析器中：
1. `COMMON_VALUE_OPTIONS` 中定义了 `{ key: "branch", names: ["-b", "--branch"], arity: "required" }`，该集合被粗粒度引入到了 `GIT_INSPECT_CONTRACT` 中。
2. 导致在解析 `git status -sb`（或者 `git status -b`）时，`-b` 被判定为缺失必填参数的 `missing-value`，进而触发 `hardBoundary` 拦截；同时在包含此命令的复合流（如 `git status && git log -n 5 --oneline && git status -sb`）中导致整条复合命令全军覆没。
3. 按照 D-067（Canonical 程序语义族两阶段架构），纯只读审查命令应解耦使用专属选项契约，非 inspect 命令隔离不继承该选项集；`git status` 与只读 inspect 命令下的 `-b` 均为纯 Flag（显示分支跟踪状态或忽略空白变更），绝非必填参数。

本任务旨在落实 D-067 的子命令合同隔离原则：
1. 为 `git status` 建立独立的选项合同（`GIT_STATUS_CONTRACT`），明确 `-b` / `--branch` 与 `-s` / `--short` 均为 Flag，完整支持 `-sb` 等短选项集群及 `--ignored`、`--porcelain`、`-z` 等标准选项；
2. 修正 `GIT_INSPECT_CONTRACT`，将 `-b` 纳为只读 flag（支持 `diff -b`、`log -b` 等），解除 `MUTATING_VALUE_OPTIONS` 对 inspect 系列子命令的选项污染；
3. 确保同构只读复合命令（`git status && git log -n 5 --oneline && git status -sb`）在 review/develop/guided 预设下能够顺利通过静态安全证明并放行。

### Out of Scope

- 不放宽 `git checkout -b`、`git clone -b`、`git branch` 等具有分支写/创建/检出语义的命令中必选分支参数的要求；
- 不放宽未建模的外部 transport、动态展开或非 inspect 破坏性操作；
- 不在网关层做执行期伪造拆解，维持既有原子授权流水线。

### Requirements

- **REQ-1 (status 专有合同与 -sb 集群解析支持):**
  - 为 `git status` 设立解耦的 `GIT_STATUS_CONTRACT`，声明 `-b`、`--branch`、`-s`、`--short`、`-v`、`--verbose`、`-z` 等为 `arity: "flag"`；
  - 声明 `-u` / `--untracked-files`、`--ignored`、`--porcelain`、`--find-renames` 为 `optional-attached`；
  - 确保短选项集群 `-sb` 能够被 `segment-parser` 正确解析为两个独立 Flag，无 `missing-value`，`hardBoundary` 为 `false`。
- **REQ-2 (inspect 合同解耦与 -b 选项修正):**
  - 将 `COMMON_VALUE_OPTIONS` 中的变异/操作类选项（`branch`、`message`、`path`）与只读共享选项解耦，不向 `GIT_INSPECT_CONTRACT` 传播 `branch: required`；
  - 在 `INSPECT_FLAG_OPTIONS` 中包含 `-b`（对应 `diff`/`log`/`show` 的忽略空白），支持 `diff -b` 等只读检查操作；
  - 维持对 `clone -b`、`checkout -b` 的 `arity: "required"` 语义不变。
- **REQ-3 (复合流与全量测试验证):**
  - 在 `shell-semantics.test.ts` 中补充 `git status -sb`、`git status -s -b`、`git status -z` 等语义提取用例；
  - 在 `shell-policy.test.ts` 中补充 `git status -sb` 以及包含它的复合流（`git status && git log -n 5 --oneline && git status -sb`）在 review / develop / guided 下的 allow 准入断言；
  - 保持全量验证通过。

### Plan

#### Slice 1: 编写测试用例 (TDD Red)
- 在 `shell-semantics.test.ts` 与 `shell-policy.test.ts` 中增加覆盖 `-sb`、`-s -b` 以及复合流的测试用例。

#### Slice 2: 修复 Git 分析器并跑通用例 (TDD Green)
- 修改 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/git.ts`：
  - 定义 `GIT_STATUS_CONTRACT` 与 `STATUS_OPTIONS`；
  - 解耦变异值选项与共享值选项，调整 `GIT_INSPECT_CONTRACT`；
  - 在子命令分发逻辑中为 `subcommand === "status"` 接入专有合同；
- 验证相关用例绿灯。

#### Slice 3: 全量回归与清理
- 验证所有测试通过；
- 记录变更并完成 Task 清档。

### Durable Updates Checklist
- [ ] `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/git.ts`
- [ ] `tests/access-gate/access-decision/core/shell-semantics.test.ts`
- [ ] `tests/access-gate/access-decision/core/shell-policy.test.ts`

## T-0147: 待创建

