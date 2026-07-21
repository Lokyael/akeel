# ADR-004: Path policy 与 OS sandbox 的边界

**分类：** 安全架构

## 问题

用户态路径策略是否应命名或配置为 sandbox，以提供更强的隔离承诺？

## 决策

pi-keel 只提供 command classification、canonical path policy、Profile access gate 和 hard boundary，不提供或假定 Landlock、seccomp、network namespace、容器或其他 OS-level isolation。

## 理由

Node.js 路径检查没有 kernel-level enforcement。将其称为 sandbox 会使配置名称和实际执行边界不一致；明确边界可以避免过度安全承诺，同时保留实际有效的路径和权限策略。

## 不采用的方案

不保留名为 sandbox 的 filesystem/network policy，也不把可选的 OS 适配器作为运行时前提，因为部署环境不一定具备相应能力。

## 影响

Profile 只决定命令和路径访问，不替代操作系统隔离。OS sandbox 属于明确的范围外能力。
