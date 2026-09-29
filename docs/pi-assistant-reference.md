# Pi 个人与通用助手参考架构

## 目标定位

本工具是一个个人与通用 AI 助手，重点是低摩擦交互、可按需扩展和可靠的单任务执行。

它应当能够：

- 处理个人问答、资料研究、计划整理和文本工作；
- 读取、修改和验证本地项目中的文件；
- 执行范围明确的单任务编码工作；
- 在任务规模较小时直接完成调查、修改和测试；
- 在需要额外视角时调用受控的子代理；
- 保存可恢复的会话、分支和工作结果；
- 通过 Extension、Skill、Prompt 和 Package 按需增加能力。

核心目标不是构建一个大型服务平台，而是保持一个小而开放的 Agent Host，让工作方式通过资源和扩展演进。

## 设计原则

### 1. 小内核、开放扩展

核心运行时只拥有：

- Agent loop；
- Model runtime；
- Tool execution；
- Context assembly；
- Session storage；
- Compaction；
- 交互宿主、JSON、Print 和 RPC 等宿主接口。

个人工作流、模型提供商、领域工具和宿主集成通过扩展资源提供。

Extension 可以注册：

- Model provider；
- Tool；
- Command；
- Shortcut；
- Event handler；
- Prompt section；
- Renderer；
- Session entry；
- Host presentation / renderer；
- 外部资源提供器。

Extension 不应把长期业务状态藏在模块级变量中。会话相关状态应绑定 Session lifecycle，外部资源应有明确的启动、释放和恢复路径。

### 2. Skill catalog 常驻，正文按需加载

启动时只向模型提供 Skill 的：

- 名称；
- 描述；
- 路径；
- 适用场景。

完整 `SKILL.md` 在任务匹配时加载。Skill 可以携带：

- 脚本；
- 参考资料；
- 模板；
- 资源文件。

Skill 负责方法和工作步骤，不直接承担长期运行时状态。需要执行行为时，应调用 Tool、Command 或 Extension。

### 3. 工具、指令和方法分层

三种入口职责不同：

| 入口 | 职责 |
|---|---|
| Tool | 模型可调用的结构化动作 |
| Command | 用户主动控制的运行时操作 |
| Skill | 任务方法、工作步骤和参考材料 |

普通工具适合：

```text
read
write
edit
bash
grep
find
ls
```

用户控制面适合：

```text
/new
/resume
/fork
/tree
/compact
/reload
```

复杂的运行时变更、会话切换、资源管理和清理优先使用 Command，而不是让普通模型工具直接操作宿主生命周期。

## 核心运行模型

```text
用户输入
    ↓
Prompt template / file expansion
    ↓
Session active branch
    ↓
System prompt + context files + skills catalog + tools
    ↓
Model request
    ↓
Assistant text / tool calls
    ↓
Tool execution
    ↓
Session entries
    ↓
下一轮或 run settlement
```

一个 Session 拥有：

- 当前模型和 thinking level；
- 当前工具集合；
- 当前扩展运行时；
- 当前 active branch；
- queued steering/follow-up messages；
- compaction state；
- session file 或 in-memory store。

## Session 与上下文

### Session tree

Session 使用树结构保存对话历史：

```text
root
 ├─ branch A
 │   └─ branch A1
 └─ branch B
```

每个 entry 指向 parent，当前 leaf 决定 active branch。导航、fork 和 clone 不删除旧分支。

### Context

模型请求由以下内容构成：

```text
base system prompt
+ system prompt sections
+ context files
+ active branch messages
+ tool definitions
+ skill descriptions
+ loaded skill instructions
```

Context extension 可以在请求前生成临时投影，但原始 Session 记录应保持不变。需要持久化的数据使用：

- Session entry；
- tool result details；
- custom message；
- 外部受控存储。

### Compaction

自动或手动 compaction 应：

1. 根据 token 预算确定 cut point；
2. 保留最近消息；
3. 对较早内容生成结构化摘要；
4. 将摘要作为新的 Session entry；
5. 保留原始 entry；
6. 在恢复、分支和再次 compaction 时能够重建 active context。

摘要至少应覆盖：

```text
Goal
Constraints & Preferences
Progress
Key Decisions
Next Steps
Critical Context
read-files
modified-files
```

## 工具运行时

### 工具注册

每个 Tool 应声明：

- 稳定名称；
- 面向模型的描述；
- TypeBox 或等价结构化参数 schema；
- 执行函数；
- 输出 content；
- 结构化 details；
- 执行模式；
- 可取消行为；
- 展示方式。

文件修改工具必须将完整的 read-modify-write 操作放入同一 mutation queue，避免并发写入破坏文件。

### 工具激活

可选工具应先注册，再通过 loader 或 Session control 选择激活集合。工具 schema 的变化应记录到会话请求历史，使模型能够知道当前可用工具。

