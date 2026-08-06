# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。编号取末尾最大 `T-xxx` + 1，不复用历史 ID。

## T-036: 修复命令语义选项值/程序串泄漏为路径 intent

**Kind:** bug
**Status:** in-progress
**Origin:** C-001（同一变更移除 candidates.md 的 C-001 条目——迁移协议）

**Goal:** 修复 5 项选项值泄漏（truncate/install 选项值、sed/awk 程序串、sed -i 表达式串、find exec 参数），消除虚假路径 intent，避免空路径与误判路径进入 PathPolicy。

### Architecture

三个 adapter 分别修复：
- **filesystem.ts**：命令表新增 `valueOptions`/`attachedOptions`，analyze 的位置参数过滤跳过选项值（truncate `-s/--size`；install `-m/-o/-g/-t`）。
- **text-transform.ts**：sed/awk 首个位置参数按程序跳过（GNU 语义，未出现 `-e/-f` 时）；`sawWrite` 信号与 intents 解耦为独立布尔；移除 `write:""` 空路径标记（编译器已有 cwd 保守写回退，见 shell-compiler.ts:119-122，空路径反而产生虚假 PathPolicy 检查）。
- **search.ts**：`-exec/-execdir/-ok` 后整体消费到 `+`（含）或命令末尾（lexer 对 `\;` 的转义集不含 `;`，`\;` 产生 "\" token + 命令分隔符，无法用 ";" 检测终止）。

### Out of Scope

- `install -t DIR` 精确建模（write intent on 目标目录）暂缓——本次跳过其值避免 cp-like 倒置，保守写兜底；建模另立。
- 其他命令/其他选项不涉及；C-001 其余内容经本任务后全部消除。

### Requirements

1. filesystem：truncate/install 选项值不再泄漏为路径 intent。
2. text-transform：sed/awk 经典程序串不再成为 read/write intent；`write:""` 标记移除（`sawWrite` 独立布尔维持 in-place 转换与 modify 分类）。
3. search：find exec 参数不再成为 search 根。
4. 测试期望更新（TDD RED）→ adapter 修复（GREEN）→ 全量 531+ 用例全绿。
5. candidates.md 移除 C-001（同一变更，Origin: C-001 保留在任务记录）。

### Verification

- `npm test` 全绿（原 531 用例中受影响行的期望已更新）。
- 语义核对：`truncate -s 0 log.txt` → `[write:log.txt]`；`install -m 755 src dst` → `[read:src, write:dst]`；`sed 's/x/y/' file` → `[read:file]`；`sed -i 's/x/y/' file` → `[write:file]`；`find -exec rm {} \;` → `[search:.]`。
- `sed -i 's/x/y/'`（无文件）→ 零 intents，编译器 cwd 保守写兜底（shell-compiler.ts 已验证）。
- gate 决策抽查：受影响命令的编译结果无虚假路径检查。

### Durable Update Checklist

- [ ] 验证通过后：更新本记录 Status → `verified`，并清空 Plan 节；Task Record 编号不复用。
- [ ] C-001 条目已随本任务移除（迁移协议）；无其他长期信息变更。
