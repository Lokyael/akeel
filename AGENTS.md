# AGENTS.md — Pi Keel 维护入口与仓库约定

本文件只定义 pi-keel 仓库自身的维护入口和内容约定，帮助模型与维护者快速区分仓库内的三类内容。它随仓库提交，只影响仓库内开发会话，不复制注入到用户项目的原则、Task 生命周期或当前架构（见 D-009）。

## 项目定位

Pi Keel 是 [pi](https://pi.dev) 的插件包：以 **扩展（extensions）** 注入工程原则与访问控制，以 **skills** 按需加载工程纪律与工作流，用于在用户项目中管理工程实践。它本身也是一个 TypeScript 开发仓库，包含用于构建与验证自身的开发内容。这三类内容在同一目录树中并存，维护时必须区分对待。

## 三类内容区分

| 类别 | 位置 | 是什么 | 分发方式 | 维护对象 |
|------|------|--------|----------|----------|
| **扩展（插件）** | `src/bootstrap/`、`src/access-gate/` | Session 启动注入的原则（`principles.md`）与 Profile 驱动的访问控制代码 | `package.json` 的 `pi.extensions` | 运行时行为；改动需同步测试与文档 |
| **Skills** | `skills/foundations/`、`skills/disciplines/`、`skills/workflows/` | 按需加载的技能，含 SKILL.md 与配套文件；三目录表达加载时机（D-005） | `package.json` 的 `pi.skills` | 技能内容与流程；只引用权威文档，不重复定义规则 |
| **开发内容（dev）** | `tests/`、`scripts/`、`types/`、`tsconfig.json`、`package.json` 脚本 | pi-keel 自身的构建、测试、类型声明与技能校验 | 不进入用户项目分发 | 开发质量；改动随对应功能同步 |

## 目录速查

```
src/bootstrap/          # 扩展：Session 注入原则（principles.md + index.ts）
src/access-gate/        # 扩展：集中配置（config/）、Profile、Shell IR、命令语义、路径策略、Gate、Session、Footer
  gate/                 #   Gate 内部：plan/（编译器+验证）、decision/（内核+渲染）、共享根（host/decision-types/decision-code-catalog）
  */index.ts            #   目录公共表面：跨目录引用统一走目录 index，不深入实现文件
skills/                 # skills：三目录按加载时机组织（D-005）
  foundations/          #   基础约束（evidence-first）
  disciplines/          #   工程纪律（TDD、代码审查、领域建模等）
  workflows/            #   工作流（survey-context、implement-work 等）
tests/                  # dev：访问控制与扩展测试（npm test 入口）
scripts/                # dev：validate-skills.ts 等校验脚本
types/                  # dev：pi 宿主类型声明
docs/                   # 项目文档：决策、任务、安全边界、溯源（见 CONTEXT.md）
CONTEXT.md              # 当前事实、术语、架构与 Active Decisions 索引
```

## 维护约定

- **测试入口**：`npm test` 运行技能校验、TypeScript 检查和 access-gate 测试；修改扩展代码必须保持测试通过。
- **分发声明**：只有 `package.json` 的 `pi.extensions` 与 `pi.skills` 声明的路径进入用户项目；其余是仓库自身开发内容。
- **修改边界（工作区源 vs 安装副本）**：内容只在仓库源 checkout 中修改；已安装的全局副本（pi 分发到 agent 目录的技能与扩展）是分发产物，只读，拒绝直接修改——改动分发走正常安装/更新机制。
- **路径可移植性**：文档、注释、示例与测试不写死本机具体路径（如 `/home/<user>/...` 绝对路径、本机工作区目录名）；用相对路径、角色化表述或占位符（`~`、`$HOME`）——本机路径随环境迁移或他人开发失效。
- **文档边界**：长期决策写 `docs/decisions.md`，当前事实写 `CONTEXT.md`（安全承诺与残余风险在 decisions.md 安全条目与 CONTEXT Negative Space），第三方来源与许可证写 `docs/traceability.md`；AGENTS.md 不承接这些职责。
- **决策寄存器内容分诊**：`docs/decisions.md` 只保留决策级内容（当前结论、理由、必要替代方案、影响）；用户使用文档（如 config schema）进 README，实现细节进代码/测试，验证证据（测试计数、用例枚举、迁移过程）不保留，历史由 Git 承载。
- **技能规则单一来源**：技能只引用 `src/bootstrap/principles.md`，不在技能内重复定义规则（D-013）。
- **技能单一职责**：每个 skill 只做一件事、调用时内容全量被使用；触发场景互斥的 skill 保持独立、不合并（D-030）。
- **决策 ID 引用**：src/tests 注释中的 `D-xxx` 引用只指向 `docs/decisions.md` 存活条目（validate-docs 强制）；决策合并/剪除时在同一变更内把全部引用更新到吸收条目，不保留剪除 ID 引用——Git 保留历史是溯源手段，不是保留悬空引用的理由。
- **记录可追溯性**：合并/改写历史后，若容器占位引用了历史中不存在的记录 ID（如跳号），按 Git 历史最大+1 重建占位；提交信息不引用不可追溯的记录 ID。
- **决策记录时机**：有替代方案的取舍（删 vs 保留、合并 vs 独立、文档化 vs 实现）在落档前定案并同步进 `docs/decisions.md`（或代码注释，按内容分诊）；验收措辞只写行为目标，不写实现方式（实现细节进代码/测试）；实施中推翻已记录决策时，先同步更新记录再继续实施，不事后补丁。

## 提示词内容改动约定

改动 `src/bootstrap/principles.md`、`skills/` 或 guidance 文本时按以下原则审计；语义零损失是唯一目标，行数不是目标。仅本仓库维护，不进入通用 skill 层。

- **语义零损失**：只删同义重复；限定词、特指词、列举、术语是语义，删改即弱化（如 `imperative`、`user approval`、`durable content` 不删改）。
- **引用验证**：`per principles.md Quick Reference — X` 锚点真实存在且承载所引语义；被删内容的语义存活于引用目标。
- **指代清晰**：合并后每个代词有可见先行词；省略名词短语仅当同句提供语境。
- **措辞方向**：适合正向的用正向（`do not X unless Z` → `X only when Z`）；必要反向保留（安全门禁、否定误解、排除边界、铁律、防循环）；同类结构全文件统一。
- **词汇一致**：与 access-gate guidance 用同一词汇（如 `literal form` / `fixed text`）。
- **精简表达**：不写推论（文件固有性质不写成规则，如条目升序则末尾即最大）与派生数据（具体编号由规则推导，不手工维护）；删重复措辞、自明解释与冗余例子（每类保留 1–3 个代表例）。
