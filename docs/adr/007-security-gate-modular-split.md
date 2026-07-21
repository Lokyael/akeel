# ADR-007: 安全扩展模块化拆分（历史）

> 本 ADR 描述的旧 config/pipeline 结构已由 ADR-017 的 Profile access-gate 架构取代。

**分类：** 代码架构

| 维度 | 内容 |
|------|------|
| **问题** | `security-gate.ts` 是 902 行巨石文件，混合了类型定义、4 组模式库、3 组预设配置、配置加载、规则评估、shell 检测、审计——8 个独立关注点。 |
| **决策** | 拆分为 `src/security-gate/` 目录下模块 + `pipeline/` 子目录。预置加载整合到 `config/index.ts`。管道分层为 `pipeline/plan-gate.ts`、`pipeline/bash.ts`、`pipeline/permission.ts`，每层独立可测。主入口 `index.ts` 负责事件注册和管道组装。 |
| **理由** | 1. 关注点分离——每个模块可独立理解和测试。2. `config/index.ts` 从 `config/presets.json` 动态加载 + deepMerge，消除配置重复。3. `taxonomy/commands.ts` 统一命令分类（见 ADR-011）。4. `bootstrap/index.ts` 注入内容外化到 `principles.md`，非程序员可直接编辑。 |
| **后果** | 模块可独立测试。权限 gate 的日志记录不属于 pi-keel 当前能力范围；gate decision 不依赖日志 I/O。 |
