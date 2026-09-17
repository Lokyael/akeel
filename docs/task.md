# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0123: 纳管有界 chmod 为专用修改分析器并消除敏感路径盲区（C-025 历史差异落地）

- **Kind:** feature
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** engineering

### Background & Goal
在 C-025 历史差异复核中，`Filesystem adapter family` 与 `Permission-change effect` 细项识别出严重的安全性与可用性割裂：
1. **敏感路径保护的静默绕过漏洞**：当前 `chmod` 处于未建模状态，被识别为 `bare` 可执行文件的 `unknown + opaque` 命令。因未知命令不提取任何操作数路径，发行的编译产物 `paths = []`。这导致 `chmod 777 ~/.pi/agent/auth.json`（宿主凭据，D-070）或 `chmod +x .git/hooks/pre-commit`（Git 控制面，D-067）在日常最常用的 `develop` 预设（`opaque: allow`）下完全绕过 Mandatory Boundary 检查并被静默放行！
2. **日常合法开发工作流受阻**：在 `review` 模式下，因 `opaque: deny`，合法的只读审查中执行良性脚本赋权（如 `chmod +x gradlew`）被一刀切阻断；在 `guided` 模式下退化为盲审。
3. **语法解析与安全模型特异性**：`chmod` 拥有非对称的 POSIX 语法（`-w`、`-x` 是 mode 而非 option；`+x` 是 mode 而非 flag；八进制存在 SUID/SGID 提权位）。通用 Coreutils 的 flag 解析器无法无损适配。

**目标**：
- 新增独立的 `core/compilation/shell/programs/chmod.ts` 专用分析器，与 `git.ts`/`find.ts` 保持同级架构深度；
- 专有三阶段扫描（Options / Mode / Targets），支持标准符号模式（`+x`, `u=rwx,go=rx`, `-w` 等）与安全三位八进制（`755`, `644`, `0755` 等）；
- 封死特权提权（SUID/SGID/Sticky：`4755`, `u+s`, `g+s`, `+t` 报 `security-boundary` fail-closed）；
- 封死递归（`-R`, `--recursive` 报 `security-boundary` fail-closed）；
- 提取所有目标路径为 `role: "target"`，映射为 `commandClass: "modify"`, `effects: ["write"]`；
- 激活现行 Mandatory Boundary 对凭据工件和 Git 控制面的绝对拦截，无缝接入现行 `paths.write` 策略。

### Out of Scope
- 恢复旧版独立的 `permissionChange` 策略轴（明确退役，统一收敛为 `write` effect）。
- 支持 `chmod --reference`（防止隐式文件探测信道）。
- 纳管 `chown` / `chgrp`（特权运维命令，明确退役，维持 unknown 阻断）。
- 纳管 `dd` / `shred` / `truncate`（不可逆破坏性命令，维持 D-071 永久硬拒绝）。
- 纳管 `tee`（依赖后续 Shell Pipeline 评估）。

### Requirements
- **REQ-1 (专用扫描与选项过滤):**
  - 支持常用无害选项：`-v, --verbose`, `-c, --changes`, `-f, --silent, --quiet`，以及 `--` 选项终止符；
  - 递归选项（`-R`, `-r` 当作为选项时，`--recursive`）直接触发 `security-boundary` fail-closed；
  - 引用选项（`--reference`）直接触发 `unsupported-syntax` fail-closed；
  - 遇到未知前缀选项 fail-closed。
- **REQ-2 (安全模式闭包与防提权):**
  - 符号模式支持：`/^[ugoa]*[+-=][rwxX]+(,[ugoa]*[+-=][rwxX]+)*$/`；严禁 `s` 与 `t`（SUID/SGID/Sticky），违者报 `security-boundary`；
  - 八进制模式支持：`/^0?[0-7]{3}$/`（合法 3 位或首位为 0 的 4 位）；严禁四位且首位非零（如 `4755`、`2755`、`1777`），违者报 `security-boundary`；
  - 不符合合法模式的 token 报 `unsupported-syntax`。
- **REQ-3 (目标路径提取与语义映射):**
  - Mode 之后的所有操作数提取为 `role: "target"` 路径事实；
  - 缺少目标操作数时报 `unsupported-syntax`；
  - 映射为 `commandClass: "modify"`, `effects: ["write"]`, `recursive: false`, `opaque: false`。
