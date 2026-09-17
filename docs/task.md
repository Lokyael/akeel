# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0122: 纳管文本只读转换命令 sort, uniq, tr 并澄清 awk/sed 边界（C-025 历史差异落地）

- **Kind:** feature
- **Status:** in-progress
- **Origin:** C-025
- **Reversal surface:** engineering

### Background & Goal
在 C-025 历史差异复核中，“Text-transform adapter family”细项识别出现存 Coreutils 与文本处理命令的覆盖缺口与安全边界：
1. **常用只读文本命令缺失导致摩擦**：日常代码审查与会话中，模型频繁使用 `sort`、`uniq`、`tr` 处理文件与流。当前这三个命令因未建模而落入 `unknown + opaque`，在 `review` 预设下直接被拒绝（deny），在 `guided` 预设下被迫触发不必要的人类审批（ask），与已纳管的 `cut`、`wc`、`cat`、`head`、`tail` 产生严重割裂。
2. **文本工具内部隐藏安全暗礁**：
   - `sort` 存在 `-o` 原地覆写、`--compress-program` 隐式任意代码执行、`--files0-from` 隐式文件泄露等高危选项；
   - `uniq` 在 POSIX 中支持双操作数（`uniq in out` 会覆写第二个文件），直接放行会导致静默写穿透；
   - `awk` 是图灵完备语言，包含 `system()` 子进程执行和内置重定向；`sed` 包含 `-i` 原地写、`w` 写文件与 `e` 外部命令执行扩展，无法作为纯 Coreutils inspect 工具对待。
3. **架构契合原则**：保持 `coreutils.ts` 与 `invocation.ts` 的命令类别 1:1 静态映射不变量，不为单个工具打破静态纯度，不强行把内联脚本解释器塞进 `interpreters.ts`。

**目标**：
- 在 `coreutils.ts` 与 `invocation.ts` 中纳管 `sort`、`uniq`、`tr` 作为纯 `inspect` Coreutils 命令（effects: `["read"]` 或 `[]`）；
- 封死 `sort` 的危险选项（`-o`, `--compress-program`, `--files0-from`, `-T`, `-m` 等直接 fail-closed）；
- 限制 `uniq` 至多 1 个操作数，双操作数形式由于涉及写入直接报 `unsupported-syntax` fail-closed，引导走受管 Shell 重定向；
- 明确澄清 `awk` 和 `sed` 维持 `unknown + opaque`，由现行策略轴统一管控，引导使用 Direct-first。

### Out of Scope
- 支持通用 Shell Pipeline（`|` 目前在 Flow 层由语法 fail-closed 保持不变，由独立候选处理）。
- 为 `sed` 编写脚本微语言 AST 解析器以开放只读子集（维持 `opaque` 并引导 Direct `edit`/`read`）。
- 为 `awk` 建立专用解释器或选项解析器（维持 `unknown + opaque`）。
- 支持 `sort -o` 选项写入（文件输出强制外置为受管 Shell 重定向）。

### Requirements
- **REQ-1 (tr Contract & Semantics):**
  - `tr` 在 `coreutils.ts` 注册，支持常用字符集选项（`-c`, `-C`, `-d`, `-s`, `-t` 等）；
  - `tr` 无路径操作数（纯流过滤），`commandClass: "inspect"`, `effects: []`, `paths: []`。
- **REQ-2 (sort Contract & Semantics):**
  - `sort` 在 `coreutils.ts` 注册，支持常用排序选项（短选项、短选项簇连写 `-nru`、`-k`、`-t` 等）；
  - 封死高危/写入选项：`-o`, `--output`, `--compress-program`, `--files0-from`, `-T`, `--temporary-directory`, `-m`, `--merge` 设为 `unsupported`（fail-closed）；
  - 所有文件操作数作为 `source` 路径事实提取；0 操作数时 `paths: []`；`commandClass: "inspect"`, `effects: ["read"]`。
- **REQ-3 (uniq Contract & Semantics):**
  - `uniq` 在 `coreutils.ts` 注册，支持常用过滤选项（`-c`, `-d`, `-u`, `-i`, `-f`, `-s`, `-w`, `-z` 等）；
  - 单操作数（`uniq file.txt`）提取为 `source` 路径，`commandClass: "inspect"`, `effects: ["read"]`；0 操作数时 `paths: []`；
  - 2 个及以上操作数（`uniq in out`）触发 `unsupported-syntax` fail-closed 阻断，杜绝静默写入。
