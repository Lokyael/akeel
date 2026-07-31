# 外部来源与合规记录

本文记录 pi-keel 使用或参考的外部来源、采用方式、当前文件映射和许可证义务。它不定义当前架构、运行时行为、安全边界或长期设计决策：这些内容分别以 [`CONTEXT.md`](../CONTEXT.md)、[`security-boundaries.md`](security-boundaries.md)、源码与测试以及 [`decisions.md`](decisions.md) 为准。

本记录用于工程归属和许可证核查，不构成法律意见。

## 记录规则

采用方式使用以下固定术语：

- **adapted**：外部文本、流程或代码结构经过改写后仍可识别其来源。
- **conceptual reference**：只采用思想或比较基线，不主张复制表达或实现。
- **runtime dependency**：发布包直接依赖的第三方软件。

初始引入发生在本仓库提交 `2f4a3ef`。该提交记录了来源和主观改编比例，但没有固定上游 revision；因此下表中的 URL 指向来源仓库，不能替代当时版本的内容快照。未来新增或同步外部内容时必须记录上游 commit 或 release。

## 技能与原则来源

| 来源 | 采用方式 | 当前映射 | 许可证与证据 |
|------|----------|----------|----------------|
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)；思想起点为 [Andrej Karpathy 的公开观察](https://x.com/karpathy/status/2015883857489522876) | adapted | `src/bootstrap/principles.md` 的 Think Before Coding、Simplicity First、Surgical Changes 和 Goal-Driven Execution | 上游 README 声明 MIT，但核查时仓库根目录没有可读取的独立 `LICENSE`；原始 revision 未固定 |
| [obra/superpowers](https://github.com/obra/superpowers) | adapted | `src/bootstrap/index.ts`；`evidence-first`、TDD、systematic debugging、plan writing、brainstorming、handoff 等技能的流程基础 | MIT；Copyright (c) 2025 Jesse Vincent；原始 revision 未固定 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | adapted | TDD 辅助文档、code review、bug diagnosis、domain modeling、codebase design、grilling、implementation、handoff、spec/ticket 等技能的流程基础 | MIT；Copyright (c) 2026 Matt Pocock；原始 revision 未固定 |
| [danielvm-git/bigpowers](https://github.com/danielvm-git/bigpowers) | adapted | security review、code audit、fix validation、bug investigation、survey context，以及部分 planning 和 document grilling 流程 | MIT；Copyright (c) 2026 Daniel VM；原始 revision 未固定 |
| John Ousterhout, *A Philosophy of Software Design* | conceptual reference | `skills/disciplines/codebase-design/SKILL.md` 中的 deep module 等设计词汇 | 受版权保护的出版物；仅记录概念影响，不复制书籍正文 |

当前技能经过多轮重构，表中“当前映射”表示来源的现存后继范围，不表示当前文件与上游仍逐行对应。具体历史变更由 Git 保留，不在本文复制。

## Access Gate 来源

| 来源 | 采用方式 | 当前映射 | 许可证与证据 |
|------|----------|----------|----------------|
| [gotgenes/pi-permission-system](https://github.com/gotgenes/pi-permission-system) | adapted / historical reference | Profile、三态决策和统一 gate 的早期输入；当前后继位于 `src/access-gate/profile/` 和 `src/access-gate/gate/` | MIT；Copyright (c) 2026 MasuRii and Christopher D. Lasher；原始 revision 未固定 |
| [kenryu42/cc-safety-net](https://github.com/kenryu42/cc-safety-net) | adapted / historical reference | 命令语义和危险操作识别的早期输入；当前后继位于 `src/access-gate/command-semantics/` | MIT；Copyright (c) 2026 kenryu42；原始 revision 未固定 |
| [chandra447/pi-hermes-memory](https://github.com/chandra447/pi-hermes-memory) | adapted | 初始 threat/secret pattern 输入；当前后继位于 `src/access-gate/security/threat-scan.ts` 和路径保护规则 | MIT；Copyright (c) 2025 Chandra Teja；原始 revision 未固定 |
| [landstrip/pi-landstrip](https://github.com/landstrip/pi-landstrip) | conceptual reference / historical adaptation | 配置和路径策略的早期比较基线；pi-keel 当前只提供用户态策略，不包含 Landstrip sandbox | MIT；Copyright (c) 2026 Jarkko Sakkinen；原始 revision 未固定 |

这些来源不定义 pi-keel 的当前安全承诺。当前 enforcement 范围和残余风险只在 [`security-boundaries.md`](security-boundaries.md) 中维护。

## Runtime 依赖

| 依赖 | 固定版本 | 用途 | License |
|------|----------|------|---------|
| [eemeli/yaml](https://github.com/eemeli/yaml) | `2.9.0`（`package-lock.json`） | 解析 command overrides YAML | ISC；Copyright (c) Eemeli Aro |

开发依赖和传递依赖以 `package-lock.json` 为准；本表只列发布包的直接 runtime dependency。

## 合规状态与维护要求

- pi-keel 本身使用 MIT License；第三方 MIT 内容仍需保留对应版权和许可声明。
- 当前记录恢复了初始提交中的来源映射，但初始引入没有保存上游 revision，这是无法由现有 Git 历史消除的溯源缺口。
- `multica-ai/andrej-karpathy-skills` 仅在 README 中声明 MIT。重新同步其文本前，必须先获得可归档的许可证证据。
- 发布前如确认当前文件仍包含第三方 substantial portions，应在分发物中保留对应上游版权和完整许可证文本；本表中的来源链接不能替代许可证义务。
- 新增外部来源时，同时记录来源 URL、固定 revision、采用方式、受影响文件、SPDX license 和所需 notice。
- 架构、Profile、命令分类、安全边界和 Task 生命周期的变化不更新本文，除非它们改变了第三方来源映射或许可证义务。
