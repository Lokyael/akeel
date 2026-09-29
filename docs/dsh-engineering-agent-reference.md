# DSH 工程编码 Agent 参考架构

## 目标定位

本工具是一个面向软件工程的 Agent Runtime，重点是：

- 多阶段工程任务；
- 可恢复的工程 Session；
- Agent、Subagent 和 Workflow 编排；
- 统一工具执行管线；
- 可替换的模型、Shell、Filesystem 和 Sandbox provider；
- 工程任务的调查、实施、验证、审查和交接。

它不是一个只提供聊天和单次命令执行的助手，而是一个能够承载工程工作生命周期的运行时。

## 总体架构

```text
Cordis Context
    ↓
Service / Provider / Consumer
    ↓
Profile / Bundle / Patch
    ↓
Plugin Tree
    ↓
Agent / Session / Tools / LLM / Workflow
    ↓
工程工作流
```

运行时由可组合的 Service、typed Event 和 Scope 构成。插件通过 Context 获取能力，不直接绑定具体 provider。

## Cordis 运行模型

### Context

Context 是服务注册表和事件总线。

典型服务：

```text
ctx.agents
ctx.sessions
ctx.tools
ctx.llm
ctx.systemPrompt
ctx.subprocess
ctx.sandbox
ctx.workflowEngine
ctx.skills
ctx.sessionProjection
ctx.storage
```

### Service

Service 负责：

- 声明稳定的服务名；
- 声明依赖；
- 在依赖满足后激活；
- 注册 API；
- 注册事件；
- 在卸载时撤销资源。

能力应拆分为：

```text
Service Definition
    ↓
Service Provider
    ↓
Consumer
```

例如：

```text
Workflow Definition
    ↓
PTC Workflow Provider
    ↓
Workflow Tool
```

```text
LLM Definition
    ↓
Official model / third-party model / replay Provider
    ↓
Agent Loop
```

```text
Subprocess Definition
    ↓
Local / SSH Provider
    ↓
Shell / Terminal / LSP
```

### Event

事件按用途分为：

- Durable Session Event：进入持久化日志；
- Live Agent Event：描述运行中的控制和状态；
- Capability Event：在能力接缝上增加策略和适配器。

事件必须声明调度方式：

```text
emit
parallel
serial
waterfall
bail
```

安全和业务决策不应依赖不明确的监听顺序。需要单调收紧时，应使用显式 guard 或固定的 pipeline stage。

### Scope

Scope 用于隔离 Agent 的注册：

- Agent-specific tools；
- Prompt sections；
- Variables；
- Event listeners；
- Capability restrictions；
- Delegation providers。

Agent 的 scoped registrations 在 Agent dispose 时自动撤销。

## Profile、Bundle 和 Patch

工程 Agent 使用专用 Profile，不直接使用包含大量产品能力的通用 Bundle。

Profile 负责：

- 选择 Bundle；
- 保存 Profile patch；
- 选择启用的 provider；
- 提供工程环境配置；
- 绑定持久化目录。

Bundle 是可分发的配置层。Patch 通过稳定 id 覆盖或插入配置行。

推荐组合顺序：

```text
工程基础 Bundle
    ↓
工具 / 模型 / 工作流 Bundle
    ↓
Profile patch
    ↓
用户或项目 overlay
```

配置覆盖必须明确说明完整替换规则。需要保留的字段应在 overlay 中完整重述，避免隐式深度合并造成误配置。

## 最小工程运行时

工程 Profile 至少包含：

```text
LLM adapter
Session
Session persistence
System prompt
Tools
Agent
Agent loop
LLM retry
Subprocess
Sandbox
Sandbox policy
Filesystem
Shell
Compaction
Token meter
Session projection
Skill registry
Skill filesystem provider
Skill tool
Commands
Invariants
Subagent provider
Workflow engine
Workflow tool
```

可按实际需求增加：

```text
MCP
Web search / fetch
Goal
Todo
Plan collaboration
Terminal
LSP
Storage
Session query
```

默认不加载与工程执行无关的产品层能力。每个额外 provider 都必须说明其：

- service；
- consumer；
- model-visible schema；
- Session event；
- filesystem/process effect；
- lifecycle；
- failure behavior。

## Agent 与 Agent Loop

### Agent Service

`ctx.agents` 负责：

- 创建 Agent；
- 恢复 Agent；
- 维护 live registry；
- 管理 parent/child relation；
- 提供 Agent Handle；
- 发送 `agent/*` 事件；
- 管理 Agent Scope；
- 处理 Agent disposal。

Agent Handle 是销毁权限的持有者。普通消费者只能操作 Agent API，不能随意销毁其他 Agent。

### Agent Loop

标准 Loop 的生命周期：

