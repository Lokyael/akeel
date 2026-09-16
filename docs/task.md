# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0117: 有界单文件 rm 语义解析与受审批准入（C-028 最小切片）

- **Kind:** feature
- **Status:** in-progress
- **Origin:** C-028
- **Reversal surface:** user-boundary

### Background & Goal
当前系统在 D-071 下对所有 `destroy` 命令和 `delete` effect 执行永久系统硬拒绝（hard-boundary deny），甚至在 `coreutils.ts` 中未对 `rm` 进行选项分析与路径提取，导致 Agent 无法删除在当前工作区内生成的临时测试文件或编译产物。本任务作为 C-028 的最小可验证闭环切片，在新的 Canonical → Admission → Policy 信任链下，为非递归、单/多显式路径的 `rm` 命令建立完整的有界证明（Bounded Proof），并将其从 Mandatory Boundary 的一刀切短路中解耦，受管地接入 Policy Kernel 求值与宿主 UI `ask` 审批。

### Out of Scope
- **递归与目录删除**: `-r`、`-R`、`--recursive`、`-d`、`--dir` 及 `rmdir` 命令永久保持 hard-boundary deny。Revisit when 建立完整的目录树影响分析与保护证明。
- **Git 破坏性操作**: `git reset --hard`、`git clean -f`、`git branch -D`、`git push -f` 保持 hard-boundary。Revisit when 单独启动 Git 破坏性子形态专项复核。
- **动态展开与通配符**: 未经证明的 Shell glob（如 `rm *.tmp`）、命令替换或变量展开保持 fail-closed。Revisit when 建立静态词表展开机制。
- **无 UI 环境静默删除**: 在无 UI（headless/CI）环境中，`approval-required` 严格自动转换为 deny，不放宽为静默删除。
- **全自动资源回收**: Herdr 多代理生命周期的非模型自动清理保持为 C-034 独立候选。

### Requirements
- **REQ-1 (Bounded Option Contract for `rm`):** 在 `coreutils.ts` 中为 `rm` 建立严格的 `BoundedOptionContract`：
  - 允许的安全标志：`-f`、`--force`、`-v`、`--verbose`、`--`；
  - 明确不支持并拒绝的标志：`-r`、`-R`、`--recursive`、`-d`、`--dir`、`--no-preserve-root`、`-i`、`-I` 等；
  - 必须至少提供一个非选项的操作数（operands），无操作数时判定为 reject。
- **REQ-2 (Target Path Extraction):** 将 `rm` 的所有操作数规范化提取为 `paths`，每个路径的 `role` 显式标记为 `"target"`，并记录起始偏移和 `invocation-cwd` 基准。
- **REQ-3 (Mandatory Boundary Decoupling):** 在 `core/authorization/index.ts` 中调整硬边界判决：
  - 仅当 `commandClass === "destroy"` 且属于未完全证明的有界破坏（如 `recursive === true`、`opaquePathAccess === true`、`hardBoundary === true`、无提取路径、或命中凭据/Git控制/路径范围硬边界）时，判定为 `hard-boundary` deny；
  - 若已建立完备路径证明且所有 target paths 均通过凭据工件与路径边界检查，则解除短路，放行进入 Policy Kernel。
- **REQ-4 (Policy & Preset Integration):**
  - 在 `core/authorization` 中，已放行的 destroy 操作按 `policy.commands.destroy` 与 `policy.paths.write` 共同裁决；
  - 更新 `adapters/config.ts` 中的内置预设：`guided` 与 `develop` 预设中的 `commands.destroy` 设为 `"ask"`（`review` 预设保持 `"deny"`）；
  - 在 `ask` 模式下，宿主正确发行 `approval-required`，经 `ui.confirm` 知情同意后执行，无 UI 时 fail-closed deny。
- **REQ-5 (Security Invariants Preservation):**
  - 无论何时，若删除目标命中 D-070 凭据工件（如 `auth.json` 等）、Git 控制工件（`.git/hooks`、`.git/config` 等）或超出 `allowedRoots`，必须无条件 hard-boundary deny。

