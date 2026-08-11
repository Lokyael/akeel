# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md`、`docs/security-boundaries.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-051: 子代理 Profile 映射实施（D-039）

**Kind:** feature

**Status:** verified

实施完成：T0/T1 档内置 profile（builtins.json）、`subagentProfiles` 覆盖键（validate/load/resolve 全链）、session_start env 检测 + `PI_KEEL_PARENT_TIER` 传播 + 钳制（min）、git.ts `branch -m/-M` 修复。npm test 666 全绿（新增 subagent-tiers/subagent-session/git 回归测试；profile-chain 不变式更新含子代理档）。与 D-039/R-17 一致，无文档修订。用户侧配置（scout 删 write+bash；researcher 不动）见 D-039 Impact。

## T-052: 架构深化——子代理编排收敛 + git branch 解析器 + 类型精确化（architecture review）

**Kind:** refactor

**Status:** verified

实施完成：C1 新建 `session/subagent-init.ts`（applySubagentProfile/publishParentTier，env 参数化）+ index.ts 两处一行调用 + isSubagentProcess 参数化，新增 subagent-init.test.ts 函数级 10 用例；C2 `analyzeGitBranch` 正向解析（delete>force>move>upstream>copy>list>create 优先级）从 GIT_CMDS 摘出 branch 规则，修正创建/复制/upstream 误分类，补 5 条 branch 矩阵用例；C3 RawProfiles.subagentProfiles → `Record<string,string>`（诚实形状）、mergeSources cast 消除、窄化断言移至 resolve（validate 后安全位置）。npm test 682 全绿。集成测试（subagent-session 8 用例）保留且行为不变。

## T-053: 架构深化#2——测试 env 样板统一 + git 解析器注册表 + /profile 渲染迁移（architecture review #2）

**Kind:** refactor

**Status:** verified

实施完成：C1 `harness.ts` 加 `makeEnv`/`withEnv`（finally 保证恢复），三测试文件统一（tiers 手写 save/restore → withEnv；init 本地 makeEnv → 共享；session snapshot/restore 删除 → 8 测试 withEnv 包装）；C2 `GIT_SUBCOMMAND_PARSERS` 注册表（config 保留 pathIntents 合并、branch 正向解析），analyze() if 分发 → 注册表 + GIT_CMDS 表兜底；C3 `profileStatus` 迁移 `ui/profile-status.ts`（移动不重构）。npm test 682 全绿（行为零变化）。

## T-054: command-semantics 审计修复——F1-F4（inspect 写出逃逸 / 选项值误触发 / install -t / 裸 stash）

**Kind:** bug

**Status:** verified

审计发现并经 TDD 修复的四项：

- **F1（安全）** git `archive -o/--output` 写输出文件：原归 inspect（所有内置 profile allow）且不提取输出路径 → 写出绕过路径策略。修复：inspect pattern 加 `-o/--output` 负前瞻（`\s-` 前缀锚定避免子串误匹配），新增 modify 条目 + `archiveOutputPaths` 提取四种形式（`-o FILE`/`--output FILE`/`--output=FILE`/`-oFILE`）产出 write intent。复审时发现 `-oFILE` 附着形式因无词边界仍落 inspect（同样漏洞），随回归测试补修 pattern。
- **F2** 选项值误触发标志检测：`find . -name "-delete"` 被升级 modify、`grep -e -r` 误判递归。修复：`consumedValueIdx` 记录被取值选项消费的 token，`hasOption` 检测改用排除后的 `flagArgs`（破坏性与递归检测共用）。
- **F3** `install -t/--target-directory` 目标目录未建模（cp/mv/ln 已支持）。修复：install paths 改用共享 `copyLikePaths(args, consumed, "read")`。
- **F4** 裸 `git stash` / `git stash -m msg`（改动工作树）被归 unknown/opaque 硬拒。修复：新增 modify 条目，负前瞻排除已知子命令（list/show/push/save/pop/apply/drop/clear）保持既有分类（inspect/destroy 不变）。

与 D-024/D-027/D-034 一致，无新决策；无文档修订。npm test 704 全绿（新增 22 条回归测试：git 15、search 3、fs 4）。

### Security Review（deff587...2ca72c7）

**结论：无未处理的 HIGH findings（≥8 置信度），Gate 通过。**

