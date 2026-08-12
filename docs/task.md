# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-059: 选项/子命令遍历收敛到 option-parse 单引擎 + 引擎深化

**Goal:** 消除 command-semantics 内五套并行的选项/子命令遍历实现（shared.ts 提取器家族、git 手写 finder/gitPathOpts/analyzeGitBranch、interpreters 内联 finder），全部收敛到 option-parse 深引擎；顺带完成引擎深化（缓存/校验/class 调节原语）与 lexer span 直记。行为零损失为原则，有意行为变化测试锁定。

**Acceptance:**
- [ ] shared.ts 的 `collectSubcommandTokens`/`firstNonOptionIndex`/`extractSubcommand` 删除，`semanticsFromRules` 吃 positional 数组
- [ ] build/package/python-tools/herdr 转换：valueOpts → Opt(expression)，`opaqueOnUnknown:false`，fallback 保留
- [ ] overrides：`firstSubcommand` → positional[0]；参数类型放宽为 `ShellArg[]`；`fullSubcommand` 保留
- [ ] git：GIT_GLOBAL_OPTS + 注册表统一 `(subArgs, pathIntents)` + stash/bundle 规则表化 + BRANCH_OPTS + GIT_CLASSIFY upgrade/downgrade 数据化；`git -- <cmd>` 新行为测试
- [ ] interpreters：flags 判断 inspect/execute，finder/fallback/规则表删除
- [ ] 引擎：buildIndex WeakMap 缓存、suffix/attached 前缀重叠 fail-fast、consumeUntil 校验、class 调节原语（upgradeTo/downgradeTo）并迁移 date/search/text-transform/python-tools
- [ ] SemanticContext 死契约处理（adapter 签名删 context）
- [ ] lexer span 直记（删 indexOf 回填循环）
- [ ] 每步 `npm test` 全绿；opaque 判据 + valueOpts→expression + class 调节并入 D-040 补记

## T-060: 待创建
