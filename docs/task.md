# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0149: 实施独立子代理审查提出的 7 项工程打磨修复 (ENG-01 ~ ENG-07)

- **Kind:** refactor
- **Status:** in-progress
- **Reversal surface:** engineering

### Background & Goal

在对本次 Pi 0.86 原生现代化改造（T-0148）执行独立子代理多轴审查（`code-review`）后，需求审查轴全票通过（100% 满足），工程审查轴精准指出了 7 项工程打磨点（ENG-01 至 ENG-07）：
1. `SEMANTIC_UNIT_SCHEMA` 中 `statement` 可选导致与底层 `validateSemanticUnit` 必填冲突，且包含不应在 record 阶段出现的 `closure` 和非 live 状态（ENG-01）；
2. `PREPARE_PAYLOAD_SCHEMA` 内部全字段可选与底层 `createContinuationCapsule` 必填参数冲突（ENG-02）；
3. `accessGate` 默认导出丢弃了注销函数返回值（ENG-03）；
4. `akeel_principles` 直接对 `sections` 属性赋值，在对象被冻结时存在潜在 `TypeError` 风险（ENG-04）；
5. `RECONCILE_PAYLOAD_SCHEMA` 中 `workspaceVerified` 写死 `Type.Literal(true)` 导致无法合法上报 `false`（blocked）状态（ENG-05）；
6. Handoff Schema 测试缺乏针对 TypeBox `Value.Check` 的正反例深度断言（ENG-06）；
7. `BuildSystemPromptOptions.sections` 在声明中非可选，但运行时防御性按可选处理（ENG-07）。

本任务旨在全面实施上述 7 项工程打磨，消除 Schema 与底层运行时的全部摩擦，补齐深度测试网。

### Out of Scope

- 不变更 `HandoffStore` 与 `ContinuationCapsule` 底层算法逻辑；
- 不变更 Access Gate 准入内核逻辑。

### Requirements

- **REQ-1 (Handoff Schema 修复与收敛 - ENG-01, ENG-02, ENG-05):**
  - 为 `action: "record"` 提供专用的 `RECORD_PAYLOAD_SCHEMA`，将 `statement` 设为必填，限定 `status: "live"`，移除 `closure`；
  - 在 `PREPARE_PAYLOAD_SCHEMA` 内部，将 `taskRef`、`authorityRefs`、`roots`、`checkpoint`、`workspace` 标注为必填；
  - 将 `RECONCILE_PAYLOAD_SCHEMA` 中的 `workspaceVerified` 改为 `Type.Boolean()`。
- **REQ-2 (入口注销对齐与防御赋值 - ENG-03, ENG-04):**
  - `packages/access-gate/src/access-gate/index.ts` 导出函数返回 `installGlobalPiAccessDecision(pi, {});`；
  - `packages/guidance/src/bootstrap/index.ts` 使用浅拷贝解构重新赋值 `sections`。
- **REQ-3 (类型声明修正 - ENG-07):**
  - `types/pi-coding-agent.d.ts` 中将 `sections` 标记为可选 `sections?: Record<string, string | null>`。
- **REQ-4 (深度 Schema 测试网 - ENG-06):**
  - 在 `tests/guidance/artifact-exchange/pi-composition.test.ts` 中引入 TypeBox `Value.Check`，对 `record`、`close`、`prepare`、`reconcile` 增加深度正向通过与反向拦截断言。

### Plan

#### Slice 1: 修复 Schema 契约、类型声明与入口导出
- 修改 `types/pi-coding-agent.d.ts`（ENG-07）；
- 修改 `packages/access-gate/src/access-gate/index.ts`（ENG-03）；
- 修改 `packages/guidance/src/bootstrap/index.ts`（ENG-04）；
- 修改 `packages/guidance/src/artifact-exchange/pi-composition.ts`（ENG-01, ENG-02, ENG-05）。

#### Slice 2: 补充深度测试并全量验证
- 更新 `tests/guidance/artifact-exchange/pi-composition.test.ts`（ENG-06）；
- 运行 `npm test` 与 `akeel_validate_records`，完成全量校验与清档。

### Verification Evidence

- 待执行验证并记录证据。

### Durable Updates Checklist

- [ ] `types/pi-coding-agent.d.ts`
- [ ] `packages/access-gate/src/access-gate/index.ts`
- [ ] `packages/guidance/src/bootstrap/index.ts`
- [ ] `packages/guidance/src/artifact-exchange/pi-composition.ts`
- [ ] `tests/guidance/artifact-exchange/pi-composition.test.ts`
- [ ] `docs/task.md`

## T-0150: 待创建