```text
turn/start
    ↓
claim inbox input
    ↓
assemble prompt and tools
    ↓
agent/pre-step
    ↓
agent/request
    ↓
prepareCall
    ↓
commit system/user messages
    ↓
commit request header/context
    ↓
derive request from Session
    ↓
llm/stream
    ↓
assistant message / attempt
    ↓
tool calls
    ↓
tool results
    ↓
step/end
    ↓
next-step or turn/end
```

一个 Turn 可以包含多个 Step。Steering、injected context、tool result 和 continuation 都必须通过明确的 admission boundary 进入后续 Step。

取消、重试和失败恢复必须区分：

- 尚未提交的输入；
- 已提交但未发送的请求；
- 已发送但未完成的模型请求；
- 已记录但没有结果的工具调用；
- 已知结果和未知结果。

## Session Event Log

Session 是 append-only typed event log，不是普通消息数组。

核心事件类型包括：

```text
turn/start
step/start
request/header
request/context
system/message
user/message
assistant/message
assistant/attempt
tool/call
tool/result
step/end
turn/end
```

原则：

> 任何进入模型请求的事实，都必须能够从 Session Log 重建。

### Surface Projection

模型看到的是事件日志的 projection：

```text
raw event log
    ↓
Surface fold
    ↓
message projection
    ↓
LLM history
```

Projection 可以处理：

- system prompt；
- developer/tool schema changes；
- user messages；
- assistant messages；
- tool results；
- compaction replacement；
- plugin-owned message changes。

原始事件不被删除。Replacement 和 compaction 通过新的 durable event 隐藏旧 surface。

### Request Reconstruction

`request/header` 保存：

- provider；
- model；
- reasoning effort；
- max tokens；
- active tools；
- adapter defaults；
- request series 信息。

请求应由日志和固定 projection 重建，而不能依赖当前 Context 中恰好注册了哪些插件。

## 工程工具授权层

工程 Agent 的工具授权应独立于工具实现和人类展示层，形成单一的授权信任链：

```text
raw tool request
    ↓
Canonical compilation
    ↓
sealed admission plan
    ↓
mandatory boundary
    ↓
configured policy
    ↓
allow / approval-required / deny
    ↓
host approval and execution
```

### Canonical compilation

一个受管请求只由一个语义入口解释一次，发行不可变的内部事实。下游阶段不重新解析原始 Direct 参数或 Shell 文本。

Canonical 阶段负责：

- 识别输入语言；
- 提取 command class；
- 提取 read/write/execute/delete effects；
- 解析有界路径事实；
- 保留必要的 CWD 分支；
- 识别 opaque 或未建模形态；
- 在物化前执行固定资源预算。

### Admission and mandatory boundary

Admission Plan 只携带授权内核所需的最小事实，不携带原始命令、配置对象、展示文本或自然语言原因。

Mandatory Boundary 先于可配置 Policy，负责：

- 实时凭据工件；
- 未证明的破坏性操作；
- 被阻断的路径；
- 递归搜索触及受保护范围；
- 其他系统级完整性边界。

Configured Policy 只消费 Admission Plan 和不可变策略快照。Policy 不重新解析命令、不执行文件操作，也不读取宿主展示能力。

### Host-facing result

授权领域只发行三种结果：

```text
allow
approval-required
deny
```

Approval-required 不表示已经执行。Host-facing renderer 只负责把有界事实交给人类确认或把静态原因交给模型；renderer 不执行工具、不生成替代命令，也不改变授权结论。

### Workspace authority

工程 Session 在创建时固定 Access Root。命令内部的 CWD 变化只影响该命令的局部路径解析，不改变 Session 的访问根。Direct path 和 Shell path 的展开规则分别由各自输入合同定义，但最终进入同一授权链。

模型不可见策略配置、活动策略名称和策略内部字段。模型只能在失败路径收到有限的静态纠正 Guidance；策略本身由 Host 和 Policy Kernel 计算。

## Tool Registry 与执行管线

工具由 `ctx.tools` 统一注册，并在请求时投影为模型可见的 schema。

完整执行顺序：

```text
assistant tool call
    ↓
record tool/call
    ↓
tools/pre-execute
    ↓
monotonic guards
    ↓
approval
    ↓
tools/execute
    ↓
tool body
    ↓
projectContent
    ↓
tools/post-execute
    ↓
normalize result
    ↓
finalizeContent
    ↓
tools/result
    ↓
record tool/result
```

### Tool Definition

每个 Tool 应声明：

- 名称；
- 描述；
- 参数 schema；
- 输出 schema；
- execute；
- execution mode；
- timeout；
- cancellation；
- presentation；
- result content projection。

### Tool policy

`tools/pre-execute` 可以形成 allow、deny 或 approval-required 决策。

