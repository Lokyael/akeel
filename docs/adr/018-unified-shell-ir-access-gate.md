# ADR-018：统一语义 Shell IR 与 Access Gate 架构

| 属性 | 值 |
|------|-----|
| **状态** | 生效 |
| **分类** | 安全架构 / 代码架构 |

## 问题

Shell 命令的路径意图、wrapper 解包、选项语义和 cwd 传播分散在字符串提取器中，无法稳定覆盖 `env rm`、`sort -o`、`sed -i`、wrapper 和 cwd 变化等表达方式。

## 决策

采用三层架构，并以不可执行的 Shell IR 传递结构化结果：

1. `shell-parse/` 解析受限 Shell 语法，输出 `ShellProgram`，不理解 Profile。
2. `command-semantics/` 通过 adapter 将 IR 转换为命令类别、路径意图、效果和 cwd 转换。
3. `gate/` 执行 hard boundary、路径策略、Profile first-match 和审批聚合。

公共分析入口为 `analyzeShell(input)`，调用者不直接依赖解析和语义实现细节。

## 安全不变量

- 任一 intent 命中 `blockedPaths` 都 hard deny，不能由 Profile 或 `Allow once` 覆盖。
- 只有所有语法节点和 effect 都被安全解释时才可 allow；无法静态解析的内容只能 hard deny 或 unclassified ask。
- wrapper 必须保留底层命令 intent；readOnly 节点不得产生写入、删除、权限变更、执行或网络 effect。
- mutating 节点的源路径按 `read` 检查，目标、删除和权限变化按 `write` 检查。
- `cd`/`pushd` 的 cwd 变化影响后续相对路径；无法确定分支 cwd 时不得 allow。
- 一个 tool call 的所有 ask intent 聚合为一次审批，批准不产生持久授权。
- 项目 Profile 仅在 `ctx.isProjectTrusted() === true` 时参与配置合并。
- Profile path rule 只按声明顺序 first-match，不计算 specificity、不排序、不因重叠规则自动改写结果。

## Enforcement scope

access-gate 只拦截 Pi `tool_call` 事件，不承诺全局 enforcement。以下入口不在范围内：`user_bash`（`!`/`!!`）、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend，以及后续 handler 对 input 的修改。

## 当前边界

未建立 adapter 的隐式文件操作、嵌套执行、特殊文件和归档内部路径仍通过 `unclassified` 等策略处理，不能视为静态安全 allow。pathname check 与实际操作之间的 TOCTOU、其他 Extension 的直接文件操作、审批详情脱敏和 OS-level sandbox 见 [`security-boundaries.md`](../security-boundaries.md)。

待核查风险和测试缺口见 [`docs/plan.md`](../plan.md)。

## 影响

命令语义和路径操作各有单一真相源；Profile 是唯一用户权限入口。旧 security-gate 的 phase、pipeline、taxonomy 和 shared 目录不再是当前 runtime 的架构依据。
