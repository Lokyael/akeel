# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-071: AKeel 独立仓库迁移

**Kind:** maintenance
**Status:** done
**Goal:** 将当前项目迁移为独立的 `Lokyael/akeel` 仓库，保留提交历史并把所有历史 author/committer 统一为 Lokyael 的 GitHub 身份。

### Closure

按用户明确要求关闭本任务；历史仓库迁移的操作性收尾不再作为 AKeel 当前工作树的活跃任务追踪。

## T-073: 只读策略修改提醒 Guidance

**Kind:** feature
**Status:** done
**Goal:** 在只读 `review` preset 下拦截普通 Direct 修改时返回静态切换 Guidance，同时保持硬边界和其他拒绝路径不被弱化。

### Architecture

Guidance 只在 runtime host-facing 渲染层根据已冻结的 active preset 与 `policy-denied` 结果选择；Canonical、Admission 和 Policy Kernel 不读取提示文案，也不自动批准或切换策略。Shell、硬边界、敏感路径、破坏性和未知操作继续使用原有 fail-closed 文案。

### Out of Scope

- **自动识别规划是否完成**：Gate 不解释对话阶段或任务意图。
- **自动切换或覆盖 deny**：策略切换仍需用户显式执行 `/policy`。
- **Shell 动态提醒**：等待更细粒度的 Shell 拒绝原因合同。

### Evidence

- [x] `npm test`
- [x] `git diff --check`

## T-075: Access Gate 显式禁用模式

**Kind:** feature
**Status:** done
**Goal:** 允许用户在 `policy.yaml` 中显式关闭 AKeel Access Gate，同时保留 bootstrap 原则与 skills。

### Architecture

新增严格的 `accessGate: disabled` policy 形式；缺省仍启用 Gate，禁用形式不得与 `paths`、`commands` 或 `presets` 混用。Runtime 在识别到已验证的禁用状态后不建立 Project/Decision service，并让所有 `tool_call` passthrough；`src/bootstrap/` 与 `skills/` 不受影响。

### Out of Scope

- **部分绕过**：不增加按工具、按路径或按拒绝码的软绕过；需要禁用时由用户显式关闭整个 Gate。
- **安全替代品**：不提供 OS sandbox、容器或新的运行时安全层；Gate 禁用期间 AKeel 不提供操作准入保证。
- **运行时热切换**：不在会话中动态开关 Gate；修改配置后重新启动会话。

### Evidence

- [x] `npm test`
- [x] `git diff --check`

## T-076: Canonical Program Semantic Families

**Kind:** feature
**Status:** done
**Goal:** 在新 Canonical Shell 管线中以统一的程序调用与选项扫描 seam 接入 Git、解释器、Python 工具、uv、npm/pnpm/yarn/npx 语义，并对不可证明的委托执行保持 fail-closed。

### Architecture

`core/program-semantics/` 只负责从已扫描的 Shell invocation 产生分类、效果、路径意图和 bounded/unbounded 路径知识；registry 仅做可执行文件分派，Policy 与 host 不进入该层。`compileShell` 仍是唯一 Canonical 路径解析点，Admission/Policy 继续只消费窄投影。已知且完整建模的命令可按 preset 决策，解释器、脚本运行器、包安装与未知子命令等无法证明运行期路径访问的命令保持 opaque。

### Out of Scope

- **网络权限轴**：当前 Policy 没有独立 network 轴，npm/uv/Git 的网络行为仅作为分类依据，不新增授权字段。
- **执行期沙箱**：不消除 Python/Node/npm lifecycle/Git hook 的运行期任意访问；需要独立 sandbox 合同后再改变 unbounded 处理。
- **旧 adapter 兼容**：不 import、复制或包装 `c52bd1d` 前的 command-semantics 实现；旧代码只提供待重新证明的场景清单。
- **完整 CLI 方言**：仅实现 Linux/GNU 合同下有证据的高频子集，未知选项、pathspec 和路径基准无法证明时 fail-closed。

### Implementation Tasks

1. 在新 public core seam 增加 invocation、semantic fact、选项扫描和 registry 的失败测试。
2. 实现 registry 与 bounded/unbounded 事实转换，并保持现有 Shell builtin 行为。
3. 以测试先行接入 Git、解释器和 Python 工具语义。
4. 以测试先行接入 uv、npm/pnpm/yarn/npx 语义；不递归分析委托的子命令。
5. 在 Canonical 阶段统一处理命令局部路径基准、隐式 scope 和路径边界回归。
6. 同步 core 导出、文档与决策引用，运行完整验证。

### Acceptance