### Design
1. **Compilation 契约扩展 (`core/compilation/shell/programs/coreutils.ts`)**:
   - 将 `"rm"` 纳入 `contracts` 映射表，配置 `BoundedOptionContract`；
   - 在 `analyzeCoreutilsComplete` 中，当 `name === "rm"` 时：
     - `commandClass = "destroy"`;
     - `effects = ["delete"]`;
     - `paths = operands.map(op => path(op, "target"))`;
     - `recursive = false`。
2. **Invocation 委托重构 (`core/compilation/shell/invocation.ts`)**:
   - 从 `destructionCommands` 集合中剥离 `rm`，或确保 `analyzeProgramInvocation` 优先将 `rm` 派发给 `coreutils` 分析器；
   - 保留 `rmdir`、`unlink`、`truncate` 等命令在未建模 destroy 中的兜底拦截。
3. **授权内核判决精细化 (`core/authorization/index.ts`)**:
   - 在 `authorizeShell` 中提炼有界破坏判定：
     ```ts
     const isUnboundedDestroy = operation.commandClass === "destroy" && (
       operation.recursive ||
       operation.opaquePathAccess ||
       operation.hardBoundary ||
       operation.paths.length === 0
     );
     ```
   - 若 `isUnboundedDestroy` 为真，判定为 `hard-boundary` deny；
   - 若操作为有界 destroy，则只核对路径是否违反凭据、Git 控制与路径边界，通过后进入常规 `modes` 收集，由 `policy.commands.destroy` 决定最终 verdict。
4. **内置预设配置调整 (`adapters/config.ts`)**:
   - `guided`: `commands.destroy = "ask"`;
   - `develop`: `commands.destroy = "ask"`（坚持毁灭性操作必须经知情同意，不设为 `allow`）；
   - `review`: `commands.destroy = "deny"`。

### Plan

#### Slice 1: Coreutils `rm` 选项契约与路径提取
**Goal:** 使 Canonical 编译器能严格解析有界 `rm` 命令，提取 target paths，并对递归/未知选项 fail-closed。
**Requirements covered:** REQ-1, REQ-2
**Depends on:** none

**Acceptance Criteria:**
- [ ] `rm single_file.txt` 成功编译为 `commandClass: "destroy"`, `effects: ["delete"]`, 且包含 1 个 role 为 target 的路径。
- [ ] `rm -f a.txt b.txt` 成功提取 2 个 target 路径。
- [ ] `rm -r dir`、`rm -R dir`、`rm --recursive dir` 被拒绝（reject unsupported option）。
- [ ] `rm -d empty_dir` 被拒绝。
- [ ] `rm` 无参数时被拒绝。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/compilation/shell/programs/coreutils.test.ts` (或同级编译测试)

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/compilation/shell/programs/coreutils.test.ts`

**Steps:**
1. 在 `coreutils.ts` 中声明 `rm` 的 `BoundedOptionContract`，支持 `-f`, `-v`, `--`，将 `-r`, `-R`, `--recursive`, `-d`, `--dir` 等标记为 `unsupported`。
2. 在 `analyzeCoreutilsComplete` 中增加对 `rm` 的语义生成逻辑，返回 target paths 与 non-recursive 标记。
3. 调整 `invocation.ts`，确保 `rm` 通过 `analyzeCoreutilsProgram` 完成解析，其提取的 paths 被正确保留在 `semantic` 中。
4. 编写并运行编译层单元测试，覆盖正常单/多文件、安全选项与递归拒绝用例。

