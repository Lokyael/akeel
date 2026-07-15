# Architecture Decision Records

## 目录

| # | 标题 | 分类 |
|---|------|------|
| 1 | Soft vs Hard 技能强制执行 | 技能哲学 |
| 2 | 统一安全扩展 vs 社区扩展并存 | 安全架构 |
| 3 | bigpowers 72→10 技能精选 | 技能策展 |
| 4 | landstrip 的定位（不是 fallback） | 安全架构 |
| 5 | 技能三目录结构 | 项目组织 |
| 6 | 统一命名规范 | 项目组织 |
| 7 | 安全扩展模块化拆分 | 代码架构 |
| 8 | 快照回滚系统 | 功能设计 |
| 9 | 移除 npm / docs / AGENTS.md | 项目组织 |
| 10 | Shell 文件写入绕过防护 | 安全架构 |
| 11 | 统一命令分类体系（command-taxonomy.ts） | 代码架构 |
| 12 | Pipeline 拆解与 Bootstrap 简化 | 代码架构 |

---

## ADR-001: Soft vs Hard 技能强制执行

**分类：** 技能哲学

| 维度 | 内容 |
|------|------|
| **问题** | superpowers 使用"IF A SKILL APPLIES, YOU MUST USE IT. This is not negotiable."的强制性语言。是否采用？ |
| **决策** | 不采用。改为"use skills when they match, user instructions take precedence"。 |
| **理由** | 1. superpowers 的强制语气在实测中常被模型无视或产生抗拒。2. Pi 哲学强调"user control over agent"。3. 技能是工具，不是枷锁。 |
| **后果** | 模型可能在某些场景跳过技能。通过提高 description 质量和 bootstrap 中的引导语言来补偿。 |

---

## ADR-002: 统一安全扩展 vs 社区扩展并存

**分类：** 安全架构

| 维度 | 内容 |
|------|------|
| **问题** | 让用户分别安装 pi-permission-system + cc-safety-net + pi-landstrip，还是创建一个统一扩展？ |
| **决策** | 创建统一扩展（`extensions/security-gate/`），在内部协调三层。 |
| **理由** | 1. 扩展加载顺序不确定——"谁先拦截"是竞争条件。2. 多重弹窗体验差。3. 三套配置学习成本高。4. 三套审计日志难以关联。 |
| **后果** | 不享受社区扩展的独立更新。需要在社区扩展大版本升级时手动跟进。 |

---

## ADR-003: bigpowers 72→10 技能精选

**分类：** 技能策展

| 维度 | 内容 |
|------|------|
| **问题** | bigpowers 有 72 个技能。为什么精选到 ~10 个并融合进其他来源的技能？ |
| **决策** | 只保留 bigpowers 独有的、且质量超过其他仓库对应物的技能。 |
| **理由** | 1. ~36 个是 Claude Code 专用的（orchestrate-project, build-epic, execute-plan 等）。2. ~8 个被 mattpocock/superpowers 更好版本替代。3. ~10 个是内部元工具（craft-skill, evolve-skill 等）。4. ~8 个是项目特定（publish-package, wire-ci 等）。 |
| **后果** | 失去 bigpowers 的 lifecycle 自动编排能力。通过 bootstrap + survey-context 手动编排来补偿。 |

---

## ADR-004: landstrip 的定位（不是 fallback）

**分类：** 安全架构

| 维度 | 内容 |
|------|------|
| **问题** | 是否需要在 landstrip 不可用时 fallback 到 cc-safety-net？ |
| **决策** | 不需要。landstrip 和 cc-safety-net 是互补层，不是替代关系。 |
| **理由** | landstrip 提供内核级文件系统隔离（阻止写入保护路径），cc-safety-net 提供语义级命令分析（阻止危险命令执行）。两者解决不同层次的问题。在 Linux 5.13+，landstrip 无需 fallback。 |
| **后果** | strict 级别只在 landstrip 可用的环境生效。standard 级别（无 sandbox）仍提供语义分析和权限控制。 |

---

## ADR-005: 技能三目录结构

**分类：** 项目组织

| 维度 | 内容 |
|------|------|
| **问题** | mattpocock 用 `engineering/` 和 `productivity/`，superpowers 用扁平目录，bigpowers 按 lifecycle phase 分。如何组织？ |
| **决策** | 三个目录：`foundations/`（始终激活）、`disciplines/`（模型自动匹配）、`workflows/`（仅用户触发）。 |
| **理由** | 1. 按加载机制分类（而非按 domain 或 phase）最大化 pi 的配置灵活性。2. 用户可以 `settings.json` 中按目录禁用。3. 清晰的加载预期——看目录名就知道技能何时触发。 |
| **后果** | 跨领域技能的归属不完全精确。通过 description 描述来补偿。 |

---

## ADR-006: 统一命名规范

**分类：** 项目组织

