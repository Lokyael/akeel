# Pi Keel — 溯源摘要

本文保留主要来源、融合决策和合规溯源；具体实现以当前源码、技能文件和 [决策寄存器](decisions.md) 为准。

## 当前边界

- pi-keel 提供 Profile 驱动的 command/path access gate，不提供 OS-level sandbox。
- Profile 统一读取、写入、Shell 分类和一次性批准；网络不是当前独立策略轴。
- 没有匹配 adapter 的未分类命令由 Profile 的 `shellPolicy.unknown` 决定；`plan`、`code`、`develop`、`query`、`build`（存储为 `keel-plan` 等，显示时去除前缀）可以要求一次性批准。
- adapter 标记为 `opaque` 的命令表示其效果无法安全解释，始终 hard deny，不受 Profile 或用户批准覆盖。
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
| `src/access-gate/command-semantics/` | 原创整合 | 统一命令语义：wrapper 规范化、control-flow、adapter 注册表（filesystem、text-transform、search、read、noop、git、package、build）|
| `src/access-gate/path/` | 原创整合 | 统一 `cwd`、`projectRoot`、`stagingDir`、按操作路径决策、blocked paths 和 symlink 检查。 |
| `src/access-gate/gate/` | 统一 access gate 设计 | `evaluate.ts` 保持唯一运行时入口；`shell-compiler.ts`、`direct-tool-compiler.ts` 生成 AccessRequest，`evaluate-request.ts` 执行 Policy Kernel，`render-decision.ts` 产生 host 兼容结果 |
| `tests/access-gate/` | 项目行为测试 | 覆盖 Profile、路径、Shell IR、compiler、Kernel、guidance/renderer、invariants、语义 adapter、Gate 和 Extension 状态。 |

## 技能来源

| 技能组 | 主要来源 | 融合方式 |
|--------|---------|---------|
| Foundations | Karpathy、obra/superpowers | 行为原则和 evidence-first 注入全会话。 |
| Engineering disciplines | mattpocock/skills、obra/superpowers、bigpowers | 组合 TDD、review、debugging、security、architecture、planning、validation 等实践。 |
| User workflows | mattpocock/skills、obra/superpowers、bigpowers | 组合设计、grilling、文档审查、架构改进、实现、handoff 和上下文调查。 |

## 关键融合决策

- 统一 access gate，避免多个扩展竞争拦截和重复弹窗。
- Profile 是唯一用户权限入口；不再拆分执行阶段和安全级别。
- TUI Footer 固定为两行：Access Gate 通过 `setFooter()` 包装 Pi 原生 `FooterComponent`，第一行显示位置和 Profile，第二行保留原生运行统计、上下文、模型和扩展状态；Pi 主包不可用时仅使用本地 fallback。
- 命令分类和路径操作分别拥有单一真相源，Profile 只提供决策。
- `blockedPaths`、threat scan 和 unsafe Shell rules 是不可覆盖边界。
- Profile 组合只允许显式继承；路径规则保留合并后的声明顺序，由 first-match 决定结果。
- principles 注入 + Quick Reference 是模型在用户项目中获取通用约束的唯一渠道。
- 用户项目文档统一为 `CONTEXT.md`、`docs/decisions.md` 和 `docs/task.md`；Task Record 验证完成后删除，长期信息提炼后保留。
- snapshot/rollback 和伪 OS sandbox 能力不进入 runtime，避免文档承诺超过实际 enforcement。

## 维护边界

来源与融合决策记录在本文；行为、路径和命令规则以源码及测试为准，测试入口以 `package.json` 为准。
