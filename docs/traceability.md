# Pi Keel — 溯源摘要

本文保留主要来源和融合决策；具体实现以当前源码、技能文件和 [ADR 记录](adr/INDEX.md) 为准。

## 当前边界

- pi-keel 提供 Profile 驱动的 command/path access gate，不提供 OS-level sandbox。
- Profile 统一读取、写入、Shell 分类和一次性批准；网络不是当前独立策略轴。
- 未分类命令由 Profile 的 `shellPolicy.unclassified` 决定；`research` 等 Profile 可以要求一次性批准。
- hard threat、危险命令、unsafe syntax、blocked paths 和 symlink escape 不可被 Profile 或用户批准覆盖。
- snapshot/rollback、audit runtime、secret replacement 不属于当前 runtime。
- 用户项目的 `README.md`、`AGENTS.md`、`.gitignore` 和 `package.json` 只读不写；第三方 extension 的直接操作不在本扩展的 enforcement 范围内。

## Runtime 产物

| 产物 | 主要来源 | 当前融合决策 |
|------|---------|-------------|
| `src/bootstrap/index.ts` + `principles.md` | obra/superpowers、Karpathy principles | 保留 compaction 后重注入；原则和 Quick Reference 外置到 `principles.md`。 |
| `src/access-gate/` | pi-permission-system、cc-safety-net、pi-hermes-memory、pi-landstrip（部分为历史参考） | 以 Profile 为唯一 Session 权限状态，统一处理工具、Shell、路径和审批。 |
| `src/access-gate/profile/` | 原创整合 | Profile 校验、继承、分层加载和内置 Profile 唯一来源。 |
| `src/access-gate/shell-parse/` | 原创 | 受限 Shell IR：lexer（引用感知分词）+ parser（控制操作符、重定向、wrapper）|
| `src/access-gate/command-semantics/` | 原创整合 | 统一命令语义：wrapper 规范化、control-flow、adapter 注册表（filesystem、text-transform、search、git、package、build）|
| `src/access-gate/path/` | 原创整合 | 统一 `cwd`、`projectRoot`、`stagingDir`、按操作路径决策、blocked paths 和 symlink 检查。 |
| `src/access-gate/gate/` | 统一 access gate 设计 | `evaluate.ts` 统一入口，`analyze-shell.ts` 使用新 IR + 语义注册表替代旧 shell-command |
| `tests/access-gate/` | 项目行为测试 | 覆盖 Profile、路径、Shell IR、语义 adapter、Gate 和 Extension 状态。 |

## 技能来源

| 技能组 | 主要来源 | 融合方式 |
|--------|---------|---------|
| Foundations | Karpathy、obra/superpowers | 行为原则和 evidence-first 注入全会话。 |
| Engineering disciplines | mattpocock/skills、obra/superpowers、bigpowers | 组合 TDD、review、debugging、security、architecture、planning、validation 等实践。 |
| User workflows | mattpocock/skills、obra/superpowers、bigpowers | 组合设计、grilling、文档审查、架构改进、实现、handoff 和上下文调查。 |

## 关键融合决策

- 统一 access gate，避免多个扩展竞争拦截和重复弹窗。
- Profile 是唯一用户权限入口；不再拆分执行阶段和安全级别。
- 命令分类和路径操作分别拥有单一真相源，Profile 只提供决策。
- `blockedPaths`、threat scan 和 unsafe Shell rules 是不可覆盖边界。
- Profile 组合只允许显式继承；路径规则保留合并后的声明顺序，由 first-match 决定结果。
- principles 注入 + Quick Reference 是模型在用户项目中获取通用约束的唯一渠道。
- snapshot/rollback 和伪 OS sandbox 能力不进入 runtime，避免文档承诺超过实际 enforcement。

## 维护规则

- 新增产物只需在本摘要补充来源和融合决策，不复制实现细节。
- 行为、路径和命令规则以源码及测试为准；测试入口以 `package.json` 为准。
