# ADR-004: Path policy 与 OS sandbox 的边界

**分类：** 安全架构

| 维度 | 内容 |
|------|------|
| **问题** | pi-keel 是否应保留一个名为 sandbox 的 filesystem/network policy，或让用户误以为它提供 OS-level 隔离？ |
| **决策** | 不提供 sandbox 配置或 OS isolation。pi-keel 保留 command classification、canonical path policy、Profile access gate 和 hard boundaries；不安装或假定 Landlock、seccomp、network namespace 或其他 OS adapter。 |
| **理由** | 该功能没有 kernel-level enforcement，且配置与真实执行边界不一致。删除它可以避免把用户态路径检查描述成 sandbox，同时保留实际有效的 immutable path 和 permission policy。 |
| **后果** | Profile 只影响 command/path access decision；真正的 OS sandbox 适配属于 out of scope。 |
