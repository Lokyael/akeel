# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0121: 可执行文件双平面解析与路径形式命令边界重构（C-025 历史差异落地）

- **Kind:** refactor
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** engineering

### Background & Goal
在 C-025 历史差异复核中，`Executable identity normalization` 细项识别出深层安全与可用性缺陷：
1. **参数路径穿透漏洞**：当前所有非 Git 的路径形式命令统一降级为 `opaque execute` 且清空了路径事实。在 `develop` 预设（`opaque: allow`）下，如 `/usr/bin/cat /blocked/secret` 或 `/bin/cp /blocked/file /tmp/dest`，操作数路径完全绕过了普通路径边界与凭据边界检查；同时在 `review` 模式下，常规系统只读检查工具（如 `/bin/cat`, `/usr/bin/diff`）被误伤拒绝。
2. **可执行文件本体缺乏路径边界校验**：当执行自定义路径脚本（如 `./tool.sh` 或 `/path/to/bin`）时，可执行文件本身的路径从未作为路径事实进入编译结果，导致无法阻止直接调用位于凭据目录或受阻目录下的恶意/敏感二进制。
3. **特例孤岛**：系统中存在针对 Git 的孤立硬编码特例 `isTrustedSystemGit`（仅对 `/bin/git` 与 `/usr/bin/git` 放行），破坏了架构一致性。

本任务通过**双平面执行语义模型（Dual-Plane Execution Semantics）**重构可执行文件身份解析与路径形式命令边界：
- **工件安全平面（Artifact Plane）**：对所有自定义路径形式的可执行文件（非系统规范目录），将其自身发行作为 `role: "source"` 路径事实，受 Mandatory Boundary（凭据与 Git 控制面保护）和 Path Policy 检查，杜绝执行敏感目录下的二进制；
- **语义与操作数平面（Semantics & Operand Plane）**：引入统一的 `ExecutableIdentity` 抽象（`bare` | `system` | `path-form`）。对不可变系统目录（`/bin/`, `/usr/bin/`）下的已知程序（coreutils, git, interpreters, python tools, package managers）统一按已知语义规范分派，提取所有操作数路径事实，彻底封堵路径穿透漏洞，消除 `isTrustedSystemGit` 孤立特例；
- **坚决维护破坏性操作铁律（D-071）**：`/bin/rm`、`/usr/bin/rm` 等路径形式破坏操作依然保持永久系统 hard boundary，仅允许严格受管的单文件裸 `rm` 命令受审批准入。

### Out of Scope
- Linux `$PATH` 运行时文件系统探测与哈希鉴权（维持纯静态 Canonical 事实提取）。
- 扩展到 `/usr/local/bin` 或用户自定义外部目录（维持标准只读系统目录 `/bin/` 与 `/usr/bin/`）。
- 更改 D-071 对单文件裸 `rm` 的 `ask` 审批范围（路径形式 `rm` 保持 hard-deny）。

### Requirements
- **REQ-1 (Executable Identity Abstraction):**
  在 `core/compilation/shell/programs/` 中建立 `resolveExecutableIdentity(executable, isKnownProgram)`：
  - 裸名（无 `/`）：`{ kind: "bare", name }`；
  - 规范系统路径（以 `/bin/` 或 `/usr/bin/` 开头，且去除前缀后无更多 `/` 且 `isKnownProgram(name)` 为 true）：`{ kind: "system", name, path }`；
  - 其他含 `/` 的形式（如 `./script.sh`, `/tmp/tool`, 未知系统工具等）：`{ kind: "path-form", path, basename }`。
- **REQ-2 (System Executable Semantics & Operand Extraction):**
  - 对 `kind: "system"`，统一分派到对应程序分析器（coreutils, git, interpreters, python-tools, package-managers, uv, herdr）：
    - 正常提取所有参数路径事实（例如 `/usr/bin/cat foo.txt` 提取 `foo.txt` 为 `role: "source"`）；
    - 准确设置 `commandClass` 与 `effects`（例如 `inspect` + `[read]`）；
    - 废除独立的 `isTrustedSystemGit`，统一由 `identity.kind === "system"` 覆盖。
  - D-071 保护：若 `identity.kind === "system"` 且 `name === "rm"`，直接标记 `hardBoundary: true`（永久拒绝），维持 D-071 不变。
- **REQ-3 (Path-Form Executable Artifact Verification):**
  - 对 `kind: "path-form"`：
    - 将 `executableWord` 自身作为 `role: "source"` 路径事实发行到 `paths` 中；
    - `commandClass: "execute"`, `opaquePathAccess: true`；
    - 提取重定向目标等标准外部路径。
- **REQ-4 (Policy & Mandatory Boundary Enforcement):**
  - 在 `develop` 预设下，`/usr/bin/cat .pi/auth.json` 必须被 Mandatory Boundary 的凭据硬边界拦截（`hard-boundary`）。
  - 在 `develop` 预设下，`/usr/bin/cat /blocked/file` 必须被路径边界拦截（`policy-denied` 或 `hard-boundary`）。
  - 在 `develop` 预设下，执行 `~/.pi/agent/akeel/auth.json` 或 `blocked_dir/tool.sh` 必须被拦截（`hard-boundary`）。
  - 在 `review` 模式下，`/usr/bin/cat README.md` 直接 `allow`（与 `cat README.md` 等价）。
  - 在任何模式下，`/bin/rm foo.txt` 永久 `hard-boundary` 拦截。

