# 外部来源与合规记录

本文记录 AKeel 使用或参考的外部来源、采用方式、当前文件映射和许可证义务。它不定义当前架构、运行时行为、安全边界或长期设计决策：这些内容分别以 [`CONTEXT.md`](../CONTEXT.md)、源码与测试以及 [`decisions.md`](decisions.md) 为准。

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
| [obra/superpowers](https://github.com/obra/superpowers) | adapted | `src/bootstrap/principles.md` 的 Verify Before Claiming；TDD、systematic debugging、plan writing、brainstorming 等技能的流程基础 | MIT；Copyright (c) 2025 Jesse Vincent；原始 revision 未固定 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | adapted | TDD 辅助文档、code review、bug diagnosis、domain modeling、codebase design、grilling、implementation、handoff、spec/ticket 等技能的流程基础 | MIT；Copyright (c) 2026 Matt Pocock；原始 revision 未固定 |
| [danielvm-git/bigpowers](https://github.com/danielvm-git/bigpowers) | adapted | security review、code audit、fix validation、bug investigation、survey context，以及部分 planning 和 document grilling 流程 | MIT；Copyright (c) 2026 Daniel VM；原始 revision 未固定 |
| John Ousterhout, *A Philosophy of Software Design* | conceptual reference | `skills/disciplines/codebase-design/SKILL.md` 中的 deep module 等设计词汇 | 受版权保护的出版物；仅记录概念影响，不复制书籍正文 |

当前技能经过多轮重构，表中“当前映射”表示来源的现存后继范围，不表示当前文件与上游仍逐行对应。具体历史变更由 Git 保留，不在本文复制。

**溯源修正（handoff-session，2026-08-25）**：初始导入记录（提交 `2f4a3ef`）把 `skills/workflows/handoff-session/SKILL.md` 标注为 mattpocock/skills `skills/productivity/handoff-session/SKILL.md`（80%）+ obra/superpowers `handoff` 概念（20%）。核查后修正两处：

- mattpocock 上游实际文件是 `skills/productivity/handoff/SKILL.md`（该名自 2026-07-02 起存在，`handoff-session` 从未存在），初始记录的路径是本地改名误转写。
- obra/superpowers 在核查时 HEAD `b36e0829` 全树与提交历史中均无 handoff 技能；初始记录归因给它的 redact sensitive information 等内容在 mattpocock 文件中已原生存在，20% 归属无对账文件，故从 superpowers 行的当前映射移除 “handoff”。

当前 handoff-session 的触发方式遵循 D-078；其在 mattpocock 基线之上的交付规则与场景无关（默认约定路径 `/tmp/akeel/handoffs/` + 用户覆盖；交接自足判据；Decisions 只引用防双源），逐行差异由 Git 历史承载。

## Access Gate 来源

| 来源 | 采用方式 | 当前映射 | 许可证与证据 |
|------|----------|----------|----------------|
| [gotgenes/pi-permission-system](https://github.com/gotgenes/pi-permission-system) | adapted / historical reference | Profile、三态决策和统一 gate 的早期输入；旧实现已由 `src/access-gate/access-decision/` 的 Greenfield pipeline 替换，Git 历史保留溯源 | MIT；Copyright (c) 2026 MasuRii and Christopher D. Lasher；原始 revision 未固定 |
| [kenryu42/cc-safety-net](https://github.com/kenryu42/cc-safety-net) | adapted / historical reference | 命令语义和危险操作识别的早期输入；旧实现已删除，新 Shell 语义由 `src/access-gate/access-decision/core/` 独立定义 | MIT；Copyright (c) 2026 kenryu42；原始 revision 未固定 |
| [chandra447/pi-hermes-memory](https://github.com/chandra447/pi-hermes-memory) | adapted / historical reference | 初始 threat/secret pattern 输入；旧 threat scanner 已删除，新安全边界由 `src/access-gate/access-decision/core/` 独立定义 | MIT；Copyright (c) 2025 Chandra Teja；原始 revision 未固定 |
| [landstrip/pi-landstrip](https://github.com/landstrip/pi-landstrip) | conceptual reference / historical adaptation | 配置和路径策略的早期比较基线；AKeel 当前只提供用户态策略，不包含 Landstrip sandbox | MIT；Copyright (c) 2026 Jarkko Sakkinen；原始 revision 未固定 |
| [astral-sh/uv](https://github.com/astral-sh/uv) release `0.12.6`；[uv project run documentation](https://docs.astral.sh/uv/concepts/projects/run/)；[uv license policy](https://docs.astral.sh/uv/reference/policies/license/) | conceptual reference / historical reference | `src/access-gate/access-decision/core/shell-words.ts` 中 `uv run`、版本/帮助和未建模子命令的分类参考；对应回归测试在 `tests/access-gate/access-decision/core/shell-policy.test.ts` | Apache-2.0 OR MIT（uv 官方 license policy）；固定参考 release `0.12.6`，仅作命令语义参考，AKeel 不分发 uv |

这些来源不定义 AKeel 的当前安全承诺。当前 enforcement 范围和残余风险在 decisions.md 安全条目与 CONTEXT.md Negative Space 中维护。

## T-069 Greenfield 外部合同来源

以下来源只为新 Pipeline 的合同仲裁提供外部事实；它们不授权复用旧 Access Gate 的实现、类型、测试或结果。每个新场景仍须在 contract test 中标记来源和 `referenceStatus`，旧行为不能单独成为 expected value。

| 来源 | 固定版本/修订 | 采用方式 | 采用范围与当前映射 | 许可证与证据 |
|----------|----------|----------|----------|----------|
| [Pi coding-agent extension guide](https://github.com/badlogic/pi-mono/blob/dd6bea41/packages/coding-agent/docs/extensions.md) 与 [extension types](https://github.com/badlogic/pi-mono/blob/dd6bea41/packages/coding-agent/src/core/extensions/types.ts) | pi-mono commit `dd6bea41` | conceptual reference | `tool_call` 拦截、`toolName`/`input` 请求边界、`ctx.hasUI`、`ctx.ui.confirm` 及 block 结果；只作为 `src/access-gate/access-decision/adapters/` 的外部 host 合同依据，不复制 Pi 内部实现 | pi-mono 仓库许可证以该 revision 为准；本仓库未复制其代码 |
| [Pi coding-agent README](https://github.com/earendil-works/pi/tree/v0.85.0/packages/coding-agent)、[quickstart](https://github.com/earendil-works/pi/tree/v0.85.0/packages/coding-agent/docs/quickstart.md) 与 [SDK](https://github.com/earendil-works/pi/tree/v0.85.0/packages/coding-agent/docs/sdk.md) | release `0.85.0` | conceptual reference | Pi 的 session `cwd` 工作目录、cwd-bound 工具/资源发现和非 Git cwd 行为；为 D-072 的 AKeel Access Root 语义提供外部依据，不复制 Pi 实现 | Pi 仓库许可证以该 release 为准；本仓库未复制其代码 |
| [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html) | Bash 5.3，Manual Edition 5.3，2025-05-18；实现基线 tag `bash-5.3` | conceptual reference + independently observed | 仅采用 T-069 支持子集的控制操作、and-or 求值顺序、引用/转义、tilde/参数展开、重定向和 builtin CWD 观察；Slice 2 的 `core/shell-language.ts`、`shell-words.ts`、`shell-flow.ts`、`shell-compile.ts` 只实现已冻结的简单命令词义、wrapper、重定向和 fail-closed 动态/控制语法；不承诺完整 Bash | GNU Free Documentation License 1.3；本仓库只记录语义来源，不复制正文 |
| [Arch Linux `bash(1)`](https://man.archlinux.org/man/bash.1.en) | Arch man-pages snapshot 标注 Bash 5.3；核查日 2026-09-02 | independently observed | 作为 Linux-only 运行环境的 Bash 命令行/版本交叉核对；不把发行版选项差异扩大为 AKeel 支持面 | Arch manual page 的上游许可证和版本信息以其页面为准；未复制文本 |
| [Linux kernel pathname lookup documentation](https://docs.kernel.org/6.15/filesystems/path-lookup.html) 与 [Linux `path_resolution(7)`](https://man7.org/linux/man-pages/man7/path_resolution.7.html) | kernel documentation 6.15；Linux man-pages 6.15 语义基线 | conceptual reference | 只采用路径组件查找、绝对/相对路径和 canonical 阶段解析时点的 Linux 语义；不宣称 fd 传递、OS sandbox 或 TOCTOU 消除 | Linux kernel documentation/man-pages 各自按上游许可证；本仓库未复制实现或正文 |

固定版本和采用范围是 Slice 0/2 的边界：来源更新不会自动改变合同；任何语义变化必须新增核查记录和独立 contract test，再决定是否调整 T-069。

## 委托与终端工作流来源

| 来源 | 固定版本/修订 | 采用方式 | 采用范围与当前映射 | 许可证与证据 |
|------|---------------|----------|----------------------|--------------|
| [Herdr documentation](https://herdr.dev/docs/) 与 [herdrdev/herdr](https://github.com/herdrdev/herdr) | release `v0.9.0`；本机 CLI 合同以 `herdr 0.9.0` 独立核对 | conceptual reference + independently observed | `skills/workflows/grill-docs/SKILL.md` 与 D-075/D-076 的 workspace/worktree、Agent start/prompt wait、settled/blocked 状态、session reference、worktree removal 和失败边界；结果交付使用 AKeel 预定 artifact，不复制实现，不把 Herdr 声明为 runtime dependency | Apache-2.0；上游 `v0.9.0` `LICENSE` |

该来源只定义已核对的 Herdr 外部执行面能力，不成为 AKeel 的运行时依赖或权限保证。版本更新不会自动改变 D-075/D-076；CLI、生命周期或 worktree 合同变化时重新核对后再修订。

## Runtime 依赖

| 依赖 | 固定版本 | 用途 | License |
|------|----------|------|---------|
| [eemeli/yaml](https://github.com/eemeli/yaml) | `2.9.0`（`package-lock.json`） | 解析 T-069 新全局 `policy.yaml` | ISC；Copyright (c) Eemeli Aro |

开发依赖和传递依赖以 `package-lock.json` 为准；本表只列发布包的直接 runtime dependency。

## 合规状态与维护要求

- AKeel 本身使用 MIT License；第三方 MIT 内容仍需保留对应版权和许可声明。
- 当前记录恢复了初始提交中的来源映射，但初始引入没有保存上游 revision，这是无法由现有 Git 历史消除的溯源缺口。
- `multica-ai/andrej-karpathy-skills` 仅在 README 中声明 MIT。重新同步其文本前，必须先获得可归档的许可证证据。
- 发布前如确认当前文件仍包含第三方 substantial portions，应在分发物中保留对应上游版权和完整许可证文本；本表中的来源链接不能替代许可证义务。
- 新增外部来源时，同时记录来源 URL、固定 revision、采用方式、受影响文件、SPDX license 和所需 notice。
- 架构、Profile、命令分类、安全边界和 Task 生命周期的变化不更新本文，除非它们改变了第三方来源映射或许可证义务。

## 上游状态核查（2026-08-06）

周期性上游状态确认，不改变既有映射与许可证义务；HEAD 快照供未来同步时作参考点，不替代“每次同步记录 commit 或 release”的要求。

| 来源 | 核查时状态 | 核查时 HEAD |
|------|-----------|-------------|
| multica-ai/andrej-karpathy-skills | 活跃（最后推送 2026-04-20）；仍只有 README 声明 MIT，仓库根目录无独立 LICENSE 文件 | `2c606141` |
| obra/superpowers | 活跃；仓库根目录存在 MIT LICENSE | `44c9b2d6` |
| mattpocock/skills | 活跃；存在 MIT LICENSE | `8b36d4fb` |
| danielvm-git/bigpowers | 活跃；存在 MIT LICENSE | `036ab125` |
| gotgenes/pi-permission-system | 已归档（内容冻结）；存在 MIT LICENSE | `f1d2f619` |
| kenryu42/cc-safety-net | 活跃；存在 MIT LICENSE | `9fa3c5bd` |
| chandra447/pi-hermes-memory | 活跃；存在 MIT LICENSE | `11a75337` |
| landstrip/pi-landstrip | 已归档（内容冻结）；存在 MIT LICENSE | `61220413` |
| eemeli/yaml | 最新 release 仍为 v2.9.0（2026-05-11 发布），与固定版本一致，无需更新 | — |

结论：本次核查未发现任何来源删除、改许可或引入新的第三方 substantial portions。`pi-permission-system` 与 `pi-landstrip` 已归档，其内容已冻结，后续同步引用以核查时 HEAD 为参考；andrej-karpathy-skills 的许可证证据缺口依旧存在，重新同步其文本前必须补齐可归档证据。

**同步记录（2026-08-06）**：从 obra/superpowers v6.2.0 吸收 `writing-good-tests.md` 的可证伪性纪律至 `skills/disciplines/test-driven-development/`：SKILL.md 织入 falsifiability 定义与反模式（String-presence、Change detector）并扩展 rationalization 行；tests.md 新增 Falsifiability 节、删除 Why Order Matters 段落（列举语义迁至表格行）；mocking.md 并入 mock-earns-no-assertions 并新增 Mirror Real Data Completely。上游 commit 链：`e74961c1`（testing-anti-patterns → writing-good-tests 重构）→ `9d8630d5`（吸收可证伪性）→ `e8a9748a`（关闭 change-detector 漏洞）→ `517a9c64`（压缩）→ `caa1826c`（两原则重写，HEAD）。

## 上游状态核查（2026-08-23）

周期性上游状态确认，不改变既有映射与许可证义务；HEAD 快照供未来同步时作参考点，不替代“每次同步记录 commit 或 release”的要求。

| 来源 | 核查时状态 | 核查时 HEAD | 与 2026-08-06 核查对比 |
|------|-----------|-------------|-------------------------|
| multica-ai/andrej-karpathy-skills | 活跃（最后推送 2026-04-20，未变）；仍只有 README 声明 MIT，仓库根目录无独立 LICENSE 文件（API license 为 null） | `2c606141` | 未变 |
| obra/superpowers | 活跃；仓库根目录存在 MIT LICENSE | `b36e0829` | 前进：2026-08-12 发布 v6.3.0，晚于 2026-08-06 同步的 v6.2.0（`caa1826c`） |
| mattpocock/skills | 活跃；存在 MIT LICENSE | `5b15a47f` | 前进：2026-08-21 HEAD 为 code review 流程措辞修订 |
| danielvm-git/bigpowers | 活跃；存在 MIT LICENSE | `c0209032` | 前进：2026-08-07 release v2.87.5 |
| gotgenes/pi-permission-system | 仓库描述含迁移公告 “Moved to gotgenes/pi-packages”并指向 monorepo 新址（新址活跃，最后推送 2026-08-22）；GitHub API archived 标志为 false；最后推送 2026-07-03，内容冻结由迁移公告确认 | `f1d2f619` | HEAD 未变；新增事实：上游迁移公告与 monorepo 新址 |
| kenryu42/cc-safety-net | 活跃（最后推送 2026-08-23）；存在 MIT LICENSE | `270839b4` | 前进 |
| chandra447/pi-hermes-memory | 活跃（最后推送 2026-08-17）；存在 MIT LICENSE | `71beae8a` | 前进 |
| landstrip/pi-landstrip | 已归档（GitHub API archived=true）；存在 MIT LICENSE | `61220413` | 未变 |
| eemeli/yaml | 最新 release 仍为 v2.9.0（2026-05-11 发布），与固定版本一致，无需更新 | — | 未变 |

结论：本次核查未发现任何来源删除、改许可或引入新的第三方 substantial portions。5 个活跃上游的 HEAD 有推进（obra/superpowers v6.3.0 晚于上次同步的 v6.2.0，mattpocock/skills、bigpowers、cc-safety-net、pi-hermes-memory），均为参考点更新，不改变既有映射与许可证义务。

两点澄清：`gotgenes/pi-permission-system` 上次核查记录的“已归档（内容冻结）”在本核查中 API archived 标志为 false，内容冻结由迁移公告与最后推送时间确认，保留冻结判定；上游内容已迁入 `gotgenes/pi-packages` monorepo（该 monorepo API license 为 null，未检出独立 LICENSE 文件，未来若从新址同步需要先补可归档许可证证据）。`andrej-karpathy-skills` 的许可证证据缺口依旧存在，重新同步其文本前必须补齐可归档证据。

**同步记录（2026-08-23）**：从 mattpocock/skills 吸收两处纪律至 AKeel：
- `1dab982`（user-invoked skill 不可被其他技能调用，2026-08-15 修复）：`scripts/validate-skills.ts` 新增 `/skill:` 交叉引用检查——引用 `disable-model-invocation` 目标时仅允许用户面向措辞（"tell the user to run ..."）或描述性提及，祈使式（hand off to / invoke / run / call）报错；`skills/disciplines/code-cleanup/SKILL.md` 与 `skills/disciplines/systematic-debugging/SKILL.md` 三处 hand-off 同步改为用户指令形式。
- `85f83d3`（grilling 问题块以 `---` 分隔，2026-08-20）：`skills/workflows/grill-docs/SKILL.md` 保留一次只问一个问题的问题块模板——问题与推荐答案之间以 `---` 分隔，连续问题块互相独立。
