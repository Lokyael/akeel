# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0138: 迁移 Git 分析器至分段解析架构并彻底退役 option-scanner

- **Kind:** refactor
- **Status:** in-progress
- **Origin:** D-067
- **Reversal surface:** engineering

### Background & Goal

在 T-0136 与 T-0137 中，我们成功构建了纯语法的确定性分段参数解析原语（`segment-parser.ts`），并将 `herdr`、`python-tools`、`package-managers`、`uv` 4 大程序族全部迁移完毕。目前整个仓库中唯一仍在依赖旧 `option-scanner.ts` 的只剩下 `git.ts`。
当前 `git.ts` 内部存在全局前置选项、子命令选项、路径提取、未知选项等多达 4~6 遍的独立参数扫描，并维护了 5 个平行的选项集合，存在集合不同步与维护摩擦的风险。

本任务目标：
1. 增强 `segment-parser.ts` 使其支持 Git inspect 纯数字缩写标志（`-[1-9][0-9]*`）与两段式路由；
2. 将 `git.ts` 全面重构为基于 `segment-parser.ts` 的两阶段架构：
   - Stage 1: 解析全局前置选项并路由子命令，解析子命令作用域选项与操作数；
   - Stage 2: 依据子命令类型构建私有 Git Invocation Plan 并投影为统一 `ProgramSemantic`；
3. 严格保持 Git 现有的所有安全不变量、路径提取规则、CWD 顺序累积、Transport 过滤与 fail-closed 边界；
4. 物理移除已无消费者的 `option-scanner.ts` 及旧的辅助函数，使代码库彻底终结双解析器并存状态；
5. 全量回归测试绿灯闭环。

### Out of Scope

- 不修改 Git 的安全判定语义（不放宽任何破坏性操作、不放宽外部 transport、不放宽 commit / add / restore / checkout 的既有安全防线）。
- 不修改 coreutils、chmod、find 等平坦命令分析器。
- 不改动 Canonical 编译与 Policy Kernel 的外部接口。

### Requirements

- **REQ-1 (分段解析器能力增强):**
  - `segment-parser.ts` 支持可选的 `isExtraOption` 规则或数字标志支持，优雅容纳 `git log -5` / `rev-list -10`，避免将纯数字限制判定为未知选项；
  - 保证原有 Herdr、Python 工具、包管理器、uv 行为 100% 保持不变。
- **REQ-2 (Git 两阶段架构重构):**
  - 第一阶段（全局分段）：解析前置 `-C`、`--git-dir`、`--work-tree` 等全局选项，准确定位子命令 token；
  - 第二阶段（子命令分段）：按 Inspect、Restore、Commit、Clone 等子命令专属契约一次性解析选项与操作数（包含严格后置于 `--` 的 pathspec）；
  - 第三阶段（语义投影）：严格保持 Git `-C` 的顺序 CWD 累积、本地 `file://` transport 校验、单文件裸 `rm`、commit 消息检查、restore/checkout 路径与 HEAD 校验、以及未知选项 fail-closed。
- **REQ-3 (彻底退役旧扫描器):**
  - 物理删除 `option-scanner.ts`；
  - 清理 `shared.ts` 中已无调用的旧扫描辅助函数；
  - 更新相关测试，确认无任何残存引用。
- **REQ-4 (安全与全量零回归):**
  - 全量 505+ 测试用例全部通过，保证 Git 所有端到端策略与安全边界 0 破坏、0 漂移。

### Plan

#### Slice 1: segment-parser 增强数字选项契约 (TDD)
- 在 `segment-parser.test.ts` 中增加纯数字缩写标志支持；
- 在 `segment-parser.ts` 中支持该契约；
- 验证 segment-parser 单元测试通过。

#### Slice 2: git.ts 全面重构迁入 segment-parser (TDD)
- 重构 `git.ts` 采用分段两阶段架构；
- 运行 `shell-semantics.test.ts` 与 `shell-policy.test.ts` 验证 Git 全量用例通过。

#### Slice 3: 物理退役 option-scanner 与清理 shared 遗留
- 删除 `option-scanner.ts`；
- 清理 `shared.ts` 中未使用的 `firstCommand` 和 `optionPaths`；
- 更新 `tests/access-gate/access-decision/core/program-semantics.test.ts`；
- 验证依赖边界与全量测试。

#### Slice 4: 全量回归、文档同步与清档
- 运行全量 `npm test`；
- 清档 `docs/task.md`。

### Durable Updates Checklist
- [ ] 代码层 — `git.ts` 完成两阶段解耦，`option-scanner.ts` 彻底物理退役
- [ ] 测试层 — 全量回归测试通过
- [ ] `docs/task.md` — 验证全绿后清档

## T-0139: 待创建

