# Pi Keel — 溯源记录

> 本文档记录每个产物的社区来源、融合决策、裁剪理由，便于后续维护和迭代。
> 格式：每个产物一个条目，包含来源、决策、变更说明。

---

## 一、基础设施

### 1. package.json

| 维度 | 内容 |
|------|------|
| **来源** | obra/superpowers 的 `package.json`（pi manifest 模式）+ mattpocock/skills 的 `package.json`（MIT 许可证） |
| **决策** | 采用 superpowers 的 `pi.extensions` + `pi.skills` 双数组结构。`keywords` 包含 `pi-package` 以支持 npm registry 发现。 |
| **变更** | 技能目录按 domain 分子目录（`skills/core`, `skills/engineering`, `skills/orchestration`），superpowers 原版是单个 `./skills` 扁平目录。 |
| **理由** | 分目录让用户可按需装载技能子集，也便于在 `settings.json` 中按目录禁用/启用。 |

### 2. README.md

| 维度 | 内容 |
|------|------|
| **来源** | obra/superpowers README（表格化技能清单 + 工作流说明）+ bigpowers README（哲学层叠 + 生命周期图） |
| **决策** | 采用 superpowers 的功能表格风格，融合 bigpowers 的来源归属表。保留"Quick Start"模式来自 superpowers。 |
| **变更** | 新增安全架构图和四层防御模型说明（原创）。新增"Design Philosophy"章节解释5条核心设计决策。 |
| **理由** | 用户需要快速理解这不是另一个技能集合，而是深度融合的产物。来源归属表建立信任。 |

---

## 二、扩展层

### 3. extensions/bootstrap.ts

| 维度 | 内容 |
|------|------|
| **来源** | **obra/superpowers** `.pi/extensions/superpowers.ts`（100% 参考其注入架构） |
| **决策** | 完全采用 superpowers 的四事件注入模式：`session_start` → 标记需要注入，`context` → 实际注入，`agent_end` → 标记已注入，`session_compact` → 重新标记。这是 superpowers 经过多平台验证的最稳定架构。 |
| **变更** | |
| | 1. **注入内容替换**：superpowers 注入的是"YOU MUST USE SKILLS"的强制指令 → 改为注入 karpathy 四原则 + 验证铁律 + 软性技能推荐 |
| | 2. **语气调整**：`<EXTREMELY_IMPORTANT>` → `<PI_SKILLS_CORE_PRINCIPLES>`，从威胁性改为引导性 |
| | 3. **移除**：superpowers 的 Pi tool mapping 章节（因为是 pi 原生工具，不需要映射表） |
| | 4. **新增**：turn counter 机制，跟踪注入状态 |
| **理由** | superpowers 的注入架构是正确的（compaction后重注入是关键），但注入内容过于强制。karpathy 原则更适合作为基线。移除 tool mapping 是冗余——pi 原生工具就是 `read/write/edit/bash`。 |

### 4. extensions/security-gate.ts

| 维度 | 内容 |
|------|------|
| **来源** | 融合四个社区方案： |
| | - **@gotgenes/pi-permission-system**：统一 Rule 模型 + `evaluate()` 函数 + 三态决策 + session rules |
| | - **cc-safety-net**：命令语义分析 → 已整合至 `command-taxonomy.ts` |
| | - **pi-hermes-memory** `content-scanner.ts`：THREAT_PATTERNS 和 SECRET_PATTERNS（保留在 `patterns.ts`） |
| | - **pi-landstrip**：沙箱策略格式（JSON 配置结构） |
| **决策** | 单一 `tool_call` 事件处理器，bash 走逐段评估（`evaluateBashSegments`），非 bash 走权限管道（`evaluatePermission`）。加载顺序和多重弹窗问题已解决。 |
| **设计要点** | |
| | 1. **三级安全预设**：`strict/standard/permissive` |
| | 2. **沙箱仅在 strict 级别启用**（Landlock, Linux 5.13+） |
| | 3. **审计日志统一**：单一 `security-audit.jsonl` |
| | 4. **/security 命令**：运行时查看/切换安全级别 |

