# ADR-004: Path policy 与 OS sandbox 的边界

**分类：** 安全架构

| 维度 | 内容 |
|------|------|
| **问题** | pi-keel 是否应保留一个名为 sandbox 的 filesystem/network policy，或让用户误以为它提供 OS-level 隔离？ |
| **决策** | 删除 sandbox 配置、filesystem/network policy、audit 和 `/security sandbox` 命令。pi-keel 只保留 command taxonomy、canonical path policy 和 permission gate；不安装或假定 Landlock、seccomp、network namespace 或其他 OS adapter。 |
| **理由** | 该功能没有 kernel-level enforcement，且配置与真实执行边界不一致。删除它可以避免把用户态路径检查描述成 sandbox，同时保留实际有效的 immutable path 和 permission policy。 |
| **后果** | strict/standard/permissive 只影响 command/path/permission 行为；项目配置中的旧 sandbox、audit 字段会被拒绝并回退到已验证配置。真正的 OS sandbox 适配属于 out of scope。 |
