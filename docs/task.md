# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。编号取末尾最大 `T-xxx` + 1，不复用历史 ID。

当前没有未完成的 Task Record。下一项工作应先创建新的 `draft` Task，并在实现前明确 Requirements、Architecture、Out of Scope 和 Verification。

## T-037: config 命令目标解析与读写分类

**Kind:** feature
**Status:** draft
**Origin:** C-005（同一变更移除 candidates.md 的 C-005 条目——迁移协议；C-005 来源为 R-11 效果关联 + R-15 直接出处）

**Goal:** 为 git/npm/pnpm config 命令建模配置层级目标解析与读写分类：消除读型 config 的假审批摩擦（`git config <key>` 无值被当 modify 而 ask），把写型 config 的路径检查从无关 cwd 兜底修正为真实配置文件目标（闭合 R-15 fail-open），并补齐 ask 侧路径 evidence（R-11 知情同意盲区）。

### Architecture

- **git.ts**：`/^config\b/` 拆分为读写两态解析：
  - 读特征（`--list/-l/-z`、`--get/--get-all/--get-regexp/--get-color/--get-colorbool`、单 positional key）→ `inspect` + read intent
  - 写特征（`--add/--unset/--unset-all/--remove-section/--rename-section/--edit/-e`、key+value 双 positional）→ `modify` + write intent
  - 无法判定 → 保守 `modify`（fail-closed，D-025）
  - 层级映射：`--global`→`~/.gitconfig`（exact）、`--system`→`/etc/gitconfig`（exact）、`--file=<p>`/`-f <p>`→精确（exact）、`--local`/无层级→`$cwd/.git/config`（conservative）
  - 未知层级选项 → `opaque`
- **package.ts**：npm/pnpm `config set/delete/edit` 从“modify 无 intent”升级为层级解析：`--userconfig=<p>`/`--globalconfig=<p>`→精确（exact）、`-g/--global` 与默认→`~/.npmrc`（exact，userconfig 为 npm 默认写层）；`config get/list` 维持 inspect
- **共享 helper**：层级→路径映射函数，两 adapter 复用（git.ts 或 package.ts 内导出）
- **cwd 兜底替换**：写型 config 产生真实目标 intent 后不再落 `shell-compiler.ts:122` 的 cwd 保守兜底（intents 非空即不触发）
- 复用既有机制：`confidence`（exact/conservative）、`opaque`、`source: "option"`（D-027 OptionSchema 风格）；不改 plan/verifier/Profile

### Out of Scope

- `git config --blob=<sha>`（git 对象非文件路径）
- `--worktree` 层级（git 2.20+，场景罕见）——不建模，落入未知层级 → opaque
- 其他配置写手（yarn/pip/uv/cargo/rustup 等）：D-024 用户 `command-overrides.yaml` 语义扩充入口
- 读型 config 无层级的合并读多文件展开（system+global+local 各一 intent）：只按显式层级产生 intent，无层级读保守处理

### Requirements

1. `git config <key>`（无值）→ inspect + 对应层级 read intent；keel-plan 下不再 ask。
2. `git config <key> <value>` / `--add/--unset/--edit` 等 → modify + 真实目标 write intent。
3. `git config --global x y` → write intent `~/.gitconfig`（exact）；`--system` → `/etc/gitconfig`；`--file=<p>` → `<p>`；无层级 → `$cwd/.git/config`（conservative）。
4. 未知层级/未知选项 → opaque（fail-closed，不猜目标）。
5. `npm config set` → write intent `~/.npmrc`（exact）；`--userconfig=<p>` → `<p>`；`npm config get/list` → inspect（维持）。
6. 测试（TDD RED）→ 实现（GREEN）→ `npm test` 全绿。
7. candidates.md 移除 C-005（同一变更，Origin: C-005 保留在任务记录）。

### Verification

- `npm test` 全绿（新增用例 + 既有 531+ 无回归）。
- 语义核对：
  - `git config user.name` → `[read:.git/config]`（conservative）
  - `git config user.name zev` → `[write:.git/config]`（conservative）
  - `git config --global user.name zev` → `[write:~/.gitconfig]`（exact）
  - `git config --file=conf.ini key v` → `[write:conf.ini]`（exact）
  - `git config --bogus key v` → opaque
  - `npm config set registry https://x` → `[write:~/.npmrc]`（exact）
- gate 决策抽查：keel-plan 下读型 config 编译为 inspect 放行；写型 config ask 侧 evidence 含完整目标路径；PathPolicy 对 `~/.gitconfig` 写按 Profile 决策（keel-* 默认 deny）。

### Durable Update Checklist

- [ ] 验证通过后：更新本记录 Status → `verified`，并清空 Plan 节；Task Record 编号不复用。
- [ ] R-15 复核：config 建模后“外部配置文件写入不经过 PathPolicy 检查”的适用范围收窄为未建模配置写手（yarn/pip/uv 等）；需在 security-boundaries.md 同步。
- [ ] C-005 条目已随本任务移除（迁移协议）。