- **REQ-4 (系统硬边界与策略求值集成):**
  - 目标路径命中宿主凭据（如 `auth.json`）时，无论何种预设均被 Mandatory Boundary 硬阻断（`hard-boundary`）；
  - 目标路径命中 Git 控制面工件（如 `.git/hooks/*`）时，无论何种预设均被 Mandatory Boundary 硬阻断（`hard-boundary`）；
  - 工作区合法文件在 `develop` 预设下直接 `allow`；在 `guided` 预设下触发清晰目标路径审批（`approval-required`）；在 `review` 预设下因写保护被拒绝（`policy-denied`）；
  - 系统路径形式 `/bin/chmod` 或 `/usr/bin/chmod` 继承同一 analyzer；path-form（如 `./chmod`）按 D-067 保持 `execute + opaque`。

### Design
1. 新建 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/chmod.ts`：
   - 导出 `analyzeChmodProgram(args: readonly ShellWord[]): ProgramAnalysis`；
   - 专用解析算法：消费 flags -> 校验 mode（八进制/符号模式）与提权防范 -> 提取 targets（生成 `ProgramPath`，`role: "target"`）；
   - 返回 `ProgramAnalysis`（`complete` 或 `reject`）。
2. 更新 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts`：
   - 导出 `analyzeChmodProgram`；
   - `isKnownProgram` 增加 `"chmod"`；
   - `analyzeProgramInvocation` 中对 `identity.name === "chmod"` 调用 `analyzeChmodProgram`；
   - 对 `path-form` 增加 `chmod` 的 `execute + opaque` 分支。
3. 更新 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`：
   - `modificationCommands` 集合中加入 `"chmod"`。
4. 单元与集成测试：
   - 在 `tests/access-gate/access-decision/core/shell-semantics.test.ts` 中增加全面的语法、模式、提权拦截和选项测试；
   - 在 `tests/access-gate/access-decision/core/shell-policy.test.ts` 中增加策略求值与凭据/Git控制面拦截测试。

### Plan

#### Slice 1: chmod 专用分析器实现与核心语义测试 (TDD)
**Goal:** 实现 `programs/chmod.ts` 并在 `programs/index.ts` 中挂载，通过单测验证符号模式、八进制、SUID拦截、递归拦截与选项处理。
**Requirements covered:** REQ-1, REQ-2, REQ-3
**Depends on:** none

**Acceptance Criteria:**
- [ ] 支持合法符号模式（`+x`, `-w`, `u=rwx,go=rx` 等）与八进制（`755`, `644`, `0755`）。
- [ ] 拒绝 SUID/SGID/Sticky 提权位（`4755`, `u+s` 报 `security-boundary`）。
- [ ] 拒绝递归选项（`-R`, `--recursive` 报 `security-boundary`）。
- [ ] 提取所有目标路径为 `target` 路径事实，`commandClass: "modify"`, `effects: ["write"]`。

**Files and Seams:**
- Create: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/chmod.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 2: Policy 求值与 Mandatory Boundary 硬边界集成验证 (TDD)
**Goal:** 验证 `chmod` 接入端到端策略求值，特别是消灭 `develop` 预设下修改凭据与 Git 控制面的绕过漏洞。
**Requirements covered:** REQ-4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] `develop` 模式下，普通文件 `chmod +x` 允许执行（`allow`）。
- [ ] `develop` 模式下，`chmod +x .git/hooks/pre-commit` 与 `chmod 777 ~/.pi/agent/auth.json` 被 Mandatory Boundary 硬阻断（`hard-boundary`）。
- [ ] `review` 模式下，`chmod +x` 被写策略阻断（`policy-denied`）。
- [ ] `guided` 模式下，`chmod +x` 产生受管审批请求（`approval-required`）。

**Files and Seams:**
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`

#### Slice 3: 全量回归、文档同步与 Task 清档
**Goal:** 运行 `npm test` 全量通过；更新 `docs/decisions.md`（D-067）、`docs/candidates.md`（C-025 修剪）；清档 `docs/task.md`。
**Requirements covered:** 全部
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] `npm test` 全套通过。
- [ ] 文档更新无死链、格式合规。
- [ ] Task 章节清空。

**Files and Seams:**
- Modify: `docs/candidates.md`
- Modify: `docs/decisions.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `docs/decisions.md` — 更新 D-067 包含 bounded chmod 分析器规范、防提权不变量与 `permissionChange` 明确退役
- [ ] `docs/candidates.md` — 修剪 C-025 中已解决的 filesystem/permission-change 细项

## T-0124: 待创建