#### Slice 2: Authorization 核心有界 Destroy 判定解耦
**Goal:** 在授权阶段区分有界与无界 Destroy，使通过完备证明的单文件删除能进入 Policy Kernel 求值。
**Requirements covered:** REQ-3, REQ-5
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 有界 `rm file.txt` 在 paths 合法时不再直接触发 `hard-boundary` deny，而是由 `policy.commands.destroy` 决定。
- [ ] 针对敏感凭据文件（如 `auth.json`）的 `rm auth.json` 依然被判定为 `hard-boundary` deny。
- [ ] 针对 Git 控制工件（如 `.git/config`）的 `rm .git/config` 依然被判定为 `hard-boundary` deny。
- [ ] 超出 `allowedRoots` 或命中 `blockedPaths` 的 `rm` 依然被判定为 `hard-boundary` deny。
- [ ] 无提取路径或递归标志的破坏操作继续被判定为 `hard-boundary` deny。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/authorization/index.ts`
- Test: `tests/access-gate/access-decision/core/authorization/authorization.test.ts` (或同级授权测试)

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/authorization/authorization.test.ts`

**Steps:**
1. 在 `core/authorization/index.ts` 的 `authorizeShell` 中重构 destroy 硬边界检查，将无界破坏与有界破坏分离。
2. 确保有界破坏仍然严格执行 `pathHitsMandatoryBoundary`、`pathHitsGitControlArtifact` 检查。
3. 确保通过有界检查后，`modes` 正确收集 `policy.commands.destroy`。
4. 编写并运行授权层单元测试，验证凭据拦截、范围拦截与合法放行。

#### Slice 3: Preset 策略配置与端到端 Host UI 审批集成
**Goal:** 在内置 `guided` 与 `develop` 预设中启用 `commands.destroy: ask`，并在宿主交互中完成确认放行与无 UI 拦截。
**Requirements covered:** REQ-4
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] 内置 `review` 预设下，`rm file.txt` 被策略拒绝（`policy-denied`）。
- [ ] 内置 `guided` 与 `develop` 预设下，`rm file.txt` 返回 `approval-required`。
- [ ] 在 `ctx.hasUI = true` 且用户确认时，工具调用成功放行；用户拒绝时阻断。
- [ ] 在 `ctx.hasUI = false` 时，自动 fail-closed deny。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/adapters/config.ts`
- Test: `tests/access-gate/index.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/index.test.ts`

**Steps:**
1. 在 `adapters/config.ts` 中更新 `BUILTIN_POLICY_DEFINITIONS`：将 `guided` 与 `develop` 的 `commands.destroy` 更新为 `"ask"`。
2. 在 `tests/access-gate/index.test.ts` 中添加端到端测试用例：覆盖 `rm` 在不同预设下的行为及 UI confirm 交互。
3. 验证无 UI 场景下的 fail-closed 表现。

#### Slice 4: 决策文档更新与全量验证
**Goal:** 修订长期决策 D-071、更新 `CONTEXT.md`、维护 `docs/candidates.md`，并跑通全量门禁。
**Requirements covered:** 全部
**Depends on:** Slice 3

**Acceptance Criteria:**
- [ ] `docs/decisions.md` 中 D-071 修订为反映有界破坏操作可经审批放行的最新结论。
- [ ] `CONTEXT.md` 的 Architecture 与 Negative Space 同步更新。
- [ ] `docs/candidates.md` 中 C-028 记录最小切片落地状态。
- [ ] `npm test` 全量通过（包含 `validate-docs`、`validate-skills`、TypeScript 类型检查和全量测试）。

**Files and Seams:**
- Modify: `docs/decisions.md`
- Modify: `CONTEXT.md`
- Modify: `docs/candidates.md`

**Verification:**
- `npm test`

**Steps:**
1. 修订 `docs/decisions.md` 中的 D-071 条目，保持其格式与 hygiene 合规。
2. 同步更新 `CONTEXT.md` 中的架构与负空间说明。
3. 更新 `docs/candidates.md` 中的 C-028 记录。
4. 执行全量 `npm test` 并确认无回归。

### Durable Updates Checklist
- [ ] `docs/decisions.md` — 修订 D-071 边界，记录有界单文件 destroy 的可审批准入结论
- [ ] `CONTEXT.md` — 同步更新 Architecture 与 Negative Space 中关于 destroy 的描述
- [ ] `docs/candidates.md` — 更新 C-028 推进进度与重访记录

## T-0118: 待创建

