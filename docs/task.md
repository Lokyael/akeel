# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0148: 全面接入 Pi 0.86 原生能力：重构原则注入、硬边界直接终止与 Handoff 强类型约束

- **Kind:** refactor
- **Status:** in-progress
- **Reversal surface:** user-boundary

### Background & Goal

在对 Pi 0.86.0 深度审查后发现，AKeel 当前多处核心交互实现仍停留在针对旧版 Pi 功能缺失时的“权宜兼容态（Workarounds）”，存在明显的角色语义、缓存利用率、执行熔断深度与类型约束缺陷：
1. **原则注入机制滞后**：`packages/guidance/src/bootstrap/index.ts` 监听 `context` 钩子向每轮对话注入伪造为 `role: "user"` 的消息，并在内存中维护 `needsInjection`、全量扫描消息历史寻找标记（`bootstrapAlreadyPresent`）以及计算偏移跳过 `compactionSummary`。这不仅模糊了原则作为系统级元纪律（“These principles are your DNA”）的最高权威，而且容易破坏现代大模型的 Prompt 前缀缓存（Prompt Prefix Caching）；同时 `principles.md` 首尾被迫保留专供扫描识别的机器专有标记；
2. **Access Gate 拦截缺乏宿主熔断**：在并行工具调用场景下，触发 Mandatory Boundary（不可放宽硬边界，如 D-070 凭据偷取、D-071 破坏性删除、D-090 防篡改能力资产越权）时，当前仅返回普通 `{ block: true, reason }`，宿主未终止批次执行循环，模型仍可能在同轮或后继继续尝试绕过；
3. **Handoff 参数盲猜与约束采样失效**：`HANDOFF_PARAMETERS` 中使用了 `payload: Type.Optional(Type.Any())`，导致模型无法从 Schema 中获悉参数结构，且使 Pi 0.86.0 默认开启的 Strict JSON-schema Constrained Sampling 完全失效；
4. **事件监听无注销闭环**：`pi.on()` 未保存并调用返回的注销句柄（`unsubscribe`），存在潜在的句柄悬挂风险；
5. **宿主环境类型声明陈旧**：`types/pi-coding-agent.d.ts` 缺失 Pi 0.84 - 0.86 的关键接口与事件声明。

本任务旨在全面消除上述历史权宜代码，接入 Pi 0.86 原生能力：
1. 重构原则注入为纯函数式监听 `before_agent_start` 并写入 `event.systemPromptOptions.sections.akeel_principles`，清理 `principles.md` 专有标记，删减冗余扫描与状态逻辑；
2. 为 Access Gate 不可放宽的安全硬边界引入 `{ block: true, reason, terminate: true }`，实现宿主级执行循环强熔断；
3. 为 `akeel_handoff` 补充严格的强类型 TypeBox Payload Schema，激活受约束采样；
4. 治理事件监听生命周期（`unsubscribe`）并全面对齐 `types/pi-coding-agent.d.ts` 类型声明；
5. 补充与调整测试套件，确保全量测试与校验绿灯。

### Out of Scope

- 不将 `context-pruner` 改为 `tool_result`（坚决遵循 D-084 决策，保持磁盘与 Git 原始测试证据 100% 真实无损，仅在进入注意力前做纯内存投影）；
- 不侵入用户直接在终端执行的 `user_bash`（继续遵循 D-002 与 CONTEXT Negative Space）；
- 不变更 `HandoffStore` 与 `ContinuationCapsule` 底层的核心状态机算法。

### Requirements

- **REQ-1 (原则注入现代化与文档洁净化):**
  - 重构 `packages/guidance/src/bootstrap/index.ts`：通过 `pi.on("before_agent_start")` 将原则注入到 `event.systemPromptOptions.sections.akeel_principles`；
  - 彻底删除 `needsInjection`、`session_start`、`session_compact` 监听、`bootstrapAlreadyPresent` 历史扫描与 `findInsertionPoint` 偏移计算；
  - 清理 `packages/guidance/src/bootstrap/principles.md` 首尾的 `<AKEEL_PRINCIPLES>`、`akeel:core-principles` 与 `</AKEEL_PRINCIPLES>` 标记，交由 Pi 自动维护 XML 节点。
