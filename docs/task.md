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
- [x] compiler reject 在 runtime tool_call 入口先于旧 evaluator 执行；未知 tool、未知字段、dynamic/opaque command 和资源超限不能被 `unclassified=allow` 放行。
- [ ] 结构化 Shell 语法（如 `for`、`while`、`if`、函数定义）尚无完整安全语义；当前仅依靠 dynamic token 检查和 Profile 的 `unclassified` 决策。
- [ ] 复杂命令参数（如 `find -exec`、`xargs`、`parallel`）仍按未完成风险处理，不在本次 adapter 扩展中放宽。

## Durable Updates

- [x] 安全边界变化同步到 `docs/security-boundaries.md`（R-13 request 真实性、R-14 Guidance 注入）。
- [x] 架构或策略决策同步到 `docs/decisions.md`（D-022 Compiler-Kernel 分层、D-023 静态 Guidance）。
- [x] 当前术语、架构或 Negative Space 变化同步到 `CONTEXT.md`（Compiler、Policy Kernel、GateDecision、Guidance 术语）。
- [ ] 验证完成后删除已关闭的风险和本 Task Record。

---

## T-002: Access Gate 决策解释与替代入口重构

**Kind:** refactor
**Status:** in-progress
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
  readonly projectRoot: string;
  readonly stagingDir: string;
  readonly operations: readonly AccessOperation[];
  readonly cwdCandidates: readonly CwdCandidate[];
  readonly coverage: RequestCoverage;
  readonly resourceUsage: ResourceUsage;
  readonly compilerVersion: string;
}

