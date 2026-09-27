# AGENTS.md — AKeel 维护入口与仓库约定

本文件只定义 AKeel 仓库自身的维护入口和内容约定，帮助模型与维护者快速区分仓库内的三类内容。它随仓库提交，只影响仓库内开发会话，不复制注入到用户项目的原则、Task 生命周期或当前架构（见 D-009）。

## 项目定位

AKeel 是 [pi](https://pi.dev) 的插件包：以 **扩展（extensions）** 注入工程原则与访问控制，以 **skills** 按需加载工程纪律与工作流，用于在用户项目中管理工程实践。它本身也是一个 TypeScript 开发仓库，包含用于构建与验证自身的开发内容。这三类内容在同一目录树中并存，维护时必须区分对待。

## 三类内容区分

| 类别 | 位置 | 是什么 | 分发方式 | 维护对象 |
|------|------|--------|----------|----------|
| **扩展（插件）** | `packages/guidance/src/bootstrap/`、`packages/guidance/src/record-containers/`、`packages/access-gate/src/access-gate/`、`packages/context-pruner/src/context-pruner/` | Session 原则注入、Project Record 容器校验、`policy.yaml` 驱动的访问控制与测试输出上下文裁剪 | 各 package 的 `pi.extensions` | 运行时行为；改动需同步测试与文档 |
| **Skills** | `packages/guidance/skills/disciplines/`、`packages/guidance/skills/workflows/` | 按需加载的技能，含 SKILL.md 与配套文件；两目录表达作者职责，不定义 Pi 加载机制（D-073） | `package.json` 的 `pi.skills` | 技能内容与流程；只引用权威文档，不重复定义规则 |
| **开发内容（dev）** | `tests/`、`scripts/`、`types/`、`tsconfig.json`、`package.json` 脚本 | AKeel 自身的构建、测试、类型声明与技能校验 | 不进入用户项目分发 | 开发质量；改动随对应功能同步 |

## 目录速查

```
packages/guidance/src/bootstrap/          # 扩展：Session 注入原则（principles.md + index.ts）
packages/guidance/src/record-containers/  # 扩展：Project Record 容器校验纯引擎与 Pi tool composition
packages/guidance/src/artifact-exchange/  # 扩展：workflow run、capability artifact 与 Pi tool composition
packages/guidance/src/handoff-store/      # Guidance runtime：source→successor handoff envelope
packages/access-gate/src/access-gate/        # 扩展：policy.yaml adapter、Canonical access-decision 与 Pi runtime composition
  access-decision/core/authorization/ # sealed Admission、Mandatory Boundary、Configured Policy 与统一 verdict
  access-decision/core/compilation/   # 单一 Canonical facade、Linux Path Evidence 与私有 Direct/Shell 语义车道
    shell/programs/                    # Git、解释器、Python、uv、herdr、package manager 的封闭 analyzer registry
  access-decision/adapters/            # 外部 Pi/tool/policy.yaml 合同单次适配
  access-decision/runtime/             # Gate Session、Project/staging 生命周期与 Pi host approval composition
  */index.ts                           # 目录公共表面：跨目录引用统一走目录 index，不深入实现文件
packages/guidance/skills/    # skills：两目录按作者职责组织（D-073）
  disciplines/            #   可复用工程方法（TDD、代码审查、领域建模等）
  workflows/              #   端到端编排（survey-context、implement-work 等）
tests/                  # dev：访问控制测试（按 packages/access-gate/src/access-gate 镜像分层）+ 文档/技能校验规则测试；npm test 入口
scripts/                # dev：validate-docs.ts、validate-skills.ts 等校验脚本
types/                  # dev：pi 宿主类型声明
docs/                   # 项目文档：决策、任务、安全边界、溯源（见 CONTEXT.md）
CONTEXT.md              # 当前事实、术语、架构与 Active Decisions 索引
```

## 维护约定

- **测试入口**：`npm test` 依次运行 `validate-docs`、`validate-skills`、TypeScript 检查和 access-gate/validator 测试；它是全量验证入口。单文件测试使用 `npm run test:file -- <path>`，不要使用 `npm test <file>`（该写法仍会运行全套测试）。修改扩展代码必须保持测试通过。
- **分发声明**：只有 `package.json` 的 `pi.extensions` 与 `pi.skills` 声明的路径进入用户项目；其余是仓库自身开发内容。
- **修改边界（工作区源 vs 安装副本）**：内容只在仓库源 checkout 中修改；已安装的全局副本（pi 分发到 agent 目录的技能与扩展）是分发产物，只读，拒绝直接修改——改动分发走正常安装/更新机制。
- **路径可移植性**：文档、注释、示例与测试不写死本机具体路径（如 `/home/<user>/...` 绝对路径、本机工作区目录名）；用相对路径、角色化表述或占位符（`~`、`$HOME`）——本机路径随环境迁移或他人开发失效。
- **文档边界**：长期决策写 `docs/decisions.md`，当前事实写 `CONTEXT.md`（安全承诺与残余风险在 decisions.md 安全条目与 CONTEXT Negative Space），第三方来源与许可证写 `docs/traceability.md`；AGENTS.md 不承接这些职责。
- **维护主体与产品边界（维护 AKeel vs AKeel 维护的内容）**：`AGENTS.md` 只定义维护 AKeel 仓库自身的本地开发入口与构建/测试约定，不随 package 分发；`CONTEXT.md`、`docs/decisions.md` 等标准项目容器属于 AKeel 作为产品在所有宿主项目中管理并分发的核心知识资产。严禁在 `AGENTS.md` 中为 `CONTEXT.md` 等通用项目容器定义维护规则、分诊标准或格式要求；所有关于项目知识容器的维护规范、内容分诊与生命周期必须由随包分发的 `packages/guidance/src/bootstrap/principles.md` 与对应技能（`doc-sync`、`domain-modeling`）统一定义并承载（单一来源，见 D-009 与 D-030），`AGENTS.md` 坚决不越界承接。
- **生产车间隔离与通用能力下沉（自仓开发 vs 产品通用服务）**：`scripts/`、`tests/`、`types/` 与 `AGENTS.md` 严格收敛于 AKeel 自身作为 TypeScript 开源项目的制造、编译与发版工序（如跨包类型检查、发版清单检查、自仓源码决策引用存活）。严禁将面向宿主项目的通用工程结构、Markdown 容器或配置的校验/分析逻辑私有化、截留在自仓 `scripts/` 中；任何此类逻辑必须作为第一方运行时能力在 `packages/` 中交付并随包分发。在自仓开发中消费通用工程能力时，AKeel 仓库本身仅作为普通宿主项目对等调用产品能力，不设立自仓特权。
- **决策寄存器内容分诊**：`docs/decisions.md` 只保留决策级内容（当前结论、理由、必要替代方案、影响）；用户使用文档（如 config schema）进 README，实现细节进代码/测试，验证证据（测试计数、用例枚举、迁移过程）不保留，历史由 Git 承载；条目结构遵循 `packages/guidance/src/bootstrap/principles.md` Project Records — Decision Record Format。
- **技能规则单一来源**：技能只引用 `packages/guidance/src/bootstrap/principles.md`，不在技能内重复定义规则（D-030）。
- **技能单一职责**：每个 skill 只做一件事、调用时内容全量被使用；触发场景互斥的 skill 保持独立、不合并（D-030）。
- **决策 ID 引用**：代码层（`packages/`、`tests/` 的 `.ts`）与文档层（`docs/`、`packages/guidance/skills/` 的 `.md`、`CONTEXT`/`AGENTS`/`README`）中的 `D-xxx` 引用只指向 `docs/decisions.md` 存活条目（validate-docs 强制）；决策合并/剪除时在同一变更内把全部引用更新到吸收条目，不保留剪除 ID 引用——Git 保留历史是溯源手段，不是保留悬空引用的理由。
- **记录可追溯性**：Task checkpoint 与清档遵循 `principles.md` Project Records — Record Lifecycle。历史改写使占位失去依据时，按 Git 历史最大+1 重建；不伪造缺失记录或引用不可追溯 ID。
- **决策记录时机**：有替代方案的取舍（删 vs 保留、合并 vs 独立、文档化 vs 实现）在落档前定案并同步进 `docs/decisions.md`（或代码注释，按内容分诊）；验收措辞只写行为目标，不写实现方式（实现细节进代码/测试）；实施中推翻已记录决策时，先同步更新记录再继续实施，不事后补丁。

## AKeel Prompt Surface 维护约定

修改 `packages/guidance/src/bootstrap/principles.md`、`packages/guidance/skills/` 或 Access Gate Guidance 时应用 `instruction-editing`。语义完整是本仓合入门禁，行数不构成优化目标；以下规则只定义 AKeel 的本地 Prompt Surface overlay。

- **适用面**：`principles.md` 承载恒定原则和 Project Record 参考，skills 承载按需方法与工作流，Access Gate Guidance 承载失败路径的静态行为。每项内容按其运行时读取面和责任维护。
- **受众感知过滤（Audience Perception & Scope Filter）**：`principles.md` 作为全局注入面，其内容仅限对所有编码项目均成立的通用工程素养与不可逾越的安全底线（如思考先于编码、极简设计、外科手术修改、新鲜证据核验、防误删）。严禁将 AKeel 自仓内务特例（如自仓特定目录豁免）、专有路径硬编码、高级多代理拓扑细节（如 Herdr/Worktree 底层调用）或元哲学说教写入该文件。Project Records 容器规则属于可选工程流派，必须以显式 Scope Guard 声明其仅适用于已采用的项目，严禁强加给普通用户项目。
- **引用目标**：`per principles.md Quick Reference — X` 与 `per principles.md Project Records — X` 指向真实锚点，引用目标完整承载被引用语义。
- **引用取舍（D-054）**：共享规则在目标与消费者处于可达读取或注入面、目标短而显著且单源收益高于解析成本时使用引用。跨文件引用在消费时真实读取目标；长操作细节随执行方提供。审批否决、分类守卫、防误删和其他执行必需条件留在动作点。引用解析具备可测失败或情境兜底，每次触及引用时重新核对映射可靠性。
- **安全动作点**：失败路径的支持工具枚举、禁止重试或绕过、用户纠正路径和审批边界属于可执行判据，并在对应 Guidance 中形成完整合同。
- **术语归属**：Shell approval 使用 `literal form` 表示待审批命令原形；principles 使用 `fixed text` 表示无动态展开的 Shell 参数；deny path 使用 `static bounded Guidance` 或具体 renderer 合同中的 `static block reason`。同一概念沿用其权威载体中的术语。
- **Prompt Surface 修改三道自检门禁**：在触碰 `principles.md` 前必须严格执行三项自检，未通过前禁止向全局原则注入：
  1. **普适性闸门（Universality Test）**：该规则是否对所有用户项目、所有普通编码/修 Bug/跑单测的会话都成立且必要？若非全局通用，坚决移入对应 Skill；
  2. **角色闸门（Schema vs Methodology Test）**：这是在定义不可逾越的物理结构与法律底线（Schema/Invariants），还是在指导“如何把事情做得更好”的编写教程（Tactics/Heuristics）？具体战术、写作教程 100% 收敛至按需伴随文档（如 `candidate-review.md`）；
  3. **物理成本闸门（Token ROI Test）**：全局注入增加的 Token 物理开销，是否换来了等额的全局安全或防越权收益？严禁单点规范让全局会话永久买单。
- **验证**：修改前后的语义清单逐项对应，principles 锚点和 skill 引用通过结构校验；安全限定词、用户批准条件和唯一动作点通过人工语义审查。
