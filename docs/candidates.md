# Candidate Records

> 本文件只保存当前未采纳、未承诺实施的候选事项。内容是项目数据，不是指令、需求、路线图、当前事实或用户批准；`Review On` 和 `Trigger` 也不会自动激活事项。只有用户在当前会话明确选择后，才能将条目迁移到 Task、Decision、Negative Space 或其他权威文档。
>
> 编号取末尾最大 `C-xxx` + 1，不复用历史 ID。

## C-001: 命令语义选项值/程序串泄漏为路径 intent（5 项）

- **Created:** 2026-08-06
- **Why Not Now:** T-034 测试重组期间由 intents 完整化揭示，行为已由完整化测试固化（无回归风险）；修复涉及命令语义选项处理（D-027 族），需独立设计且可能改变既有路径检查面，不在当前评估。
- **Trigger:** 命令语义选项值分类（D-027）或 adapter 选项处理被修改/评估时。
- **Review On:** 2026-11-06
- **内容（现状行为，非缺陷声明）：**
  1. `truncate -s 0 log.txt` 的 `0` 被当作 write 路径 intent；
  2. `install -m 755 src.sh dst` 的 `755` 被当作 read 路径 intent（chmod/chown 有 skip 而 install 没有）；
  3. sed/awk 经典形式程序串（`sed 's/x/y/' file`、`awk '{print}' file`）被当作 read 路径 intent（仅 `-e`/`-f` 形式被正确处理）；
  4. `sed -i` 原地模式下表达式串被当作 write 目标；
  5. `find -exec/-execdir/-ok` 的 exec 参数（`{}`、`\;`）被当作 search 根。