复杂或高成本工具不应默认进入每个普通 Session 的模型请求。推荐：

```text
轻量 loader 常驻
    ↓
用户或模型明确选择能力
    ↓
下一次请求激活完整工具
```

### 工具结果

工具结果分为：

- 模型可见 content；
- 人类展示内容；
- 结构化 details；
- session 持久化数据；
- 诊断 artifacts。

大结果应写入受控 artifact，并向模型返回有界摘要和读取提示。不能把无限输出直接塞入对话。

## 子代理架构参考

`pi-subagents` 的架构可作为子代理能力的主要参考。

### Child Session

Child 应是真实的独立 Agent Session，而不是父模型的重复请求。

每个 child 具有：

- 独立 Session；
- 独立模型和 thinking；
- 独立工具集合；
- 独立 Skill/Extension 选择；
- 独立 cwd；
- 独立输出和 usage；
- 独立生命周期。

支持两种执行模式：

```text
Foreground：当前进程内运行并实时展示
Background：独立 runner 运行，通过状态和结果文件回传
```

### Agent Definition

Agent 用 Markdown frontmatter + system prompt 定义：

```yaml
---
name: reviewer
description: Review code and tests
tools: read, grep, find, ls
context: fresh
acceptanceRole: read-only
---

You are an independent reviewer...
```

应支持：

- builtin agents；
- package agents；
- user agents；
- project agents；
- 作用域优先级；
- user/project override；
- model override；
- tool allowlist；
- skill selection；
- extension selection；
- fresh/fork context；
- output binding；
- acceptance policy。

### Capability ceiling

父级可以为 child 施加单调收紧的能力上限：

```text
allowedAgents
allowedTools
denyExtensions
maxSubagentDepth
```

多个限制取交集。Child、Workflow 和外部配置都不能把已收紧的能力重新扩大。

### Lazy delegation tool

新 Session 默认只暴露轻量的 delegation loader。只有明确允许委托时，完整 `subagent` schema 才在下一轮请求中出现。

委托应有清晰的授权来源：

- 当前用户请求；
- 当前 Skill；
- Project instruction；
- 明确的 Workflow；
- 已注册的 capability ceiling。

任务复杂度本身不能自动授予委托权。

## Workflow Script

Workflow 用于编排多个 child，而不是替代普通单任务执行。

推荐接口：

```js
const scan = await runs.run("scan", {
  agent: "scout",
  task: "Inspect the relevant code"
});

const reviews = await runs.all([
  { key: "correctness", agent: "reviewer", task: "Review correctness" },
  { key: "tests", agent: "reviewer", task: "Review tests" }
]);

return { scan: scan.output, reviews };
```

Workflow runtime 应提供：

- sequential run；
- parallel fan-out；
- pipeline；
- stable workflow key；
- child result binding；
- timeout；
- cancellation；
- bounded output；
- structured result；
- status；
- steering；
- recovery；
- nested depth limit。

脚本运行环境只提供受控 API，不提供任意 filesystem、shell 或宿主全局对象。Host command 必须通过已信任的 named resource 授予，而不是由模型脚本自行拼接。

## 持久化运行状态

Foreground 运行主要依赖 Session 事件。Background 运行需要机器可读的生命周期 artifacts：

```text
status.json
 events.jsonl
output-<index>.log
transcript
result.json
workflow-receipt.json
```

文件应使用：

- 原子写入；
- 私有权限；
- schema version；
- 稳定 run id；
- 明确 owner；
- bounded fields；
- 可恢复状态；
- unknown 状态保留而不是猜测清理。

实时事件适合运行时观察和通知，持久化文件适合恢复、查询和跨进程传输。原始命令输出不是状态协议。

## Worktree 与单任务编码

写入型 child 可以使用独立 worktree：

```text
源 checkout clean check
    ↓
创建 worktree
    ↓
启动 writer child
    ↓
捕获 diff / test / output
    ↓
生成 handoff manifest
    ↓
由用户或 Owner 决定采纳与清理
```

只读 child 可以共享 checkout，但测试或脚本可能产生 tracked side effect 时，应按写入任务处理。

清理只能依赖：

- 记录的 owner；
- 已验证的 run 状态；
- handoff manifest；
- fresh Git 检查；
- 明确的 release predicate。

路径、时间戳和显示状态不能单独证明资源可以删除。

## 工程单任务工作流

普通单任务编码采用：

```text
clarify
  ↓
survey
  ↓
plan
  ↓
implement
  ↓
validate
  ↓
review
  ↓
settle
```

### Survey

输出：

- 当前结构；
- 相关入口；
- 数据流；
- 外部依赖；
- 测试入口；
- 风险；
- 未决问题。

### Plan

计划必须说明：

- Goal；
- Requirements；
- Design；
- 变更范围；
- 公共接缝；
- 验收标准；
- 验证命令；
- 风险和回滚面。

