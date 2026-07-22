# T-001: Access Gate 安全核查

**Kind:** maintenance
**Status:** in-progress
**Goal:** 集中维护 Access Gate 尚未完成核查的安全与质量事项，并在验证完成后提炼长期信息。

## Scope

覆盖 Shell 解析、命令语义、路径策略、Profile、Gate、Session 生命周期和安全矩阵。

## Out of Scope

- **OS-level isolation**：Access Gate 是用户态策略，不负责容器、VM、seccomp、Landlock 或 network namespace。
- **独立 network policy**：当前网络命令继续使用 `unclassified` 决策，直到有独立策略需求。
- **全局 enforcement**：Shell 实际执行、用户 `!`/`!!` 命令和其他 Extension 的直接操作不在 Access Gate 范围内。

## Risk Register

| ID | 优先级 | 待核查事项 | 主要模块 |
|----|--------|------------|----------|
| AG-01 | P0 | 只读命令是否完整产生敏感路径的 `read` intent；覆盖 `head`、`tail`、`less`、`base64`、`dd`、`openssl enc` 和 wrapper。 | `command-semantics/adapters/`、`gate/` |
| AG-02 | P0 | `.git` 全部内容、裸仓库和常见密钥文件是否均属于 hard-blocked paths。 | `path/blocked-paths.ts` |
| AG-03 | P0 | heredoc body 是否完整消费、作为 literal 保存，并对缺失结束符和动态内容 hard deny。 | `shell-parse/` |
| AG-04 | P1 | 复合控制流是否正确处理 `&&`、`||`、`&`、pipeline、cwd 传播和无法确定的 opaque 分支。 | `command-semantics/control-flow.ts` |
| AG-05 | P1 | 命令语义 validator、Effect 到 PathOperation 的映射以及 pipeline 聚合规则是否集中且可验证。 | `command-semantics/`、`gate/` |
| AG-06 | P1 | Shell 解析、wrapper、分支状态、intent 和 heredoc 是否有明确资源上限。 | `shell-parse/`、`command-semantics/`、`gate/` |
| AG-07 | P1 | hard boundary、Shell 路径归一化、特殊文件和新文件 parent directory 检查是否集中处理。 | `path/`、`gate/` |
| AG-08 | P1 | Profile 多继承、child/parent 优先级、项目覆盖和失效 default Profile 是否有稳定契约。 | `profile/` |
| AG-09 | P1 | Profile 初始化失败、项目不可信或项目根目录不可用时是否始终 fail closed。 | `session/`、`index.ts` |
| AG-10 | P2 | 一个 tool call 的多个 ask 是否聚合为一次审批，并明确审批详情边界。 | `gate/` |
| AG-11 | P2 | Direct tool adapter 是否集中管理 `read`、`write`、`edit`、`find`、`grep`、`ls`，未知 tool 是否不会被错误放行。 | `gate/` |
| AG-12 | P2 | staging 目录的命名隔离、容量、孤儿清理和异常退出策略是否明确。 | `index.ts`、`path/` |
| AG-13 | P2 | 并发 tool call、Profile 切换、Session shutdown 与执行中的 tool call 之间是否有明确同步边界。 | `gate/`、`index.ts` |
| AG-14 | P3 | 是否有覆盖内置 Profile、四类 PathOperation、Direct tool 和 Shell 的安全矩阵。 | `tests/access-gate/` |

## Test Gaps

以下场景应纳入安全矩阵或对应模块测试：

- `curl | sh`、network pipeline 和 unknown command + redirect
- 非 `cat` 敏感读取、`tee` 保护路径和 `sudo` wrapper
- 多 parent Profile 冲突、Profile 覆盖和 `${}` dynamic 标记
- `.git/HEAD` 直接读取、裸仓库路径和嵌套 symlink
- heredoc 多段 body、quoted delimiter、截断 body 和 body 内控制符
- `find -exec`、`xargs`、`parallel`、归档内部路径和特殊文件
- `for`、`while`、`if`、函数定义等结构化 Shell 语法，以及无动态 token 的未知命令在各 Profile 下的边界

