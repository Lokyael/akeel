# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-071: AKeel 独立仓库迁移

**Kind:** maintenance
**Status:** in-progress
**Goal:** 将当前项目迁移为独立的 `Lokyael/akeel` 仓库，保留提交历史并把所有历史 author/committer 统一为 Lokyael 的 GitHub 身份。

### Architecture

在临时迁移副本中重写 `main` 的提交身份，不在当前工作副本上执行不可逆历史操作。保留提交消息、时间、文件内容和提交拓扑；验证通过后只向空的新仓库推送 `main`，旧仓库最后再 Private + Archive。

### Out of Scope

- **许可证切换**：当前继续使用 MIT；除非用户另行明确决定，否则不改变许可证。
- **所有历史快照的文本脱敏**：本任务先清理当前树和提交身份；只有用户明确要求历史快照也移除旧名称/地址时才扩大范围。
- **旧仓库收尾**：新仓库验证前不修改旧仓库的可见性或归档状态。

### Requirements

- 当前 AKeel 改名整理提交为 `bf38452`。
- 迁移备份位于 `/tmp/pi-work/akeel-before-rewrite.bundle`。
- 临时迁移副本位于 `/tmp/pi-work/akeel-migration`，当前包含 276 个 `main` 提交，未执行身份重写。
- 当前仓库 `origin` 已指向 `git@github.com:Lokyael/akeel.git`，尚未推送。
- 当前 Profile 拒绝 `git filter-repo`，需先允许历史重写命令，或由用户在外部终端完成该步骤。

### Next actions

1. 在 `/tmp/pi-work/akeel-migration` 中确认 `git filter-repo` 可执行。
2. 将所有提交的 author 和 committer 统一改为本地已确认的 Lokyael GitHub noreply 身份。
3. 验证提交数量、单一身份、仅有 `main` ref、旧名称扫描、`git diff --check` 和 `npm test`。
4. 确认 `Lokyael/akeel` 为空后，只推送 `main`，不得使用 `git push --mirror`。
5. 从新仓库 clone 验证后，再将旧 `Lokyael/pi-keel` 设为 Private 并 Archive。

## T-073: 只读策略修改提醒 Guidance

**Kind:** feature
**Status:** done
**Goal:** 在只读 `review` preset 下拦截普通 Direct 修改时返回静态切换 Guidance，同时保持硬边界和其他拒绝路径不被弱化。

### Architecture

Guidance 只在 runtime host-facing 渲染层根据已冻结的 active preset 与 `policy-denied` 结果选择；Canonical、Admission 和 Policy Kernel 不读取提示文案，也不自动批准或切换策略。Shell、硬边界、敏感路径、破坏性和未知操作继续使用原有 fail-closed 文案。

### Out of Scope

- **自动识别规划是否完成**：Gate 不解释对话阶段或任务意图。
- **自动切换或覆盖 deny**：策略切换仍需用户显式执行 `/policy`。
- **Shell 动态提醒**：等待更细粒度的 Shell 拒绝原因合同。

### Evidence

- [x] `npm test`
- [x] `git diff --check`

## T-074: 待创建
