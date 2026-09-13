# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0101: 拆分 AKeel 可安装能力包

**Kind:** feature
**Status:** in-progress

### Goal

将 AKeel 从单一全量 Pi package 整理为三个可独立安装的能力包，并保留一个全量 `akeel` 包；不改变现有运行时语义、安全边界或技能内容。

### Requirements

- 提供三个可独立安装的 Pi package：
  - `akeel-guidance`：`bootstrap` + `skills`。
  - `akeel-access-gate`：Access Gate extension。
  - `akeel-context-pruner`：测试输出上下文裁剪 extension。
- 保留 `akeel` 全量包，能够一次加载上述三个能力，且不重复加载资源。
- `bootstrap` 与 `skills` 在运行时仍保持各自的加载机制，但作为同一 Guidance package 发布；不复制 `principles.md`。
- Access Gate 和 context-pruner 在缺少其他两个 package 时仍能独立加载，并保持现有行为与安全承诺。
- 更新 package manifest、发布目录、安装说明和相关开发校验，使独立包与全量包的资源声明可验证。
- 现有 Access Decision、Policy、credential boundary、`/policy`、Shell 语义和 context-pruner 行为不发生变化。

### Design

采用一个仓库维护三个可发布 package root，并由仓库根 package `akeel` 作为全量分发入口：

- `packages/guidance/` 持有 bootstrap 入口、`principles.md` 和 skills。
- `packages/access-gate/` 持有 Access Gate 入口及其运行时实现，声明 `yaml` runtime dependency。
- `packages/context-pruner/` 持有 context-pruner 入口及其实现。
- 根 `package.json` 的 `pi` manifest 指向三个 package root 中的资源；各子 package 的 `pi` manifest 只声明自身资源。
- 子 package 之间不建立运行时导入；Guidance 对 principles 的关系通过现有单一来源和文档说明维护，不复制规则文本。
- 继续使用 Pi 的 resource filtering 作为高级加载方式，但不把 filtering 当作三个独立包的替代品。

### Out of Scope

- **Access Decision 语义重构：** 本任务只调整分发边界，不改变 Canonical、Admission、Policy 或 Host contract；若需要改变，另立任务。
- **原则与技能内容重写：** 两者只随目录迁移和引用同步调整；若要改变工程规则，另立任务。
- **context-pruner 与其他 extension 的功能合并：** 当前职责和生命周期独立；只有出现明确的共同运行时合同才重新评估。
- **发布自动化与版本联动策略：** 本任务建立可发布 package roots 和 manifest 合同；CI 发布编排在需要真实 registry 发布时再评估。

### Plan

#### Slice 1: 建立三个 package root 与全量 manifest

**Goal:** 三个子 package 和根全量 package 都声明准确、互不重复的 Pi 资源。
**Requirements covered:** 三个独立包、全量包、Guidance 聚合、无运行时交叉依赖
**Depends on:** none

**Acceptance Criteria:**
- [ ] 三个子 package 各自拥有合法 `package.json` 和 `pi` manifest。
- [ ] `akeel-guidance` 同时声明 bootstrap 与 skills，且原则文件只有一个来源。
- [ ] `akeel-access-gate` 与 `akeel-context-pruner` 的 manifest 只加载自身 extension。
- [ ] 根 `akeel` manifest 加载三类能力一次且仅一次。
- [ ] package manifest 合同测试能区分全量资源与独立资源。

**Files and Seams:**
- Modify: `package.json` — full package manifest and workspace/package metadata
- Add/modify: `packages/guidance/package.json` — Guidance package manifest
- Add/modify: `packages/access-gate/package.json` — Access Gate package manifest
- Add/modify: `packages/context-pruner/package.json` — context-pruner package manifest
- Test: package manifest validation seam — resource declarations and dependency boundaries

**Verification:**
- `npm run test:file -- tests/validate-packages.test.ts`
- `npm test`

**Steps:**
1. 先添加 manifest 合同测试并确认当前单包布局不能满足三个独立 package 的断言。
2. 建立三个 package root、子 manifest 和根全量 manifest。
3. 恢复 manifest 合同测试并执行现有测试。

#### Slice 2: 迁移分发源与测试接缝

**Goal:** 每个独立 package 在自身根目录内包含可运行的 extension/skill 资源，开发测试仍覆盖同一 public seam。
**Requirements covered:** 独立安装、现有行为不变、无原则复制
**Depends on:** Slice 1

**Acceptance Criteria:**
- [ ] 子 package 不依赖仓库外部相对路径即可被 Pi 加载。
- [ ] Access Gate 的 `yaml` 运行时依赖在其 package 中声明。
- [ ] 现有 Access Gate、context-pruner、skill 校验测试迁移后仍通过。
- [ ] skills 仍只引用唯一的 `principles.md` 来源。

**Files and Seams:**
- Modify: `packages/guidance/` — bootstrap and skills distribution source
- Modify: `packages/access-gate/` — Access Gate distribution source
- Modify: `packages/context-pruner/` — context-pruner distribution source
- Modify: `tests/access-gate/` — imports and production composition seam
- Modify: `tests/context-pruner/` and `tests/validate-skills.test.ts` — relocated resource seams

**Verification:**
- `npm run test:file -- tests/access-gate/index.test.ts`
- `npm run test:file -- tests/context-pruner/index.test.ts`
- `npm run test:file -- tests/validate-skills.test.ts`

**Steps:**
1. 先迁移一个能力单元及其测试接缝，运行对应 focused test。
2. 依次迁移其余能力单元，保持模块依赖方向和 public exports。
3. 删除仅由迁移产生的旧路径引用，运行全部 focused tests。

#### Slice 3: 同步用户安装与仓库维护文档

**Goal:** 用户能理解全量安装、能力包安装和 Guidance 的组成关系。
**Requirements covered:** 安装说明、能力边界可理解
**Depends on:** Slice 2

**Acceptance Criteria:**
- [ ] README 给出全量和三个独立 package 的安装方式。
- [ ] 文档明确 `bootstrap` 与 `skills` 同属 Guidance package。
- [ ] 文档明确 Access Gate 与 context-pruner 的独立职责及其边界。
- [ ] `AGENTS.md`、`CONTEXT.md` 和 package 路径描述不再过时。

**Files and Seams:**
- Modify: `README.md` — installation and package selection
- Modify: `AGENTS.md` — repository distribution map
- Modify: `CONTEXT.md` — current package architecture
- Modify: `docs/decisions.md` only if the final package boundary introduces a new durable decision
- Test: `tests/validate-docs.test.ts` and package validation

**Verification:**
- `npm run test:file -- tests/validate-docs.test.ts`
- `npm test`

**Steps:**
1. 根据已落地的 manifest 路径同步 README 和仓库约定。
2. 核对三类 package 的名称、资源和运行时边界在文档中一致。
3. 执行文档校验和全量测试。

### Evidence

- 当前根 `package.json` 将 bootstrap、access-gate、context-pruner 和 skills 全部声明在单一 `akeel` package 中。
- Pi package manifest 支持独立 package root、资源清单和 resource filtering；本设计选择真实独立 package，同时保留 filtering。
- `bootstrap` 与 skills 共享 `principles.md` 单一来源；Access Gate 和 context-pruner 没有彼此代码依赖。
- 用户已接受 `akeel-guidance`、`akeel-access-gate`、`akeel-context-pruner` 三包方案。

### Durable Updates

- [ ] 若最终包边界成为长期架构约束，更新 `CONTEXT.md` 与必要的 `docs/decisions.md`。
- [ ] 完成后清除本 Task Record。

## T-0102: 待创建
