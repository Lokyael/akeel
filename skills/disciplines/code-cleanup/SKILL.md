---
name: code-cleanup
description: 'Use when the user says `clean up` or `整理代码`, or at the end of a development phase — systematic deep cleanup: dead code, duplicate logic, long files, module boundaries, test hygiene, and doc sync.'
---

# Clean Up Code

Systematic deep cleanup at the end of a development phase, before merging or releasing. Run when the user says `clean up` / `整理代码`, or when a milestone is complete.

Follow each step in order.

## Process

### 1. 死代码

- `npx tsc --noEmit` 确认零错误
- 对每个 `export` 执行 `grep -rn <name> src/ tests/`，无引用方则删除
- 检查 import 列表，移除未使用的导入

### 2. 重复逻辑

- 找相似度高的代码块（相同函数签名、相同控制流结构）
- 评估：抽取后的接口复杂度 > 节省的代码行数 → 不抽取
- 仅抽取"改一处即全局生效"的重复

### 3. 长文件

- 超过 ~350 行的文件，检查是否有独立职责可拆出
- 拆分标准：可独立命名、可独立测试、有明确单一职责
- **不拆的情形（满足任一即保留原样，不限行数）：**
  - 模块私有状态（WeakSet、闭包变量）被多个函数共享，拆分后必须导出 → 打破安全边界
  - 多个函数共同守卫一个概念（如 request 构造+验证），拆开后概念散落两处 → 违反 §9
  - 超出部分来自 import/export 声明、section banner 等结构性开销，核心逻辑在大约 300 行以内
- 不拆但超过 ~500 行：重新审视模块职责是否过于庞杂，考虑通过重构（而非拆分文件）来简化

### 4. 模块边界

- imports 是否形成单向依赖树（不应有循环引用）
- 同一抽象层级的概念是否放在同一个模块中
- 路径深度 > 4 层时检查是否可以扁平化

### 5. 测试清理

- 相同输入 + 相同断言 → 合并为一个参数化用例
- 断言覆盖唯一路径（equivalence class 每类一个），不重复验证同一行为
- 删除"为了覆盖率"写的、不测试实际行为的测试

### 6. 文档同步

- 运行 `/skill:doc-sync` 检查过期引用、stale 计数
- 近期变更的模块、API、配置项是否有对应文档更新

## Completion

Commit cleanup changes with meaningful messages. If any step revealed architectural issues beyond cleanup scope, hand off to `/skill:improve-architecture`.
