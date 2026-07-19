# 安全边界记录

本文仅记录当前未纳入实施计划的两个安全边界，不定义实现任务、验收标准或执行顺序。

## R-02：internal symlink 的真实目标匹配

**状态：** 不纳入当前实施计划。

项目目录内的 symlink 可能在逻辑路径和真实目标之间产生差异，例如 `safe-env -> .env`。当前记录该边界，表示路径策略需要同时考虑输入路径和 existing canonical target，才能稳定覆盖 immutable path 与 configured path policy。

## R-08：Node-only TOCTOU

**状态：** deferred，不纳入当前实施计划。

路径检查与实际文件操作之间存在时间窗口。其他进程可以在 `realpath`/permission check 通过后替换文件、symlink 或父目录，使后续 pathname-based read/write/edit 操作作用于不同目标。

现有 gate 提供检查时的路径策略和 fail-closed 判断，但不提供 atomic file-object enforcement。消除该边界需要由实际操作方使用 fd-based 或 OS-level 原子机制；当前不引入此类机制，也不将 Node-only path checks 描述为已消除 TOCTOU 风险。

## 范围声明

上述两项仅作为安全边界和 residual risk 记录，不进入当前实施计划，不新增代码、测试或迁移工作。
