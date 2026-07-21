# ADR-017: Profile 驱动的访问策略

**分类：** 安全架构 / 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | 旧 runtime 将 PLAN/BUILD 执行阶段和 strict/standard/permissive 安全级别拆成两个状态系统，用户需要同时理解两个互相影响的开关；路径决策也分散在通用权限规则、工具规则和 Shell 规则中。 |
| **决策** | 以命名 Profile 作为唯一用户权限入口。Profile 通过 `extends` 组合，解析为 `shellPolicy` 和按 `read/list/search/write` 区分的 `pathPolicy`。Footer 只显示 Profile 名称。 |
| **命令决策** | taxonomy 输出 `readOnly`、`mutating`、`dangerous`、`unclassified`。Profile 使用 `shellPolicy.readOnly`、`mutating`、`unclassified`；未分类命令目前包含尚未建立独立策略的网络命令。 |
| **路径决策** | 路径规则按操作独立配置，并按配置及继承后的声明顺序 first-match；先匹配的规则优先，不进行优先级评分，也不因规则重叠拒绝加载。`blockedPaths`、威胁模式、危险命令、unsafe Shell syntax 和 symlink escape 是不可覆盖的 hard deny。 |
| **批准** | `ask` 只提供 `Allow once` 和 `Deny`，批准不跨调用或 Session 持久化。无 UI 的运行模式在需要批准时 fail-closed。 |
| **Session 状态** | active Profile 属于当前 extension instance；每次 `session_start` 从配置的 `defaultProfile` 重新开始，Session replacement 不继承临时 Profile。 |
| **配置层级** | 内置 Profile → 全局 `~/.pi/agent/extensions/access-gate/profiles.json` → Pi 信任项目后才读取项目 `.pi/extensions/access-gate/profiles.json`。后层同名 Profile 替换前层定义，Profile 内部使用 `extends` 显式组合。 |
| **理由** | Profile 让用户看到一个明确的访问模式，同时保留命令分类、路径匹配和 hard boundary 的独立可测试性；按操作的路径规则避免用单一 writeScope 表达互相冲突的读写需求。 |
| **后果** | 旧的 phase、security level、preset、PLAN/BUILD 命令和旧配置格式被删除；Profile 配置需要提供清晰 description；网络能力暂不单独管理，未分类命令的批准是有意的临时边界。 |
| **Out of Scope** | OS-level sandbox、网络隔离、容器/VM、基于 fd 的原子文件执行，以及把 network command taxonomy 独立成新的能力轴。 |
