# Pi Keel — 溯源摘要

本文保留产物的主要来源和融合决策；具体实现以当前源码、技能文件和 [ADR 记录](adr/INDEX.md) 为准。

## 当前边界

- R-01、R-03、R-04、R-05 和 R-07 已实现并通过当前测试集验证。
- R-02、R-08 仅记录于 [docs/security-boundaries.md](security-boundaries.md)，不在实施计划内。
- pi-keel 提供 command/path policy、permission gate 和 PLAN/BUILD；不提供 OS-level sandbox。
- snapshot/rollback、legacy cleanup、audit runtime、secret scan 和 secret replacement 不属于当前 runtime。
- 用户项目的 `README.md`、`AGENTS.md`、`.gitignore` 和 `package.json` 只读不写；第三方 extension 的直接文件或网络操作不在 enforcement 范围内。

## Runtime 产物

| 产物 | 主要来源 | 当前融合决策 |
|------|---------|-------------|
| `src/bootstrap/index.ts` + `principles.md` | obra/superpowers、Karpathy principles | 保留 compaction 后重注入；原则和 Quick Reference 外置到 `principles.md`。 |
| `src/security-gate/` | pi-permission-system、cc-safety-net、pi-hermes-memory、pi-landstrip（部分为历史参考） | 统一 extension；按 config、taxonomy、security、policy、pipeline 分层，PLAN、bash、permission 三条管道负责编排。 |
| `src/security-gate/taxonomy/` | 原创整合 | `commands.ts` 集中命令规则，`index.ts` 提供命令分类和 shell analysis 的唯一公共入口。 |
| `src/security-gate/policy/path.ts` | 原创整合 | 统一 cwd、外部路径、immutable path 和 operation policy。 |
| `src/security-gate/config/index.ts` + `presets.json` | pi-permission-system、pi-landstrip、原创 preset | 三级 preset；global/project 配置经验证后合并；旧字段 fail-closed。 |
| `src/security-gate/pipeline/*.ts` | 统一 security gate 设计 | PLAN、bash、permission 各自可通过公开 seam 测试；`plan-gate.ts` 同时承载 PLAN 约束检查和结果适配。 |
| `tests/security-gate/*.ts` | 项目行为测试 | 覆盖 taxonomy、plan-gate、permission-engine、tool-gate、path、config、phase、index 和 integration。 |

## 技能来源

| 技能组 | 主要来源 | 融合方式 |
|--------|---------|---------|
| Foundations | Karpathy、obra/superpowers | 行为原则和 evidence-first 注入全会话。 |
| Engineering disciplines | mattpocock/skills、obra/superpowers、bigpowers | 组合 TDD、review、debugging、security、architecture、planning、validation 等实践。 |
| User workflows | mattpocock/skills、obra/superpowers、bigpowers | 组合设计、grilling、文档审查、架构改进、实现、handoff 和上下文调查。 |

## 关键融合决策

- 统一 security extension，避免多个扩展竞争拦截和重复弹窗。
- command taxonomy 作为命令分类唯一真相源，避免规则分散漂移。
- security-gate 按 config、taxonomy、security、policy、pipeline 分层；模块和测试文件采用领域命名，测试与源码保持目录隔离。
- principles 注入 + Quick Reference 是模型在用户项目中获取通用约束的唯一渠道。
- snapshot/rollback、audit 和伪 OS sandbox 能力移除，避免文档承诺超过实际 enforcement。
- 当前决策的完整记录见 [ADR 目录](adr/INDEX.md)；已清理的历史方案不再进入当前索引，ADR 编号不复用。

## 维护规则

- 新增产物只需在本摘要补充来源和融合决策，不复制实现细节。
- 行为、路径和命令规则以源码及测试为准；测试数量以 [README.md](../README.md) 和 [USAGE.md](../USAGE.md) 为准。
