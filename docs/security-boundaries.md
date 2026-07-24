# 安全边界记录

本文记录当前未由用户态 access gate 完全消除的安全边界，不定义实现任务、验收标准或执行顺序。

## R-02：Node 路径检查与真实对象

**状态：** 部分实现。

`access-gate/path/resolve.ts` 会检查现有目标、父目录、canonical path 和 symlink escape。它可以拒绝项目路径通过 symlink 指向项目外部，但它不能把 pathname check 变成基于 file descriptor 的原子访问。

## R-08：Node-only TOCTOU

**状态：** deferred。

路径检查与实际文件操作之间存在时间窗口。其他进程可以在 `realpath`/access check 通过后替换文件、symlink 或父目录，使后续 pathname-based read/write/edit 操作作用于不同目标。

消除该边界需要由实际操作方使用 fd-based 或 OS-level 原子机制；当前不引入此类机制，也不将 Node-only path checks 描述为已消除 TOCTOU 风险。

## R-12：受限 Shell 语法范围

**状态：** by design，部分语法仍未覆盖。

Shell IR 不是完整 Bash 语法树；当前只对简单命令、已知 wrapper、控制操作符、重定向和已支持的字面量参数建模。`for`、`while`、`if`、函数定义等结构化控制流没有对应的安全语义。命令中的动态 token（例如 `$f`、命令替换和未引用 glob）会在 Profile 决策前 hard deny。

没有动态 token 的未知命令仍可能按 `shellPolicy.unknown` 进入 deny、ask 或 allow，这不代表结构化 Shell 语法已经得到验证。需要批量检查文件时，应使用直接 `read`、`grep`、`find` 或 `ls` tool call；这是受支持的访问入口，不是绕过 Shell gate。

## 范围声明

pi-keel 的 Profile、命令分类 adapter 和路径 gate 是用户态策略，不提供容器、VM、seccomp、Landlock、网络 namespace 或其他 kernel-level isolation。

## R-09：非 gate 入口绕过

**状态：** by design。

access-gate 只拦截 Pi `tool_call` 事件。`user_bash`（`!`/`!!`）、`shellCommandPrefix`、Bash `spawnHook`、tool override、custom tool backend 和其他 Extension 的 handler 不在 enforcement 范围内。用户安装的其他 Extension 可直接调用 Node fs/child_process。

## R-10：审批后的实际 side effect

**状态：** by design。

用户批准 ask tool call 后，该 tool call 内部的实际文件操作仍由操作系统权限决定。access-gate 只做前置策略检查，不控制执行后的行为。

## R-11：审批详情敏感信息

**状态：** partial。

deny 决策的 reason 经过 sensitive prefix 脱敏（`~/.ssh`、`/home/`、`.env` 等），subject 被截断到 1,024 字符，reason 总长度 ≤ 2,048。ask 决策仍保留完整 evidence 供用户审批判断。renderer 不做完整 security log scrubbing。

## R-13：Compiler-issued request 真实性

**状态：** implemented。

`CompleteAccessRequest` 只能由 compiler 构造器发行；构造器 deep-freeze request 后加入模块私有 WeakSet。Kernel 通过 `isCompleteAccessRequest()` 验证 WeakSet 成员资格、递归冻结、exact coverage correspondence 和 resource budget，拒绝复制或伪造的 request。

WeakSet 在进程生命周期内保持，request 不跨调用缓存或持久化。

## R-14：Guidance 注入

**状态：** implemented。

Guidance 只能从源码内置的静态 `GuidanceId` catalog 映射，不拼接原始 Shell、glob、用户输入或文件路径。blocked path、threat 和 symlink escape 不提供绕过建议。renderer 不调用替代 tool、不生成可执行命令。
