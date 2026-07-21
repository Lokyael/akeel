# ADR-010: Shell 文件写入绕过防护

**分类：** 安全架构

## 问题

`write`/`edit` 工具有路径保护，但 Shell 的重定向和文件操作命令可以直接修改文件，绕过工具级策略。

## 决策

将 Shell 文件修改统一纳入受限 Shell analysis、command semantics 和 canonical path policy。写入 intent 与其他路径操作使用同一套 hard boundary 和 Profile gate；secret-pattern scan 不承担访问控制职责。

## 理由

安全策略必须覆盖所有文件修改入口。集中解析和路径判定可以防止通过 `sed -i`、重定向、`tee`、`cp`、`mv` 等命令绕过工具权限。

## 不采用的方案

不只保护内置 `write`/`edit`，也不把字符串 secret scan 当作文件访问控制，因为这两种方式都无法完整覆盖 Shell 写入路径。

## 影响

Shell 写入会按目标路径进入统一策略；critical、unsafe syntax、dynamic execution 和 immutable path 等 hard boundary 不受 Profile 或用户批准放宽。
