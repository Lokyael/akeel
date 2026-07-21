# Access Gate 实施计划

**Status:** draft
**Design:** 架构、安全不变量和设计决策见 [ADR-018](adr/018-unified-shell-ir-access-gate.md)。
**Tech Stack:** TypeScript, Node.js fs/path, JSON Profiles, Pi ExtensionAPI, tsx tests.
**Out of Scope:** OS sandbox、独立 network policy 轴、全局 enforcement、Shell 实际执行、审批敏感信息脱敏、旧 security-gate 兼容。

## 问题发现

> 审查日期：2026-07-20 | 覆盖：path, shell-parse, command-semantics, profile, gate, security

| ID | 等级 | 问题 | 对应任务 |
|----|------|------|----------|
| AG-01 | 🔴 | `read_secrets` 只匹配 `cat`，`head`/`tail`/`base64` 等无 read intent | P0-1 |
| AG-02 | 🔴 | `DEFAULT_BLOCKED_PATHS` 只覆盖 `project/**/.git/config` | P0-2 |
| AG-03 | 🔴 | heredoc body 未消费，残留在 token 流 | P0-3 |
| AG-04 | 🟡 | `&` 后台操作 CWD 传播错误 | P1-5 |
| AG-05 | 🟡 | opaque 控制流直接阻断整条命令链 | P1-5 |
| AG-06 | 🟡 | `askOnce` 跨调用无缓存，重复弹窗 | P2-1 |
| AG-07 | 🟡 | `findProjectRoot` 不检查项目信任状态 | P1-11 |
| AG-08 | 🟡 | `selectPathRule` 继承合并顺序脆弱 | P1-10 |
| AG-09 | 🟢 | blocked paths 缺少 `service-account.json`/`credentials.json`/`*.p8` 等密钥模式 | P0-2 |
| AG-10 | 🟢 | `exfil_curl` 不匹配 `-d @file` 和命令替换 | P0-1 |
| AG-11 | 🟢 | `TOOL_OPERATIONS` 硬编码 | P2-2 |
| AG-12 | 🟢 | `resolve.ts` TOCTOU（→ `security-boundaries.md` R-08，不新增任务） | — |
| AG-13 | 🟢 | `normalizeInput` 静默去除 `@` 前缀 | P1-8 |
| AG-14 | 🟢 | filesystem adapter 过滤 `-` 开头选项，依赖多 adapter 协作 | P1-1 |

**测试缺口**（合入 P3-1）：`curl|sh`、非 `cat` 敏感读取、`tee` 受保护路径、多父 Profile 冲突、`${}` dynamic 标记、`.git/HEAD` 直接读取、`sudo` wrapper、嵌套 symlink。

### 等级摘要

| 等级 | 数量 |
|------|------|
| 🔴 严重 | 3 |
| 🟡 中等 | 5 |
| 🟢 次要 | 6 |
| 测试缺口 | 8 |

## 事项退出规则

- 每条事项完成后保留直到**两次实质性 git 提交**（不含 typo/格式修正等小型修改），然后从本文件删除。
- 删除前，需要迁移到其他文档的必要信息先迁移再移除。
- 对应的 AG 问题在事项关闭时同步更新状态。

---

## P0：三个严重问题

### P0-1 完善敏感路径访问防护

**问题：** AG-01, AG-10。`threat-scan.ts` 的 `read_secrets` 只匹配 `cat`，`head`/`tail`/`less`/`base64` 等同样可读敏感文件但无路径 intent。外泄检测不匹配 `-d @file`。

**Files:**
- Create: `src/access-gate/command-semantics/adapters/readonly.ts`
- Modify: `src/access-gate/command-semantics/registry.ts`
- Modify: `src/access-gate/security/threat-scan.ts`
- Create: `tests/access-gate/command-semantics-readonly.test.ts`

