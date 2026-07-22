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
**Goal:** 让拒绝结果具备稳定原因、最小安全证据和可执行的替代入口，同时统一 Shell 与 Direct tool 的授权前置检查。

### Requirements

- hard deny、Profile deny、ask 和 user deny 使用稳定的 machine-readable decision code。
- Shell 与 Direct tool 经过各自 compiler 后进入同一个 Policy Kernel；运行时只保留一个 `tool_call` enforcement entry。
- 任何无法证明完整的语法、命令效果、路径 intent、cwd 分支或资源边界都必须 reject，不能生成可 allow 的空请求。
- guidance 只能引用源码内置的静态 `GuidanceId`，不能携带可直接执行的 Shell 字符串。
- guidance 只提供替代入口，不改变 decision、不执行替代操作、不产生持久授权。
- 所有替代 tool call 必须再次经过同一个 Gate。
- 保留现有 Profile、blocked path、symlink escape、opaque hard deny、审批聚合和 headless fail-closed 语义。

### Scope Boundary

本任务解决 Gate 的分析证据、授权决策和拒绝解释边界，不把受限 Shell 变成完整 Bash。

明确不做：

- `for`、`while`、`if`、函数定义、命令替换和未引用 glob 的完整建模。
- Gate 内的 glob expansion 或 Shell interpreter。
- OS-level sandbox、容器、VM、seccomp、Landlock、network namespace 或全局 enforcement。
- 持久化审批、自动重试、跨 tool call 的授权缓存。
- 可编程 Profile policy DSL；现有 JSON Profile 足够覆盖当前需求。

### Target Architecture

统一的是“访问证据和策略输入”，不是把所有 Shell 语义压成一套通用命令模型：

```text
Shell compiler       ┐
                     ├─> CompleteAccessRequest
Direct tool compiler ┘            │
                                  ↓
                           Policy Kernel
                                  │
                                  ↓
                            GateDecision
                                  │
                     ┌────────────┴────────────┐
                     ↓                         ↓
              approval adapter          explanation renderer
                     ↓                         ↓
                 Pi host                 block reason / guidance
```

现有 `shell-parse/` 仍负责受限 Shell IR，`command-semantics/` 仍负责 wrapper、command class、effects、path intents 和 cwd 分析。新入口只增加一个转换边界，不重复实现这些语义。

Direct `read`、`write`、`edit`、`find`、`grep`、`ls` 通过 schema compiler 生成同一种访问请求。`cd` 作为 `cwdChange + list` operation 进入 Shell request；无法确定目标或分支 cwd 时拒绝。

### Domain Model

`AccessRequest` 是分析证据，不是执行计划，也不是授权凭证：

```typescript
type CompileResult =
  | { kind: "complete"; request: CompleteAccessRequest }
  | { kind: "reject"; code: DecisionCode; evidence: readonly GateEvidence[] };

interface CompleteAccessRequest {
  readonly source: ToolSurface;
  readonly operations: readonly AccessOperation[];
  readonly cwdStates: readonly CwdState[];
  readonly assumptions: readonly Assumption[];
  readonly compilerVersion: string;
}

type AccessOperation =
  | {
      readonly kind: "path";
      readonly operation: "read" | "list" | "search" | "write";
      readonly input: string;
      readonly cwd: CwdState;
      readonly source: "argument" | "option" | "redirection" | "cwd" | "wrapper";
      readonly confidence: "exact" | "conservative";
    }
  | {
      readonly kind: "effect";
      readonly effect: "read" | "search" | "write" | "delete" | "permissionChange" | "execute" | "network" | "cwdChange";
      readonly confidence: "exact" | "conservative";
    };
```

`CompleteAccessRequest` 不包含 `allow`、`deny`、`hard`、`approved` 或 policy reason。只有 Policy Kernel 可以产生授权结果。`complete` 是内部 compiler 对“所有已建模语义均已覆盖”的封闭类型证明，不是 tool input 提供的布尔字段。

决策类型：

```typescript
type GateDecision =
  | { disposition: "allow" }
  | {
      disposition: "ask";
      evidence: readonly GateEvidence[];
      approval: ApprovalRequest;
    }
  | {
      disposition: "deny";
      code: DecisionCode;
      enforcement: "hard" | "profile";
      evidence: readonly GateEvidence[];
      guidance: readonly Guidance[];
    };
```