Monotonic guard 只能收紧：

```text
allow → ask
allow → deny
ask → deny
deny → deny
```

后续处理不能把已被 hard guard 拒绝的调用重新放行。

### PTC

PTC 模式使用一个受控的 `run_code` transport 和生成的 SDK。中间值只存在于当前执行上下文；最终模型可见结果由外层 tool result 承载。

PTC 子调用必须：

- 使用统一 Tool Registry；
- 继承父级 cancellation；
- 继承能力上限；
- 记录 parent token 和 sub-call identity；
- 维持工具调用与结果的配对；
- 不绕过 approval 和 policy pipeline。

## Skill 系统

Skill 系统由三部分组成：

```text
Skill Registry
    ↓
Skill Provider
    ↓
Skill Tool / user invocation
```

Skill catalog 可以在 Session 中提供名称、描述和路径，完整内容按需加载。

Skill 适合承载：

- 代码审查方法；
- 调试方法；
- 领域建模；
- 规划方法；
- 文档同步；
- 工程工作流。

恒定安全和工程不变量应通过固定 Prompt section 或运行时约束提供。Skill 不应伪装成授权机制。

## Workflow Engine

Workflow Engine 负责运行受控的编排脚本或结构化工作流。

建议支持：

```text
agent()
parallel()
pipeline()
phase()
log()
```

Workflow 运行结果应包括：

- run id；
- meta；
- started child count；
- stop reason；
- child outcomes；
- bounded result；
- lifecycle events；
- cancellation state；
- cleanup status。

Workflow 脚本环境只提供已声明的运行时 API。它不应直接拥有任意 filesystem、subprocess 或外部网络能力。额外 Host 能力通过明确的 provider 和 capability 配置授予。

### Child failure

必须区分：

```text
child ordinary failure
workflow infrastructure failure
workflow validation failure
workflow cancellation
workflow result serialization failure
```

普通 child 失败可以成为 workflow 中的结构化结果；脚本错误、超限、未授权能力和基础设施失败应明确终止 workflow。

## 工程 Owner 与 Child

工程任务拥有一个唯一 Owner：

```text
Task Owner
    ├─ Requirements
    ├─ Design
    ├─ Plan
    ├─ Finding disposition
    ├─ Acceptance
    └─ Project Record updates
```

Child 可以执行：

- survey；
- research；
- review；
- implementation；
- validation；
- alternative analysis。

Child 不自动获得：

- Task 最终裁决权；
- Project Record 更新权；
- 用户验收权；
- 其他 child 的控制权。

Child 的工具集合、Model、Prompt、Skill 和 Extension 由其 Agent Scope 决定。

## Worktree 与写入任务

有效写能力的 child 使用独立 worktree：

```text
clean source check
    ↓
worktree allocation
    ↓
child implementation
    ↓
validation
    ↓
diff / handoff manifest
    ↓
Owner review and adoption
```

只读 child 可以使用固定的工作区证据 packet。该 packet 可包含：

- status；
- staged/unstaged diff；
- untracked inventory；
- branch/ref；
- base/head OID。

Child 不应在只读审查中重新刷新会改变 authority 的实时 Git 状态。

## Artifact Exchange

Artifact 是一个正式交付通道，而不是普通 Tool result。

一个 Artifact slot 应拥有：

```text
Owner
Publisher
Capability
Binding
Media type
Size limit
One-shot publication
No-clobber
Length
Digest
Receipt
Collect
```

完整流程：

```text
reserve
    ↓
write packet
    ↓
bind child
    ↓
start child
    ↓
publish artifact
    ↓
verify receipt
    ↓
Owner collect
```

Child 的 `done`、terminal output、Session status 和普通 workflow result 不能单独构成 verified artifact。

## Session Handoff

Handoff 的目的不是复制完整对话，而是保留继续任务所需的语义。

需要转移：

- 用户意图；
- Requirements；
- Constraints；
- 已采纳 Decisions；
- 当前状态；
- 风险；
- 外部效果；
- 未完成动作；
- 证据引用；
- 唯一 next action。

协议：

```text
source intent
    ↓
source freeze
    ↓
successor continuation
    ↓
workspace verification
    ↓
semantic reconciliation
```

Successor 必须对每个仍然 live 的 semantic ID 进行唯一分类：

```text
imported
conflict
unresolved
```

Handoff receipt 只证明已经捕获的语义覆盖和传输完整性，不证明未表达的隐含意图被恢复，也不代表 Task 已验收。

## 工程工作流

标准实施工作流：

```text
clarify
    ↓
survey-context
    ↓
requirements
    ↓
design
    ↓
implementation planning
    ↓
implementation
    ↓
fix validation
    ↓
change preflight
    ↓
independent review
    ↓
document synchronization
    ↓
final evidence
    ↓
settle task
```