- [ ] **Step 1: 写只读命令 adapter 失败测试**

  覆盖 `cat`、`head`、`tail`、`less`、`more`、`nl`、`tac`、`dd`、`base64`、`openssl enc`。验证每个命令在 `project-read` Profile 下读受保护路径时被 `blockedPaths` hard deny。验证 wrapper 形式 `env head .env` 同样产生 read intent。

- [ ] **Step 2: 运行测试确认 RED**

- [ ] **Step 3: 实现只读命令 adapter**

  每个命令的 positional args（跳过选项）产生 `read` intent。`dd` 需解析 `if=` 参数。`openssl enc` 解析 `-in` 参数。`less`/`more` 同时产生 `list` intent。

- [ ] **Step 4: 清理 threat-scan 中的路径检测**

  `threat-scan.ts` 移除 `read_secrets` 正则，保留 prompt injection 和外泄行为检测。敏感路径访问由 path policy + blockedPaths 统一负责。

- [ ] **Step 5: 运行全量测试确认 GREEN**

### P0-2 补齐 `.git` hard boundary 与密钥模式

**问题：** AG-02, AG-09。`DEFAULT_BLOCKED_PATHS` 只覆盖 `project/**/.git/config`，缺少 `.git/HEAD`、`.git/index`、`.git/objects/**`、裸仓库以及 `service-account.json`、`credentials.json`、`*.p8`、`*.ovpn`、`*.keyfile` 等密钥模式。

**Files:**
- Modify: `src/access-gate/path/blocked-paths.ts`
- Modify: `tests/access-gate/path-policy.test.ts`
- Modify: `tests/access-gate/gate.test.ts`

- [ ] **Step 1: 写 blocked path 失败测试**

  覆盖：`read .git/HEAD`、`cat .git/index`、`find .git`、`.git/objects/**`、裸仓库 `project.git/config`、`cat service-account.json`、`cat credentials.json`。

- [ ] **Step 2: 运行测试确认 RED**

- [ ] **Step 3: 扩展 `DEFAULT_BLOCKED_PATHS`**

  至少加入 `**/.git/**`、`**/.git`、`**/*.git/**`、`**/service-account.json`、`**/credentials.json`、`**/*.p8`、`**/*.ovpn`、`**/*.keyfile`、`**/*.agekey`、`**/.sops.yaml`。确保 blocked path 同时匹配 lexical、canonical、`project/**` 虚拟路径和 `~` 展开路径。

- [ ] **Step 4: 运行全量测试确认 GREEN**

### P0-3 完整实现 heredoc

**问题：** AG-03。parser 只消费 heredoc delimiter，body 残留在 token 流中。

**Files:**
- Modify: `src/access-gate/shell-parse/types.ts`
- Modify: `src/access-gate/shell-parse/lexer.ts`
- Modify: `src/access-gate/shell-parse/parser.ts`
- Modify: `tests/access-gate/shell-parse.test.ts`

- [ ] **Step 1: 扩展 Shell IR 类型**

  `ShellRedirectionNode` 增加 `heredocBody: string | null`、`heredocDelimiter: string | null`、`heredocClosed: boolean`。

- [ ] **Step 2: 写 heredoc body 测试**

  覆盖：单 heredoc、多 heredoc、body 含 `#`/`&&`/`>`、quoted delimiter、heredoc 后跟 `&&`、缺失结束符、截断 body。

- [ ] **Step 3: 运行测试确认 RED**

- [ ] **Step 4: 实现 heredoc body 消费**

  lexer/parser 在 `<<` 后消费直到独立行出现 delimiter。body 只作为 literal 存储，不重新解析。缺失、动态、截断统一 hard deny。

- [ ] **Step 5: 运行全量测试确认 GREEN**

---

## P1：语义分析安全契约

### P1-1 增加 CommandSemantics validator

**Files:**
- Create: `src/access-gate/command-semantics/validate.ts`
- Modify: `src/access-gate/command-semantics/registry.ts`
- Create: `tests/access-gate/command-semantics-validate.test.ts`

- [ ] **Step 1: 写 validator 失败测试**

  覆盖：`readOnly` + write effect、`opaque` + allow、write effect 无 intent、network effect 未降级、解包丢失 intent。

