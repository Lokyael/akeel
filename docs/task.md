# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0134: CONTEXT.md 维护方法制度化与 Architecture 负载控制重构

- **Origin:** C-041
- **Kind:** refactor
- **Reversal surface:** engineering

### Requirements

1. **规范与分诊纪律落地（产品能力层）**：
   - 在 `packages/guidance/src/bootstrap/principles.md` 的 `### CONTEXT.md Structure` 节中补齐内容分诊准则（Content Triage Rules）：
     - `## Architecture` 必须专注于系统当前顶层拓扑、核心求值管道、状态机与组件关系；
     - 明确禁止记录具体 CLI 选项列表（如 `-name`、`-maxdepth`）、变量名、内部函数名或数值常量（移入对应决策或代码）；
     - 明确禁止叙述单个 Skill 的内部执行流程与触发列表（已有 SKILL.md 与 Glossary 承载）；
     - `Negative Space` 统一定义系统明确排除的范围与残余风险，`Architecture` 不得反向重复罗列。
   - 在 `packages/guidance/skills/disciplines/doc-sync/SKILL.md` 中强化 Architecture 同步检查项：要求提炼宏观架构，禁止向段落末尾单向堆砌流水账。
   - 在 `packages/guidance/skills/disciplines/domain-modeling/SKILL.md` 中强化内联更新守卫。
2. **自动化 Hygiene 校验（工具层）**：
   - 在 `scripts/validate-docs.ts` 中实现 `checkContextHygiene(content: string)`：
     - 校验必须严格依序包含 `## Glossary`、`## Architecture`、`## Active Decisions`、`## Negative Space` 四个标准二级标题；
     - 限制 `## Architecture` 内单个 bullet 或段落的字符数预算（单个 bullet 超过 1,000 字符报错），防止单一大段累加器反模式；
   - 在 `tests/validate-docs.test.ts` 中为 `checkContextHygiene` 编写契约测试，覆盖合法结构、缺失标题、单段超长、顺序错乱等场景。
3. **`CONTEXT.md` 存量内容重构（标杆落地）**：
   - 按分诊新规范彻底重构 `CONTEXT.md ## Architecture`：
     - 剔除 Bullet 1 中对 10 个技能流转的冗余罗列；
     - 将 Bullet 5 中 2,300 字符的流水账拆解为结构化子系统架构切面；
     - 消除与 `Negative Space` 的重复条款；
     - 总体积削减 30%~40%，消除上下文启动负荷。
4. **全量回归与生命周期闭环**：
   - 保证 `validate-docs`、`validate-skills`、`tsc --noEmit` 全绿；
   - 从 `docs/candidates.md` 迁移清理 `C-041` 停车记录；
   - 验证完成后清空 T-0134 任务正文。

### Design

1. **`principles.md` 分诊规则**：
   - 在 `### CONTEXT.md Structure` 后定义四段的职责分工与准入边界。
   - `Glossary`：领域名词与精确意图；
   - `Architecture`：常驻顶层拓扑、子系统与处理管道不变量；
   - `Active Decisions`：存活决策索引；
   - `Negative Space`：系统明确排除的范围与残余风险。
2. **`doc-sync` 与 `domain-modeling` 契约增强**：
   - 明确架构同步要求提炼为组件/管道级契约，禁止向 Architecture 末尾流水账追加选项。
3. **`scripts/validate-docs.ts` 新增校验器**：
   - 解析 H2 标题序列，验证必须包含四段且顺序一致；
   - 提取 `Architecture` 范围文本，按行识别 bullet 和独立段落，计算字符长度；
   - 若单 bullet 超过 1000 字符，报告 `context-architecture-budget-exceeded`。
4. **`CONTEXT.md` 模块化重组**：
   - 将现有 Architecture 划分为 8 个结构化模块：分发拓扑、提示词面、单一授权管道、三域路径、命令语义流、静态预算、策略生命周期、上下文准入协作；
   - 消除技能流程与负向重复，提炼抽象，保留全部既有 D-xxx 决策引用。

### Plan

- [ ] **Slice 1: 规范与分诊纪律落地 (`principles.md`, `doc-sync`, `domain-modeling`)**
- [ ] **Slice 2: 自动化 Hygiene 校验与测试 (`scripts/validate-docs.ts`, `tests/validate-docs.test.ts`)**
- [ ] **Slice 3: `CONTEXT.md` 存量内容重组与瘦身**
- [ ] **Slice 4: 全量验证与生命周期收尾**

## T-0135: 待创建