### 5. extensions/security-gate/command-taxonomy.ts

| 维度 | 内容 |
|------|------|
| **来源** | 原创整合——统一 phase.ts、patterns.ts、presets.json 中分散的命令分类模式。 |
| **决策** | `command-taxonomy.ts` 作为单一真相源：CMDS 按命令名索引 + sub 正则匹配子命令；PATTERNS 处理无命令词的模式；FULL_COMMAND_PATTERNS 预分裂检查。每条定义 `plan`/`build`/`category`/`severity`。`phase.ts` 和 `detection.ts` 从此派生。 |
| **设计要点** | |
| | 1. **cmd 索引 + sub 正则**：`cmdName()` 提取命令词 → `byCmd.get()` O(1) 查表 → 子命令 sub 匹配。消除 `word` 全文匹配的误伤 |
| | 2. **FULL_COMMAND_PATTERNS**：`curl|sh` 等管道命令在段分裂前检查 |
| | 3. **类别优先级**：多条规则匹配同一命令时，按 remote-exec > destructive > privilege > shell-write > fs-mutate > vcs-mutate > read-only 选择最危险的 |
| | 4. **presets.json 不参与命令分类**：bash 权限由 taxonomy 控制，presets 仅管理路径保护和工具权限 |
| **理由** | 杜绝命令分类的语义漂移，消除 eval/git 在参数中的误伤。新增命令只需一条 CmdDef 条目。 |

---

## 三、核心技能（Always-On）

### 5. skills/foundations/engineering-principles/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **multica-ai/andrej-karpathy-skills** `CLAUDE.md` + `skills/engineering-principles/SKILL.md`（100% 内容来源） |
| **决策** | 完整保留四条原则的原文和结构。 |
| **变更** | |
| | 1. 移除 `CLAUDE.md` 中的"Tradeoff"行内注释 → 改为独立章节 |
| | 2. 新增 `disable-model-invocation: true` — 此技能由 bootstrap 注入，不需要模型加载 |
| | 3. 新增底部**生效标志**段落：明确什么现象说明原则在生效 |
| | 4. 新增 frontmatter `description` 明确声明"always active, no invocation needed" |
| **理由** | karpathy 原文已经是极致精简，不应画蛇添足。唯一增强是明确告诉模型"你不需要主动加载我"。 |

### 6. skills/foundations/evidence-first/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **obra/superpowers** `skills/evidence-first/SKILL.md`（90% 内容来源） |
| **决策** | 完整保留其 Iron Law、Gate Function、Red Flags 表格、Rationalization Prevention 表格。 |
| **变更** | |
| | 1. **删除**：superpowers 原版中的"From 24 failure memories"段落（过于个人化） |
| | 2. **删除**：引用其他 superpowers 技能的段落（因为 pi 技能使用不同名称） |
| | 3. **简化**：Key Patterns 章节的示例 |
| | 4. 新增 `disable-model-invocation: true` — 由 bootstrap 注入 |
| **理由** | superpowers 的 evidence-first 是其最精华的技能之一。裁剪个人化内容和跨技能引用后保持简洁。 |

---

## 四、工程技能（Auto-Match）

### 7. skills/disciplines/test-driven-development/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/test-driven-development/SKILL.md`（70%）+ **superpowers** `skills/test-driven-development/SKILL.md`（30%） |
| **决策** | 以 mattpocock 的 seam 概念和反模式文档为核心框架（更工程化），吸收 superpowers 的 Iron Law 和 Common Rationalizations 表格（更有力）。 |
| **变更** | |
| | 1. **保留 mattpocock 的**：seam 概念、anti-patterns（implementation-coupled/tautological/horizontal-slicing）、When Stuck 表格 |
| | 2. **吸收 superpowers 的**：Iron Law（NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST）、Rationalization 表格的覆盖范围 |
| | 3. **删除 mattpocock 的**：Refactoring 的"belongs to the review stage"说法（与 TDD 循环中的 REFACTOR 阶段矛盾） |
| | 4. **删除 superpowers 的**：冗长的 TDD 循环描述和 dot graph（pi 模型不渲染 graphviz） |
| | 5. **新增**：Red Flags — STOP and Start Over 章节（融合双方的反模式列表） |
| | 6. **拆分**：tests.md 和 mocking.md 作为辅助文件（mattpocock 模式） |
| **理由** | mattpocock 的 seam 概念是 TDD 中最被忽视但最重要的部分。superpowers 的 Iron Law 给 mattpocock 的温和语气增加了必要的力量。bigpowers 的 develop-tdd 没有提供比这两者更多的价值。 |