- **REQ-2 (强制安全硬边界宿主级熔断):**
  - 在 `packages/access-gate/src/access-gate/access-decision/runtime/host-composition.ts` 中，当决策结果命中不可放宽的强制硬边界（如 `credential-violation`、`destroy-denied`、`asset-violation` 等由 Mandatory Boundary 发行的拒绝）时，在返回的阻断对象中注入 `terminate: true`；普通策略模式拒绝与需审批操作保持普通阻断。
- **REQ-3 (Handoff 参数强类型化与约束采样激活):**
  - 在 `packages/guidance/src/artifact-exchange/pi-composition.ts` 中，彻底废除 `Type.Any()`，为 `HANDOFF_PARAMETERS` 的各个 action（`record`、`close`、`prepare`、`reconcile` 等）构建严格的强类型 TypeBox Schema，激活 Pi 0.86.0 的 Strict JSON Schema 语法约束采样。
- **REQ-4 (事件监听注销闭环):**
  - 在 `packages/access-gate/src/access-gate/access-decision/runtime/pi-composition.ts` 中，收集 `pi.on()` 返回的注销函数，在 `session_shutdown` 时统一执行清理。
- **REQ-5 (补齐宿主环境类型声明):**
  - 在 `types/pi-coding-agent.d.ts` 中，补齐 `before_agent_start`、`systemPromptOptions`、`BuildSystemPromptOptions`、`terminate`、`unsubscribe`、`ui_prompt_*` 等 Pi 0.86.0 官方导出的最新接口。
- **REQ-6 (测试套件更新与全量验证):**
  - 编写与适配单元测试及集成测试，覆盖 `before_agent_start` 原则注入、硬边界 `terminate: true` 熔断、Handoff 强类型参数校验与注销机制；
  - 保持全量验证通过（`npm test`、文档校验与容器校验）。

### Plan

#### Slice 1: 补齐宿主环境声明与治理事件注销
- 更新 `types/pi-coding-agent.d.ts`，加入 Pi 0.86.0 的核心类型；
- 在 `packages/access-gate/src/access-gate/access-decision/runtime/pi-composition.ts` 中接入 `unsubscribe`。

#### Slice 2: Access Gate 强制安全硬边界支持 `terminate: true`
- 改造 `packages/access-gate/src/access-gate/access-decision/runtime/host-composition.ts`；
- 针对不可放宽的硬边界返回 `{ block: true, reason, terminate: true }`；
- 更新 `tests/access-gate/runtime/host-composition.test.ts` 覆盖测试。

#### Slice 3: 重构原则注入为 `before_agent_start` 并洁净 `principles.md`
- 清理 `packages/guidance/src/bootstrap/principles.md` 首尾专有扫描标记；
- 重写 `packages/guidance/src/bootstrap/index.ts` 为监听 `before_agent_start` 写入 sections；
- 新增 `tests/guidance/bootstrap/bootstrap.test.ts`，验证原则注入到 `systemPromptOptions.sections`。

#### Slice 4: Handoff 工具参数强类型化
- 在 `packages/guidance/src/artifact-exchange/pi-composition.ts` 中拆分定义严格的 `HANDOFF_PARAMETERS` TypeBox Schema；
- 更新 `tests/guidance/artifact-exchange/pi-composition.test.ts` 验证入参强类型与行为。

#### Slice 5: 文档同步与全量验证
- 更新 `CONTEXT.md` 对应技术事实描述；
- 运行 `npm test`、`akeel_validate_records`，确保所有测试与检验 100% 绿灯。

### Verification Evidence

- 待执行验证并记录证据。

### Durable Updates Checklist

- [ ] `types/pi-coding-agent.d.ts`
- [ ] `packages/access-gate/src/access-gate/access-decision/runtime/host-composition.ts`
- [ ] `packages/access-gate/src/access-gate/access-decision/runtime/pi-composition.ts`
- [ ] `packages/guidance/src/bootstrap/index.ts`
- [ ] `packages/guidance/src/bootstrap/principles.md`
- [ ] `packages/guidance/src/artifact-exchange/pi-composition.ts`
- [ ] `tests/access-gate/runtime/host-composition.test.ts`
- [ ] `tests/guidance/bootstrap/bootstrap.test.ts`
- [ ] `tests/guidance/artifact-exchange/pi-composition.test.ts`
- [ ] `CONTEXT.md`
- [ ] `docs/task.md`

## T-0149: 待创建