- `git status/diff/log/show` 在项目 context 下不再因 unknown opaque 被无条件拦截；未知 Git 子命令仍 hard-boundary。
- 已建模的 Git 路径、输出路径和危险选项经过同一 Canonical path boundary；解释器、uv run、npm run/install、npx 等 unbounded execution 不因 develop allow 绕过硬边界。
- 现有 Shell、Direct、runtime 测试保持通过；新增测试通过 public seams 验证，不依赖旧实现或旧 DTO。
- `npm test`、`git diff --check` 和工作树检查有新鲜证据。

### Evidence

- [x] `npm test`（239 tests）
- [x] `git diff --check`
- [x] `git status --short`

## T-077: Program Semantic Security Hardening

**Kind:** maintenance
**Status:** done
**Goal:** 修复 T-076 审查发现的程序语义 fail-open 与 Shell 路径事实丢失，并使实现与现行安全合同一致。

### Architecture

继续由 `compileShell` 发行一次性 Canonical 路径事实；程序语义层只负责消费已扫描的 invocation，并把未知选项、外部配置范围、递归隐式作用域和未建模副作用转换为显式路径或 opaque/hard-boundary 事实。Admission/Policy 不重新解析命令。

### Out of Scope

- **Git command-local CWD：** `-C`、`--git-dir`、`--work-tree` 的完整 canonicalization 另行设计 command-local path seam；本任务只保证未 canonicalize 时无条件 fail-closed。
- **完整 CLI 方言：** 不扩展所有 Git、uv、npm 或 Python 工具选项；无法证明的选项继续 fail-closed。
- **网络权限轴和执行期沙箱：** 仍不新增 network policy 或运行期隔离能力。

### Implementation Tasks

1. 以回归测试锁定递归 `grep` 带重定向时仍检查 cwd、Git `-c`/配置文件范围、clone value options、npm/uv 未知选项和 `ruff clean` 的边界行为。
2. 在最小语义入口修复上述路径/effect/opaque 事实，使每个回归测试先失败后通过。
3. 按 D-018 将 `<>` 和 `2<>` 按 write 侧建模，更新 Shell 编译测试与决策引用。
4. 同步 T-076 的验收证据、README/CONTEXT 中的行为描述，记录剩余 command-local CWD 与 option scanner seam 风险。
5. 运行定向回归、完整 `npm test`、`git diff --check` 和工作树检查。

### Acceptance

- 递归 `grep` 即使有输出重定向，也不会绕过 blocked descendants。
- `git -c`、`git config --global/--system/--file/-f`、错误或未知的 npm/uv 选项、`ruff clean` 不得在项目路径边界下错误放行。
- Git clone 的 option value 不被误判为 source/target；未能证明的 clone 形态 fail-closed。
- `<>`/`2<>` 产生 write 侧路径/effect，并遵守现有 write⇒read 合同。
- 所有新增行为由 public Shell compile/admission seam 测试，验证证据新鲜且文档引用一致。

### Review Findings

- [x] 递归 `grep` 的重定向组合已恢复隐式 cwd 路径事实，阻断 blocked descendants 绕过。
- [x] Git `-c`、未 canonicalize 的 `-C/--git-dir/--work-tree`、配置范围和配置文件路径已进入 hard-boundary 或 Canonical path 检查。
- [x] Git clone 的 depth/template/reference 选项值不再泄漏为位置参数路径；`--separate-git-dir`、`--upload-pack`、`--config` 和未证明的 clone 形态 fail-closed。
- [x] Git show/log 等 inspect 命令的输出路径、npm global 等号形式、npm/uv 未知选项和 `ruff clean` 已保持 fail-closed。
- [x] Git `file://` transport、fetch/pull/push 本地仓库参数与配置间接 remote、ls-remote/remote alias、init template/separate-git-dir、submodule add/update/foreach 和 upload-pack 路径已进入 Canonical boundary。
- [x] `<>`/`2<>` 已按 write-side target 建模，符合 D-018。
- [ ] `destroy: ask` 合同仍待独立任务；Git command-local CWD 与统一 option scanner 已由 T-078 覆盖。

### Evidence

- [x] 定向回归测试：Shell compile/semantics/policy，78 tests passed
- [x] `npm test`：242 tests passed
- [x] `git diff --check`
- [x] `git status --short`（仅预期工作树修改）

## T-078: Git Command-Local Path Canonicalization

**Kind:** feature
**Status:** done
**Goal:** 在 Canonical 编译阶段统一解析 Git 的命令局部路径基准，使 `develop` 只放行路径事实可证明且受同一 allowed/blocked boundary 约束的本地 Git 工作流。

### Architecture

