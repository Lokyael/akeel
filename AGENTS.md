# AGENTS.md — Pi Keel 维护入口与仓库约定

本文件只定义 pi-keel 仓库自身的维护入口和内容约定，帮助模型与维护者快速区分仓库内的三类内容。它**不复制**注入到用户项目的原则、Task 生命周期或当前架构——那些内容分别在 `src/bootstrap/principles.md`、`CONTEXT.md` 和 `docs/` 中维护（见 D-026）。

## 项目定位

Pi Keel 是 [pi](https://pi.dev) 的插件包：以 **扩展（extensions）** 注入工程原则与访问控制，以 **skills** 按需加载工程纪律与工作流，用于在用户项目中管理工程实践。它本身也是一个 TypeScript 开发仓库，包含用于构建与验证自身的开发内容。这三类内容在同一目录树中并存，维护时必须区分对待。

## 三类内容区分

| 类别 | 位置 | 是什么 | 分发方式 | 维护对象 |
|------|------|--------|----------|----------|
| **扩展（插件）** | `src/bootstrap/`、`src/access-gate/` | Session 启动注入的原则（`principles.md`）与 Profile 驱动的访问控制代码 | `package.json` 的 `pi.extensions` | 运行时行为；改动需同步测试与文档 |
| **Skills** | `skills/foundations/`、`skills/disciplines/`、`skills/workflows/` | 按需加载的技能，含 SKILL.md 与配套文件；三目录表达加载时机（D-005） | `package.json` 的 `pi.skills` | 技能内容与流程；只引用权威文档，不重复定义规则 |
| **开发内容（dev）** | `tests/`、`scripts/`、`types/`、`tsconfig.json`、`package.json` 脚本 | pi-keel 自身的构建、测试、类型声明与技能校验 | 不进入用户项目分发 | 开发质量；改动随对应功能同步 |

## 目录速查

```
src/bootstrap/          # 扩展：Session 注入原则（principles.md + index.ts）
src/access-gate/        # 扩展：Profile、Shell IR、路径策略、Gate、Session、Footer
skills/                 # skills：三目录按加载时机组织（D-005）
  foundations/          #   基础约束（evidence-first）
  disciplines/          #   工程纪律（TDD、代码审查、领域建模等）
  workflows/            #   工作流（survey-context、implement-work 等）
tests/                  # dev：访问控制与扩展测试（npm test 入口）
scripts/                # dev：validate-skills.ts 等校验脚本
types/                  # dev：pi 宿主类型声明
docs/                   # 项目文档：决策、任务、安全边界、溯源（见 CONTEXT.md）
CONTEXT.md              # 当前事实、术语、架构与 Active Decisions 索引
```

## 维护约定

- **测试入口**：`npm test` 运行技能校验、TypeScript 检查和 access-gate 测试；修改扩展代码必须保持测试通过。
- **分发声明**：只有 `package.json` 的 `pi.extensions` 与 `pi.skills` 声明的路径进入用户项目；其余是仓库自身开发内容。
- **文档边界**：长期决策写 `docs/decisions.md`，当前事实写 `CONTEXT.md`，安全承诺写 `docs/security-boundaries.md`，第三方来源与许可证写 `docs/traceability.md`；AGENTS.md 不承接这些职责。
- **技能规则单一来源**：技能只引用 `src/bootstrap/principles.md`，不在技能内重复定义规则（D-013）。
