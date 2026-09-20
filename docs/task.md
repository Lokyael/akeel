# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0149: 为 which 建立有界 Shell inspect 语义

- **Kind:** feature
- **Status:** in-progress
- **Reversal surface:** engineering

### Background & Goal

`which <command>` 是常见的可执行文件路径查询，但当前 `which` 未进入封闭 Shell analyzer registry，因此被分类为 `unknown [opaque]` 并触发审批。为减少无风险路径查询的交互摩擦，在不扩大执行能力的前提下，为严格受限的单目标 `which` 建立 inspect/read 语义。

### Out of Scope

- 不支持 `which` 的别名、函数、多个目标、选项或 Shell 扩展行为；
- 不改变未知命令的 fail-closed 语义；
- 不放宽自定义路径形式、包装器、管道或重定向的准入。

### Requirements

- **REQ-1:** `which <bare-command-name>` 分类为 `inspect`，效果为 `read`，不产生文件路径事实且不标记 opaque。
- **REQ-2:** 选项、多个目标、空目标及动态/路径形式保持 fail-closed，不获得 `which` 的系统身份复用。
- **REQ-3:** 在 shell 语义与 policy seam 补充正反例测试，并保持全量验证通过。

### Plan

#### Slice 1: Shell analyzer contract
- 先在 `tests/access-gate/access-decision/core/shell-semantics.test.ts` 增加 `which` 正反例；
- 在 coreutils registry 中加入有界 `which` 合同与单目标校验；
- 增加 policy seam 允许 inspect 查询的断言。

#### Slice 2: Verification and records
- 运行相关测试、全量 `npm test` 与 `akeel_validate_records`；
- 同步当前架构事实并清理本 Task。

### Verification Evidence

- 待执行。

### Durable Updates Checklist

- [ ] `packages/access-gate/src/access-gate/access-decision/core/compilation/shell/programs/coreutils.ts`
- [ ] `tests/access-gate/access-decision/core/shell-semantics.test.ts`
- [ ] `tests/access-gate/access-decision/core/shell-policy.test.ts`
- [ ] `CONTEXT.md`
- [ ] `docs/task.md`

## T-0150: 待创建