`GateResult.kind` 只作为 Pi host 兼容层保留。host 仍接收 `{ block: true, reason }`，但 reason 由 renderer 在最后一层生成，内部流程不再依赖自由格式字符串。

核心边界必须保持为：

```text
分析证据 ≠ 授权结果
CompleteAccessRequest ≠ allow
guidance ≠ 权限
plan digest ≠ 安全证明
```

### Security Invariants

1. **Closed world**：未知 syntax、effect、intent、hazard、tool surface、cwd branch 或 compiler version 一律 reject。
2. **Hard boundary first**：threat、dynamic/unsafe syntax、opaque semantics、blocked path、symlink escape 和不可分类路径不能被 Profile 或 `Allow once` 覆盖。
3. **Complete coverage**：所有 command node、redirection、effect、path intent 和 cwd candidate 都必须进入 request；遗漏不能产生 allow。
4. **Monotonic policy**：增加 operation、扩大 cwd 候选或降低 confidence，只能保持原决策或使其更严格，不能让 deny 变 allow。
5. **Effect closure**：每个 Effect 必须映射到明确 Profile 决策；没有策略轴的 effect hard deny，不能回退到 `readOnly`。
6. **Approval scope**：一次审批绑定整个不可变 request；提示展示全部必要 evidence，不能只展示第一个 approval reason。
7. **Guidance separation**：GuidanceId 是静态枚举；renderer 不做策略判断，不生成可执行 Shell，不自动调用替代 tool。
8. **No false security claim**：request、digest 和 Gate 都是用户态 preflight，不消除 pathname TOCTOU，也不覆盖其他 Extension 入口。
9. **Bounded analysis**：lexer、parser、compiler、path resolver、evidence 和 renderer 各自有输入长度、节点数、intent 数、分支数和输出长度上限；超限 hard reject。
10. **Snapshot semantics**：Profile 和 request 在一次 tool call 内冻结；不跨调用缓存 Profile 决策、realpath 或 symlink 结果。

### Guidance Policy

Guidance 由 `DecisionCode` 映射到静态 catalog：

| DecisionCode | Guidance | 是否允许 Allow once |
|---|---|---|
| `dynamic-shell` | `batch-inspection-tools`：使用 Direct `read`/`grep`/`find`/`ls` | 否 |
| `opaque-command` | `literal-command-or-direct-tool` | 否 |
| `unsafe-syntax` | `split-supported-commands` | 否 |
| `path-denied` | 无，避免诱导绕过路径策略 | 否 |
| `blocked-path` | 无 | 否 |
| `threat` | 无 | 否 |
| `shell-policy-denied` | 可显示当前 Profile 限制，不建议自动切换 Profile | 否 |
| `approval-required` | 显示最小必要 evidence | 是 |
| `user-denied` | 无自动重试 | 否 |

Guidance 不包含原始 glob、Shell 变量、命令替换内容、未经脱敏的敏感路径或由用户输入决定的 tool/action 名称。所有 evidence 经过长度限制、脱敏和明确的数据区渲染。

### Policy Evaluation Order

```text
1. validate CompleteAccessRequest schema and compiler version
2. validate resource budget and coverage markers
3. recompute hard hazards and resolve every cwd candidate
4. check blocked paths, symlink escapes and path classification
5. evaluate every AccessOperation against Profile
6. aggregate all ask evidence for this request
7. return allow, one ask, or structured deny
8. render only at the Pi host boundary
```

任何阶段失败都停止后续 allow 计算。不同操作的 decision 组合规则为：

```text
hard deny > profile deny > ask > allow
```

### Implementation Plan

#### Task 1: 建立决策领域类型

**Files:**
- Create: `src/access-gate/gate/decision-types.ts`
- Modify: `src/access-gate/gate/types.ts`
- Test: `tests/access-gate/gate-decision.test.ts`

**Steps:**

- [ ] 先写测试：验证 `DecisionCode`、`GateEvidence`、`GateDecision` 的 discriminated union；验证 hard deny 不能进入 ask，guidance 不能携带授权字段。
- [ ] 运行 `npx tsx tests/access-gate/gate-decision.test.ts`，确认新类型和构造器测试先失败。
- [ ] 实现 `CompleteAccessRequest`、`AccessOperation`、`DecisionCode`、`GateEvidence`、`Guidance` 和 `GateDecision`；禁止导出可伪造的 policy result 构造器。
- [ ] 再运行同一测试，确认通过。
- [ ] 在 `gate/types.ts` 保留 `GateResult` 兼容类型和结构化 decision 到 host result 的适配签名。