## Security Review

- [x] 多搜索根逐个生成 `search` intent；`rg pattern project/docs /etc` 现在拒绝 `/etc`，避免第二个根目录绕过策略。
- [x] 非递归 `grep` 的显式文件生成 `read` intent；`grep pattern /etc/passwd` 现在拒绝外部读取。
- [x] `2>/dev/null` 仅对精确 `/dev/null` 输出 sink 放行，其他外部写入仍由路径策略决定。
- [x] fd 前缀仅在数字 token 与重定向符相邻时消费；`2 > file` 保留为普通参数加 stdout 重定向。
- [x] `git rev-list` 识别为只读；adapter 无法安全解释的 `opaque` 语义在 Gate 层 hard deny，避免被 `unclassified: allow` 放行。
- [x] `git rm` 识别为变更命令，并对每个目标产生 `write` intent；已删除项目文件可在批准后暂存，保护路径仍被拒绝。
- [x] `rg` 的 `-A`、`-B`、`-C` 及长选项上下文计数会被消费为选项值，不再误判为搜索根。
- [x] `cd` 目标经过 `list` 路径检查后不再触发额外的未知命令审批；`grep -rn` 的组合短选项保持递归搜索语义。
- [ ] 结构化 Shell 语法（如 `for`、`while`、`if`、函数定义）尚无完整安全语义；当前仅依靠 dynamic token 检查和 Profile 的 `unclassified` 决策。
- [ ] 复杂命令参数（如 `find -exec`、`xargs`、`parallel`）仍按未完成风险处理，不在本次 adapter 扩展中放宽。

## Durable Updates

- [ ] 安全边界变化同步到 `docs/security-boundaries.md`。
- [ ] 架构或策略决策同步到 `docs/decisions.md`。
- [ ] 当前术语、架构或 Negative Space 变化同步到 `CONTEXT.md`。
- [ ] 验证完成后删除已关闭的风险和本 Task Record。

---

## T-002: Access Gate 决策解释与替代入口重构

**Kind:** refactor
**Status:** draft
**Goal:** 让每次拒绝都能提供结构化、可验证且不放宽权限的原因与替代入口，同时统一 Shell 和 Direct tool 的访问计划。

### Architecture

采用三层边界：`tool_call` 编译为不可执行的 `AccessPlan`，Policy Evaluator 只根据计划和 Profile 产生结构化 `GateDecision`，Renderer 在 Pi 边界将决策转换为兼容现有 host API 的 `reason` 字符串。动态 token、opaque effect、威胁和 blocked path 继续是不可覆盖的 hard deny；guidance 只描述安全替代入口，不能执行替代操作或覆盖 deny。

Shell 的 `CommandSemantics` 继续作为 Shell compiler 的内部输出；Direct tool 通过同一计划接口进入 Gate。现有 `GateResult.kind` 在迁移期保留，新增稳定的 `code`、`hard`、`evidence` 和 `guidance` 字段，避免一次重构同时破坏 Pi host 集成和测试调用方。

### Out of Scope

- **完整 Bash 兼容**：`for`、`while`、`if`、函数定义、命令替换和未引用 glob 仍不建模；因为这需要独立的 Shell 解释器或执行沙箱，而不是拒绝消息重构。
- **自动 glob 展开**：不在 Gate 中枚举并执行 Shell glob；因为路径检查与实际展开之间会引入 TOCTOU 和语义差异。批量检查继续通过 Direct tool 或字面 `find`。
- **OS-level isolation 和全局 enforcement**：遵循 T-001 与 D-004/D-018 的既有边界。
- **持久化审批和自动重试**：guidance 不产生授权状态。

### Requirements