- 写能力命令不得落 inspect 的不变量：`archive` 四形式（`-o FILE`/`--output FILE`/`--output=`/`-oFILE`）均 modify + write intent；`-oFILE` 附着形式曾实测落 inspect（真实漏洞），随复审测试修复，10/10 置信度已关闭。
- 裸 `stash` unknown→modify：非新能力（= `stash push` 同操作），cwd fallback write 门控；keel-plan/keel-read 下 gate 结果不变。
- `flagArgs` 检测：`-delete` 永不作为值消费、`-exec` 族不被排除 → 无假阴性路径；`-name "-delete"` 假阳性消除（安全方向）。
- `install -t` 目标目录 intent 精确化（更严格）。
- 排除项：SQLi/XSS/反序列化/加密/模板注入不适用；无 eval、无输入拼接；secrets 零命中。
- 残余风险（前存在，非本 diff 引入，全部过拒方向）：`install -d` 目标目录未建模（cwd fallback 兜底）、`git -c key=val` 误解析 opaque 拒（过拒非绕过）、`git format-patch/bundle` 等写命令 opaque 拒（过拒非绕过）。

#### 残余风险处理（同一变更集内完成）

- **R1 `install -d/--directory`（mkdir 模式）**：`extractPositionalArgs` 新增 `flags` 输出（短选项 cluster 逐字符、长选项整体），install paths 检测 `-d` → 位置参数全部为目录 write intent。
- **R2 `git -c key=val`**：subcommand finder 跳过 `-c` 及其值（附着形式 `-ckey=val` 原已跳过）；分类正确化，最终决策仍由 class + path policy 门控，无逃逸面。
- **R3 `git format-patch`/`bundle`**：format-patch → modify（`-o/--output-directory` write intent，无 `-o` 时 cwd fallback）；bundle create → modify + 文件 write intent，verify/list/header → inspect，unpack → modify。`archiveOutputPaths` 泛化为 `writeOutputArgs`（分离/等号/短附着三形式）供 archive 与 format-patch 复用。

### Security Review 2（deff587...ec84047，D-040 A/B 架构深化）

**结论：无未处理的 HIGH findings（≥8 置信度），Gate 通过。D-040 为净收紧。**

- GIT_CLASSIFY token 级匹配（D-040）：`-oFILE` 类写出逃逸结构性消除（不再 join 字符串），`--force-with-lease` prefix → destroy、`reset HEAD --hard` token 级命中；upgrade 优先 fail-closed；无匹配 → opaque。
- option-parse 引擎：破坏性检测（-delete/-execdir/-okdir 新建模堵洞）→ flag+write → sawWrite → modify；`-exec` 区内 token 不参与 flags（正确）；fs/read opaque 传递 bug 被收紧测试当场捕获并修复。
- opaqueOnUnknown 收紧（search/fs/read true）：未知选项静默 → opaque 硬拒（`cp -z`/`wc --bogus`/`grep --bogus-flag` 锁定）；高频 flag 全建模避免日常误拒（`cp -r`/`rm -rf`/`find -print`/`wc -l` 锁定）；git 子集提取 false。
- 类别：SQLi/XSS/反序列化/加密/模板不适用；无 eval/拼接；secrets 零命中；路径遍历由 path/policy 统一裁决（未改）。
- 残余风险（前存在，非本 diff 引入，fail-safe 方向）：`dd if=/of=` 目标未建模（cwd fallback 兜底）、`git stash --help` 过拒。

#### 残余风险处理（后续变更集）

- **R4 `dd if=/of=` 读写目标建模**：dd 的 key=value 参数（不以 `-` 开头，引擎当位置参数）在 adapter 层提取——`of=` → write intent、`if=` → read intent，其余（bs/count/skip）忽略。写目标不再依赖 cwd fallback。
- **R5 `git stash --help` / `git help <cmd>` 过拒**：stash parser 识别 `--help`/`-h`/`--version` → inspect；`help` 加入 GIT_CLASSIFY（inspect）。

## T-055: keel-build home 配置写 ask（~/** 规则 + home 形式规则匹配）

**Kind:** feature

**Status:** verified

实施完成：`path/policy.ts` 抽取 `homeForm()`（与 blocked 候选同源），`selectedRule` 对 home 路径追加 `~/` 形式匹配——此前 profile 规则只匹配 virtualPath（外部 scope 为绝对路径），`~/...` 规则是死配置；`builtins.json` keel-build 新增 `~/**` write=ask 并更新 description——非 blocked 的 home 配置写（`~/.gitconfig`、`~/.npmrc` 等）从 profile deny 变 ask，blocked 家目录路径（`~/.ssh/**`、`~/.aws/**` 等）仍硬拒不可覆盖。README Profiles 段落补充路径规则形式说明；security-boundaries R-15 增补。npm test 721 全绿（新增 path-policy 2 用例、gate-policy-matrix 2 用例；profile-chain keel-build 规则顺序断言更新）。

## T-056: 待创建
