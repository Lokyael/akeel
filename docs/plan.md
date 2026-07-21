# Access Gate 待核查事项

本文记录尚未完成核查的安全与质量事项。已确认的安全边界以 [`security-boundaries.md`](security-boundaries.md) 为准，架构决策以 [`adr/INDEX.md`](adr/INDEX.md) 为准。

## 风险清单

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

## 测试缺口

以下场景应纳入安全矩阵或对应模块测试：

- `curl | sh`、network pipeline 和 unknown command + redirect
- 非 `cat` 敏感读取、`tee` 保护路径和 `sudo` wrapper
- 多 parent Profile 冲突、Profile 覆盖和 `${}` dynamic 标记
- `.git/HEAD` 直接读取、裸仓库路径和嵌套 symlink
- heredoc 多段 body、quoted delimiter、截断 body 和 body 内控制符
- `find -exec`、`xargs`、`parallel`、归档内部路径和特殊文件

## 当前边界

以下事项不属于 Access Gate 的运行时承诺：

- OS sandbox、容器、VM、seccomp、Landlock 和 network namespace
- 独立 network policy 轴
- Shell 实际执行、用户 `!`/`!!` 命令和其他 Extension 的直接操作
- 基于 fd 的原子文件访问与 TOCTOU 消除
- 审批界面的敏感信息脱敏