### 8. skills/disciplines/test-driven-development/tests.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/test-driven-development/SKILL.md` 中的 What a good test is 章节 + **superpowers** 的 Good/Bad 示例 |
| **决策** | 独立为辅助文件（mattpocock 模式：SKILL.md → 引用辅助文件），让主文件保持精简。 |
| **变更** | 融合 mattpocock 的文字和 superpowers 的代码示例。新增 Bug Fix Example。 |
| **理由** | SKILL.md 应在 2000 tokens 以内。辅助文件按需加载。 |

### 9. skills/disciplines/test-driven-development/mocking.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/test-driven-development/mocking.md`（90%）+ **superpowers** `testing-anti-patterns.md`（10%） |
| **决策** | 以 mattpocock 的"mock only I/O boundaries"为核心，吸收 superpowers 的 anti-pattern 分类。 |
| **变更** | 新增 When Not to Mock 的 Good/Bad 代码示例。新增 Dependency Injection Rule。 |
| **理由** | Mocking 是 TDD 中最容易出错的实践。明确的代码示例比抽象规则更有效。 |

### 10. skills/disciplines/code-review/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/code-review/SKILL.md`（85%） |
| **决策** | 基本完整保留 mattpocock 的双轴并行审查架构。这是最独特的贡献（其他仓库都没有这种设计）。 |
| **变更** | |
| | 1. **删除**：subagent 相关指令（"Spawn both sub-agents in parallel"）→ 改为"parallel analyses"（pi 不内置 subagent） |
| | 2. **删除**：Claude Code 特定的 `Agent` tool 调用指令 |
| | 3. **删除**：Fowler 味道详细列表中的部分条目（保留 8 个最核心的） |
| | 4. **删除**：issue tracker 引用（`docs/agents/issue-tracker.md`） |
| | 5. **简化**：Why Two Axes 解释 |
| **理由** | pi 不内置 subagent，但双轴审查的核心逻辑（分开评估 Standards 和 Spec，不合并）仍然适用。模型可以在单次响应中完成两个维度的分析。 |

### 11. skills/disciplines/systematic-debugging/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **obra/superpowers** `skills/systematic-debugging/SKILL.md`（80%）+ **mattpocock/skills** `skills/disciplines/bug-diagnosis/SKILL.md`（20%） |
| **决策** | 以 superpowers 的 4 阶段框架为核心（更系统化），吸收 mattpocock 的"3+ failed fixes → question architecture"（独到的架构洞察）。 |
| **变更** | |
| | 1. **保留 superpowers 的**：4 阶段结构、Iron Law、When to Use、Common Rationalizations 表格、Quick Reference 表 |
| | 2. **吸收 mattpocock 的**：Phase 4 中"3次修复后质疑架构"的判断（superpowers 原版没有这个硬性数值） |
| | 3. **删除 superpowers 的**：冗长的多组件系统诊断示例代码块 |
| | 4. **删除 superpowers 的**：Phase 4.5 "Your human partner's signals"段落（过于特定） |
| | 5. **删除 superpowers 的**：dot graph 流程图（pi 模型不渲染） |
| | 6. **删除**：对 superpowers 其他技能的交叉引用 |
| **理由** | superpowers 的 4 阶段框架是社区最完整的，但需要精简。mattpocock 的"3次失败=架构问题"是实用且被低估的洞察，应该融入。 |