Canonical 编译是唯一拥有 Shell 当前 cwd、Git invocation 和路径解析上下文的边界。程序语义层不解析文件系统，也不发行绝对路径；它只发行带有显式基准选择的路径意图和按顺序排列的 command-local cwd 变更。当前 seam 已按命令 token 顺序解析 `-C`、`--git-dir` 和 `--work-tree` 的显式路径，并以所得 cwd 解析后续 repository、基本 literal path candidate、输出路径和显式本地 `file://` transport；Git magic/glob/exclusion pathspec、pathspec-from-file、外部 transport、host、alias 和间接 config 形式仍 fail-closed。Admission 只消费已解析的候选及 traversal prefixes，Policy 不重新解析 Git 参数。

Design Twice 结论：

1. **把解析后的绝对路径直接写回 `ProgramPath`：** 放弃。语义层没有 cwd/path resolver 输入，无法保证不同 Shell cwd 下结果正确，并会把 Canonical 解析职责泄漏到程序 adapter。
2. **为每个 `ProgramPath` 增加 `base`，另由语义层发行 ordered local-cwd facts：** 采用。当前接口区分 `invocation-cwd` 与 `command-cwd`，解析仍集中在 `compileShell`；多个 `-C` 可按 token 顺序组合，后续 location slice 可在同一基准事实上表达 `--git-dir`/`--work-tree`/local transport，Admission 保持窄投影。
3. **在 Admission 或 Policy 中再次解释 Git 参数：** 拒绝。会破坏一次 Canonical 解释、引入 filesystem observation 时点漂移，并形成第二套选项解析器。

### Out of Scope

- **远端网络授权轴：** 不增加 network policy；HTTPS/SSH 和其他外部 Git transport 在当前 bounded seam 中 hard-boundary，不作为本任务的网络授权。
- **Git 配置间接 remote：** 不读取或执行 Git config；alias、配置文件、ext transport 和无法静态证明的 remote 继续 fail-closed。
- **完整 Git CLI：** 不实现所有 pathspec、环境变量、hook、外部 diff/merge driver 或子命令；未建模形态继续 hard-boundary。

### Public Seam

**Files:**

- Modify: `src/access-gate/access-decision/core/program-semantics/types.ts`
- Modify: `src/access-gate/access-decision/core/program-semantics/option-scanner.ts`
- Modify: `src/access-gate/access-decision/core/program-semantics/index.ts`
- Modify: `src/access-gate/access-decision/core/shell-words.ts`
- Modify: `src/access-gate/access-decision/core/shell-compile.ts`
- Modify: `src/access-gate/access-decision/core/admission.ts`
- Test: `tests/access-gate/access-decision/core/program-semantics.test.ts`
- Test: `tests/access-gate/access-decision/core/shell-semantics.test.ts`
- Test: `tests/access-gate/access-decision/core/shell-compile.test.ts`
- Test: `tests/access-gate/access-decision/core/shell-policy.test.ts`
- Update: `README.md`, `CONTEXT.md`, `docs/decisions.md`, `docs/task.md`

**Produced facts:**

```typescript
export type ProgramPathBase = "invocation-cwd" | "command-cwd";

export type ProgramPath = Readonly<{
  readonly path: ShellPath;
  readonly start: number;
  readonly base: ProgramPathBase;
}>;

export type ProgramCwdChange = Readonly<{
  readonly path: ShellPath;
  readonly start: number;
  readonly base: ProgramPathBase;
}>;
```

`analyzeProgramCommand()` 只发行 `ProgramCwdChange` 与 `ProgramPathBase`，不调用 `resolveShellPath*`。`compileShell()` 消费这些事实并发行与现有 `ResolvedShellPath` 形状一致的 candidate/traversed 结果；缺失值、未知路径基准、非法组合和超出边界的解析结果 fail-closed。Admission 的公开行为仍只有 allow/ask/deny，不增加 Git 专用 policy 分支。

### Implementation Tasks