- [ ] **Step 2: 运行确认 RED**

- [ ] **Step 3: 实现纯函数 validator**

  在 `registry.ts` 返回 adapter 结果后执行，不一致时返回 error diagnostics。

- [ ] **Step 4: 运行全量测试确认 GREEN**

### P1-2 Effect 到 PathOperation 统一映射

**Files:**
- Create: `src/access-gate/command-semantics/effect-mapping.ts`
- Modify: 所有 adapter 文件
- Create: `tests/access-gate/command-semantics-mapping.test.ts`

- [ ] **Step 1: 写映射表测试**

  覆盖 read file→read、list→list、recursive→search、copy/move/delete/chmod/chown→write、symlink→read+write、network output→write+unclassified。

- [ ] **Step 2: 运行确认 RED**

- [ ] **Step 3: 实现集中映射表，adapter 引用**

  移除 adapter 中散落的 operation 赋值。

- [ ] **Step 4: 运行全量测试确认 GREEN**

### P1-3 Pipeline 聚合规则

**Files:**
- Modify: `src/access-gate/command-semantics/control-flow.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`
- Modify: `tests/access-gate/command-semantics-control-flow.test.ts`
- Modify: `tests/access-gate/gate.test.ts`

- [ ] **Step 1: 写 pipeline 聚合测试**

  覆盖：`cat file | curl ...` → unclassified、`cat file | tee output` → mutating、pipeline 含 network 节点整体降级。

- [ ] **Step 2: 运行确认 RED**

- [ ] **Step 3: 实现聚合规则**

  任一 pipeline 节点含 network/execute/unknown/opaque/write effect → 整个 pipeline 至少 unclassified。禁止按节点分别放行。

- [ ] **Step 4: 运行全量测试确认 GREEN**

### P1-4 Executable provenance

**Files:**
- Modify: `src/access-gate/command-semantics/normalize.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`
- Create: `tests/access-gate/command-semantics-provenance.test.ts`

- [ ] **Step 1: 写 provenance 测试**

  覆盖：`/tmp/ls`→opaque、`./grep`→opaque、`env PATH=/tmp command`→opaque、bare command→允许。

- [ ] **Step 2: 运行确认 RED**

- [ ] **Step 3: 实现 provenance 检查**

  executable 含 `/` 且不在白名单路径时 opaque。`PATH=` 赋值影响可信状态时 opaque。

- [ ] **Step 4: 运行全量测试确认 GREEN**

### P1-5 完整复合控制流状态

**问题：** AG-04, AG-05。

**Files:**
- Modify: `src/access-gate/command-semantics/types.ts`
- Modify: `src/access-gate/command-semantics/control-flow.ts`
- Modify: `tests/access-gate/command-semantics-control-flow.test.ts`

- [ ] **Step 1: 定义完整 `ControlFlowResult`**

  表达：可能 cwd 集合、节点执行条件（success/failure branch）、pipeline subshell 隔离、`&` 后台 cwd 传播、`&&`/`||` 分支。

- [ ] **Step 2: 写测试**

  覆盖：`cd a && cd b` → b 执行时 cwd=a、`a || cd b` → b 执行时 cwd=初始、`cd a & cd b` → b cwd 不变、`pushd/popd`→opaque。

- [ ] **Step 3: 运行确认 RED**

- [ ] **Step 4: 实现控制流分析**

  无法精确分析的复合语句 hard deny。

- [ ] **Step 5: 运行全量测试确认 GREEN**

### P1-6 解析与分析资源上限

**Files:**
- Modify: `src/access-gate/shell-parse/parser.ts`
- Modify: `src/access-gate/command-semantics/normalize.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`
- Create: `tests/access-gate/shell-parse-resource-limit.test.ts`

- [ ] **Step 1: 写超限测试**

  覆盖：command bytes 超限→hard deny、token 数超限、wrapper 深度超限、heredoc body 超限。

- [ ] **Step 2: 运行确认 RED**