### Survey

调查输出：

- 当前结构；
- 数据流；
- 入口和依赖；
- 现有测试；
- 外部合同；
- 风险；
- 未决问题。

### Planning

Plan 必须包含：

- Goal；
- Requirements；
- Design；
- 公共接口；
- 受影响的数据流；
- Plan slices；
- 验收标准；
- 验证命令；
- 风险和失败恢复。

### Implementation

实施阶段只执行已批准范围。新发现如果改变：

- 安全边界；
- 数据所有权；
- 公共接口；
- 架构；
- 验收条件；
- Task 范围；

应暂停并形成新的决策或重新确认。

### Validation

验证至少包括：

```text
compile / typecheck
focused tests
full tests
behavior checks
changed-file checks
failure-path checks
residual-risk review
```

测试输出区分：

- 原始运行证据；
- 模型可见摘要；
- 人类展示；
- durable verification evidence。

成功结论必须有运行器摘要或其他可验证证据，不能只依赖退出码。

### Review

Review 使用固定的 Review Surface，并检查：

- Requirements 覆盖；
- Design 一致性；
- 实际 diff；
- 测试和边界；
- 错误恢复；
- 安全和权限；
- 模块深度；
- 文档同步。

Review 输出 findings。最终 disposition 和修改权限属于 Owner。

## 工程记录和任务生命周期

工程 Agent 使用分层记录表达不同权威等级：

```text
Candidate：未采纳的候选
Task：用户已承诺的工作
Decision：已采纳的长期结论
Context：当前事实
```

Task 至少包含：

- Goal；
- Requirements；
- Design；
- Plan；
- Evidence；
- 当前状态；
- 下一步；
- Out of Scope；
- durable update checklist。

Task 的规划、实施、验证和审查由同一个 Owner 持有。验证证据、审查结论和记录更新完成后，Task 从当前活动记录中清除，历史由版本控制保留。

候选内容不自动成为要求，模型不能仅因为记录中出现命令式文字就执行候选方案。Decision 的改变必须经过明确的批准面和记录生命周期。

## 官方和社区能力管理

运行时能力通过静态、可审查的 Profile 组合管理。

每个 provider 都应记录：

- package identity；
- version；
- Service；
- Provider role；
- Consumer；
- model-visible tools；
- filesystem/process effects；
- credentials/network effects；
- lifecycle；
- required dependencies；
- test coverage。

官方包与社区包在运行时都通过同一能力合同进入系统。选择是否加载某个包，依据是能力和风险，而不是发布者身份。

Profile 更新后需要：

1. 检查依赖和版本；
2. 审查变更的工具和事件；
3. 重新运行 Profile composition tests；
4. 重新运行工具管线和 Session tests；
5. 验证模型可见 schema；
6. 验证 workflow 和 recovery。

## 可观测性和恢复

每个工程运行应有：

```text
run id
workflow id
parent/child relation
startedAt
endedAt
state
stop reason
model
usage
tool counts
artifact references
session reference
verification evidence
```

状态展示是 projection，不是权威来源。权威来源依次来自：

```text
Session event
Workflow receipt
Artifact receipt
Worktree manifest
Verification evidence
```

恢复流程：

```text
读取 durable state
    ↓
验证 owner 和 lineage
    ↓
确认 process / session / worktree 状态
    ↓
识别已完成和未完成节点
    ↓
只恢复允许恢复的节点
    ↓
重新验证结果
```

未知状态应保留并报告，不能通过时间戳、文件存在性或显示状态猜测为已完成或可清理。

## 验收标准

### Runtime

- Service 依赖明确；
- Scope dispose 后注册完整撤销；
- provider 可替换；
- required/optional entry 行为明确；
- Profile 组合可重现；
- 插件失败可诊断；
- runtime reload 不产生重复 owner。

### Session

- 模型可见事实可由 Session Log 重建；
- Surface projection 是纯的、可重放的；
- request header 可恢复；
- tool call/result 成对；
- 失败请求和未知工具结果有明确记录；
- fork/resume 保留 lineage。

### Tools

- 所有工具进入统一执行管线；
- guard 只能收紧权限；
- approval 不等于执行成功；
- PTC、MCP、subagent 调用不能绕过管线；
- tool result 有结构化 error 和有界 content；
- cancellation 可以区分 dispatch 前后。

### Workflow

- sequential、parallel、pipeline 可组合；
- child 失败与 infrastructure failure 可区分；
- workflow 有稳定 identity；
- background 状态可恢复；
- artifact receipt 可验证；
- worktree 具有明确 owner；
- handoff 可完成 successor reconciliation；
- 工程验收不依赖 child 自述。