1. **冻结 Git `-C` 的失败测试。** 在 `shell-semantics.test.ts` 锁定单个、重复、separated 和 attached 形式的 `-C` invocation facts；在 `shell-compile.test.ts` 锁定 `git -C subdir diff -- file` 的 command-local path 解析结果，以及缺失值、动态值和未支持组合的拒绝结果。
2. **验证 RED。** 运行定向测试，确认新断言因当前实现仍将 `-C` 标为 hard-boundary 或使用错误基准而失败；失败原因必须来自缺少 command-local canonicalization，而不是测试输入错误。
3. **实现最小 `-C` vertical slice。** 在 program semantic types/index 中发行 ordered cwd/path-base facts；在 `compileShell` 按 token 顺序更新命令局部 cwd，并只在该处调用 `resolveShellPathWithTraversal`；保留已有 `-C` 外部路径和后续 Git path intents 的 traversal 证据。
4. **验证 GREEN。** 运行 `shell-semantics.test.ts`、`shell-compile.test.ts` 和 `shell-policy.test.ts`，确认项目内 `-C` 可按策略决策，项目外或 blocked descendant 仍为 `hard-boundary`，且 Admission/Policy 不重新解析命令。
5. **扩展 Git repository location seam。** 以失败测试分别锁定 `--git-dir`、`--work-tree` 的绝对值、相对值、attached/equals 形式和它们与 `-C` 的组合；明确二者是独立路径事实，不把它们错误当成 process cwd 变化。
6. **实现 location 与 local transport。** 让编译器在同一 Canonical context 下解析 repository scope、work-tree、git-dir、显式本地 `file://` remote、基本 literal path candidate 和输出目标；当前已完成前三类显式 location 与 local transport，Git magic/glob/exclusion pathspec、pathspec-from-file、config 间接 remote、hosted `file://`、外部/ext transport、动态值或无法确定基准的形态继续发行 hard-boundary/opaque 事实。
7. **补齐 public policy 回归。** 在 project context 下验证 `git status/diff/log/show`、`git add/commit` 的允许路径；验证 `git -C /outside`、`--git-dir=/outside`、`--work-tree=/outside`、local remote 和 blocked `.git` 后代不能因 `develop` allow 放行。
8. **同步 durable 文档。** 更新 README 的 Git 支持范围、CONTEXT Negative Space/Architecture、D-067 的 command-local seam 状态，并把 T-078 验收证据写入本记录；不恢复旧 adapter 或旧 parity expected values。
9. **最终验证。** 运行 `npm test`、`git diff --check`、`git status --short`，随后进行 `code-review` 和 `security-review`；只在验证结果与工作树状态均明确后提交。

### Acceptance

- `git -C <project-subdir> status/diff` 的 repository scope、基本 literal path candidate 和输出路径均以 Canonical 阶段解析后的 command-local cwd 为基准；magic/glob/exclusion pathspec 与 pathspec-from-file 继续 hard-boundary。
- `--git-dir` 与 `--work-tree` 的路径事实不被遗漏、不被误当成普通 positional argument，也不未经解析直接放行。
- `-C` 支持 separated、attached 和多个按顺序组合的形式；缺失值、动态值、未知选项和不确定基准 fail-closed。
- 项目外路径、blocked `.git` descendants、项目外 local remote、hosted `file://`、配置间接 remote 和未建模 transport 在 `develop` 下仍不可绕过 hard boundary；项目内显式 local `file://` remote 可按同一 boundary 评估。
- Admission/Policy 不包含 Git 参数解析或 filesystem resolution；所有路径候选和 traversal prefixes 来自同一次 Canonical compilation。
- 新行为通过 `compile → admission → policy` public seam 测试；`npm test`、`git diff --check` 和工作树检查有新鲜证据。

### Review Findings

- [x] 独立 code review：确认 `-C` 的 cwd 变更按 token 顺序解析，Admission/Policy 不重新解析 Git 参数。
- [x] 补充 public seam 回归：relative separated/attached `-C`、多重 `-C`、动态值、项目外路径和 blocked descendant。
- [x] README、CONTEXT 和 D-067 已同步已支持的 `-C`/`--git-dir`/`--work-tree` 与仍 fail-closed 的 location 形式。
- [x] security review：未知 Git global option 现在无论是否配置 path policy 都直接进入 `hard-boundary`，避免 helper 路径等选项造成 fail-open；复核未发现新的 CWE-22/CWE-78 fail-open。
- [x] 项目内显式 local `file://` transport、fetch/pull/push remote path 和 submodule local transport 已进入同一 Canonical boundary；大小写变体、host、alias、间接 config remote 与 submodule `--reference` 外部路径仍 fail-closed。
- [x] Git/npm/uv/Python 共用 option scanner，统一处理首个非选项、等号值和分离值；Git global options 也经过同一 scanner，未建模选项仍保持 opaque/hard-boundary。
- [x] 复核发现的大小写 `file://`、submodule alias/hosted source、submodule `--reference` path omission、recursive clone 和 scanner missing-value/direct-test 缺口已修复并覆盖。

### Progress Evidence

- [x] 定向 `program-semantics`/`shell-semantics`/`shell-policy`/`shell-compile` 测试：62 tests passed
- [x] `npm test`：256 tests passed
- [x] `git diff --check`
- [x] `git status --short`（26 个预期未提交路径，包含 2 个新增文件）

### Evidence

- [x] `npm test`：256 tests passed
- [x] `git diff --check`
- [x] `git status --short`：26 个预期未提交路径，包含 2 个新增文件
- [x] `code-review`：final standards review passed
- [x] `security-review`：final security review passed

## T-079: 待创建