#### Task 2: 统一 Shell 与 Direct tool compiler

**Files:**
- Create: `src/access-gate/gate/access-request.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Test: `tests/access-gate/access-request.test.ts`

**Steps:**

- [ ] 先写 compiler 测试：`grep -rn`、`cd && grep`、重定向、Direct `find` 和 Direct `read` 产生一致的 path operation；dynamic、opaque、未知 effect 和不确定 cwd 产生 reject。
- [ ] 运行 `npx tsx tests/access-gate/access-request.test.ts`，确认当前两套入口不能满足统一 request 契约。
- [ ] 实现 `compileShellCall()`：复用现有 lexer、parser、normalize、control-flow 和 command adapter，不在 compiler 内重复解析。
- [ ] 实现 `compileDirectToolCall()`：集中校验 surface 和参数 schema，生成 path/effect operation。
- [ ] 将 `joined` cwd 转为候选集合；所有候选不能安全检查时返回 reject，不允许只取一个 cwd。
- [ ] 运行 compiler 测试和现有 Shell/command-semantics 测试，确认行为保持 fail closed。

#### Task 3: 实现唯一 Policy Kernel

**Files:**
- Create: `src/access-gate/gate/evaluate-request.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Test: `tests/access-gate/gate-policy-matrix.test.ts`

**Steps:**

- [ ] 先写 Profile 矩阵测试：四类 PathOperation、Shell class、每个 Effect、blocked path、symlink escape、opaque 和 headless ask。
- [ ] 运行 `npx tsx tests/access-gate/gate-policy-matrix.test.ts`，确认旧 evaluator 的分散路径不能覆盖完整矩阵。
- [ ] 实现 `evaluateRequest(request, profile, runtime): Promise<GateDecision>`；入口只接受 `CompleteAccessRequest`。
- [ ] 重新解析每个 path operation，检查 blocked path、classifiable、symlink escape、Profile rule/default，并拒绝未知 effect。
- [ ] 聚合全部 ask evidence 为一个审批请求；用户批准只返回当前 request 的 allow，不保存授权。
- [ ] 让 `evaluateToolCall()` 成为唯一 compiler → kernel → host adapter 入口，删除旧 evaluator 的并行 surface 分支。
- [ ] 运行 `npm run test:gate`、`npm run test:path` 和矩阵测试。

#### Task 4: 实现拒绝解释和静态 guidance

**Files:**
- Create: `src/access-gate/gate/guidance-catalog.ts`
- Create: `src/access-gate/gate/render-decision.ts`
- Modify: `src/access-gate/gate/unknown-command.ts`
- Modify: `src/access-gate/index.ts`
- Test: `tests/access-gate/guidance.test.ts`

**Steps:**

- [ ] 先写测试：dynamic glob 显示 Direct tool guidance；blocked path/threat 不显示绕过建议；ask 显示完整必要 evidence；raw input 不进入可执行建议。
- [ ] 运行 `npx tsx tests/access-gate/guidance.test.ts`，确认当前 block reason 没有结构化 guidance。
- [ ] 实现静态 `GuidanceId` catalog；catalog 不读取 Profile、项目文件或 Shell 输入中的模板。
- [ ] 实现 evidence redact、长度限制和 `renderDecision()`；renderer 只转换展示，不改变 decision。
- [ ] 保持 Pi host 的 `{ block: true, reason }` 适配，并将 guidance 附加到 reason 的安全说明区。
- [ ] 运行 guidance、gate 和 index 测试，确认 headless 与 hard deny 行为不变。

#### Task 5: 加入单调性、资源预算和迁移回归

**Files:**
- Modify: `src/access-gate/shell-parse/lexer.ts`
- Modify: `src/access-gate/shell-parse/parser.ts`
- Modify: `src/access-gate/command-semantics/control-flow.ts`
- Modify: `src/access-gate/path/resolve.ts`
- Test: `tests/access-gate/access-request-invariants.test.ts`
- Test: `tests/access-gate/security-matrix.test.ts`

**Steps:**