### Design
1. 新建 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/identity.ts`：
   - 导出 `ExecutableIdentity` 判别联合与 `resolveExecutableIdentity(executable, isKnownProgram)`；
   - 严格限定系统前缀为 `/usr/bin/` 与 `/bin/`，拒绝嵌套斜杠与 `..`。
2. 重构 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts`：
   - 使用 `resolveExecutableIdentity` 替代 `isTrustedSystemGit`；
   - 对 `system` 与 `bare` 统一分派到 `analyzeCoreutilsProgram` 或 `PROGRAM_ANALYZERS`；
   - 对 `system` 下的 `rm` 命令强制返回 `result("destroy", ["delete"], [], { hardBoundary: true })`。
3. 修改 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`：
   - 接入 `resolveExecutableIdentity`；
   - 若为 `path-form`，将可执行文件自身提取为 `source` 路径事实；
   - 保持 `system` 与 `bare` 路径操作数正常发射。
4. 补充测试并验证全量套件。

### Plan

#### Slice 1: 可执行文件身份解析与程序分派重构 (TDD)
**Goal:** 实现 `ExecutableIdentity` 抽象与解析器，重构 `analyzeProgramInvocation` 消除 `isTrustedSystemGit`，增加单元测试。
**Requirements covered:** REQ-1, REQ-2
**Depends on:** none

**Acceptance Criteria:**
- [ ] `/bin/git` 与 `/usr/bin/git` 识别为 `system`，享受完整 Git 语义。
- [ ] `/bin/cat` 与 `/usr/bin/diff` 识别为 `system`，享受完整 Coreutils 语义并提取操作数路径。
- [ ] `/bin/rm` 识别为 `system`，但强制返回 `hardBoundary: true`。
- [ ] `./tool.sh`、`/tmp/tool`、`/opt/bin/cat` 识别为 `path-form`。

**Files and Seams:**
- Create: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/identity.ts`
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/index.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 2: Invocation 双平面协同与工件路径事实发射 (TDD)
**Goal:** 在 `invocation.ts` 中接入身份解析，对 `path-form` 发射可执行文件本体路径事实，对 `system` 正常发射操作数事实。
**Requirements covered:** REQ-2, REQ-3
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] `/usr/bin/cat foo.txt` 发射 `foo.txt` 路径事实，`commandClass: "inspect"`，`opaque: false`。
- [ ] `./scripts/build.sh` 发射 `./scripts/build.sh` 作为 source 路径事实，`commandClass: "execute"`，`opaque: true`。
- [ ] `~/.pi/agent/akeel/auth.json` 发射路径事实且保留 `home-relative` 标记。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 3: Policy 授权与边界防御集成验证
**Goal:** 验证端到端凭据拦截、受阻路径拦截、`develop` 下漏洞封堵、`review` 下系统只读放行与 `/bin/rm` 永久拦截。
**Requirements covered:** REQ-4
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] `develop` 预设下，`/usr/bin/cat auth.json` 触发 `hard-boundary` 拒绝。
- [ ] `develop` 预设下，`/usr/bin/cat /blocked/file` 触发路径拦截。
- [ ] `develop` 预设下，执行 `~/.pi/agent/akeel/auth.json` 触发 `hard-boundary` 拒绝。
- [ ] `review` 预设下，`/bin/cat README.md` 允许执行（与 `cat README.md` 等价）。
- [ ] 任意预设下，`/bin/rm file.txt` 触发 `hard-boundary` 永久拦截。

**Files and Seams:**
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`
- Test: `tests/access-gate/index.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`
- `npm run test:file -- tests/access-gate/index.test.ts`

#### Slice 4: 全量回归、决策与文档同步、C-025 更新与 Task 清档
**Goal:** 更新 `docs/decisions.md`（D-067）与 `CONTEXT.md`，在 `docs/candidates.md` 中将 C-025 对应细项结项，通过全量测试并清空 Task。
**Requirements covered:** 全部
**Depends on:** Slice 3

**Acceptance Criteria:**
- [ ] `docs/decisions.md` 中 D-067 明确双平面执行语义与系统路径归一化。
- [ ] `docs/candidates.md` 中更新 C-025。
- [ ] `npm test` 全量通过。
- [ ] 清空 Task 章节。

**Files and Seams:**
- Modify: `docs/decisions.md`
- Modify: `docs/candidates.md`
- Modify: `CONTEXT.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `docs/decisions.md` — 更新 D-067 吸收双平面语义与系统可执行文件归一化
- [ ] `CONTEXT.md` — 同步更新 Architecture 与 Negative Space
- [ ] `docs/candidates.md` — 更新 C-025 记录该细项已由 T-0121 落地解决

## T-0122: 待创建
