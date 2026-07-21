# ADR-017: Profile 驱动的访问策略

**分类：** 安全架构 / 代码架构

## 问题

旧 runtime 同时暴露执行阶段和安全级别两个状态系统，路径决策也分散在工具、Shell 和通用权限规则中，用户难以判断当前实际权限。

## 决策

以命名 Profile 作为唯一用户权限入口。Profile 通过 `extends` 组合，分别配置 `shellPolicy` 和 `read`、`list`、`search`、`write` 四类 `pathPolicy`。

## 规则

- 命令分类为 `readOnly`、`mutating`、`dangerous`、`unclassified`；Profile 为前三类可配置 `allow`、`ask`、`deny`，危险命令始终拒绝。
- 路径规则按声明顺序对每个 operation 使用 first-match；`blockedPaths`、威胁模式、unsafe syntax 和 symlink escape 是不可覆盖的 hard deny。
- `ask` 只提供 `Allow once` 和 `Deny`，不跨调用或 Session 持久化；无 UI 时 fail-closed。
- 每次 Session 从配置的 `defaultProfile` 开始，不继承其他 Session 的临时 Profile。
- 配置按内置、全局、受信项目顺序合并；后层同名 Profile 替换前层定义，继承关系必须显式声明。

## 理由

Profile 给用户一个明确的访问模式，同时保留命令分类、路径匹配和 hard boundary 的独立可测试性；按 operation 拆分路径规则可以表达不同的读写需求。

## 不采用的方案

不继续暴露 phase/security level 双状态，也不使用单一 `writeScope` 表达所有路径操作，因为两者都无法清晰描述实际权限组合。

## 影响与边界

旧 phase、security level、preset、PLAN/BUILD 命令和旧配置格式不再属于当前 runtime。OS-level sandbox、网络隔离、容器/VM、基于 fd 的原子文件执行和独立 network policy 轴不在本决策范围内。
