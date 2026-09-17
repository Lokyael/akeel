# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0118: 支持 Shell 重定向至 /dev/null 特殊设备的无害丢弃（C-025 细项落地）

- **Kind:** bug
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** user-boundary

### Background & Goal
在 Shell 命令行中，向 `/dev/null` 重定向（如 `2>/dev/null` 丢弃 stderr、`> /dev/null` 丢弃 stdout 或 `< /dev/null` 输入 EOF）是 Linux 环境下极其高频的无害用法。当前 Access Gate 在 Canonical 编译阶段将所有重定向目标统一作为普通文件系统路径提取，且对任何 target 路径强制追加 `write` effect，导致向 `/dev/null` 的丢弃重定向被 `violatesPathBoundary`（超出项目访问根）判定为 `hard-boundary` 致命拦截，同时将只读命令属性错误污染为修改操作。本任务在 Canonical 编译层为规范化的 `/dev/null` 丢弃流建立特例识别，使其不产生普通文件系统 target 路径事实、不污染写入 effect，从而解除良性探测与只读命令的误拦截。

### Out of Scope
- **非 `/dev/null` 外部设备**: `/dev/zero`、`/dev/urandom`、`/dev/sda`、`/dev/pts/*` 以及任何非 `/dev/null` 设备路径依然严格遵守路径边界与安全隔离。Revisit when 有明确的设备建模需求。
- **命令操作数（Operands）**: 作为命令常规参数的 `/dev/null`（如 `rm /dev/null`、`touch /dev/null`、`cat /dev/null` 等）保持现有命令语义与路径策略，破坏性操作继续 hard-deny。Revisit when 评估通用设备参数支持。
- **复合重定向与 FD 复制**: `&>`、`>&`、`2>&1` 等复合重定向仍按现行语法支持矩阵处理（fail-closed）。

### Requirements
- **REQ-1 (Discard Sink Recognition):** 在 `core/compilation/shell/invocation.ts` 中识别重定向目标为 `/dev/null`（支持 `>`、`>>`、`<>`、`2>` 等输出丢弃，以及 `<` 输入），将其标记为流丢弃或空输入，不作为普通文件系统路径提取到 `paths` 中。
- **REQ-2 (Effect Purity):** 重定向到 `/dev/null` 的输出流不产生 `write` effect，自 `/dev/null` 的输入流不产生基于外部文件的 `read` effect，原命令自身的 inspect/modify/destroy/execute effect 保持不变。
- **REQ-3 (Command Operands Untouched):** 仅在处理重定向运算符（`>`、`>>`、`<>`、`<`）的目标词时应用该规则；普通位置参数、选项参数中的 `/dev/null` 仍按普通路径和命令参数处理，不受此豁免。
- **REQ-4 (Policy & Boundary Preservation):** 原命令本身的权限裁决保持不变（例如 `git status 2>/dev/null` 维持 inspect / read 判定，在 `review`/`guided`/`develop` 下均可直接 allow；而 `rm file.txt 2>/dev/null` 维持 destroy 判定，受 destroy 门禁控制）。

### Design
1. **Compilation 阶段流识别 (`core/compilation/shell/invocation.ts`)**:
   - 在扫描 Shell 词表的重定向逻辑中（`redirectRole !== undefined`）：
     - 检查目标词是否为字面 `"/dev/null"`；
     - 若为 `"/dev/null"`，则将其判定为丢弃设备，不调用 `addPath`，重置 `redirectRole = undefined` 并跳过常规 target 路径注册；
     - 若不是 `"/dev/null"`，维持现有逻辑提取文件系统路径并标记相应 role。
2. **副作用纯净性保障**:
   - 由于未向 `paths` 追加 target 路径，`paths.some(({ path }) => path.role === "target")` 不会被 `/dev/null` 触发，避免了在只读命令（如 `git status`）中错误追加 `"write"` effect。
3. **安全硬边界守卫**:
   - 其它重定向路径（如 `> /dev/sda`、`> /etc/passwd`）正常提取路径事实并触发 Mandatory Boundary hard-deny；
   - 作为命令参数的 `/dev/null`（如 `rm /dev/null`）正常走命令参数解析流程，由命令分类和路径策略裁决。

### Plan

#### Slice 1: Invocation 编译层 /dev/null 重定向与副作用测试驱动实现
**Goal:** 使 Canonical 编译层正确识别 `/dev/null` 重定向，不提取目标路径，不产生错误的写副作用。
**Requirements covered:** REQ-1, REQ-2, REQ-3
**Depends on:** none

**Acceptance Criteria:**
- [ ] `git status 2>/dev/null` 编译为 `commandClass: "inspect"`, `effects: ["read"]`, `paths: []`。
- [ ] `echo hello > /dev/null` 编译为 `commandClass: "inspect"`, `effects: []`, `paths: []`。
- [ ] `cat < /dev/null` 编译为 `commandClass: "inspect"`, `effects: ["read"]`, `paths: []`。
- [ ] `git status 2> /dev/sda` 正常提取 `/dev/sda` 目标路径。
- [ ] `cat /dev/null` 正常提取 `/dev/null` 源路径。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Steps:**
1. (RED) 在 `tests/access-gate/access-decision/core/shell-semantics.test.ts` 中编写针对 `2>/dev/null`、`> /dev/null`、`< /dev/null` 以及非丢弃路径的测试用例，观察其失败。
2. (GREEN) 在 `invocation.ts` 的重定向处理分支中增加 `/dev/null` 判定并跳过路径注册。
3. (REFACTOR) 验证测试通过并保持逻辑精简。

#### Slice 2: Authorization 与端到端门禁策略集成验证
**Goal:** 确保 `/dev/null` 重定向在不同策略预设（review / develop）下正确放行，同时敏感与越界命令继续坚决拦截。
**Requirements covered:** REQ-4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 在 `review` 预设下，`git status 2>/dev/null` 直接 `allow`。
- [ ] 在 `review` 预设下，`git status 2> /dev/sda` 触发 `hard-boundary` deny。
- [ ] 在 `review` 预设下，`rm /dev/null` 触发 `hard-boundary` deny。
- [ ] 在 `review` 预设下，`cat file.txt > /dev/null` 正常读取工作区文件并丢弃输出，直接 `allow`。

**Files and Seams:**
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`
- Test: `tests/access-gate/index.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`
- `npm run test:file -- tests/access-gate/index.test.ts`

**Steps:**
1. (RED) 编写授权层与端到端集成测试，验证 `git status 2>/dev/null` 在 `review` 下的准入与越界命令拦截。
2. (GREEN) 验证现有授权信任链在干净的编译事实下直接跑通。
3. 执行相关测试套件确认无误。

#### Slice 3: 全量验证、文档与 Candidate 更新及 Task 清档
**Goal:** 更新 `CONTEXT.md`、`docs/decisions.md`、`docs/candidates.md`，执行全量门禁并清档。
**Requirements covered:** 全部
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] `docs/candidates.md` 中的 C-025 更新 `Special device/discard handling` 为已解决。
- [ ] `CONTEXT.md` 的 Negative Space / Architecture 准确反映 `/dev/null` 丢弃流语义。
- [ ] `npm test` 全量通过。
- [ ] 清理 Task Record。

**Files and Seams:**
- Modify: `docs/candidates.md`
- Modify: `CONTEXT.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `CONTEXT.md` — 更新 Architecture 与 Negative Space 中关于 Shell 重定向及 `/dev/null` 丢弃流的描述
- [ ] `docs/candidates.md` — 在 C-025 中更新 `Special device/discard handling` 检查项状态

## T-0119: 待创建

