# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0147: 收敛会话接力单一交互入口、移除 handoff-session 技能并补齐后继协调契约

- **Kind:** refactor
- **Status:** verified
- **Reversal surface:** user-boundary

### Background & Goal

在 D-092 会话内嵌 Handoff 初版实施后，保留了独立的 `handoff-session` 技能作为辅助审计，导致用户既可通过 `/skill:handoff-session` 准备交接，又需通过 `/akeel-handoff` 触发原生会话替换，存在双重入口与认知摩擦。同时，命令名带有冗余的 `akeel-` 命名空间前缀，与 Access Gate 的 `/policy` 等简明交互命令风格不一致。

此外，在移除 `handoff-session` 技能后，后继会话模型缺乏显式的 `reconcile` payload 契约指引，容易因模型盲猜参数导致后继会话 `OWNER_TOOL` 锁死；且命令 handler 内部在错误分支与 catch 块中使用 `staticFailure` 抛错破坏了终端通知一致性。

本任务旨在：
1. 将交互入口完全收敛为单一 `/handoff` 原生命令，移除冗余的独立 `handoff-session` 技能；
2. 同步更新 D-078 与 D-092 决策、CONTEXT 与 README 文档，明确消除双入口认知割裂；
3. 在后继会话 kickoff 提示词模板中显式补齐 `reconcile` 结构契约指引，彻底消除后继模型认知盲区与工具死锁风险；
4. 将 `handoff` 命令 handler 的错误处理规范化为用户端优雅通知（UI notify / stderr），消除未捕获异常；
5. 在 `record-containers` 中下沉 Task 记录标准元数据词汇机械检查，并增加候选记录 Status 反向防御；
6. 彻底废除 `task-<topic>.md` 冗余特例，将任务容器收敛为单一 `docs/task.md`，并优化 Revisit condition 的生成与维护规范。

### Out of Scope

- 不保留已废除命令 `/akeel-handoff` 的向后兼容别名（当前处于内部开发阶段，无存量外部用户，直接收敛为单一干净接口）；
- 不改变底层 `HandoffStore` 与 `ContinuationCapsule` 的核心状态机与校验逻辑；
- 不改变 Access Gate 策略与审计边界。

### Requirements

- **REQ-1 (命令归一与移除冗余技能):**
  - 将 `pi.registerCommand` 从 `akeel-handoff` 变更注册为裸名 `handoff`；
  - 彻底删除 `packages/guidance/skills/workflows/handoff-session/SKILL.md` 文件及所在目录；
  - 在 `docs/decisions.md` 中同步修订 D-078（移除 manual workflows 列表中的 handoff-session 枚举）与 D-092（明确收敛至单一 `/handoff` 原生命令，并记入 Rejected）；
  - 同步更新 `CONTEXT.md`、`README.md` 与 `docs/traceability.md` 中的命令与入口说明。
- **REQ-2 (后继会话协调契约显式化):**
  - 在 `pi-composition.ts` 的后继会话 kickoff 提示词模板（`sendUserMessage`）中明确注入 `reconcile` payload 的结构契约（含 `importedSemanticIds`, `conflicts`, `unresolvedSemanticIds`, `workspaceVerified`），确保后继模型零摩擦完成状态机对齐并解锁 `OWNER_TOOL`。
- **REQ-3 (命令异常处理与测试守卫):**
  - 改造 `handoff` 命令 handler 的错误路径，将 `staticFailure` 替换为 `context.ui.notify(..., "error")` / `console.error` 并优雅返回；
  - 适配 `pi-composition.test.ts` 与 `validate-skills.test.ts`，增加针对 kickoff 提示词结构契约以及非 idle 命令拒绝优雅通知的测试断言。
- **REQ-4 (Project Record 标准词机械校验与候选墓碑反向防御):**
  - 在 `packages/guidance/src/record-containers/validator.ts` 中实现 Task 记录标准元数据字段（`Kind`、`Status`、`Reversal surface`）的机械检查与合法枚举校验，并拒绝废弃的 `Origin` 字段；
  - 增加 `checkCandidateHygiene`，反向机械拦截在 `docs/candidates.md` 中写入 `Status`（如 `promoted`/`dismissed`/`parked`）的墓碑行为；
  - 在 `validateRecordContainers` 与 `scripts/validate-docs.ts` 中联动生效并补充自动化测试。