type AccessOperation =
  | {
      readonly kind: "command";
      readonly origin: "shell" | "direct";
      readonly commandClass: CommandClass;
      readonly executable: string | null;
      readonly effects: readonly Effect[];
    }
  | {
      readonly kind: "path";
      readonly operation: "read" | "list" | "search" | "write";
      readonly input: string;
      readonly cwdCandidates: readonly CwdCandidate[];
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

`command.effects` 是 command operation 的声明摘要，独立的 effect operations 是 Kernel 消费的 canonical effect 序列；validator 必须验证两者逐项一致。Effect policy axis 是封闭映射：`read/search/write/delete/permissionChange/cwdChange → path`，`execute/network → shell`。Direct tool 不能产生 Shell-only effect。Direct tool 也必须生成 command、effect 和 path 三类证据，不能只生成 path operation。

request 只能由 compiler 的构造器创建；构造器必须 defensive-copy 并 deep-freeze request。Kernel 通过 `isCompleteAccessRequest()` 做 runtime schema、brand、compiler version、coverage、effect closure 和 resource budget 校验。

决策类型：

```typescript
type GateDecision =
  | { disposition: "allow" }
  | {
      disposition: "ask";
      code: "approval-required";
      evidence: readonly GateEvidence[];
      approval: ApprovalRequest;
    }
  | {
      disposition: "deny";
      code: HardDenyCode;
      enforcement: "hard";
      evidence: readonly GateEvidence[];
      guidance: readonly Guidance[];
    }
  | {
      disposition: "deny";
      code: ProfileDenyCode;
      enforcement: "profile";
      evidence: readonly GateEvidence[];
      guidance: readonly Guidance[];
    }
  | {
      disposition: "deny";
      code: "user-denied";
      enforcement: "user";
      evidence: readonly GateEvidence[];
      guidance: readonly Guidance[];
    };
```

`GateResult.kind` 只作为 Pi host 兼容层保留。host 仍接收 `{ block: true, reason }`，block 同时必须携带稳定 code；reason 由 renderer 在最后一层生成，内部流程不再依赖自由格式字符串。

核心边界必须保持为：

```text
分析证据 ≠ 授权结果
CompleteAccessRequest ≠ allow
guidance ≠ 权限
plan digest ≠ 安全证明
```

### Security Invariants

1. **Closed world**：未知 syntax、effect、intent、hazard、tool surface、cwd branch 或 compiler version 一律 reject。
2. **Compiler-owned hard boundary**：threat、dynamic/unsafe syntax、opaque semantics、hard command rule 和不支持的 redirection 在 compiler 阶段 reject；complete request 不携带原始 Shell，因此 Kernel 不重新解析缺失的 raw input，只验证 compiler-created request 的 brand、schema 和 coverage。blocked path、symlink escape 和不可分类路径由 Kernel 对每个 operation 重新检查，不能被 Profile 或 `Allow once` 覆盖。
3. **Complete coverage**：所有 command node、redirection、effect、path intent 和 cwd candidate 都必须进入 request；遗漏不能产生 allow。
4. **Monotonic policy**：增加 operation、扩大 cwd 候选或降低 confidence，只能保持原决策或使其更严格，不能让 deny 变 allow。
5. **Effect closure**：每个 Effect 必须映射到明确 Profile 决策；没有策略轴的 effect hard deny，不能回退到 `readOnly`。
6. **Approval scope**：一次审批绑定整个不可变 request；提示展示全部必要 evidence，不能只展示第一个 approval reason。
7. **Guidance separation**：GuidanceId 是静态枚举；renderer 不做策略判断，不生成可执行 Shell，不自动调用替代 tool。
8. **No false security claim**：request、digest 和 Gate 都是用户态 preflight，不消除 pathname TOCTOU，也不覆盖其他 Extension 入口。
9. **Bounded analysis**：lexer、parser、compiler、path resolver、evidence 和 renderer 各自有输入长度、节点数、intent 数、分支数、evidence subject 和输出长度上限；超限 hard reject。
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
| `symlink-escape` | 无 | 否 |
| `path-unclassifiable` | 无 | 否 |
| `threat` | 无 | 否 |
| `shell-policy-denied` | 可显示当前 Profile 限制，不建议自动切换 Profile | 否 |
| `approval-required` | 显示最小必要 evidence | 是 |
| `user-denied` | 无自动重试 | 否 |
| `unknown-tool` | 无 | 否 |
| `invalid-tool-input` | 无 | 否 |
| `unsupported-redirection` | 无 | 否 |
| `uncertain-cwd` | 无 | 否 |
| `unknown-effect` | 无 | 否 |
| `dangerous-command` | 无 | 否 |
| `hard-command-rule` | 无 | 否 |
| `resource-limit` | 无 | 否 |

Guidance 不包含原始 glob、Shell 变量、命令替换内容、未经脱敏的敏感路径或由用户输入决定的 tool/action 名称。所有 evidence 经过长度限制、脱敏和明确的数据区渲染。

### Policy Evaluation Order

```text
1. validate CompleteAccessRequest schema and compiler version
2. validate resource budget and coverage markers
3. validate compiler-owned hard-boundary evidence and resolve every cwd candidate; do not reparse raw Shell here
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
- Modify: `src/access-gate/gate/unknown-command.ts`
- Test: `tests/access-gate/gate-decision.test.ts`

**Steps:**

- [x] 先写测试：验证 `DecisionCode`、`GateEvidence`、`GateDecision` 的 discriminated union；验证 hard deny 不能进入 ask，guidance 不能携带授权字段。
- [ ] (TDD red-phase 过程证据未保留; 实现已通过 compile-time `@ts-expect-error` 验证非法 union 组合被拒绝)
- [x] 实现 `CompleteAccessRequest`、`AccessOperation`、`DecisionCode`、`GateEvidence`、`Guidance` 和 `GateDecision`；禁止导出可伪造的 policy result 构造器。
- [x] 再运行同一测试，确认通过。
- [x] 在 `gate/types.ts` 保留 `GateResult` 兼容类型和稳定 code 字段；`renderDecision()` 已由 Task 4 完成完整 decision → host result 适配。

#### Task 2: 统一 Shell 与 Direct tool compiler

**Files:**
- Create: `src/access-gate/gate/access-request.ts`
- Create: `tests/access-gate/task2-contract.test.ts`
- Create: `src/access-gate/gate/shell-compiler.ts`
- Create: `src/access-gate/gate/direct-tool-compiler.ts`
- Create: `src/access-gate/gate/hard-rules.ts`
- Create: `src/access-gate/gate/decision-code.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Modify: `src/access-gate/gate/types.ts`
- Modify: `src/access-gate/gate/unknown-command.ts`
- Modify: `src/access-gate/gate/index.ts`
- Modify: `src/access-gate/command-semantics/control-flow.ts`
- Modify: `src/access-gate/command-semantics/types.ts`
- Modify: `src/access-gate/command-semantics/adapters/shared.ts`
- Modify: `src/access-gate/command-semantics/adapters/filesystem.ts`
- Modify: `src/access-gate/command-semantics/adapters/git.ts`
- Modify: `src/access-gate/command-semantics/adapters/build.ts`
- Modify: `src/access-gate/command-semantics/adapters/package.ts`
- Modify: `src/access-gate/shell-parse/parser.ts`
- Modify: `package.json`
- Test: `tests/access-gate/access-request.test.ts`
- Test: `tests/access-gate/shell-parse.test.ts`

**Steps:**

- [x] 先写 compiler 测试：`grep -rn`、`cd && grep`、重定向、Direct `find` 和 Direct `read` 产生一致的 path operation；dynamic、opaque、未知 effect 和不确定 cwd 产生 reject。
- [x] 运行 `npx tsx tests/access-gate/access-request.test.ts`，确认当前两套入口不能满足统一 request 契约。
- [x] 实现 `compileShellCall()`：复用现有 lexer、parser、normalize、control-flow 和 command adapter，不在 compiler 内重复解析。
- [x] 实现 `compileDirectToolCall()`：集中校验 surface 和参数 schema，生成 command/effect/path operation；非对象 args、空 required path 和不可序列化参数结构化 reject。
- [x] 将 cwd 状态关联到每个 path operation；保留可安全证明的候选集合，无法解析的分支返回 reject，不允许只取一个 cwd。
- [x] 将 fd duplicate、fd close、heredoc 和 here-string 作为 unsupported redirection reject，避免误映射为文件路径。
- [x] 集中 hard command rule，确保旧 Shell 入口和新 compiler 使用同一规则。
- [x] 为 request 增加 coverage、resource usage 和集中 analysis limits；超限 hard reject。
- [x] request 构造器执行 defensive-copy、deep-freeze、WeakSet issuance 和 effect summary/canonical effect 一致性校验；导出 `isCompleteAccessRequest()` 供 Kernel 做 runtime 验证。
- [x] validator 校验 command/redirection/effect span 与 operation 的逐项对应，并校验顶层 cwd candidates 是 path candidates 的去重序列。
- [x] 为 filesystem、git、build 和 package semantics 保留显式 Effect；`delete`、`permissionChange` 和 `network` 不再退化为普通 `write`。
- [x] 在 runtime `tool_call` 入口先执行 compiler；compiler reject 不再被旧 evaluator 放行，并携带稳定 code。
- [x] 迁移期旧 evaluator 的 hard/profile deny 也携带稳定 code；blocked path、symlink escape、path-unclassifiable、path-denied 和 shell-policy-denied 不再只返回自由格式 reason。
- [x] 运行 compiler 测试和现有 Shell/command-semantics 测试，确认行为保持 fail closed。

#### Task 3: 实现唯一 Policy Kernel

**Files:**
- Create: `src/access-gate/gate/evaluate-request.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Test: `tests/access-gate/gate-policy-matrix.test.ts`

**Steps:**

- [x] 先写 Profile 矩阵测试：Direct read、blocked path、多个 path ask、伪造 request 和 headless adapter。
- [x] 运行 `npx tsx tests/access-gate/gate-policy-matrix.test.ts`，确认旧 evaluator 的分散路径不能覆盖完整矩阵。
- [x] 实现 `evaluateRequest(request, profile, runtime): Promise<GateDecision>`；入口第一步调用 `isCompleteAccessRequest()`，只接受 compiler-issued `CompleteAccessRequest`。
- [x] 对 command/path operation 建立封闭 policy 处理；区分 Shell command policy 与 Direct tool path/effect policy，检查 blocked path、classifiable、symlink escape、Profile rule/default，并由 request validator 拒绝未知 effect。
- [x] 不从 request 重新解析 raw Shell；hard hazard 必须已在 compiler 阶段 reject，Kernel 只验证 compiler brand、coverage 和 operation 级 hard boundary。
- [x] 聚合全部 ask evidence 为一个审批请求；用户批准只返回当前 request 的 allow，不保存授权。
- [x] 让 `evaluateToolCall()` 成为唯一 compiler → kernel → host adapter 入口；Direct command operation 不复用 Shell policy，旧 `pathForTool()`、`TOOL_OPERATIONS` 和 `analyzeShellCommand()` 不再承担 runtime 授权。
- [x] 移除 `analyzeShellCommand` 的 gate production export，保留 host adapter 迁移前的源码供后续清理。
- [x] 运行 `npm run test:gate`、`npm run test:path` 和矩阵测试。

#### Task 4: 实现拒绝解释和静态 guidance

**Files:**
- Create: `src/access-gate/gate/guidance-catalog.ts`
- Create: `src/access-gate/gate/render-decision.ts`
- Modify: `src/access-gate/gate/unknown-command.ts`
- Modify: `src/access-gate/index.ts`
- Test: `tests/access-gate/guidance.test.ts`

**Steps:**

- [x] 先写测试：dynamic glob 显示 Direct tool guidance；blocked path/threat 不显示绕过建议；ask 显示完整必要 evidence；raw input 不进入可执行建议。
- [x] 运行 `npx tsx tests/access-gate/guidance.test.ts`，确认当前 block reason 没有结构化 guidance。
- [x] 实现静态 `GuidanceId` catalog；catalog 不读取 Profile、项目文件或 Shell 输入中的模板。
- [x] 实现 evidence redact（sensitive prefixes 脱敏）、长度限制（reason ≤ 2048、subject ≤ 1024、items ≤ 32）和 `renderDecision()`；renderer 只转换展示，不改变 decision。
- [x] 保持 Pi host 的 `{ block: true, reason }` 适配，guidance id + text 附加到 reason 的安全说明区；blocked path/threat 不提供绕过建议。
- [x] 运行 guidance、gate 和 index 测试，确认 headless 与 hard deny 行为不变。

#### Task 5: 加入单调性、资源预算和迁移回归

**Files:**
- Modify: `src/access-gate/shell-parse/lexer.ts`
- Modify: `src/access-gate/shell-parse/parser.ts`
- Modify: `src/access-gate/command-semantics/control-flow.ts`
- Modify: `src/access-gate/path/resolve.ts`
- Test: `tests/access-gate/access-request-invariants.test.ts`
- Test: `tests/access-gate/security-matrix.test.ts`

**Steps:**

- [x] 先写单调性测试：增加 path intent 后结果不变或更严格；单 deny + 单 allow 组合必须 deny。
- [x] lexer 增加 token 数量预算和字符长度上限；parser 已由 compiler 的 `ANALYSIS_LIMITS.maxCommands` 约束，renderer 已限制 reason ≤ 2048、evidence items ≤ 32、subject ≤ 1024。
- [x] 增加 `&&`/`||`/pipeline/cd 的所有 cwd 候选测试（cd && cmd 进入 target dir，cd || cmd 保留原始 cwd，pipeline 不传播 cd）。
- [x] 增加 Shell 与 Direct tool 的等价 operation 矩阵测试（grep、read、write 路径一致性）。
- [x] 已删除旧 `analyze-shell.ts`，移除未使用的 `pathForTool()`/`TOOL_OPERATIONS` 和旧授权分支。验证 `npm test`、`git diff --check` 通过。

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
| 不完整或伪造 request 被误当成完整 request | High / CWE-863 | 只允许 compiler-issued `CompleteAccessRequest` 进入 Kernel；使用模块私有 WeakSet、deep-freeze、exact coverage correspondence；unknown/uncertain 一律 reject。 |
| 旧 evaluator 与新 Kernel 并行 | High / CWE-863 | 只保留一个 `tool_call` entry；旧 API 只做 host adapter。 |
| `joined` cwd 只检查一个候选 | High / CWE-863 | 保存所有候选 cwd；无法全部检查时 hard deny。 |
| Effect 没有策略映射 | High / CWE-863 | effect-to-policy 使用封闭 registry；未知 effect hard deny。 |
| coverage 与 operation 只计数不对应 | High / CWE-863 | command/redirection/effect/cwd span 和候选集合必须逐项一致，不能只检查数量。 |
| guidance 拼接为可执行命令 | Medium / CWE-74 | 只使用静态 GuidanceId；不自动重试，替代调用重新过 Gate。 |
| evidence 泄露敏感路径或输入 | Medium / CWE-200 | 最小化、脱敏、限长、数据区渲染；hard security deny 不提供绕过提示。 |
| compound approval 覆盖范围不透明 | Medium / CWE-863 | 展示完整必要 evidence；approval 只绑定当前不可变 request。 |
| 超长输入和分支导致资源耗尽 | Medium / CWE-400 | 各解析、路径和渲染阶段设置预算，超限 hard reject。 |
| 用户态 pathname TOCTOU | Known boundary | 不宣称被消除，继续记录在 `docs/security-boundaries.md`。 |
| 非 `tool_call` 入口绕过 | Known boundary | 不扩大 enforcement 承诺，继续记录 R-09。 |

### Evidence

- 当前 `GateResult` 仍是 Pi host 兼容类型；每个 block 已强制携带 machine-readable code，`renderDecision()` 已接管 guidance 和 evidence redaction。
- 旧 `analyze-shell.ts` 已删除；runtime 只经过 compiler → Policy Kernel → host adapter。
- 当前 `CommandSemantics` 和 Direct tool 已进入相同的 request/Policy Kernel seam；Direct command origin 不复用 Shell policy。
- 当前 `control-flow.ts` 将可证明的 cwd 状态关联到 path operation 的 candidate 集合；无法解析的分支仍 hard reject。
- `USAGE.md` 已定义 Direct tool 是批量检查入口；host adapter 已通过 `renderDecision()` 展示结构化 code 和 guidance。

**Task 2 Implementation Evidence:**

- `gate/shell-compiler.ts` 和 `gate/direct-tool-compiler.ts` 通过 `gate/index.ts` 暴露统一 compiler seam；两者只生成 request 或 structured reject，不接 Profile 或审批。
- 每个 path operation 携带 cwd candidate；`cd &&`、`cd ||` 和 pipeline 的 cwd 传播由 `command-semantics/control-flow.ts` 保留为可检查状态。
- Direct tool schema 拒绝未知 surface、未知字段、错误字段类型和缺失必填参数；Shell compiler 拒绝 dynamic、opaque、hard command rule 和 unsupported redirection。
- `2>&1` 先由 parser 识别为 `fdDuplicate`，heredoc/here-string 不再被误当成普通文件路径。
- `npm test` 通过；当前 compiler/access-request 测试 15 项、Task 2 contract 测试 7 项、decision type 测试 3 项、Policy Kernel 矩阵测试 4 项、guidance/renderer 测试 7 项、invariants 测试 8 项、Shell parser 测试 57 项、原有 Gate 测试 23 项均通过，TypeScript 检查和 `git diff --check` 通过。
- runtime `evaluateToolCall()` 现已执行 compiler → Policy Kernel → host adapter；未知 tool 在 `unclassified=allow` 下仍返回带 `unknown-tool` code 的 block，Direct tool 不再复用 Shell policy。
- request 携带 command/path/effect/cwd coverage 和 resource usage；Shell 输入、Direct tool 参数、operation 数量、cwd candidate 数量和 evidence subject 长度受集中 limits 约束。
- host adapter 已通过 `renderDecision()` 接入静态 guidance catalog；编译器拒绝也经过同一 renderer，所有拒绝路径都携带 guidance id + text。
- Shell 与 Direct tool 的等价 operation 已由 invariants 测试验证；`&&`/`||`/pipeline/cd 的 cwd 候选语义已由 invariants 测试覆盖。
- `docs/decisions.md` 新增 D-022、D-023；`docs/security-boundaries.md` 新增 R-13、R-14 并更新 R-11；`CONTEXT.md` 术语和架构已同步。

### Durable Updates

- [x] 实施完成后将当前架构和"拒绝解释不改变授权"提炼到 `docs/decisions.md`（D-022、D-023）。
- [x] 将 guidance、evidence 脱敏和残余 TOCTOU 风险提炼到 `docs/security-boundaries.md`（R-13、R-14，更新 R-11）。
- [x] 将 AccessRequest、Policy Kernel、GateDecision、Guidance 和 Direct tool 入口术语同步到 `CONTEXT.md`。
- [ ] 验证完成后删除本 Task Record，保留必要的长期决策和安全边界内容。
