# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0143: 适配 Git status -u 选项与只读 stash list/show 子命令

- **Kind:** bug
- **Status:** in-progress
- **Reversal surface:** engineering

### Background & Goal

在当前 Access Gate 的 Git 分析器中：
1. `-u` 被配置在全局一刀切检查（`analyzeGitProgram` 第 249 行）与 `COMMON_VALUE_OPTIONS` 中，初衷是阻断远程协议利用的 `--upload-pack` 别名，却误伤了 `git status -u`（以及 `-uno`、`--untracked-files` 等），导致高频的只读状态检查触发 `hardBoundary` 拦截。
2. `stash` 子命令被列入 `GIT_HELPER_COMMANDS` 硬阻断集合，使得后段原本用于支持 `git stash list` 和 `git stash show` 作为只读 `inspect` 的分支沦为无法触达的死代码。

本任务旨在修复上述误杀与死代码，精确支持 Git 状态检查中的 `-u` 选项与储藏只读查询（`stash list`、`stash show`），同时严格保持对危险操作（`clone -u`、`fetch -u`、`stash pop/drop/clear` 等）的硬拦截防线。

### Out of Scope

- 不放宽 `git clone`、`git fetch`、`git pull` 等命令中的 `--upload-pack` 或 `-u`（仍为不可放宽硬拦截）；
- 不放宽 `git stash` 默认 push、`stash pop`、`stash drop`、`stash clear` 等产生写副作用或销毁暂存的操作（仍为 helper command 硬拦截）；
- 不放宽外部远程 transport、网络协议或其它未建模的 Git 命令。

### Requirements

- **REQ-1 (status -u 及相关选项支持):**
  - 从 `COMMON_VALUE_OPTIONS` 中移除具有必选值语义的 `"-u"`，避免与标志位/可选参数冲突；
  - 在检查子命令选项中以 `optional-attached` 形式适配 `-u` 与 `--untracked-files`，支持裸 `-u`、裸 `--untracked-files` 以及合法模式参数（`no`、`normal`、`all`，如 `-uno`、`-uall`、`--untracked-files=no`）；
  - 对非法的模式值（如 `-uevil`、`--untracked-files=evil`）保持 fail-closed 硬拦截；
  - 将 `--upload-pack` 相关的短别名 `-u` 拦截收敛到涉及 transport 的子命令（`clone`、`fetch`、`pull` 等），不再误杀 `git status`、`git diff` 等本地只读命令。
- **REQ-2 (stash 只读查询 list/show 支持):**
  - 在 `GIT_HELPER_COMMANDS` 前置阻断中豁免 `stash list` 与 `stash show`；
  - 仅识别 `stash list`（无多余位置操作数）与 `stash show`（可选单个 revision，如 `stash@{0}`）为只读 `inspect` 命令，效果为 `["read"]`，仓库路径为 `.`；
  - 任何包含未知选项、多余操作数或 pathspec 通配符的调用触发 `hardBoundary`；
  - 其余 `stash` 变体（裸 `git stash`、`pop`、`drop`、`clear`、`apply`、`branch`）继续由 `GIT_HELPER_COMMANDS` 保持硬拦截。
- **REQ-3 (全量测试与回归验证):**
  - 遵循 TDD 编写针对 `status -u` 与 `stash list/show` 的单元测试与策略准入测试；
  - 全量运行 `npm test`（文档校验、技能校验、类型检查与 520+ 测试用例）100% 保持通过。

### Plan

#### Slice 1: 编写失败测试用例 (TDD Red)
- 在 `shell-semantics.test.ts` 中补充 `git status -u`、`-uno`、`-uall`、`--untracked-files`、`git stash list`、`git stash show` 等语义提取与硬边界用例；
- 在 `shell-policy.test.ts` 中补充 review / develop / guided 策略下对这些命令的准入评估用例；
- 运行单测验证用例红灯。

#### Slice 2: 修复 Git 分析器并跑通单测 (TDD Green)
- 修改 `git.ts`：
  - 调整 `COMMON_VALUE_OPTIONS` 与 inspect 选项合同，引入 `optional-attached` 的 `-u` / `--untracked-files`；
  - 收敛全局 `-u` 检查至 upload-pack 相关命令；
  - 为 `status` 补充模式值校验；
  - 在 helper commands 拦截中豁免 `stash list` 与 `stash show` 并建立参数约束；
- 运行单测验证用例绿灯。

#### Slice 3: 全量回归、checkpoint 与文档收敛
- 运行全量 `npm test` 确认 0 错误；
- 更新 `docs/task.md` 标记完成并清档。

### Durable Updates Checklist
- [ ] `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/git.ts` — 适配 `status -u` 与 `stash list/show`
- [ ] 全量验证通过与 `docs/task.md` 清档

## T-0144: 待创建