| 维度 | 内容 |
|------|------|
| **问题** | 项目名和技能名存在 6 类不一致：动名词混用、结构不统一、人物名嵌入、缩写不描述、名称过长、项目名泛化。 |
| **决策** | 采用三规则命名体系：Foundations 用简短描述名，Disciplines 用名词短语，Workflows 用动词-名词。 |
| **理由** | 1. 名称即描述——模型从名字推断功能。2. 分类即规则——名字揭示加载方式。3. 社群调研：bigpowers 72 技能全用 verb-noun；mattpocock 混用但以名词短语为主。名词短语更适合 auto-match（描述方法论而非操作）。 |
| **后果** | 1 个技能删除（grill-me 合并到 grill-plan）。3 个目录重命名。22 个技能名变更。扩展和配置也同步重命名。 |

---

## ADR-007: 安全扩展模块化拆分

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | `security-gate.ts` 是 902 行巨石文件，混合了类型定义、4 组模式库、3 组预设配置、配置加载、规则评估、shell 检测、审计——8 个独立关注点。 |
| **决策** | 拆分为 `extensions/security-gate/` 目录下模块 + `pipeline/` 子目录。预置加载整合到 `config.ts`。管道分层为 `pipeline/plan-gate.ts`、`pipeline/bash.ts`、`pipeline/permission.ts`，每层独立可测。主入口 `index.ts` 仅 206 行，只负责事件注册和管道组装。 |
| **理由** | 1. 关注点分离——每个模块可独立理解和测试。2. `config.ts` 从 `config/presets.json` 动态加载 + deepMerge，消除 267 行配置重复。3. `audit.ts` 感知 `PI_CODING_AGENT_DIR` 环境变量。4. `command-taxonomy.ts` 统一命令分类（见 ADR-011）。5. `bootstrap.ts` 注入内容外化到 `principles.md`，非程序员可直接编辑。 |
| **后果** | 模块可独立测试。 |

---

## ADR-008: 快照回滚系统

**分类：** 功能设计

| 维度 | 内容 |
|------|------|
| **问题** | git 只能回滚已提交的代码。AI 修改了一堆文件但还没 commit、生成错误配置文件、批量 sed 替换搞坏代码——这些场景 git 帮不上忙。 |
| **决策** | 三层回滚体系：(1) 文件快照——`write`/`edit` 操作前自动备份到 `.pi-keel/snapshots/`，提供 `/rollback` 命令恢复；(2) 会话回退——`rollback-session` 技能引导用户使用 pi 的 `/tree`；(3) 审计追踪——`.pi-keel/audit.jsonl` 记录每次快照。 |
| **理由** | pi-keel 定位为"防止 AI 走偏的龙骨"，回滚能力是龙骨的另一半——走偏了能拉回来。三层从轻到重覆盖所有回退场景。 |
| **后果** | 新增 `snapshots.ts` 模块（manifest.jsonl + UUID 备份文件）。后续重构：文件名编码改为 manifest 系统（消除 basename 碰撞），旧快照自动清除。`rollback-session` 工作流技能引导用户。`.pi-keel/` 加入 `.gitignore`。 |

---

## ADR-009: 移除 npm 发布、docs 目录和 AGENTS.md 模板

**分类：** 项目组织

| 维度 | 内容 |
|------|------|
| **问题** | 项目仅通过 Git 分发，不需要 npm 相关配置和文档。`AGENTS.md` 是用户项目文件，不应由 pi-keel 提供模板。`docs/` 目录仅含一个文件。 |
| **决策** | (1) `package.json` 移除 `version`、`keywords`、`repository` 等 npm 字段，仅保留 pi 加载必需的 `pi` 字段；(2) 删除 `AGENTS.md` 模板——完全由用户自行管理；(3) `docs/USAGE.md` 移到根目录，删除 `docs/` 目录；(4) `docs/GITHUB.md` 中的开发者内容精简为根目录 `CONTRIBUTING.md`；(5) `docs/OPTIMIZATION.md`（698 行未来规划，无一项落地）删除。 |
| **理由** | 减少维护负担。每个文件都有明确的"谁需要它"的答案。GitHub 平台要求的放根目录，项目内部文档放根目录，不需要的一律删除。 |
| **后果** | 根目录仅 5 个 .md（README、LICENSE、CONTRIBUTING、TRACEABILITY、USAGE），结构扁平化。 |

---

## ADR-010: Shell 文件写入绕过防护

**分类：** 安全架构