### 12. skills/disciplines/bug-diagnosis/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/bug-diagnosis/SKILL.md`（95%） |
| **决策** | 几乎完整保留。这是 mattpocock 最独特的技能——反馈回路构建在其他仓库中没有等价物。 |
| **变更** | |
| | 1. **删除**：对 `CONTEXT.md` 和 ADRs 的读取指令（简化，domain-modeling 已涵盖） |
| | 2. **删除**：`scripts/hitl-loop.template.sh` 引用（过于特定） |
| | 3. **简化**：Phase 1 的 10 种回路构建方法 → 保留核心描述 |
| | 4. **新增**：description 中明确与 systematic-debugging 的区别 |
| **理由** | 几乎不需要改动。这个技能本身就很优秀。与 systematic-debugging 的区别需要明确：bug-diagnosis 专注于构建测试回路（适用于难复现的 bug），systematic-debugging 专注于4阶段根因分析（适用于常规 bug）。 |

### 13. skills/disciplines/security-review/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **bigpowers** `skills/security-review/SKILL.md`（80%）+ **mattpocock/skills** 的 `git-guardrails` 概念（10%）+ 原创（10%） |
| **决策** | 以 bigpowers 的 5 阶段扫描 + CWE 映射为核心框架（其他仓库没有等价的安全审查技能）。 |
| **变更** | |
| | 1. **保留 bigpowers 的**：5 阶段结构、SQL-Safety Doctrine（proven-authorship 概念）、CWE 映射 |
| | 2. **删除 bigpowers 的**：BCP Plus 集成章节（bigpowers 特定的复杂度核算系统） |
| | 3. **删除 bigpowers 的**：CWE fixture 要求（过于内部工程化） |
| | 4. **删除 bigpowers 的**：story 引用注释（`<!-- story: e45s41 -->`） |
| | 5. **删除 bigpowers 的**：`parallel-review-worktrees.sh` 引用（过于特定） |
| | 6. **新增**：简化 Integration Points 表格 |
| **理由** | bigpowers 的安全审查是其最有价值的独特技能。proven-authorship 概念（"无法证明开发者作者身份的 SQL = 不安全"）是实用的分类方法。 |

