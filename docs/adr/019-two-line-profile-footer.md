# ADR-019: 两行 Profile Footer

**分类：** 用户界面 / 扩展架构

## 问题

使用 `setStatus()` 显示 Profile 会额外增加一行，无法与 Pi 原生 Footer 的工作目录、Session、Token、模型和扩展状态形成稳定布局。

## 决策

TUI 模式使用 `setFooter()` 包装 Pi 原生 `FooterComponent`，固定为两行：第一行保留原生位置和 Session 信息并显示当前 Profile，第二行保留原生运行统计和扩展状态。Pi 主包不可用时使用最小本地 fallback。

## 理由

`setStatus()` 只能追加单行状态，不能控制 Footer 的整体布局；`setFooter()` 才能在保留原生信息的同时稳定放置 Profile。

## 影响

Footer 从 Session 级 `ProfileState` 读取当前 Profile，切换 Profile 后请求重绘；两行均支持宽度截断以避免窄终端文本重叠。该决策只影响 TUI 展示，不改变权限、Session 或 `/profile` 语义。
