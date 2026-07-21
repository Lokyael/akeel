# 架构决策记录

pi-keel 的所有架构决策按时间顺序编号，每个 ADR 独立文件。新增 ADR 时在此索引末尾追加。

## 索引

| # | 标题 | 分类 | 文件 |
|---|------|------|------|
| 1 | Soft vs Hard 技能强制执行 | 技能哲学 | [ADR-001](./001-soft-vs-hard-enforcement.md) |
| 2 | 统一安全扩展 vs 社区扩展并存 | 安全架构 | [ADR-002](./002-unified-security-extension.md) |
| 3 | bigpowers 72→10 技能精选 | 技能策展 | [ADR-003](./003-bigpowers-skill-curation.md) |
| 4 | Path policy 与 OS sandbox 的边界 | 安全架构 | [ADR-004](./004-path-policy-os-sandbox-boundary.md) |
| 5 | 技能三目录结构 | 项目组织 | [ADR-005](./005-skill-three-directory-structure.md) |
| 6 | 统一命名规范 | 项目组织 | [ADR-006](./006-unified-naming-convention.md) |
| 7 | 安全扩展模块化拆分（历史） | 代码架构 | [ADR-007](./007-security-gate-modular-split.md) |
| 9 | 移除 npm / docs / AGENTS.md | 项目组织 | [ADR-009](./009-remove-npm-docs-agents.md) |
| 10 | Shell 文件写入绕过防护 | 安全架构 | [ADR-010](./010-shell-write-bypass-protection.md) |
| 11 | 统一命令分类体系（历史） | 代码架构 | [ADR-011](./011-unified-command-taxonomy.md) |
| 12 | Pipeline 拆解与 Bootstrap 简化（历史） | 代码架构 | [ADR-012](./012-pipeline-bootstrap-simplify.md) |
| 13 | 原则向用户项目的统一部署 | 文档架构 | [ADR-013](./013-unified-principles-deployment.md) |
| 16 | 安全门控模块边界与统一命名（历史） | 代码架构 | [ADR-016](./016-module-boundaries-and-naming.md) |
| 17 | Profile 驱动的访问策略 | 安全架构 / 代码架构 | [ADR-017](./017-profile-access-policy.md) |
| 18 | 统一语义 Shell IR 与 Access Gate 架构 | 安全架构 / 代码架构 | [ADR-018](./018-unified-shell-ir-access-gate.md) |

## 状态标记

- **无标记**：当前生效的决策
- **历史（Historical）**：不再影响当前 runtime 的决策；历史记录不进入当前 ADR 索引
- ADR 编号只增不复用；已清理的历史编号保留空缺，避免后续引用歧义。

## 新增规则

新增 ADR 时：
1. 在 `docs/adr/` 下创建 `NNN-<kebab-title>.md` 文件
2. 在本索引末尾追加一行
3. 同时更新 `docs/traceability.md` 的关键融合决策列表