- **REQ-5 (废除 task-<topic> 特例并优化 Revisit condition 规范):**
  - 在 `principles.md`、`decisions.md` (D-028) 及所有技能（`implement-work`、`survey-context`、`brainstorm-design`、`security-review`、`doc-sync`）中彻底移除 `task-<topic>.md` / `task-*.md` 特例，收敛至单一 `docs/task.md`；
  - 在 `candidate-review.md` 中强化 `Revisit condition` 规范（要求反向击穿 Why Not Now、严禁包含“用户要求/需要时”等套套逻辑逃逸舱、实现一秒客观可证伪判定），保持 `principles.md` 极简骨架不被写作教程膨胀。

### Plan

#### Slice 1: 命令归一、决策修订与技能移除
- 移除 `packages/guidance/skills/workflows/handoff-session/SKILL.md`；
- 更新 `pi-composition.ts` 中的命令注册为 `handoff`；
- 更新 `docs/decisions.md`（D-078, D-092）、`CONTEXT.md`、`README.md`、`docs/traceability.md`。

#### Slice 2: 补齐后继会话协调契约与命令错误处理
- 在 `pi-composition.ts` 的 `sendUserMessage` 中注入 `reconcile` payload 规范；
- 改造 `handoff` 命令 handler 的错误返回逻辑为 `notifyCommandError`。

#### Slice 3: 测试覆盖与记录校验
- 调整 `pi-composition.test.ts` 与 `validate-skills.test.ts`；
- 增加 kickoff 提示词契约断言与非 idle 拒绝测试；
- 运行 `akeel_validate_records` 校验容器完整性。

#### Slice 4: 容器机械检查下沉、废除 task-* 特例与 Revisit condition 规范优化
- 在 `packages/guidance/src/record-containers/validator.ts` 中实现 `checkTaskHygiene` 与 `checkCandidateHygiene`；
- 在 `validateRecordContainers` 与 `scripts/validate-docs.ts` 中接入校验；
- 全局移除 `task-<topic>.md` / `task-*.md` 引用并收敛至单一 `docs/task.md`；
- 在 `principles.md` 与 `candidate-review.md` 中细化 `Revisit condition` 编写三项准则；
- 补充 `tests/guidance/record-containers/validator.test.ts` 与 `tests/validate-docs.test.ts`。

### Verification Evidence

- `akeel_validate_records` 校验通过，记录容器格式无误，机械拦截非法 Task 状态词、Origin 以及 Candidate 墓碑 Status；
- `tests/guidance/artifact-exchange/pi-composition.test.ts` 全面覆盖 `/handoff` 合成、view、非 idle 优雅拒绝、retry 以及后继协调提示词契约；
- `tests/validate-skills.test.ts` 移除针对不存在技能的断言并保持通过；
- `tests/guidance/record-containers/validator.test.ts` 与 `tests/validate-docs.test.ts` 覆盖 Task/Candidate 机械拦截。

### Durable Updates Checklist

- [x] `packages/guidance/src/artifact-exchange/pi-composition.ts`
- [x] `packages/guidance/src/bootstrap/principles.md`
- [x] `packages/guidance/src/record-containers/validator.ts`
- [x] `packages/guidance/skills/workflows/survey-context/candidate-review.md`
- [x] `packages/guidance/skills/workflows/survey-context/SKILL.md`
- [x] `packages/guidance/skills/workflows/implement-work/SKILL.md`
- [x] `packages/guidance/skills/workflows/brainstorm-design/SKILL.md`
- [x] `packages/guidance/skills/disciplines/domain-modeling/SKILL.md`
- [x] `packages/guidance/skills/disciplines/security-review/SKILL.md`
- [x] `packages/guidance/skills/disciplines/doc-sync/SKILL.md`
- [x] `scripts/validate-docs.ts`
- [x] `scripts/validate-skills.ts`
- [x] `tests/guidance/artifact-exchange/pi-composition.test.ts`
- [x] `tests/guidance/record-containers/validator.test.ts`
- [x] `tests/guidance/record-containers/pi-composition.test.ts`
- [x] `tests/validate-docs.test.ts`
- [x] `tests/validate-skills.test.ts`
- [x] `AGENTS.md`
- [x] `docs/candidates.md`
- [x] `docs/decisions.md`
- [x] `CONTEXT.md`
- [x] `README.md`
- [x] `docs/traceability.md`
- [x] `packages/guidance/skills/workflows/handoff-session/SKILL.md` (已删除)
- [x] `docs/task.md`

## T-0148: 待创建

