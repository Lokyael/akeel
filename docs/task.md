# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0108: Access Gate 审查发现项修复与代码质量收敛

**Kind:** maintenance
**Status:** in-progress

### Goal

修复 Access Gate 独立审查中确证的 Coreutils `ln` 遗漏、WeakMap Sidecar 残留、解释器解析耦合、死代码与测试门面导入偏差，并补全极端深度与编码边界单测。

### Requirements

- **R1 — Coreutils `ln` 对称支持：** 在 `invocation.ts` 中将 `ln` 纳入 `modificationCommands` 类似 `cp`/`mv` 的模型：源路径为 `read` effect，目标路径为 `write` effect，使 `ln` 自然接入 Path Evidence 与 Mandatory Boundary 保护（包括凭据拦截与符号链接路径解析）。
- **R2 — 消除 WeakMap Sidecar：** 重构 `packages/access-gate/src/access-gate/access-decision/adapters/config.ts`，消除模块级 `normalizedDefinitions = new WeakMap()`，`readDefinition` 直接自包含返回强类型规范化不可变对象，完全符合 D-087 消除隐藏状态的约定。
- **R3 — 解释器选项与脚本解析内聚：** 将 `invocation.ts` 中的 `unsupportedInterpreterOption` 与 `interpreterScriptPath` 逻辑内聚迁入 `core/compilation/shell/programs/interpreters.ts`，由分析器统一定义解释器语义，消除霰弹式修改。
- **R4 — 清理死代码：** 删除 `runtime/project-context.ts` 中全仓零引用的 `isProjectContext` 与 `ISSUED_CONTEXTS = new WeakSet<ProjectContext>()`。
- **R5 — 修复测试门面导入：** 将 `tests/access-gate/access-decision/adapters/host.test.ts` 导入路径由内部私有实现改为走 `adapters/index.ts`（遵循 AGENTS.md）。
- **R6 — 补充极端边界单测：** 在测试套件中为符号链接递归深度达到上限 40（`MAX_SYMLINK_DEPTH`）以及孤立 UTF-16 代理对（Surrogate Pairs）截断补充精准的单元测试。

### Design

1. **`ln` 支持**：`ln` 是 Coreutils 核心文件工具。在 `invocation.ts` 中将 `ln` 加入 `modificationCommands`，并在 `unmodeledPathOption` 允许 `-s` / `-f` / `-sf` / `-n` / `-v` 等常见选项；其参数按多路径操作数解析，源参数标记 `source`（触发 `read` effect），目标参数标记 `target`（触发 `write` effect）。
2. **`config.ts` 去除 `WeakMap`**：定义 `NormalizedDefinition` 为自包含的 `{ paths, commands }` 结构；`readDefinition` 直接返回该规范化对象；`mergeBuiltinDefinition` 和 `unifiedSnapshotFor` 直接消费并生成 `UnifiedPolicySnapshot`，彻底移除全局 `normalizedDefinitions = new WeakMap()`。
3. **解释器解析内聚**：`programs/interpreters.ts` 扩展 `analyzeInterpreterProgram`，在其中直接检查参数列表：若是单参数且属于 `--version`/`-h` 等信息标志则返回 `inspect`；若存在除 `--` 外的其他选项标志（如 `-c`, `-e`）则标记 `securityBoundary: true`；若包含脚本路径则提取为 `source` 路径，标记 `effects: ["execute", "read"]`。`invocation.ts` 移除分散的解释器判断函数，直接消费分析器产物。
4. **死代码与门面导入清理**：移除 `runtime/project-context.ts` 中无调用的代码；修改 `host.test.ts` 导入。
5. **边界单测补充**：在 `tests/access-gate/access-decision/core/` 下添加针对 `MAX_SYMLINK_DEPTH = 40` 和 UTF-16 孤立代理对字节预算的专项测试。

### Out of Scope

- **大小写折叠/大小写不敏感凭据保护 (SEC-02)**：D-070 明确声明仅保证标准大小写敏感 Linux 文件系统，属于已定案的 Negative Space，不修改。
- **通用未建模命令的启发式静态探测**：坚守 D-070 和 Negative Space，不为 opaque shell 引入模糊字符串嗅探，依靠 preset 分层与知情同意面。

### Plan

#### Slice 1: 基础工程与死代码清理 (R4, R5)
**Goal:** 清理 `project-context.ts` 死代码与修复 `host.test.ts` 门面导入。
**Requirements covered:** R4, R5
**Depends on:** none
**Acceptance Criteria:**
- `isProjectContext` 及 `ISSUED_CONTEXTS` 移除，TypeScript 检查通过。
- `host.test.ts` 通过 `adapters/index.ts` 导入并全部测试通过。

#### Slice 2: 消除配置适配器 WeakMap Sidecar (R2)
**Goal:** 重构 `adapters/config.ts`，消除 `normalizedDefinitions = new WeakMap()`。
**Requirements covered:** R2
**Depends on:** Slice 1
**Acceptance Criteria:**
- `config.ts` 零 WeakMap。
- `unified-config.test.ts`、`policy-file.test.ts` 全部通过。

#### Slice 3: 解释器解析内聚收敛 (R3)
**Goal:** 将解释器选项与脚本参数提取下沉至 `programs/interpreters.ts`。
**Requirements covered:** R3
**Depends on:** Slice 2
**Acceptance Criteria:**
- `invocation.ts` 不再包含分散的 `unsupportedInterpreterOption` 和 `interpreterScriptPath`。
- 现有解释器测试（`interpreters.test.ts`、`shell-semantics.test.ts`）全部通过。

#### Slice 4: Coreutils `ln` 对称支持 (R1)
**Goal:** 将 `ln` 纳为基础 modification 命令并提取源与目标路径。
**Requirements covered:** R1
**Depends on:** Slice 3
**Acceptance Criteria:**
- `ln file target` 将 `file` 视为 read、`target` 视为 write。
- `ln ~/.pi/agent/auth.json ./stolen` 触发 Mandatory Boundary 硬拒绝。
- 添加针对 `ln` 的单测。

#### Slice 5: 极端边界单元测试补充 (R6)
**Goal:** 补全符号链接深度上限与代理对预算截断的单测。
**Requirements covered:** R6
**Depends on:** Slice 4
**Acceptance Criteria:**
- 补充 `MAX_SYMLINK_DEPTH = 40` 刚好达到与超过 40 的测试。
- 补充孤立高代理对（`\uD800`）的 UTF-8 字节预算测试。
- 全量测试 `npm test` 通过。

### Evidence

- 待实施验证。

### Durable Updates

- [ ] 检查 `CONTEXT.md` 与 `docs/decisions.md`，确认相关架构描述保持一致。

## T-0109: 待创建
