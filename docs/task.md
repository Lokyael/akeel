# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0131: 宿主能力资产三域正交只读准入与防篡改硬保护

- **Status:** in-progress
- **Kind:** feature
- **Origin:** C-049

### Scope

在 Access Gate 中实现三域正交访问模型（Three-Tier Path Domain Model）：
1. 扩展 `MandatoryBoundaries` 承载宿主已注册能力资产根（`capabilityRoots`）；
2. 在 Authorization Core 中实现能力资产只读放行（Direct `read`/`list` 隐式准入）与防篡改系统硬拦截（Direct `write`/`edit` 及 Shell 写删副作用永久 `hard-boundary`）；
3. 确保 D-070 凭据硬边界对能力资产域拥有绝对优先压制权；
4. 在 `GateSession` 与 `pi-composition` 适配层中自动装配宿主分发子目录（`git`、`node_modules`、`skills`、`extensions`），实现用户零配置（Zero-Config UX）。

### Out of Scope

- 不放宽工作区外普通业务文件的读写限制；
- 不将 `agentDir` 根目录自身纳入能力资产根（防止凭据泛化）；
- 不在 Shell 中放开任意动态或未建模命令对能力资产的执行；
- 不引入外部动态包管理器扫描器或侵入 Pi 私有数据结构。

### Requirements

- **R-1 (Mandatory Boundary Extension):** `createMandatoryBoundaries` 接受合法的 `capabilityRoots: readonly string[]`（绝对路径数组），由密封的 `MandatoryBoundaries` 安全持有。
- **R-2 (Immutable Read-Only Access):** Direct `read` 与非递归 `list` 当目标路径命中 `capabilityRoots` 且未触及凭据时，直接判定为 `allow`，无需该路径位于用户工作区 `allowedRoots` 内。
- **R-3 (Anti-Tamper Hard Boundary):** Direct `write`、`edit` 以及 Shell 带有 `write`/`delete` 副作用的操作当目标路径命中 `capabilityRoots` 时，无论任何 preset，一律判定为 `deny: hard-boundary`。
- **R-4 (Credential Dominance):** 命中 `credentialRoots` 的凭据工件（`auth.json` 及其衍生）优先于 `capabilityRoots` 判定，永久硬拒绝。
- **R-5 (Gate Session Passthrough):** `createGateSession` 校验并接收可选的 `capabilityRoots`，传递给 Mandatory Boundaries，同时保持工作区 `defaultRoots` 不被污染。
- **R-6 (Pi Composition Auto-Discovery):** `pi-composition` 自动从 `agentDir` 推导标准分发子目录（`git`、`node_modules`、`skills`、`extensions`）作为默认能力资产根，严禁将 `agentDir` 自身纳入。

### Design

- **三域模型（Three-Tier Path Domain Model）**：
  - **Credential Domain**：D-070 凭据工件，最高优先级，全部硬拒绝。
  - **Capability Domain**：宿主分发能力资产（`capabilityRoots`），只读基础设施，读查放行，写改删系统硬拒绝。
  - **Workspace Domain**：用户项目根（`allowedRoots` / `stagingRoot`），完整受 preset 策略管辖。
- **Seam & Functions**:
  - `packages/access-gate/src/access-gate/access-decision/core/authorization/index.ts`:
    - `MandatoryBoundaryFacts` 新增 `capabilityRoots`；
    - `createMandatoryBoundaries(input)` 支持 `capabilityRoots` 参数与绝对路径校验；
    - `authorizeDirect` 与 `authorizeShell` 增加 `capabilityRoots` 判定分支。
  - `packages/access-gate/src/access-gate/access-decision/runtime/gate-session.ts`:
    - `createGateSession(input)` 校验 `input.capabilityRoots` 并传给 `createMandatoryBoundaries`。
  - `packages/access-gate/src/access-gate/access-decision/runtime/pi-composition.ts`:
    - `defaultCapabilityRoots(agentDir: string)` 推导 `git`、`node_modules`、`skills`、`extensions` 规范路径并注入。

### Plan Slices

#### Slice 1: Authorization Core 扩展与三域准入不变量
**Goal:** `MandatoryBoundaries` 承载 `capabilityRoots`，并在 `authorizeAdmission` 中实现能力资产的“只读通行，写改硬拒，凭据压制”。
**Requirements covered:** R-1, R-2, R-3, R-4
**Depends on:** none