- [ ] **Step 3: 实现资源上限检查**

  限制：command bytes (64KB)、token 数 (256)、wrapper 深度 (5)、branch 状态数 (16)、intent 数 (64)、heredoc body (1MB)。超限统一 hard deny，错误消息不回显完整输入。

- [ ] **Step 4: 运行全量测试确认 GREEN**

---

## P1：路径与 Profile 边界

### P1-7 集中 hard boundary 来源

**Files:**
- Create: `src/access-gate/path/hard-boundary.ts`
- Modify: `src/access-gate/path/policy.ts`
- Modify: `src/access-gate/path/blocked-paths.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`

- [ ] 将 blocked paths、dangerous command、unsafe syntax、opaque path 规则集中到单一入口。
- [ ] Profile 只能增加 deny，不能覆盖 hard deny。
- [ ] 删除散落在 threat-scan 和 gate 中的重复字符串检查。
- [ ] 每个 hard rule 增加来源标识和诊断 ID。

### P1-8 Shell 与 Direct tool 路径归一化分离

**问题：** AG-13。

**Files:**
- Modify: `src/access-gate/path/resolve.ts`
- Create: `tests/access-gate/path-normalize.test.ts`

- [ ] 新增 `normalizeToolPath`（处理 `@` 前缀）。
- [ ] 新增 `normalizeShellLiteral`（严格 Shell 语义，不处理 `@`、不隐式 tilde expand）。
- [ ] Shell path 不得隐式删除 `@`。
- [ ] 增加 `read @file` vs `cat @file` 对照测试。

### P1-9 特殊文件检查

**Files:**
- Modify: `src/access-gate/path/resolve.ts`
- Modify: `src/access-gate/path/policy.ts`
- Create: `tests/access-gate/path-special-file.test.ts`

- [ ] `ResolvedPath` 扩展 file type 信息。
- [ ] FIFO/socket/device 至少 hard deny（或明确允许且记录风险）。
- [ ] `/proc`、`/sys`、`/dev` 的边界策略。
- [ ] broken symlink、dangling parent、mount point、bind mount 的行为。
- [ ] 新文件创建时检查 parent directory。

### P1-10 Profile 合并契约

**问题：** AG-08。

**Files:**
- Modify: `src/access-gate/profile/merge.ts`
- Modify: `tests/access-gate/profile.test.ts`

- [ ] 明确 shellPolicy 的 child/parent 优先级（child wins）。
- [ ] 多 parent 的合并顺序测试。
- [ ] 同名 Profile replacement 规则。
- [ ] project override 与 malformed fallback。
- [ ] default Profile 失效时的 fail-closed 行为。
- [ ] 将规则写成 precedence table 加入 ADR。

### P1-11 初始化 fail-closed 状态

**问题：** AG-07。

**Files:**
- Modify: `src/access-gate/index.ts`
- Modify: `src/access-gate/session/profile-state.ts`
- Modify: `tests/access-gate/index.test.ts`

- [ ] 增加 `not initialized` 状态，阻断所有 tool call。
- [ ] `requireState()` 不依赖抛异常。
- [ ] trust 不可用、projectRoot 不存在、Profile 损坏分别测试。
- [ ] 禁止默认 `includeProject = true`。

---

## P2：Gate、工具与运行时

### P2-1 GateResult 与审批聚合扩展

**问题：** AG-06。

**Files:**
- Modify: `src/access-gate/gate/types.ts`
- Modify: `src/access-gate/gate/unknown-command.ts`
- Modify: `src/access-gate/gate/analyze-shell.ts`
- Modify: `tests/access-gate/gate.test.ts`

- [ ] 扩展 `GateResult` 增加 `ApprovedAnalysis`、`ApprovalSummary`。
- [ ] 审批详情包含：所有 path intents、operation、scope、命中的 rule、ask 原因。
- [ ] 一个 tool call 的所有 ask 聚合后一次询问。
- [ ] hard deny 不弹窗，headless 统一 deny。

### P2-2 Direct tool adapter