| 维度 | 内容 |
|------|------|
| **问题** | `write`/`edit` 工具有路径保护，但 `sed -i`、`echo >`、`tee`、`cp`、`mv`、`cat >`、`dd of=`、`awk -i`、`truncate` 等 10 种 shell 命令可以直接修改文件，绕过 `write`/`edit` 工具的路径保护。 |
| **决策** | 在 `detection.ts` 中新增 `detectShellFileWrite()` 函数，检测 shell 文件修改模式（sed -i、echo >、tee、cp、mv、cat >、dd of=、awk -i、truncate），从 `command-taxonomy.ts` 的 shell-write 规则派生路径提取，与 `config.permission.path` 的 deny 规则匹配。匹配时阻止执行并提示用户使用 `write`/`edit` 工具。同批次激活了 `SECRET_PATTERNS`（16 条密钥检测规则），在 bash 命令中检测到 API key/token 时发出警告。 |
| **理由** | 纵深防御——路径保护必须覆盖所有文件修改入口，不能仅依赖工具级拦截。Shell 命令是最大的盲区。 |
| **后果** | 覆盖了 `sed -i .env`、`echo "k=v" > .env`、`tee .env`、`cp /tmp/x .env` 等常见绕过方式。 |

---

## ADR-011: 统一命令分类体系（command-taxonomy.ts）

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | 命令行为分散在多个模块的独立模式列表中，新增一个命令需修改多处，极易产生语义漂移（如 `sudo` 在危险命令列表中但不在写操作拦截列表中）。 |
| **决策** | 创建 `command-taxonomy.ts` 作为单一真相源。CMDS 按命令名索引（git, npm, ls, eval…），sub 正则匹配子命令；PATTERNS 处理无命令词的模式（$(...), >file, curl|sh…）；FULL_COMMAND_PATTERNS 预分裂检查。每条定义 `plan`/`build`/`category`/`severity`。`phase.ts` 和 `detection.ts` 从此派生。 |
| **决策要点** | |
| | 1. **优先级系统**：多条规则匹配同一命令时，按类别优先级选择更危险的规则（remote-exec > destructive > privilege > shell-write > fs-mutate > vcs-mutate > read-only）。 |
| | 2. **PLAN/BUILD 分离**：`plan` 控制 PLAN 门控（checkGate），`build` 控制 BUILD 权限评估（evaluateBashSegments）。同一规则在两个模式下行为不同（如 `git commit`：plan=block, build=ask）。 |
| | 3. **shell-write 路径提取**：`category: "shell-write"` 的规则附带 `extractPath` 函数，`detectShellFileWrite()` 从此派生。 |
| | 4. **presets.json 不参与命令分类**：bash 权限完全由 taxonomy 控制，presets 仅管理路径保护和工具权限。 |
| **理由** | 单一真相源消除漂移。新增命令只需 1 行 taxonomy 规则。 |
| **后果** | `command-taxonomy.ts` 约 361 行，含 ~65 条 CMDS 规则 + ~8 条 PATTERNS + 2 条 FULL_COMMAND_PATTERNS。通过 `ro()`（options 对象）/`pkgRules()` 工厂消除只读命令和包管理器的重复定义。`phase.ts` 直接调用 `findRule()`，`detection.ts` 用于 shell-write 路径提取和威胁扫描。presets.json 不参与命令分类。 |

---

## ADR-012: Pipeline 拆解与 Bootstrap 简化

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | (1) ADR-007 拆出的 `index.ts`（445 行）在后续演进中重新膨胀为 God Object，混合了配置加载、deepMerge、命令注册、5 层管道编排、bash 分段评估等 8 个关注点。(2) `bootstrap.ts` 注入状态机用 3 个变量（`needsInjection`、`injectedInTurn`、`currentTurn`）+ `agent_end` handler 跟踪注入状态，但实际语义只是"是否已注入"——1 个 boolean 就够。 |
| **决策** | (1) 管道拆为 `pipeline/` 子目录，每层独立函数：`plan-gate.ts`（PLAN 门控）、`bash.ts`（bash 威胁→密钥→shell-write→分段评估）、`permission.ts`（路径保护→规则构建→用户确认）。`index.ts` 仅 206 行负责事件注册和管道组装。(2) 注入内容外化：`CORE_PRINCIPLES` 模板字面量（100+ 行）移至 `principles.md`，`readFileSync` 加载。(3) 状态机 3 变量 + 4 handler → 1 boolean + 3 handler，删除 `agent_end` handler。 |
| **理由** | 1. 管道层独立可测——每层输入/输出明确定义，不依赖主入口。2. 内容外化——改原则不需改 TypeScript 源码。3. 状态机简化是严格等价变换：`bootstrapAlreadyPresent()` 阻止重复注入，`needsInjection` boolean 在 session_start/compact 时设为 true，首次 context 触发注入后设为 false，与旧逻辑无行为差异。 |
| **后果** | 新增 `pipeline/` 目录（3 文件 272 行）、`config.ts`（78 行）、`utils.ts`（17 行）、`principles.md`（99 行）。删除 `presets.ts`（20 行）。规则构建逻辑从 `permission.ts` 收敛到 `rules.ts` 的 `buildRuleset()`。新增 `rules.test.ts`（35 条单元测试）覆盖之前仅通过端到端测试的模块。 |

---
