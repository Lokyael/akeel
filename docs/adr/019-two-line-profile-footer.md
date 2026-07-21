# ADR-019: 两行 Profile Footer

**分类：** 用户界面 / 扩展架构

| 维度 | 内容 |
|------|------|
| **问题** | Pi 内置 Footer 有两行核心信息，但扩展通过 `setStatus()` 注册的 Profile 名称会被追加为第三行；Profile 名称也无法和当前路径、Token、模型信息形成稳定布局。 |
| **决策** | Access Gate 在 TUI 模式使用 `setFooter()` 包装 Pi 导出的原生 `FooterComponent`，固定渲染两行。第一行保留原生 Footer 的工作目录、Git 分支和 Session 名称，并在右侧显示当前 Profile 名称；第二行保留原生 Footer 的 Token、缓存、成本、上下文、Provider、模型、思考级别和扩展状态信息。Pi 主包不可用时仅使用本地渲染 fallback。 |
| **同步** | Footer 读取同一个 Session 级 `ProfileState`。切换 Profile 后请求重绘；Session 启动时重新安装 Footer，Session 关闭时释放 Footer。 |
| **布局** | 两行均使用左右对齐和宽度截断，右侧 Profile 或模型信息优先保留，避免窄终端下发生文本重叠。Profile 名称不显示 `Profile:` 前缀。 |
| **范围** | 只改变 TUI Footer 的展示，不改变 Profile 的权限决策、Session 生命周期或 `/profile` 命令语义。非 TUI 模式不安装自定义 Footer。 |
| **理由** | `setStatus()` 只能追加单行扩展状态，带换行的状态文本也会被 Pi 单行清洗；只有 `setFooter()` 能控制整个底部区域的行数和布局。 |
| **后果** | 正常 Pi 运行时的统计和上下文数据继续由原生 Footer 负责；fallback 仍需在 Pi API 不可用时提供最小两行布局，并由测试覆盖。Pi 原生 Footer API 变化时需要验证包装层兼容性。 |