- **REQ-4 (Invocation & Policy Integration):**
  - `invocation.ts` 中 `inspectionCommands` 同步增加 `"sort"`, `"uniq"`, `"tr"`；
  - 在 `review`、`guided`、`develop` 预设下，`sort file.txt`、`uniq file.txt`、`tr a b` 的只读操作均在路径合法时直接 `allow`；
  - 路径受阻或凭据工件路径（如 `sort /blocked/file`、`uniq ~/.pi/agent/auth.json`）在所有模式下被 Mandatory Boundary 拦截；
  - `awk`、`sed` 保持 `unknown + opaque` 状态，不赋予 Coreutils inspect 特权。

### Design
1. 在 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`：
   - 在 `contracts` Map 中新增 `tr`, `uniq`, `sort` 的 `BoundedOptionContract`；
   - 在 `inspection` Set 中加入 `"tr"`, `"uniq"`, `"sort"`；
   - 在 `analyzeCoreutilsProgram` 中，针对 `uniq` 检查 `parsed.operands.length > 1`，若是则返回 `reject`（`unsupported-syntax`）；
   - 在 `analyzeCoreutilsComplete` 中：
     - `name === "sort"`：将全部 `operands` 转换为 `source` 路径；
     - `name === "uniq"`：将至多 1 个 `operand` 转换为 `source` 路径；
     - `name === "tr"`：不产生任何路径事实（纯流）；`effects` 为空列表（无文件系统读取副作用）。
2. 在 `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`：
   - 在 `inspectionCommands` Set 中追加 `"sort"`, `"uniq"`, `"tr"`。
3. 单元测试与端到端测试：
   - 在 `tests/access-gate/access-decision/core/shell-semantics.test.ts` 中增加 `tr`, `sort`, `uniq` 的合同与选项测试；
   - 在 `tests/access-gate/access-decision/core/shell-policy.test.ts` 中验证全预设（特别是 `review`）下的放行与路径/凭据防御。

### Plan

#### Slice 1: Coreutils Contracts 与语义解析实现 (TDD)
**Goal:** 在 `coreutils.ts` 中实现 `tr`、`sort`、`uniq` 的选项合同与路径提取，阻断危险选项与双操作数，编写针对性单元测试。
**Requirements covered:** REQ-1, REQ-2, REQ-3
**Depends on:** none

**Acceptance Criteria:**
- [ ] `tr` 支持常用字符集选项，不提取路径，`effects: []`。
- [ ] `sort` 支持短选项簇与排序参数，提取全部文件为 source 路径。
- [ ] `sort -o`、`sort --compress-program` 等被 `unsupported-syntax` 阻断。
- [ ] `uniq` 单操作数提取 source 路径；双操作数被 `unsupported-syntax` 阻断。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-semantics.test.ts`

#### Slice 2: Invocation 集成与策略端到端验证 (TDD)
**Goal:** 在 `invocation.ts` 中注册 `inspectionCommands`，增加端到端策略求值测试（特别是 `review` 模式下直接放行，以及对敏感/受阻路径的拦截）。
**Requirements covered:** REQ-4
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] `review` 模式下 `sort file.txt`、`uniq file.txt` 允许放行（`allow`）。
- [ ] 受阻路径或凭据路径被 Mandatory Boundary 拦截。
- [ ] `awk` 和 `sed` 保持 `unknown + opaque`，在 `review` 模式下保持拒绝。

**Files and Seams:**
- Modify: `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/invocation.ts`
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`

**Verification:**
- `npm run test:file -- tests/access-gate/access-decision/core/shell-policy.test.ts`

#### Slice 3: 全量回归、文档同步与 Task 清档
**Goal:** 运行 `npm test` 全量通过；更新 `docs/candidates.md`（C-025 记录）、`docs/decisions.md`（D-067）与 `CONTEXT.md`；清档 `docs/task.md`。
**Requirements covered:** 全部
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] `npm test` 全套通过。
- [ ] 文档更新无死链、格式合规。
- [ ] Task 章节清空。

**Files and Seams:**
- Modify: `docs/candidates.md`
- Modify: `docs/decisions.md`
- Modify: `CONTEXT.md`
- Modify: `docs/task.md`

**Verification:**
- `npm test`

### Durable Updates Checklist
- [ ] `docs/decisions.md` — 更新 D-067 Coreutils 覆盖范围与 text-transform 边界澄清
- [ ] `CONTEXT.md` — 同步更新 Architecture
- [ ] `docs/candidates.md` — 更新 C-025 记录该细项落地

## T-0123: 待创建

