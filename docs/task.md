# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0140: 用户项目 Project Record 容器确定性校验能力

- **Kind:** feature
- **Status:** verified
- **Origin:** C-032
- **Reversal surface:** engineering

### Background & Goal

当前 AKeel 的 Project Record 容器（`docs/candidates.md`、`docs/task.md`、`docs/decisions.md`）结构规范唯一锚定在 `principles.md`。自仓构建有 `scripts/validate-docs.ts` 作为强门禁，但在用户项目中，完全依赖 `doc-sync` 中 Agent 自主使用 Direct `grep`/`read` 定点检查，缺乏确定性代码执行保障，易受模型注意力漂移影响。
同时，用户项目可能是非 Node.js 异构环境，且在 Access Gate 的 Shell 委托执行与能力资产防篡改硬边界（D-090, D-067）管辖下，外部脚本没有可靠的 Agent 执行通道。

按架构定位，Project Record 容器规范是 AKeel 作为产品向用户项目交付的核心资产，AKeel 需要对其结构维护承担确定性责任。
本任务目标：
1. 在 `packages/guidance/src/record-containers/` 抽取零外部依赖的纯函数容器校验引擎（`validateRecordContainers`）；
2. 改造自仓 `scripts/validate-docs.ts` 复用该核心模块进行基础容器检查，自身仅保留自仓特定的跨包源码 `D-xxx` 引用扫描与 Decision hygiene 校验；
3. 在 `akeel-guidance` 扩展中注册专供 Agent 调用的原生 Direct 工具 `akeel_validate_records`，实现零 Shell/解释器依赖、零 Access Gate 审批摩擦的确定性校验；
4. 升级 `doc-sync` 技能契约，将模型手工检查替换为强制调用 `akeel_validate_records` 并验证通过；
5. 全量自动化测试保障零回归。

### Out of Scope

- 绝对不引入自动修复（Auto-Fix）：坚持只报不改，防止静默截断、错位或破坏记录正文；
- 不接入 Access Gate 的 `tool_call` 准入拦截管道（格式属于 Guidance 纪律域，不污染安全准入信任链）；
- 不注册任何人类斜杠命令（不增加 `/validate-records`，保持人类交互界面零侵入）；
- 不引入独立 CLI/npm 分发或 CI 门禁（第一阶段聚焦宿主运行时原生工具赋能）。

### Requirements

- **REQ-1 (纯函数容器校验核心):**
  - 单一格式来源：严格依照 `principles.md` Project Records；
  - 正则契约：严格匹配 `^## ([CTD])-0\d{2,}: 待创建$`；
  - 唯一性：每个存在的容器文件必须恰好有 1 个匹配槽位；
  - 末尾约束：槽位必须是文件最后一个非空行（槽位后绝无任何残留非空内容）；
  - 前缀一致性：C 对应 `docs/candidates.md`，T 对应 `docs/task.md`，D 对应 `docs/decisions.md`；
  - 可选容器安全跳过：若文件不存在，安全忽略，绝不报错或自动新建文件；
  - 诊断报告：返回 `{ ok: boolean, checked: string[], errors: string[] }`，错误包含文件名、行号与清晰违反事实。
- **REQ-2 (自仓验证脚本 DRY 复用):**
  - `scripts/validate-docs.ts` 调用核心校验模块，保证自仓测试零行为漂移；
  - `tests/validate-docs.test.ts` 100% 通过。
- **REQ-3 (面向 Agent 的原生扩展工具):**
  - 在 `akeel-guidance` 中注册原生 Direct 工具 `akeel_validate_records`；
  - 参数：可选 `{ projectRoot?: string }`（默认为会话 `context.cwd`）；
  - 执行纯校验引擎并输出结构化结果；
  - 工具定义完全符合 Pi `ExtensionToolDefinition` 合同。
- **REQ-4 (`doc-sync` 技能契约升级):**
  - 更新 `packages/guidance/skills/disciplines/doc-sync/SKILL.md` Step 2 第 10 项；
  - 指引 Agent 在文档同步时调用 `akeel_validate_records`，若 `ok: false` 必须就地修复。
- **REQ-5 (全量回归与测试闭环):**
  - 覆盖多槽位、缺失槽位、槽位非末尾、前缀不符、LF/CRLF、空文件、可选容器缺失等场景的完整测试；
  - 全量 `npm test`（500+ 用例及技能/文档校验）全绿。

### Plan

#### Slice 1: 纯函数容器校验核心及单元测试 (TDD)
- 在 `tests/guidance/record-containers/validator.test.ts` 编写完整红灯测试；
- 在 `packages/guidance/src/record-containers/validator.ts` 实现纯函数核心逻辑；
- 运行测试使其变绿。

#### Slice 2: 自仓 validate-docs.ts 重构复用核心模块
- 修改 `scripts/validate-docs.ts` 接入核心校验逻辑；
- 运行 `tests/validate-docs.test.ts` 与 `scripts/validate-docs.ts` 验证零回归。

#### Slice 3: 注册原生扩展工具 akeel_validate_records (TDD)
- 在 `tests/guidance/record-containers/tool.test.ts` 编写工具注册与执行测试；
- 在 `packages/guidance/src/record-containers/pi-composition.ts` 实现工具注册与 Direct 调用；
- 在 `packages/guidance/package.json` 与根目录 `package.json` 的 `pi.extensions` 中声明该扩展；
- 验证工具测试通过。

#### Slice 4: 升级 doc-sync 技能契约并校验
- 更新 `packages/guidance/skills/disciplines/doc-sync/SKILL.md`；
- 运行 `validate-skills.ts` 与 `validate-docs.ts` 确保提示词与引用合规。

#### Slice 5: 全量回归、文档同步与清档准备
- 运行全量 `npm test`；
- 更新 durable updates checklist。

### Durable Updates Checklist
- [x] 纯函数核心 — `packages/guidance/src/record-containers/validator.ts`
- [x] 自仓脚本复用 — `scripts/validate-docs.ts` 接入核心
- [x] 原生扩展工具 — `akeel_validate_records` 注册并接入 manifests
- [x] 技能升级 — `doc-sync/SKILL.md` Step 2 第 10 条
- [x] 单元测试 — 核心校验与工具测试（519 测试全部绿灯通过）
- [ ] 验证全绿与 `docs/task.md` 清档

## T-0141: 待创建