**Acceptance Criteria:**
- [x] `createMandatoryBoundaries` 正确接收、去重并冻结 `capabilityRoots`；
- [x] Direct `read` 访问 `capabilityRoots` 下的文件直接返回 `{ kind: "allow" }`；
- [x] Direct `list` 访问 `capabilityRoots` 下的目录直接返回 `{ kind: "allow" }`；
- [x] Direct `write` 与 `edit` 访问 `capabilityRoots` 下的路径直接返回 `{ kind: "deny", code: "hard-boundary" }`；
- [x] Shell 写或删除涉及 `capabilityRoots` 下的路径直接返回 `{ kind: "deny", code: "hard-boundary" }`；
- [x] 位于 `capabilityRoots` 内的 `auth.json` 仍返回 `{ kind: "deny", code: "hard-boundary" }`。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/authorization/index.ts`
- Test: `tests/access-gate/access-decision/core/authorization/direct-tracer.test.ts`
- Test: `tests/access-gate/access-decision/core/authorization/shell-tracer.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/authorization/direct-tracer.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/core/authorization/shell-tracer.test.ts`

**Steps:**
1. 编写 Slice 1 对应的新增测试用例（RED）；
2. 扩展 `createMandatoryBoundaries` 与 `MandatoryBoundaryFacts`；
3. 更新 `authorizeDirect` 与 `authorizeShell` 的路径判定逻辑；
4. 运行单测验证绿灯（GREEN）。

#### Slice 2: GateSession 聚合与生命周期穿透
**Goal:** `createGateSession` 支持 `capabilityRoots` 输入校验并传递至 Mandatory Boundaries，保持 `allowedRoots` 纯净。
**Requirements covered:** R-5
**Depends on:** Slice 1

**Acceptance Criteria:**
- [x] `createGateSession` 校验 `capabilityRoots` 必须为非空绝对路径数组（若提供）；
- [x] `session.evaluate` 在 `develop` preset 下依然拦截对 `capabilityRoots` 的 Direct `write`；
- [x] `session.evaluate` 在 `review` preset 下放行对 `capabilityRoots` 的 Direct `read`（即使不在工作区）。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/runtime/gate-session.ts`
- Test: `tests/access-gate/access-decision/runtime/gate-session.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/runtime/gate-session.test.ts`

**Steps:**
1. 编写 GateSession 相关的输入校验与三域求值测试（RED）；
2. 更新 `gate-session.ts` 中的参数校验与构造；
3. 运行单测验证绿灯（GREEN）。

#### Slice 3: Pi 宿主适配层自动装配与端到端集成
**Goal:** `pi-composition` 在初始化会话时自动推导 `agentDir` 隔离的 `git`、`node_modules`、`skills`、`extensions` 作为能力资产根，不污染凭据根。
**Requirements covered:** R-6
**Depends on:** Slice 2

**Acceptance Criteria:**
- [x] `pi-composition` 推导的能力资产根严格限定在 `git`、`node_modules`、`skills`、`extensions`；
- [x] 端到端模拟测试：模型直接 `read` 位于 `agentDir/skills/...` 下的文件得到 `allow`；
- [x] 模型试图 `write` 位于 `agentDir/skills/...` 下的文件被静态 reason 阻断（hard-boundary）；
- [x] 针对 `agentDir/auth.json` 的任何读取仍被阻断（hard-boundary）；
- [x] 全量 `npm test` 通过。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/runtime/pi-composition.ts`
- Test: `tests/access-gate/access-decision/runtime/pi-composition.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/runtime/pi-composition.test.ts`
- `npm test`

**Steps:**
1. 编写 Pi 组合层端到端能力资产读写测试用例（RED）；
2. 在 `pi-composition.ts` 中实现标准分发子目录推导并传入 `createGateSession`；
3. 运行测试验证绿灯（GREEN）；
4. 运行全量 `npm test`。

### Verification

- `npm run test:file -- tests/access-gate/access-decision/core/authorization/direct-tracer.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/runtime/gate-session.test.ts`
- `npm run test:file -- tests/access-gate/access-decision/runtime/pi-composition.test.ts`
- `npm test`

### Durable Updates Checklist

- [x] 更新 `CONTEXT.md` 架构与 Negative Space 章节（记录三域模型与能力资产防篡改保证）
- [ ] 在 `docs/decisions.md` 记录或关联新决策（若必要）
- [x] 运行 `scripts/validate-docs.ts` 与 `scripts/validate-skills.ts`

## T-0132: 待创建
