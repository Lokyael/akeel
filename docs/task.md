# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0130: 安全边界终态 Guidance 与反绕过原则落地

- **Kind:** feature
- **Status:** in-progress
- **Origin:** 用户指令与安全边界反思
- **Goal:** 解决模型将任务完成度置于安全边界之上的行为偏差，落实简化的安全阻断终态 Guidance 协议，并在 principles.md 中确立安全边界不可逾越法则与反探测要求，同步 D-023 决策。

### Out of Scope

- 不修改 `AGENTS.md`（依用户指示“不做3”）。
- 不引入复杂的动态 prompt 注入或运行时断路器架构（保持 D-053 的 Policy 数据零注入与 D-023 的静态 bounded guidance 约束）。
- 不改变现行 Canonical 编译、Admission 判定或 Policy 内核的评估逻辑，仅更新 Host-facing Guidance 静态文案与 Principles 原则。

### Requirements

- **R1 — Simplified Guidance:** 在 `packages/access-gate/src/access-gate/access-decision/runtime/host-render.ts` 中增强 `hard-boundary` 与 `security-boundary` 的阻断 Guidance 文本，简明声明“禁止绕过或包装脚本，就地停机并向用户汇报”（`Blocked by a security boundary. Do not attempt bypasses or script wrappers; halt and report to the user.`），保持静态、bounded、无用户派生值。
- **R2 — Principle Invariants:** 在 `packages/guidance/src/bootstrap/principles.md` 的 `Rule Status` 明确澄清安全边界是不变量（inviolable invariants），不可被即兴指令视为可覆盖的 default；在核心原则（Direct Tools Before Shell）明确声明门禁判定为终态、禁止脚本包装/变形绕过、严禁翻阅门禁代码进行漏洞探测。
- **R3 — Decision Alignment:** 在 `docs/decisions.md` 的 D-023 中记录阻断 Guidance 的反绕过终态要求；核对 `CONTEXT.md` 保持事实同步。
- **R4 — Test Preservation:** 更新所有受 Guidance 文案变动影响的测试断言，确保全量 `npm test`（文档校验、技能校验、类型检查与全量单元测试）全部通过。

### Plan

#### Slice 1: 任务记录与检查点
**Goal:** 记录 T-0130 并提交 checkpoint 进入可达 Git 历史。
**Requirements covered:** R1-R4
**Depends on:** none
**Acceptance Criteria:**
- [ ] `docs/task.md` 包含完整的 T-0130 章节，推进 slot 至 T-0131。
- [ ] 提交 checkpoint commit。

#### Slice 2: Access Gate Guidance 更新与测试适配
**Goal:** 更新 `host-render.ts` 中的安全阻断文案，并适配相关测试文件。
**Requirements covered:** R1, R4
**Depends on:** Slice 1
**Acceptance Criteria:**
- [ ] `hard-boundary` 与 `security-boundary` 采用简化的反绕过 Guidance。
- [ ] 受影响的测试断言更新并通过。

#### Slice 3: principles.md 与决策文档同步
**Goal:** 更新原则文件和架构决策。
**Requirements covered:** R2, R3
**Depends on:** Slice 2
**Acceptance Criteria:**
- [ ] `principles.md` 固化安全不变量与反探测纪律。
- [ ] `docs/decisions.md` (D-023) 与 `CONTEXT.md` 保持一致。

#### Slice 4: 全量验证与任务收尾
**Goal:** 跑通全套测试并完成任务清理。
**Requirements covered:** R1-R4
**Depends on:** Slice 3
**Acceptance Criteria:**
- [ ] `npm test` 全绿（文档校验、技能校验、TypeScript 编译检查、全量单元测试）。
- [ ] 清空 `docs/task.md` 的 T-0130 章节。

### Durable Update Checklist

- [ ] 更新 `packages/access-gate/src/access-gate/access-decision/runtime/host-render.ts`
- [ ] 同步更新受影响的测试断言
- [ ] 更新 `packages/guidance/src/bootstrap/principles.md`
- [ ] 更新 `docs/decisions.md` (D-023)
- [ ] 更新 `CONTEXT.md`
- [ ] 验证 `npm test` 全绿后清空 Task 章节

## T-0131: 待创建