### Implement

实施只处理已批准范围。发现改变架构、授权、数据所有权或验收条件的新问题时，暂停并升级裁决，不自行扩展范围。

### Validate

验证分为：

- 编译 / 类型检查；
- focused tests；
- full tests；
- behavior checks；
- changed-file checks；
- residual risk review。

测试工具的原始输出应保留；模型可收到经过有界投影的摘要，但摘要不能伪装成完整证据。

### Review

独立 Review 使用固定的 Review Surface，覆盖：

- Requirements；
- Design；
- 实际 diff；
- 测试；
- 边界条件；
- 安全和权限；
- 简洁性；
- 文档同步。

Review 输出 findings，不自动拥有修改权。修改后必须重新验证。

## Artifact Exchange

正式 child 结果不应依赖终端文本。

一个 artifact slot 应具备：

- owner；
- publisher；
- capability；
- binding；
- media type；
- size limit；
- one-shot publication；
- no-clobber；
- length；
- digest；
- receipt；
- Owner-side collect。

child 完成、终端显示或 status=done 只能说明执行状态，不能说明结果已经正式交付。

## Session Handoff

Handoff 需要保存的不是完整对话，而是继续工作所需的语义：

- 用户意图；
- Requirements；
- 约束；
- 已采纳 Decisions；
- 当前进度；
- 风险；
- 外部副作用；
- 未完成动作；
- 结果和证据引用。

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

每个仍然有效的 semantic unit 必须分类为：

```text
imported
conflict
unresolved
```

receipt 证明的是已捕获语义的覆盖和传输完整性，不证明模型已经理解所有隐含意图。

## 扩展和能力接缝

每个可替换能力按三部分设计：

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
PTC / local workflow provider
    ↓
workflow tool
```

```text
Subprocess Definition
    ↓
local / SSH provider
    ↓
shell and terminal tools
```

```text
LLM Definition
    ↓
model adapter
    ↓
agent loop
```

Provider 不应把领域权威、Project Record 或 Policy 逻辑偷偷下沉到平台层。

## 个人助手能力组合

个人助手的推荐基础能力集合：

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
Skills
Skill loader
Commands
Invariants
Subagent provider
Workflow provider
```

默认不加入与工程执行无关的产品服务。每个额外 provider 都应说明：

- 提供什么能力；
- 注册什么服务；
- 向模型暴露什么 schema；
- 写入什么 Session event；
- 需要什么权限；
- 如何卸载；
- 如何验证失败。

Profile、Bundle 和 Patch 只用于组合运行时，不应把内部实现细节全部暴露给工程使用者。

## 资源、信任与加载

资源加载分为安装、发现、激活三个阶段：

```text
Package installed
    ↓
resource discovered
    ↓
resource selected and activated
```

Package 可以提供：

- Extensions；
- Skills；
- Prompt templates；
- Themes；
- Agent definitions；
- runtime dependencies。

用户级资源和项目级资源具有明确的优先级。项目资源在信任确认后加载，项目资源的存在不会自动改变工具权限。Extension 在宿主进程中执行，因此每个 Package 都应在加载前审查其源码、依赖和资源声明。

可选资源使用 manifest filter 或运行时 activation 控制，不应让全部扩展、工具和提示词默认进入每个 Session。

## 任务与长期委托

个人助手可以把较长的委托保存为 Mission：

- objective；
- linked runs；
- artifacts；
- decisions；
- receipts；
- usage；
- current status。

Mission 是运行管理记录，不代替用户对项目事实的最终确认。定时任务应保存明确的 schedule、参数、下一次运行时间和结果 receipt，并使用固定的资源与权限配置。

## 验收标准

### Agent 与 Workflow

- Child 有稳定身份和明确 owner；
- parallel、pipeline、retry、cancel 行为可重放；
- nested delegation 有深度和能力上限；
- child 结果与执行状态分离；
- workflow 失败不会被伪装成空成功；
- background 状态可恢复；
- reload 和进程重启不会重复执行已确认的副作用。

### Session

- 模型可见事实可由 Session 重建；
- 原始事件与模型 projection 分离；
- compaction 不丢失继续任务所需语义；
- fork/resume 能保留 owner 和 lineage；
- handoff 能完成 successor reconciliation。

### Tools

- 工具 schema 与实际执行能力一致；
- 所有受管工具经过统一 pipeline；
- approval、timeout、retry、result normalization 有稳定顺序；
- PTC、MCP、subagent 内部工具不能绕过执行管线；
- 高成本工具可按需激活。

### 工程流程

- 任务可以从 survey 进入 plan；
- plan 可以被 implementation 消费；
- writer、validator、reviewer 的职责可区分；
- Worktree 和 artifact 具有可验证 owner；
- 验收证据与 child 自述分离；
- 文档和当前事实可以同步更新；
- 失败、取消、部分完成和未决状态有明确输出。
