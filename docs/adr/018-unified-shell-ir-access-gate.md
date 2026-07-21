# ADR-018：统一语义 Shell IR 与 Access Gate 架构

| 属性 | 值 |
|------|-----|
| **日期** | 2026-07 |
| **状态** | 生效 |
| **分类** | 安全架构 / 代码架构 |

## 问题

Shell 命令的路径意图、wrapper 解包、选项语义和 cwd 传播分散在多个字符串提取器中，每个只能覆盖已知字符串形态，无法防止通过 `env rm`、`sort -o`、`sed -i`、wrapper 和 cwd 变化绕过 path policy。

## 决策

采用三层深模块架构，每层只做一件事，通过不可执行的 Shell IR 串联：

1. **`shell-parse/`** — 受限 Shell 语法解析，输出 `ShellProgram` IR。不理解 Profile、不做 allow/deny。
2. **`command-semantics/`** — 通过 adapter 注册表，将 IR 节点解析为 `CommandClass`、`PathIntent`、`Effect` 和 `CwdTransition`。
3. **`gate/`** — 消费上述结构化结果，执行 hard boundary、路径解析、Profile first-match 和审批聚合。

调用者只看到一个入口：`analyzeShell(input)` → `GateResult`。

### 拒绝的方案

- **给 extractor 增加命令特例**（shotgun surgery，不可验证）
- **依赖系统 Shell 先执行再判断**（side effect 不可控）

## 安全不变量

1. `blockedPaths` 命中的任何 intent 返回 hard deny，不能被 Profile 或 Allow once 覆盖。
2. `allow` 只能在所有语法节点和所有 effect 都被语义注册表解释后产生。
3. 一个参数无法静态解析为安全 intent → hard deny 或 unclassified ask。
4. wrapper 不删除底层命令的 intent（`env rm x` ≡ `rm x`）。
5. `readOnly` 节点不能含 write/delete/permissionChange/execute/network effect。
6. mutating 节点的源路径按 `read` 检查，目标/删除/权限变化按 `write` 检查。
7. `cd`/`pushd` 的 cwd 变化影响后续相对路径；无法确定分支 cwd 时不能 allow。
8. 一个 tool call 的所有 ask intent 聚合在一次审批中；Allow once 不产生持久授权。
9. 项目 Profile 只在 `ctx.isProjectTrusted() === true` 时参与配置合并。
10. first-match 是唯一 Profile path rule 优先级；不计算 specificity，不排序，不因重叠规则报冲突。

## Profile 决策

- 命令决策：`shellPolicy.{readOnly,mutating,unclassified}` — `allow | ask | deny`。
- 路径决策：`pathPolicy.rules[]` 按声明顺序 per-operation first-match；未声明的 operation 对该 rule 透明。
- `blockedPaths`、dangerous command、unsafe syntax 和 symlink escape 是 hard deny，Profile 只能增加不能放宽。

## Enforcement scope

access-gate 只拦截 Pi `tool_call` 事件。以下入口不在 enforcement 范围内：

- `user_bash`（`!`/`!!`）
- `shellCommandPrefix`
- Bash `spawnHook`
- tool override
- custom tool backend
- 后续 handler 修改 `event.input`

access-gate 对自身收到的 `tool_call` 参数做一次快照校验，不跟踪参数变化，不承诺全局 enforcement。

## 残余风险

- pathname check 与实际文件操作之间的 TOCTOU（记录于 `security-boundaries.md` R-08）
- 用户安装的其他 Extension 可直接调用 Node fs/child_process
- 用户批准后 tool call 的真实 side effect 由 OS 权限决定
- Shell 执行环境（PATH、BASH_ENV、hooks、LD_PRELOAD）不纳入分析
- 审批详情暂不提供敏感信息脱敏
- 无 kernel-level sandbox，用户态 Profile 不是隔离边界

## 已知覆盖边界

以下命令类型在本轮 adapter 覆盖范围之外，至少通过 `unclassified` 策略询问用户：

- 隐式文件操作且无 adapter 的命令（tar、unzip、rsync、patch 等）
- 嵌套执行（find -exec、xargs、parallel）
- 非普通文件（FIFO、socket、device、procfs、sysfs）
- 归档内部路径穿越

## 后果

- 旧 security-gate phase/pipeline/taxonomy/shared 模块已删除。
- 命令分类和路径操作各有单一真相源。
- Profile 是唯一用户权限入口；PLAN/BUILD 和 security level 已移除。
- 实施计划见 `docs/plans/access-gate-hardening-plan.md`。