- hard deny、Profile deny、ask、user deny 使用稳定的 machine-readable decision code。
- `AccessPlan` 只能由 Gate 内部 compiler 创建；`evaluatePlan` 必须重新验证 plan 完整性，不能信任外部传入的 `hard`、`hazards` 或 `intents`。
- guidance 只能引用内置的静态 `GuidanceId`，不能携带可直接执行的 Shell 字符串或由用户输入决定的 tool/action 名称。
- 每个可恢复拒绝最多提供一个安全替代方案类别；敏感路径拒绝不得通过 guidance 泄露更多秘密信息。
- 所有 guidance 的目标 tool call 必须再次经过同一 Gate；渲染层不得返回隐含 allow。
- 迁移期间只保留一个 `tool_call` enforcement entry；旧 evaluator 和新 evaluator 不得按 surface 并行产生不同结论。
- `cd`、Shell path intent、Direct `find/read/grep/ls` 对同一 `AccessPlan` 契约进行路径检查。
- 保留现有审批聚合、blocked path、opaque hard deny、symlink escape 和 Profile 语义。
- headless 模式在 ask 场景继续 fail closed。

### Design Alternatives

**方案 A：仅扩展拒绝字符串**

在 `decisionBlock(reason)` 后拼接固定建议，例如动态 token 拒绝时追加“使用 `find`”。改动小，但原因、严重性和建议仍被字符串耦合；调用方无法区分 hard deny 与普通 deny，建议也无法被测试或其他 UI 复用。拒绝。

**方案 B：结构化拒绝 + 中央 Guidance Catalog**

新增 reason code、evidence 和 guidance ID，由一个 catalog 将 code 映射成提示。它能快速解决交互问题，迁移成本低，但 Shell 与 Direct tool 仍分别构造路径意图，长期会继续产生入口行为漂移。作为过渡层保留，不作为终态。

**方案 C：统一 AccessPlan + Policy Decision + Explanation Renderer（推荐）**

两个入口先编译到统一计划，再由单一 evaluator 执行所有 effect/path 检查，最后由 renderer 生成 host reason 和 guidance。接口更深、职责更清晰，能同时解决审批详情、拒绝引导、矩阵测试和未来非 Shell tool 的扩展问题；代价是需要分阶段迁移现有 Gate。

### Implementation Plan

#### Task 1: 定义决策领域类型

**Files:**
- Create: `src/access-gate/gate/decision-types.ts`
- Modify: `src/access-gate/gate/types.ts`
- Test: `tests/access-gate/gate-decision.test.ts`

**Interfaces:**
- `DecisionCode`: `dynamic-shell`, `unsafe-syntax`, `threat`, `opaque-command`, `blocked-path`, `path-denied`, `shell-policy-denied`, `approval-required`, `user-denied`, `unknown-tool`。
- `GateEvidence`: `{ kind, subject, operation?, pattern?, span? }`，其中 `subject` 只允许经过 redact 的结构化值。
- `Guidance`: `{ id: GuidanceId, safety: "recheck" }`；`GuidanceId` 来自源码内置 catalog，不包含可执行命令。
- `GateDecision`: `{ disposition: "allow" } | { disposition: "ask", prompt, evidence } | { disposition: "deny", code, enforcement: "hard" | "profile", evidence, guidance }`。

- [ ] 为每个 code 写构造器和判定不变量测试：`hard=true` 不能进入 ask；guidance 不能携带 allow 状态。
- [ ] 保留 `GateResult` 的 `kind` 兼容字段，并定义从 `GateDecision` 到旧 host 结果的转换接口。

#### Task 2: 建立统一 AccessPlan compiler seam

**Files:**
- Create: `src/access-gate/gate/access-plan.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`
- Test: `tests/access-gate/access-plan.test.ts`

**Interfaces:**
- `AccessPlan`: `{ surface, cwd, transitions, intents, effects, hazards, assumptions }`。
- `compileShellCall(input): CompileResult`。
- `compileDirectToolCall(input): CompileResult`。
- `CompileResult`: `{ kind: "plan", plan } | { kind: "reject", code, evidence }`。

