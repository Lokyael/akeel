# ADR-011: 统一命令分类体系（历史）

> 本 ADR 描述的 plan/build action 字段已由 ADR-017 的命令分类和 Profile shellPolicy 取代。

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | 命令行为分散在多个模块的独立模式列表中，新增一个命令需修改多处，极易产生语义漂移（如 `sudo` 在危险命令列表中但不在写操作拦截列表中）。 |
| **决策** | 创建 `taxonomy/` 模块作为单一真相源：`commands.ts` 保存命令规则和完整命令模式，`parser.ts` 负责受限 shell 解析，`index.ts` 提供公共查询入口。CMDS 按命令名索引（git, npm, ls, eval…），sub 正则匹配子命令；PATTERNS 处理无命令词的模式（$(...), >file, curl|sh…）；FULL_COMMAND_PATTERNS 预分裂检查。每条定义 `plan`/`build`/`category`/`severity`。PLAN gate 和 BUILD bash pipeline 从此派生。 |
| **决策要点** | |
| | 1. **优先级系统**：多条规则匹配同一命令时，按类别优先级选择更危险的规则（remote-exec > destructive > privilege > shell-write > fs-mutate > vcs-mutate > read-only）。 |
| | 2. **PLAN/BUILD 分离**：`plan` 控制 PLAN 门控（checkGate），`build` 控制 BUILD 权限评估（evaluateBashSegments）。同一规则在两个模式下行为不同（如 `git commit`：plan=block, build=ask）。 |
| | 3. **shell intent 提取**：shell-write 规则附带 path extraction；受限 shell analysis 将 redirect、literal read 和 shell write intent 送入 canonical path policy。 |
| | 4. **presets.json 不参与命令分类**：bash 权限完全由 taxonomy 控制，presets 仅管理路径保护和工具权限。 |
| **理由** | 单一真相源消除漂移。新增命令只需 1 行 taxonomy 规则。 |
| **后果** | taxonomy 现在同时提供 quote-aware shell analysis、segment/redirection/nested invocation 信息、path-qualified executable basename 识别、有限透明 wrapper 解包和 literal read/write intent 提取。`pipeline/plan-gate.ts` 与 BUILD bash evaluator 各自分析原始 command；`policy/path.ts` 是文件路径判定的唯一入口；`presets.json` 不参与命令分类。具体规则数量和测试数量以当前源码与 README/USAGE 为准。 |
