# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0132: Git inspect 选项建模：支持数值缩写限制与 branch --show-current

- **Kind:** feature
- **Reversal surface:** engineering

### Requirements

1. `git log` 与 `git rev-list` 支持 `-[1-9][0-9]*`（如 `-5`）数值行数限制缩写，作为安全 inspect 选项，不降级为 opaque，不发射路径事实。
2. `git branch --show-current` 作为已知安全选项纳入 `GIT_SAFE_OPTIONS`，在无额外操作数时作为纯只读 inspect 命令求值，不降级为 opaque。
3. 非 inspect 命令（如 `commit`、`add`、`checkout`）继续隔离，不得放行 `-[1-9][0-9]*` 选项。
4. 内置 `review` 预设下，`git log -5 --oneline` 与 `git branch --show-current` 直接返回 allow。

### Design

1. 在 `option-scanner.ts` 的 `hasUnknownOption` 中增加可选谓词 `isKnownExtra?: (name: string) => boolean`。
2. 在 `git.ts` 中定义 `isGitNumericLimitOption = (name: string) => (subcommand === "log" || subcommand === "rev-list") && /^-[1-9][0-9]*$/u.test(name)`，并在 `return result(...)` 的 `hasUnknownOption` 检查中传入。
3. 在 `git.ts` 的 `GIT_SAFE_OPTIONS` 中添加 `"--show-current"`。

### Plan

1. [x] 在 `docs/task.md` 建立 T-0132 并提交 checkpoint。
2. [ ] 在 `tests/access-gate/access-decision/core/shell-semantics.test.ts` 和 `shell-policy.test.ts` 中编写失败测试（TDD red）。
3. [ ] 修改 `option-scanner.ts` 和 `git.ts` 使测试通过（TDD green）。
4. [ ] 运行全套测试 `npm test`。
5. [ ] 更新 `CONTEXT.md` 和 `docs/decisions.md`。
6. [ ] 清理 `docs/task.md`。

## T-0133: 待创建