- [ ] 将 dynamic/unsafe/threat/opaque 从字符串 early return 改成带 span 和 code 的 compile rejection。
- [ ] 让 `AccessPlan` 使用非导出构造器或不可伪造的内部 token；`evaluatePlan` 对 effect、intent、hazard、cwd transition 和 compiler version 做完整性校验，无法证明完整时 reject。
- [ ] 把 Direct tool 的 `TOOL_OPERATIONS` 和 pathForTool 逻辑移入 compiler；不复制另一套 path policy。
- [ ] 将 `cd` 作为 `cwdChange + list intent` 进入计划；保留无法解析 cwd 时的 reject。
- [ ] 为 Shell 和 Direct tool 写等价计划测试，确保相同文件操作使用相同 `PathOperation`；迁移期只从一个 compiler entry 进入 evaluator。

#### Task 3: 集中 Policy Evaluator 与 hard-boundary 优先级

**Files:**
- Create: `src/access-gate/gate/evaluate-plan.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Test: `tests/access-gate/gate-policy-matrix.test.ts`

**Interfaces:**
- `evaluatePlan(plan, profile, runtime): Promise<GateDecision>`。
- `evaluatePlan` 按顺序执行 hard hazards、path decisions、effect class、approval aggregation；只在全部 intent 通过后返回 allow 或一次 ask。

- [ ] 为每个内置 Profile 覆盖 `read/list/search/write` 与 Shell class 的矩阵。
- [ ] 验证 blocked path、symlink escape、opaque 和 threat 不受 Profile allow 或 Allow once 覆盖。
- [ ] 验证多个 ask 仍聚合为一个 prompt，prompt 只展示必要证据。
- [ ] 验证无 UI 时 ask 返回 hard fail-closed 结果。

#### Task 4: 实现中央 Guidance Catalog 和安全渲染

**Files:**
- Create: `src/access-gate/gate/guidance-catalog.ts`
- Create: `src/access-gate/gate/render-decision.ts`
- Modify: `src/access-gate/gate/unknown-command.ts`
- Modify: `src/access-gate/index.ts`
- Test: `tests/access-gate/guidance.test.ts`

**Interfaces:**
- `guidanceFor(code, evidence): readonly Guidance[]`。
- `renderDecision(decision): string`。
- `formatApprovalPrompt(decision): { title, detail, options }`。

- [ ] 为 `dynamic-shell` 提供静态替代入口：Direct `read`/`grep`/`find`/`ls`；不要把原始 glob 或变量重新拼成可执行命令。
- [ ] 为 `opaque-command` 和未建模结构化语法提供 Direct tool 或拆分为字面命令的建议。
- [ ] 为 blocked path、threat、symlink escape 和 hard path deny 不提供可能诱导绕过的 guidance。
- [ ] catalog 只接受源码内置的 `GuidanceId`，不读取 Profile、项目文件或 Shell 输入提供的提示模板；Renderer 将 untrusted evidence 放在明确的数据区并做长度限制和脱敏。
- [ ] 保留现有 `block: true, reason` host 适配；reason 由 renderer 生成并包含 code 对应的简短说明与可选建议。
- [ ] 对 path、command、threat evidence 做最小化和脱敏，避免审批/拒绝文案扩大 R-11 暴露面。

#### Task 5: 迁移测试、文档和运行时验证

**Files:**
- Modify: `tests/access-gate/gate.test.ts`
- Modify: `tests/access-gate/index.test.ts`
- Modify: `README.md`
- Modify: `USAGE.md`
- Modify: `docs/security-boundaries.md`
- Modify: `docs/decisions.md`
- Modify: `CONTEXT.md`

- [ ] 增加动态 glob、变量、命令替换、opaque、blocked path、Profile deny、ask 和 user deny 的拒绝引导回归测试。
- [ ] 增加 Pi host 适配测试，验证结构化 decision 最终仍能被 host 识别为 block 或 allow。
- [ ] 更新 D-018，记录“拒绝解释不改变授权结果”和“替代入口必须重新过 Gate”。
- [ ] 更新安全边界与使用文档，明确 guidance 是建议而非授权，Direct tool 是批量检查的正式入口。
- [ ] 执行 `npm test`、`git diff --check`，并用实际 Pi Session 重载扩展验证拒绝提示。

### Acceptance Criteria

- 动态 glob 示例被拒绝时，结果包含稳定 code，并提示 Direct tool；没有 Allow once 选项。
- blocked path、threat、opaque 仍 hard deny，且没有可绕过性建议。
- Profile deny 与 ask 的语义不变；ask 仍是一次审批，批准后不产生持久授权。
- Shell 与 Direct tool 对同一目标路径产生一致的 path evidence。
- 现有 Access Gate 全部测试通过，新增决策、计划、渲染和矩阵测试通过。

### Security Review

**Status:** conditional pass；方案 C 可继续推进，但以下设计约束必须在实现前固定，不能作为实现细节留给后续决定。

- `docs/task.md:121-128` — **High — CWE-863 / 授权绕过**：如果 `AccessPlan` 的字段或 `hard` 标志可以由普通调用方构造，调用方可能省略 path intent 或伪造无 hazard 计划，直接得到 allow。修复：仅允许 Gate compiler 创建内部 plan；evaluator 对所有字段和 compiler version 做完整性校验，并对未知 effect/hazard fail closed。
- `docs/task.md:130-147` — **High — CWE-863 / 双 evaluator 漂移**：迁移期若旧 `evaluateToolCall` 与新 `evaluatePlan` 按 surface 并行，Shell 与 Direct tool 可能得出不同授权结论。修复：保留一个 tool-call entry；旧 API 只能成为 renderer 兼容层，不能绕过统一 compiler/evaluator。
- `docs/task.md:165-183` — **Medium — CWE-74 / 指令与命令注入风险**：可执行的 guidance 字符串或由原始命令拼接的 `tool/action` 会把 untrusted Shell 输入带入下一次操作。修复：guidance 仅使用静态 `GuidanceId`，不自动执行、不生成 Shell 命令；所有替代调用重新过 Gate。
- `docs/task.md:121-125,174-183` — **Medium — CWE-200 / 敏感信息暴露**：`subject`、path、command span 和 threat evidence 可能在拒绝/审批 UI 中泄露密钥路径或用户输入。修复：evidence 只保留最小结构化值，统一长度限制、脱敏和数据区渲染；hard security reason 不追加绕过建议。
- `docs/task.md:138-147,156-163` — **Medium — 完整性假设错误**：统一计划类型本身不保证 intent 完整；遗漏一个 intent 仍可能让 evaluator 合法地产生 allow。修复：compiler 输出带版本/完成标记的内部 plan，evaluator 对未知或未覆盖 effect 一律 reject，并增加 Shell/Direct 等价计划矩阵。

现有 R-02/R-08 的 pathname 与 TOCTOU 边界不因方案 C 消失，继续按 `docs/security-boundaries.md` 保留为已知限制。

### Evidence

- 当前 `GateResult` 只有 `{ kind: "allow" } | { kind: "block", reason: string }`，拒绝原因在 `gate/unknown-command.ts` 被压成字符串。
- `analyze-shell.ts` 对 dynamic、unsafe、threat 和 opaque 直接返回字符串拒绝。
- `evaluate.ts` 对 Direct tool 也独立生成字符串路径拒绝；两类入口尚无统一 AccessPlan。
- `USAGE.md` 已定义 Direct tool 是批量检查入口，但运行时拒绝结果不会自动显示该信息。

### Durable Updates

- [ ] 实施完成后将架构决策提炼到 `docs/decisions.md`，不保留实施过程作为长期文档。
- [ ] 将当前生效的 guidance 与残余泄露风险提炼到 `docs/security-boundaries.md`。
- [ ] 验证完成后删除本 Task Record，保留必要的 CONTEXT/Decision/Security boundary 内容。
