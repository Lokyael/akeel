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

## Security Review

- [x] 多搜索根逐个生成 `search` intent；`rg pattern project/docs /etc` 现在拒绝 `/etc`，避免第二个根目录绕过策略。
- [x] 非递归 `grep` 的显式文件生成 `read` intent；`grep pattern /etc/passwd` 现在拒绝外部读取。
- [x] `2>/dev/null` 仅对精确 `/dev/null` 输出 sink 放行，其他外部写入仍由路径策略决定。
- [x] fd 前缀仅在数字 token 与重定向符相邻时消费；`2 > file` 保留为普通参数加 stdout 重定向。
- [ ] 复杂命令参数（如 `find -exec`、`xargs`、`parallel`）仍按未完成风险处理，不在本次 adapter 扩展中放宽。

## Durable Updates

- [ ] 安全边界变化同步到 `docs/security-boundaries.md`。
- [ ] 架构或策略决策同步到 `docs/decisions.md`。
- [ ] 当前术语、架构或 Negative Space 变化同步到 `CONTEXT.md`。
- [ ] 验证完成后删除已关闭的风险和本 Task Record。