### 14. skills/disciplines/code-audit/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **bigpowers** `skills/code-audit/SKILL.md`（70%）+ **karpathy** 的四原则（10%）+ 原创 Akita 视角（20%） |
| **决策** | 以 bigpowers 的 Checklist 为核心，融合 karpathy 原则和 Akita 的 agent readability 视角。 |
| **变更** | |
| | 1. **保留 bigpowers 的**：Supply Chain、Boy Scout Rule、Types、Test Coverage、SOLID 章节 |
| | 2. **吸收 karpathy 的**：Scope 章节（Surgical Changes 原则的应用） |
| | 3. **保留 bigpowers 的**：Agent Readability (Akita's Lens) 章节（独特价值） |
| | 4. **删除 bigpowers 的**：Provenance & Metadata、Law of Demeter（过度工程化） |
| | 5. **删除 bigpowers 的**：Redundancy with `enforce-first` 检查（已合并到 tdd） |
| | 6. **删除 bigpowers 的**：`--gate` 模式、`--parallel` 模式（过于特定） |
| | 7. **删除 bigpowers 的**：`bp-churn-rank.sh` 引用 |
| | 8. **新增**：churn heuristic 的通用 git 命令（替代 bigpowers 脚本） |
| **理由** | bigpowers 的 checklist 是全面的，但有过度工程化倾向。删除 4 个章节和 3 个模式后仍保持 80% 的检查覆盖率。 |

### 15. skills/disciplines/domain-modeling/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/domain-modeling/SKILL.md`（90%） |
| **决策** | 几乎完整保留 mattpocock 的 active discipline 概念。bigpowers 的 model-domain 只是 grilling 的包装，没有额外价值。 |
| **变更** | |
| | 1. **删除**：`CONTEXT-MAP.md` 多上下文文件结构（过于特定） |
| | 2. **删除**：mattpocock 原版中的 code cross-reference 示例（保留文字描述即可） |
| | 3. **简化**：During the Session 章节 |
| | 4. **新增**：Integration 段落——说明此技能由 `/grill-docs` 自动调用 |
| **理由** | mattpocock 的 domain-modeling 是社区最好的领域建模技能。bigpowers 的 model-domain 只是套了 grilling 壳，没有实质内容。 |

### 16. skills/disciplines/codebase-design/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/codebase-design/SKILL.md`（80%）+ **Ousterhout** "A Philosophy of Software Design"（20%） |
| **决策** | 保留 mattpocock 的深度模块设计词汇（module/interface/depth/seam/adapter/leverage/locality），这是社区唯一的系统性架构词汇。 |
| **变更** | |
| | 1. **保留 mattpocock 的**：Core Vocabulary 表格、Deletion Test、"Interface is the Test Surface"、"One Adapter = Hypothetical" |
| | 2. **新增**：Designing a Deep Module 章节（来自 Ousterhout） |
| | 3. **新增**：Red Flags 表格（原创，补充词汇定义） |
| | 4. **删除**：mattpocock 原版的冗长代码示例 |
| **理由** | 词汇表是核心价值。Ousterhout 的方法被 bigpowers 引用但未整合——这里直接整合了。 |

### 17. skills/disciplines/plan-writing/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **obra/superpowers** `skills/plan-writing/SKILL.md`（75%）+ **mattpocock/skills** `draft-tickets` 概念（15%）+ **bigpowers** `plan-work`（10%） |
| **决策** | 以 superpowers 的任务模板为核心（最具体的代码级计划），吸收 mattpocock 的"bite-sized tasks"粒度概念，吸收 bigpowers 的 Plan Header 结构。 |
| **变更** | |
| | 1. **保留 superpowers 的**：Task Template（精确文件路径、完整代码、验证命令）、No Placeholders 规则 |
| | 2. **吸收 mattpocock 的**：Bite-sized Granularity（2-5分钟粒度） |
| | 3. **吸收 bigpowers 的**：Plan Header 结构（Goal + Architecture + Tech Stack + Global Constraints） |
| | 4. **删除 superpowers 的**：Scope Check 章节（移到 brainstorm） |
| | 5. **删除 superpowers 的**：Subagent-Driven vs Inline Execution 选择（pi 不内置 subagent） |
| | 6. **删除 superpowers 的**：dot graph 和 reference 文件 |
| | 7. **新增**：Self-Review 3 步检查（原创，综合 superpowers 和 bigpowers 的审查模式） |
| **理由** | superpowers 的任务模板是最具体的——精确文件路径和完整代码是其他仓库缺乏的。mattpocock 的"2-5分钟"粒度使计划可用。bigpowers 的 Header 结构有助于多会话对齐。 |

### 18. skills/disciplines/fix-validation/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **bigpowers** `skills/fix-validation/SKILL.md`（70%）+ **superpowers** `evidence-first`（30%） |
| **决策** | 以 bigpowers 的 5 步验证流程为核心，强化 superpowers 的 Iron Law 精神。 |
| **变更** | |
| | 1. **保留 bigpowers 的**：5 步流程（Re-run Failing Test → Full Suite → Build+Lint → Manual → Git Status） |
| | 2. **吸收 superpowers 的**：HARD GATE 声明、Verification Checklist |
| | 3. **新增**：If Validation Fails 表格（原创，给模型清晰的下一步指引） |
| | 4. **删除 bigpowers 的**：`bp-timing.sh` 引用 |
| **理由** | bigpowers 的 5 步流程很实用，但缺少 superpowers 的不妥协精神。融合后既实用又有力。 |

### 19. skills/disciplines/bug-investigation/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **bigpowers** `skills/bug-investigation/SKILL.md`（80%）+ **mattpocock/skills** `bug-diagnosis` Phase 1（20%） |
| **决策** | 以 bigpowers 的端到端调查流程 + bug 文件模板为核心。 |
| **变更** | |
| | 1. **保留 bigpowers 的**：6 步流程 + BUG-*.md 模板 |
| | 2. **吸收 mattpocock 的**：反馈回路构建概念（融入 Reproduce 步骤） |
| | 3. **删除 bigpowers 的**：`bp-timing.sh` 引用、story 引用注释 |
| | 4. **简化**：bug 文件模板（删除 bigpowers 特定的 BCP 字段） |
| | 5. **新增**：Handoff 步骤——完成调查后自动移交到 systematic-debugging |
| **理由** | bigpowers 的调查流程和 bug 文件模板是社区最完整的。mattpocock 的反馈回路概念增强了 Reproduce 步骤的严谨性。 |

---

## 五、编排技能（User-Only）

### 20. skills/workflows/brainstorm-design/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **obra/superpowers** `skills/brainstorming/SKILL.md`（70%）+ **mattpocock/skills** `grilling` 一问一答模式（30%） |
| **决策** | 以 superpowers 的 HARD-GATE 设计审批流程为核心，吸收 mattpocock 的"one question at a time"模式。 |
| **变更** | |
| | 1. **保留 superpowers 的**：HARD-GATE、Anti-Pattern "Too Simple"、Process 步骤（1-6） |
| | 2. **吸收 mattpocock 的**："Ask the questions one at a time"（superpowers 原版没有明确一问一答） |
| | 3. **删除 superpowers 的**：Visual Companion 章节（过于特定，且需要外部服务） |
| | 4. **删除 superpowers 的**：dot graph 流程图 |
| | 5. **删除 superpowers 的**：Design for isolation 的冗长描述 → 保留核心段落 |
| | 6. **删除 superpowers 的**：Spec Self-Review 详细步骤 → 合并为一句话 |
| | 7. **新增**：Working in Existing Codebases 章节（mattpocock 中有，superpowers 没有） |
| **理由** | superpowers 的 brainstorming 是社区最好的设计审批流程。删除 Visual Companion 大幅降低复杂度。一问一答增强控制感。 |

### 21. skills/workflows/grill-plan/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/productivity/grill-plan/SKILL.md`（100%） |
| **决策** | 完整保留，这是 grilling 引擎的核心——其他 grilling 变体都是它的包装。 |
| **变更** | 无实质变更。仅适配了 frontmatter 格式。 |
| **理由** | 原文已经是最精简且最有效的一问一答描述。不需要任何修改。 |

### 22. skills/workflows/grill-plan/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/productivity/grill-plan/SKILL.md`（100%） |
| **决策** | 作为 grilling 引擎的薄包装，完整保留其"Run a `/grilling` session"的委托模式。 |
| **变更** | 删除 mattpocock 原版的 `argument-hint` frontmatter 字段（pi 标准不支持）→ 保留在正文。 |
| **理由** | 包装器模式是正确的——grill-plan 是用户入口，grilling 是可复用引擎。 |

### 23. skills/workflows/grill-docs/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/grill-docs/SKILL.md`（70%）+ **bigpowers** `model-domain/SKILL.md` 的文档检查步骤（30%） |
| **决策** | 保留 mattpocock 的委托模式 + 集成 domain-modeling。吸收 bigpowers 的文档获取和验证流程。 |
| **变更** | |
| | 1. **保留 mattpocock 的**：委托 grilling + domain-modeling |
| | 2. **吸收 bigpowers 的**：5 步文档验证流程（List → Fetch → Challenge → Report → Update） |
| | 3. **删除 mattpocock 原版**的冗长域名建模引用（由 grilling 引擎处理） |
| **理由** | bigpowers 的文档验证流程补充了 mattpocock 缺失的具体验证步骤。 |

### 24. skills/workflows/improve-architecture/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/improve-architecture/SKILL.md`（85%） |
| **决策** | 保留 mattpocock 的探索→HTML报告→Grilling 三阶段流程。这是社区唯一的可视化架构审查技能。 |
| **变更** | |
| | 1. **保留 mattpocock 的**：Explore、HTML Report、Grilling Loop 三阶段 |
| | 2. **删除**：`HTML-REPORT.md` 引用（过于特定的模板指令） |
| | 3. **删除**：`/codebase-design` 词汇引用中的冗长定义（改为"使用 codebase-design 中的词汇"） |
| | 4. **删除**：`--tailwind` 和 `--mermaid` CDN 引用细节 |
| | 5. **删除**：ADR 冲突检测章节（过于特定场景） |
| | 6. **简化**：Explore 阶段的热点发现方法（用通用 git 命令替代脚本） |
| **理由** | 核心价值是探索+可视化+grilling 的三阶段流程。删除平台特定细节后仍然完整。 |

### 25. skills/workflows/implement-work/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/implement-work/SKILL.md`（90%） |
| **决策** | 保留 mattpocock 的编排器模式——implement 是薄包装，编排 tdd + code-audit + code-review。 |
| **变更** | |
| | 1. **保留 mattpocock 的**：委托 tdd → code-audit → code-review 的顺序 |
| | 2. **新增**：seam 确认步骤（"confirm seams with user before writing tests"） |
| | 3. **删除**：mattpocock 原版的"Commit your work"（由 code-review 和 fix-validation 覆盖） |
| **理由** | 编排器模式是正确的——implement 不应包含具体步骤，应委托给纪律技能。 |

### 26. skills/workflows/survey-context/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **bigpowers** `skills/survey-context/SKILL.md`（80%）+ **mattpocock** `CONTEXT.md` 概念（20%） |
| **决策** | 以 bigpowers 的"where am I?"上下文启动流程为核心。这是 bigpowers 独特的贡献——其他仓库没有等价的技能。 |
| **变更** | |
| | 1. **保留 bigpowers 的**：6 步流程（CONVENTIONS → specs/ → AGENTS.md → git → state → synthesize） |
| | 2. **删除 bigpowers 的**：`bp-timing.sh` 引用、`bp-read-agents.sh` 引用 |
| | 3. **删除 bigpowers 的**：YAML validation 脚本引用 |
| | 4. **删除 bigpowers 的**：`CLAUDE.md` 特定读取指令（改为通用 AGENTS.md） |
| | 5. **简化**：specs/ 目录结构说明 |
| | 6. **新增**：Synthesize and Recommend 章节——给模型具体的下一步建议 |
| **理由** | survey-context 是实用且独特的技能。删除 bigpowers 特定脚本后仍然是完整的工作流。 |

### 27. skills/workflows/handoff-session/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/productivity/handoff-session/SKILL.md`（80%）+ **obra/superpowers** `handoff` 概念（20%） |
| **决策** | 以 mattpocock 的 handoff 文档模板为核心，吸收 superpowers 的"redact sensitive info"概念。 |
| **变更** | |
| | 1. **保留 mattpocock 的**：handoff 文档结构和输出位置 |
| | 2. **吸收 superpowers 的**：Redact sensitive information 明确指令 |
| | 3. **新增**：What to Include / What NOT to Include 明确分段 |
| | 4. **删除 mattpocock 的**："Suggested skills" 段落（由 survey-context 覆盖） |
| **理由** | mattpocock 的 handoff 是实用的。superpowers 的安全意识是必要的补充。 |

### 28. skills/workflows/draft-spec/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/draft-spec/SKILL.md`（90%） |
| **决策** | 保留 mattpocock 的会话→规格转换模式。 |
| **变更** | |
| | 1. 新增：What to Capture 分章节（Goal/Requirements/Design/Constraints/Out of Scope/Open Questions） |
| | 2. 删除：issue tracker 特定创建指令 |
| | 3. 新增：flag missing information rather than assuming |
| **理由** | 原版过于简洁。结构化 What to Capture 给模型明确的输出模板。 |

### 29. skills/workflows/draft-tickets/SKILL.md

| 维度 | 内容 |
|------|------|
| **来源** | **mattpocock/skills** `skills/disciplines/draft-tickets/SKILL.md`（85%） |
| **决策** | 保留 mattpocock 的规格→工单分解模式。 |
| **变更** | |
| | 1. 新增：Ticket Template（统一格式） |
| | 2. 新增：Principles 章节（vertical slices/tracer bullets/explicit dependencies/independent testable/right-sized） |
| | 3. 删除：原生 blocking links 概念（pi 生态不支持） |
| **理由** | 模板和原则让模型产出更一致的工单。 |

---

## 六、配置

### 30. config/presets.json

| 维度 | 内容 |
|------|------|
| **来源** | 融合三个配置体系：**@gotgenes/pi-permission-system** config 格式（60%）+ **pi-landstrip** policy 格式（20%）+ 原创三级预设（20%） |
| **决策** | 以 pi-permission-system 的 JSON 结构为基础，融入 landstrip 的沙箱策略字段，新增三级预设枚举。 |
| **变更** | |
| | 1. **保留 pi-permission-system 的**：`permission` 对象结构（path/bash/tool surfaces） |
| | 2. **新增**：`sandbox` 顶级字段（从 landstrip policy 格式改编） |
| | 3. **新增**：`audit` 顶级字段（统一审计配置） |
| | 4. **新增**：`level` 顶级字段 + 三级预设（strict/standard/permissive） |
| | 5. **删除**：pi-permission-system 的 `yoloMode`、`debugLog`、`permissionReviewLog`（移到 security-gate.ts 内部处理） |
| | 6. **删除**：pi-permission-system 的 `mcp` 和 `skill` surface（pi 不内置 MCP） |
| **理由** | 单一配置 + 预设是核心价值。用户不应该需要理解三套独立的配置格式。 |

---

## 八、溯源矩阵总览

| # | 产物 | 主要来源 | 融合来源 | 原创占比 |
|---|------|---------|----------|----------|
| 1 | package.json | superpowers | mattpocock | 20% |
| 2 | README.md | superpowers | bigpowers | 30% |
| 3 | bootstrap.ts | superpowers | karpathy | 30% |
| 4 | security-gate.ts | permission-system | cc-safety-net + hermes-memory + landstrip | 30% |
| 5 | command-taxonomy.ts | 原创统一 | 上述所有 + phase.ts 模式库 | — |
| 5 | engineering-principles | karpathy | — | 5% |
| 6 | evidence-first | superpowers | — | 10% |
| 7 | test-driven-development/SKILL.md | mattpocock | superpowers | 15% |
| 8 | test-driven-development/tests.md | mattpocock | superpowers | 15% |
| 9 | test-driven-development/mocking.md | mattpocock | superpowers | 20% |
| 10 | code-review | mattpocock | — | 15% |
| 11 | systematic-debugging | superpowers | mattpocock | 20% |
| 12 | bug-diagnosis | mattpocock | — | 5% |
| 13 | security-review | bigpowers | mattpocock | 20% |
| 14 | code-audit | bigpowers | karpathy | 30% |
| 15 | domain-modeling | mattpocock | — | 10% |
| 16 | codebase-design | mattpocock | Ousterhout | 20% |
| 17 | plan-writing | superpowers | mattpocock + bigpowers | 25% |
| 18 | fix-validation | bigpowers | superpowers | 30% |
| 19 | bug-investigation | bigpowers | mattpocock | 20% |
| 20 | brainstorm | superpowers | mattpocock | 30% |
| 21 | grilling | mattpocock | — | 0% |
| 22 | grill-plan | mattpocock | — | 5% |
| 23 | grill-docs | mattpocock | bigpowers | 30% |
| 24 | improve-architecture | mattpocock | — | 15% |
| 25 | implement-work | mattpocock | — | 10% |
| 26 | survey-context | bigpowers | mattpocock | 20% |
| 27 | handoff-session | mattpocock | superpowers | 20% |
| 28 | draft-spec | mattpocock | — | 10% |
| 29 | draft-tickets | mattpocock | — | 15% |
| 30 | presets.json | permission-system | landstrip | 40% |

**各来源贡献占比（按产物数，含融合贡献）：**
- mattpocock/skills：20/30（67%）— 最大贡献者
- superpowers：12/30（40%）
- bigpowers：8/30（27%）
- karpathy：3/30（10%）
- 原创/其他：体现在每个文件的变更中

---


> 架构决策记录已独立为 [ADR.md](ADR.md)，包含 11 条 ADR（ADR-001 ~ ADR-011）。