- [ ] 先写单调性测试：增加 path intent、cwd candidate 或 effect 后，结果只能不变或更严格。
- [ ] 增加超长输入、超多 command、超多 intent、深层分支和超长 evidence 测试；超限必须 hard reject。
- [ ] 增加 `&&`/`||`/pipeline/cd 的所有 cwd 候选测试，覆盖当前 `joined` 欠近似风险。
- [ ] 增加 Shell 与 Direct tool 的等价 operation 矩阵，防止新旧入口策略漂移。
- [ ] 运行 `npm test`、`git diff --check`，并在实际 Pi Session 重载扩展后验证拒绝提示。

### Acceptance Criteria

- `ls skills/foundations/*/SKILL.md` 被拒绝时返回稳定 code，并提示 Direct tool；没有 Allow once。
- `grep -rn`、`cd && grep` 等已支持的字面命令不再因为 `cd` 或组合短选项产生多余审批。
- blocked path、threat、opaque、unknown effect、unknown syntax 和不确定 cwd 仍 hard deny。
- Shell 与 Direct tool 对同一目标产生一致的 operation 和 path evidence。
- 一个 compound tool call 的所有 ask evidence 聚合为一次审批，批准不跨调用保存。
- 任何不完整 request、未知字段、未知 effect 或资源超限都不能返回 allow。
- guidance 不生成可执行 Shell，不泄露未脱敏敏感 evidence，不改变授权结果。
- `npm test`、TypeScript 检查、Access Gate 安全矩阵和 Pi host 适配测试全部通过。

### Security Review

**Status:** conditional pass。设计可以实施，但以下风险必须在实现中作为不变量处理：

| 风险 | 严重性 | 处理 |
|---|---|---|
| 不完整 request 被误当成完整 request | High / CWE-863 | 只允许 `CompleteAccessRequest` 进入 Kernel；unknown/uncertain 一律 reject。 |
| 旧 evaluator 与新 Kernel 并行 | High / CWE-863 | 只保留一个 `tool_call` entry；旧 API 只做 host adapter。 |
| `joined` cwd 只检查一个候选 | High / CWE-863 | 保存所有候选 cwd；无法全部检查时 hard deny。 |
| Effect 没有策略映射 | High / CWE-863 | effect-to-policy 使用封闭 registry；未知 effect hard deny。 |
| guidance 拼接为可执行命令 | Medium / CWE-74 | 只使用静态 GuidanceId；不自动重试，替代调用重新过 Gate。 |
| evidence 泄露敏感路径或输入 | Medium / CWE-200 | 最小化、脱敏、限长、数据区渲染；hard security deny 不提供绕过提示。 |
| compound approval 覆盖范围不透明 | Medium / CWE-863 | 展示完整必要 evidence；approval 只绑定当前不可变 request。 |
| 超长输入和分支导致资源耗尽 | Medium / CWE-400 | 各解析、路径和渲染阶段设置预算，超限 hard reject。 |
| 用户态 pathname TOCTOU | Known boundary | 不宣称被消除，继续记录在 `docs/security-boundaries.md`。 |
| 非 `tool_call` 入口绕过 | Known boundary | 不扩大 enforcement 承诺，继续记录 R-09。 |

### Evidence

- 当前 `GateResult` 只有 `{ kind: "allow" } | { kind: "block", reason: string }`，拒绝原因在 `gate/unknown-command.ts` 被压成字符串。
- `analyze-shell.ts` 同时承担解析后的语义、路径、Profile 和审批流程；Direct tool 在 `evaluate.ts` 中有独立路径分支。
- 当前 `CommandSemantics` 已提供 Shell 语义 IR，但 Direct tool 尚未进入相同的 request/kernel seam。
- 当前 `control-flow.ts` 可以产生 `joined` cwd，而 Gate 需要在重构中将其转为候选集合或 hard reject。
- `USAGE.md` 已定义 Direct tool 是批量检查入口，但运行时拒绝结果不会自动显示该信息。

### Durable Updates

- [ ] 实施完成后将当前架构和“拒绝解释不改变授权”提炼到 `docs/decisions.md`。
- [ ] 将 guidance、evidence 脱敏和残余 TOCTOU 风险提炼到 `docs/security-boundaries.md`。
- [ ] 将 AccessRequest、Policy Kernel 和 Direct tool 入口术语同步到 `CONTEXT.md`。
- [ ] 验证完成后删除本 Task Record，保留必要的长期决策和安全边界内容。
