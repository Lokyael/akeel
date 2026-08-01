# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-027: LLM 交互表述精准化改写

**Kind:** refactor
**Status:** verified
**Goal:** 重写 Access Gate 的 LLM 直面文本（deny/ask 原因、静态 Guidance、审批回退文案），使表述与 Gate 实际行为一致、判据可执行、不暗示 LLM 无法完成的路径。

### Architecture

保持 D-023 的静态 GuidanceId 架构不变：渲染器只拼接源码内置静态文本，不携带可执行 Shell、原始 glob 或用户输入。本次改写只动文本与映射，不动决策类型、compiler、Policy Kernel 或安全边界。

- Guidance 文本从「宽泛建议」改为「可验证判据」：明确定义 literal command 的动态字符集合（`$`、反引号、`*`、`?`、`[`、`{`、`(`，单引号包裹即可转义）、受支持的分隔符（`&&`、`;`）与简单重定向（`>`、`>>`、`2>`、`<`），全部以 lexer/compiler 实际行为为准。
- 新增 `check-tool-input` GuidanceId：把 `invalid-tool-input` / `unknown-tool` 从「字面命令或 Direct 工具」的错位指引中拆出，改为「修正工具参数 / 使用已知工具」。
- 删除渲染器中与 guidance 重复的尾部句子（"Use a different entry point or a simpler literal command."）。
- Profile deny 不再建议「Use an allowed Profile / wait for approval」——LLM 无法自行切换 Profile，profile deny 也不触发审批弹窗；改为「ask the user to update the Profile or approve」。
- 审批回退文案明确「操作未执行」，防止 LLM 误以为成功而重试；统一 user-denied 文案。

### Out of Scope

- `src/bootstrap/principles.md` 注入原则与 `skills/**/SKILL.md` 技能描述不改写（用户未确认纳入；本任务完成后单独评估）。
- ask 审批 UI 的 title 与选项文案（"Access profile approval"、"Allow once"、"Deny"）不变——面向用户而非 LLM。
- GuidanceId 之外不引入新的渲染机制、不改 D-023 的安全边界、不动 `denyResponseKindFor` 分类。

### 实施记录

- `a9b4448` refactor: Guidance 文本改为可执行判据并新增 check-tool-input
- `29dd4b7` refactor: deny 渲染去冗余并移除 Profile 自助切换误导
- `0b5c398` fix: 审批回退文案明确操作未执行，防止 LLM 误重试
- `f92a1b0` docs: 同步 D-023 Guidance 映射与表述准则
- `72b5377` refactor: 提取 deny 渲染常量消除双渲染器重复文案
- `1a1632a` fix: 统一 user-denied 文案并补齐渲染测试与注释语言

### Verification

- `npm test` 全量通过（skill validation + `tsc --noEmit` + 349 项 access-gate 测试，0 fail）。
- 陈旧引用扫描：`src/`、`README.md`、`USAGE.md`、`CONTEXT.md`、`docs/` 无旧表述残留。
- D-023 映射表与表述准则已同步（`docs/decisions.md`）。