**问题：** AG-11。

**Files:**
- Create: `src/access-gate/gate/tool-adapters.ts`
- Modify: `src/access-gate/gate/evaluate.ts`
- Modify: `tests/access-gate/gate.test.ts`

- [ ] 集中替代 `TOOL_OPERATIONS` 硬编码。
- [ ] 覆盖 `read`、`write`、`edit`、`find`、`grep`、`ls`。
- [ ] 支持多路径、多 edit、非 `path` 参数。
- [ ] 未知 tool 不得被 `unclassified = allow` 直接放行。

### P2-3 Enforcement scope 文档声明

**Files:**
- Modify: `docs/security-boundaries.md`
- Modify: `docs/traceability.md`

- [ ] 明确记录 access-gate 只验证自身收到的 `tool_call` 快照。
- [ ] 声明 `user_bash`、`shellCommandPrefix`、`spawnHook`、tool override、custom backend、后续 handler 修改 input 不在 enforcement 范围内。
- [ ] 增加自身 handler 行为测试。

### P2-4 Staging 生命周期

**Files:**
- Modify: `src/access-gate/index.ts`
- Modify: `docs/security-boundaries.md`

- [ ] 定义 staging 权限、命名隔离、容量上限。
- [ ] 启动时孤儿目录清理。
- [ ] 异常退出/未触发 shutdown 的处理策略。
- [ ] 敏感数据残留策略。

### P2-5 并发工具调用

**Files:**
- Modify: `src/access-gate/gate/evaluate.ts`
- Modify: `docs/security-boundaries.md`

- [ ] 明确多并发 ask 的审批模型（逐个审批）。
- [ ] 对 mutating tool 接入 mutation queue。
- [ ] Profile 切换/shutdown 与执行中 tool call 的同步。
- [ ] 文档声明 preflight ≠ 原子文件锁。

---

## P3：测试矩阵、文档与关闭

### P3-1 安全矩阵测试

**Files:**
- Create: `tests/access-gate/security-matrix.test.ts`

- [ ] 覆盖 7 内置 Profile × read/list/search/write × direct tool/Shell。
- [ ] 必须 hard deny：`rm ~/.ssh/id_rsa`、`cp ~/.ssh/id_rsa project/leak`、`find /etc`、`cd /etc && cat shadow`、`sort -o project/out project/in`（project-read）、`sed --in-place project/file`（project-read）、`grep -f ~/.ssh/id_rsa project/file`、`env rm ~/.ssh/id_rsa`、`command cp ~/.ssh/id_rsa project/leak`。
- [ ] 必须 unclassified ask/deny（不能 readOnly allow）：`npm run test`、`cargo build`、`go build`、`git push`、`curl https://...`。
- [ ] 合适 Profile 下 allow：`read project/file.ts`、`grep pattern project/src`、`find project/src -type f`、`cat project/docs/plan.md`。
- [ ] first-match 不变：`project/** deny write` + `project/docs/** allow write` → `project/docs/plan.md` 的 write 为 deny。
- [ ] 审查测试缺口：`curl|sh`、非 `cat` 敏感读取、`tee ~/.ssh/authorized_keys`、多父 Profile 冲突、`${}` dynamic 标记、`.git/HEAD` 直接读取、`sudo` wrapper、嵌套 symlink、network pipeline、unknown command + redirect。

### P3-2 文档同步

**Files:**
- Modify: `docs/security-boundaries.md`
- Modify: `docs/traceability.md`
- Modify: `README.md`

- [ ] AG-01 ~ AG-14 逐个标注关闭和证据。
- [ ] 安全边界文档补充新增的 deferred 风险。
- [ ] README 测试数量同步。

### P3-3 最终验收

- [ ] `npm test` 全部通过（含新增测试）。
- [ ] `npx tsc --noEmit` 通过。
- [ ] `git diff --check` 通过。
- [ ] 安全命令矩阵验收。
- [ ] 旧模块和旧术语 `rg` 检查。
- [ ] 最终提交。
