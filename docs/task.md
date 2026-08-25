# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-062: 可判定 for 循环（Reduction-first 归约前端）

**Kind:** feature
**Status:** in-progress
**Goal:** 让 Access Gate 对"可静态求值"的 for 循环（字面词表 + 双引号内 `$f`/常量拼接）做判定==展开的精确建模；不可静态求值的形态保持 fail-closed。
**Origin:** C-014

### Architecture

**不建树、不扩语义引擎**。`ShellProgram.commands` 扁平 IR 保持，parser 仅增加一个 **region pass**（栈式识别命令位/未引用的 `for <var> [in words] ; do ... done`；非 for 保留字区（if/while/case/etc.）标 opaque；畸形/嵌套超限 → unsafeSyntax），`ShellProgram` 加 `loopScopes: LoopScope[]`（含 header/words/body/重定向/裁剪 span；命令**不回指**，单向无环——W1）；核心是 **归约前端**：`verifyLoopScope`（strict 守卫）→ `reduceToFlat`（denoteWord 求值 + 文本级替换 + 值转义）→ **把归约后的扁平文本重 lex/parse，重喂既有管线**（preflight → dynamic → control-flow → 逐条编译），下游 90% 零改动；归约构造错误会因重解析失败而 fail-closed（自校验）。不安全形态在结构扫描/归约前拒绝，`program.dynamic` 硬拒兜底一切残余动态。

**编译器管线统一顺序（两阶段共用）**：parse（region pass）→ **结构扫描**：任一 opaque 区域 / 未建模或（Phase 1）全部 for-scope → `compound-command` 拒绝；**两阶段统一快路径：结构扫描零命中（无 opaque、无待处理 loop）→ 直接走既有 compile 路径（不冗余重 parse，J2）** → **归约**（Phase 1 no-op；Phase 2 仅可建模 for-scope；**单次归约：一个 pass 处理命令内全部可建模 scope，无拼接**；归约失败/自校验不成 → `compound-command`）→ 归约（或原）文本交给**内层 `compileFlat`**（lex→parse→preflight→dynamic→control-flow→逐条编译，**不递归外层**）→ **preflight**（扁平文本，`curl | sh` 跨 loop 边界邻接自然可见）→ **dynamic 硬拒**（残余动态，既有一行检查兜底）→ control-flow（扁平，原样）→ 逐条编译。**双坐标经 operation 字段直挂**：`span`（归约坐标）用于 coverage 对账；展示的 literal form 一律用 `originalSpan`（原始坐标）切原文；plan 可选携带 `reductionText` 供 `expanded form:` 行。

### Out of Scope

- 不可静态求值的展开（修饰/算数/间接/命令替换/**非 `$f` 变量**/裸 `$f`）、body **循环变量重赋值**与 **early-exit**（break/continue/exit/return/exec/shift/… 变异内建）→ 不建模；真实现需跑真 shell，超出 fail-closed 哲学，有实证再评估。
- 其他复合命令（if/while/until/case/select/function/`(`/`{`/`[[`/`((`）与**嵌套 for** → opaque/`compound-command` 拒绝。
- **loop 整体级 `|` / `&` 操作符**（`for...done | sh`）：bash 将 loop 视为整体管道，扁平文本无法等价表达 → v1 不建模（`compound-command` 拒绝，与现状行为等价）。
- `~user` / `~+` / `~-` 词表形态 → 不建模；HOME 与 homedir() 差异 = 既有文档化边界，不新增近似面。
- **`while read ... done` 惯用式**：while 属 opaque 必被拒——记为预期摩擦点与未来 Trigger。

---

### Progress（实施日志：2026 会话基线）

**已完成并提交（npm test 933 全绿、tsc 干净）：**
- A0-1 `expandTildeArg`（词级 tilde 单源）+ cd 家族（builtin/command 追踪、`env cd` 抑制 G8、pushd/popd opaque）+ `time`/`!` 前缀剥离 G7（提交 477c32a）
- A0-2 词义层 `denoteWord`（tilde 词级归一 + N3 动态入口短路）（4548065）
- A0-3 `resolveTargetForCwd` 统一路径服务（D-045 语义重放；resolveCdTarget 移除）（fc3fa62）
- A0-4 D1 展示：path 证据绝对路径聚合、逐 cwd 候选分组、distinct 去重、去 `@ cwd`（5bc9fb7）
- P1T1 region pass：for 作用域（嵌套/多行/引号 do H2/空表/`in` 歧义/V1/R2/深括号 G9/I11/scope 字段装配 W1·R3·J1）+ opaque 区（if/while/case/function/`[[`/`((`/括号/`time|!` 管线）+ 边界关键字守卫 G6（c316000 含）
- P1T2 `compound-command` code + 结构扫描（先于 preflight/动态；for/if/while → 干净 block；畸形 → unsafe-syntax）（c316000 含）

**实施偏离（定案，已代码注释 + 测试锁定）：**
- **`cd "~/x"`（引号内 tilde 目标）→ opaque 而非字面建模**。理由：cd 目标有三个同源消费方（①`resolveTargetForCwd` 的 cwd 候选 ②compiler 的 cd-list 意图 ③`normalizeInput` string-mode tilde），引号信息在 `cdInfo.target: string` 边界丢失；R1-B 明令不引入 `PathIntent.quoted`、不恢复 span→token 回查（U1）、不改 filesystem/option-parse 辅助函数 → 字面建模必然造成 ②③ 展开 home 与 ① 字面分裂 = 下近似漏判（policy 查错路径）；按 D-018「无法精确建模则拒绝」落 opaque（fail-closed）。未引号 `cd ~/x`/`cd ~` 因词级先展开成绝对路径而完全一致，不受影响。与 loop 特性零关联（A0 独立地基；归约引擎在 token 级处理词表 tilde）。未来字面建模需 (A) 路由（option-parse 值 token span 单点修复 + 各 adapter 位置参数意图附 arg span）作为独立任务。
- **`FOO=1 for ...` → unsafeSyntax**（R2：bash 赋值前缀只合法于简单命令）；合法形态 `FOO=1; for ...` 照常识别。
- **C 风格 `for ((…))` → opaqueRegions**（头变量非标识符，消费终点 = 配对 done，与 while 同机制）。

**待办（Phase 2，新会话继续）：** Task 4 scanVarRefs/denoteWord 绑定求值 → Task 5 verifyLoopScope 守卫矩阵 → Task 6 reduceToFlat（文本归约 + 重 lex 自校验 + 值转义）→ Task 7 compileFlat 集成（动态归属替换程序级检查、双坐标 originalSpan/reductionText、三个预算）→ Task 8 展示（expanded form + 证据去重）→ 收尾对账 + Task 9 文档（D-018/CONTEXT 负空间改口）。

---

### A0-1: tilde 词级单一来源（expandTildeArg + cd 系列修复）

**Files:**
- Modify: `src/access-gate/path/resolve.ts`（导出 `expandTildeArg`）
- Modify: `src/access-gate/command-semantics/control-flow.ts`（cd 目标解析改传 ShellArg + 调 expandTildeArg）
- Test: `tests/access-gate/path/*.test.ts`、`tests/access-gate/command-semantics/command-semantics-control-flow.test.ts`

**Interfaces:**
- Produces: `export function expandTildeArg(arg: ShellArg): string` — **词级、quoted 感知**：`arg.quoted` 或 raw 前导 `\~` → 原样；仅未引用词首 `~`/`~/x` → homedir；其余（`~user`/`~+`/`~-`）原样
- Produces: `export function prefixedCommand(node: ShellCommandNode): { cmd: string } | { kind: "opaque-options" } | null` — 解析 `builtin`/`command` 前缀取真实命令名；含选项形态（`-p`/`-v` 等）→ `{ kind: "opaque-options" }`；无前缀 → null（Q1：`analyzeCd` 追踪、verifyLoopScope 黑名单与 cd 家族判定**三处单点复用**，防前缀解析漂移——与 tilde 单一来源同纪律）
- Produces: `export function stripPreambleLeading(node): { executable: ShellArg; args: ShellArg[] } | null`（G7）——preamble/normalize 显式扩展：剥命令位 `!` 前缀与 `time` 前导（`time` 含 `-p` 选项跳过，可复用 wrapper-args 机制）；`wrappers.ts` 现无 `time`/`!`（仅 env/command/nohup/exec/timeout）——此为**新增机制**非既有行为；**机制落点（H7）：接收完整 node 并检查 `node.wrapper` 与前缀判定——`env time`/`builtin time`/`command time`（前缀后）**不剥离**依托此 node 视角，防退化成纯 executable 字符串版漏掉 env 包裹**；`time`/`!` 的管线形态（`time ls | grep x`、`! a || b`）由 region pass opaque 全域吞下，不达此层
- Consumes: —（纯提取）

- [ ] **Step 1: 写失败测试（含引号内 tilde 字面分歧）**

```typescript
test("control: cd ~/x resolves to home (fix)", () => {
  const { program } = parse(lex("cd ~/sub; ls").tokens);
  const flow = analyzeControlFlow(program, initialCwd("/project"));
  assert.ok(cwdSet(flow, 1).includes(join(homedir(), "sub")));
});
test("control: cd \"~/x\" stays literal (quoted tilde does NOT expand)", () => {
  const { program } = parse(lex("cd \"~/sub\"; ls").tokens);
  assert.ok(cwdSet(analyzeControlFlow(program, initialCwd("/project")), 1)
    .includes(resolve("/project", "~/sub")));
});
```

- [ ] **Step 2: 运行确认失败**：`npx tsx --test tests/access-gate/command-semantics/command-semantics-control-flow.test.ts`
- [ ] **Step 3: 实现 expandTildeArg**（上签名字段；normalizeInput 暂按字符串调用，quoted 未知时按未引用）

```typescript
/** 唯一 tilde 词级归一源（quoted/转义不展开；仅未引用词首 ~ 生效）。 */
export function expandTildeArg(arg: ShellArg): string {
  if (arg.quoted || arg.raw.startsWith("\\~")) return arg.value;
  if (arg.value === "~") return homedir();
  if (arg.value.startsWith("~/")) return join(homedir(), arg.value.slice(2));
  return arg.value; // ~user / ~+ / ~- 原样
}
```

- [ ] **Step 4: 提取 `prefixedCommand`（Q1 单点）**——builtin/command 前缀解析收敛到该函数；`analyzeCd`（cd 家族 + builtin/command 前缀）与 body 黑名单共用；cd 目标链路改传 ShellArg（`analyzeCd`/`resolveCdTarget` 传 arg 而非字符串，保留下引号信息；`cd "~"` 不展开），返回仍含 exists；**`analyzeCd` 经 `prefixedCommand` 识别 `builtin cd` / `command cd` → 按 cd 追踪（修复既有下近似；`sh -c "cd..."` 子壳不追踪——无父级 cwd 影响）；`env cd` 不追踪（G8 机制）：`env` 是 wrapper（wrappers.ts 现有成员），normalize 出栈后 executable=cd、wrapper 信息被抹除——analyzeCd 必须在 normalize 之前查看 `node.wrapper`，发现 `env` 包裹 → 抑制 cd 追踪（回归非 cd 分类：不具备 cwd 变更与 list 意图；今天的 `env cd` 是被误追踪的，属现存下近似闭环）；`prefixedCommand` 返回 `opaque-options`（`command -p cd`/`command -v cd`）→ 保守拒（opaque，防漏判 cwd）**；**`pushd`/`popd`（直接或 builtin/command 前缀）→ `opaque=true`（既有 pushd/popd 的 cwd 变异未追踪的下近似一并闭环——fail-closed 拒绝而非旧 cwd 误建模，D-045 候选集上重放）**；**cd 的 list-path 操作与 resolveCdTarget 必须同源**——shell-compiler 推 `pathOperation("list", cdInfo.target, ...)` 时用 `expandTildeArg` 的同一展开结果（或让 target 保持 ShellArg 传递），禁止二次 denoteWord 导致 `cd "~/x"` 的 cd 目标（字面）与 list 意图（误展开 home）分裂；**`time`/`!` 简单主体剥离（G7）**——preamble/normalize 调 `stripPreambleLeading`：命令位 `!` 剥除 + `time`（`-p` 跳过）前导剥离后取真实 executable；`command time`/`builtin time`/`env time` **不剥离**；`time`/`!` 管线形态由 region pass opaque 吞咽（不达此层）
- [ ] **Step 5: 回归清单（逐条真断言）**：`cd ~`、`cd ~/sub`、`cd "~/sub"`、`cd "~"`、`cd -`；**`command cd /x; ls` → 按 cd 追踪（保持现状——`command` ∈ WRAPPER_CMDS，preamble 出栈后 executable=cd，今日已追踪，R4 修正为保持回归）；`builtin cd /x; ls` → 按 cd 追踪（新增，从 unknown-ask 转为 cd 追踪）；`env cd /tmp; ls` → 不追踪（非 cd 分类，G8）**；**`cd "~/x"; ls` 的 cd 目标、list 意图与 cwd 候选三者同值（同源回归）**；**`pushd /tmp; touch x` → opaque 或正确双候选（回归）**；D-045 双候选（`;` 双 / `&&` 单）全部重放；path 层 `~`/`@`/NUL/Windows 分支断言不变；**G7 剥离回归**：`time ls`/`time -p ls`/`! ls` → 剥离建模（executable=ls）；`command time ls` → 不剥离（time 作外部命令分类）；`time ls | grep x`/`! a || b` → opaque（region pass 层，非本层）
- [ ] **Step 6: Commit**

```bash
git add src/access-gate/path/resolve.ts src/access-gate/command-semantics/control-flow.ts tests/access-gate
git commit -m "refactor(path): tilde 词级归一 expandTildeArg（quoted 感知），修复 cd ~/x 与 cd \"~/x\""
```

---

### A0-2: 词义层 denoteWord（基础形态 + tilde 单源承接）

**Files:**
- Create: `src/access-gate/command-semantics/denote.ts`
- 不改 `src/access-gate/path/resolve.ts`（B 裁决：normalizeInput 维持 string-mode tilde——`touch "~/x"` 展开为 home 属**既有文档化边界**，扩张方向偏 deny、安全向无害；词级 tilde 只在**持有 token 的三处**（归约词表/body 词、cd、重定向）经 `expandTildeArg`；归约先展开为绝对路径，归约文本无 tilde，路径层不触发）
- Test: `tests/access-gate/command-semantics/denote.test.ts`

**Interfaces:**
- Produces:
  - `type Binding = { kind: "literals"; values: readonly string[] } | { kind: "unknown" }`
  - `denoteWord(arg: ShellArg, env: ReadonlyMap<string, Binding>): { kind: "static"; values: readonly string[] } | { kind: "opaque" }`
  - v1（A0）语义：无绑定引用 = 字面常量（tilde 经 expandTildeArg 词级归一一次：quoted/转义不展开）；含 `$`/反引号/glob/花括号 → `opaque`（Phase 2 分层接管）
- Consumes: `expandTildeArg`（A0-1，token 级）

- [ ] **Step 1: 写失败测试**

```typescript
test("denote: unquoted leading tilde normalizes once", () => {
  const r = denoteWord({ value: "~/x", raw: "~/x", quoted: false, dynamic: false, span }, emptyEnv);
  assert.deepEqual(r, { kind: "static", values: [join(homedir(), "x")] });
});
test("denote: QUOTED tilde stays literal", () => {
  const r = denoteWord({ value: "~/x", raw: "\"~/x\"", quoted: true, dynamic: false, span }, emptyEnv);
  assert.deepEqual(r, { kind: "static", values: ["~/x"] });
});
test("denote: dynamic word is opaque in A0", () => {
  const r = denoteWord({ value: "$f", raw: "$f", quoted: false, dynamic: true, span }, emptyEnv);
  assert.equal(r.kind, "opaque");
});
test("denote: tilde normalization is idempotent across double application", () => {
  const w = { value: "~/x", raw: "~/x", quoted: false, dynamic: false, span };
  const once = denoteWord(w, emptyEnv)["values"][0];
  const twice = expandTildeArg({ ...w, value: once, raw: once });
  assert.equal(twice, once); // 意图循环二次应用为 no-op，防两处展开漂移
});
```

- [ ] **Step 2: 确认失败 → Step 3: 实现 denote.ts（env 就位，v1 仅空 env）**
- [ ] **Step 4: 词级 tilde 的边界收敛（B 裁决，替代原 U1/X16′/normalizeInput 移除）**——词级 tilde 只在三处消费：① 归约引擎（reduceToFlat 对词表/body 词，token 级，quoted 完整）；② cd 目标（A0-1，ShellArg 级）；③ 重定向 target（ShellArg 级）。normalizeInput 维持 string-mode tilde（既有边界：`touch "~/x"`/`git add "~/x"` 仍按未引用展开——文档化，扩张偏 deny、安全向无害）。**不引入 `PathIntent.quoted`、不改 filesystem/option-parse 辅助函数、无 span→token 回查（U1 删除）、无 Direct 面 expandTildeString、无 pathOperation denoteWord 钩子**——denoteWord 是归约引擎的求值器（Phase 2），不进入一般路径面。回归替换：`touch "~/x"` 锁定既有行为断言（防静默改动）；`cd "~/x"`/`done > "~/x"` 词级正确由 A0-1 与重定向面新断言覆盖。跑通 path 层与 gate 全量。
- [ ] **Step 5: index.ts 导出 `denoteWord`/`Binding`**
- [ ] **Step 6: Commit**

```bash
git add src/access-gate/command-semantics/denote.ts src/access-gate/path/resolve.ts src/access-gate/command-semantics/index.ts tests/access-gate
git commit -m "feat(semantics): 词义层 denoteWord（tilde 词级归一 + 动态 opaque）"
```

---

### A0-3: 路径解析服务统一（resolveCdTarget 并入 path）

**Files:** 修改 `src/access-gate/path/`（暴露 `resolveTargetForCwd(cwd, arg) → { absolute, exists }`，共享 canonical/existsSync 单实现）；`control-flow.ts` 删除自建 isDirectory/resolve；Test control-flow D-045 用例重放 + path 全量

- [ ] **Step 1:** 写 D-045 双候选回归清单（`;` 双候选 / `&&` 单候选逐条真断言）
- [ ] **Step 2: 确认失败 → Step 3: 实现 resolveTargetForCwd + control-flow 改调（语义不变，仅收敛实现）**
- [ ] **Step 4: 跑通 D-045 + path 全量 → Step 5: Commit**（`git commit -m "refactor(path): cd 目标解析并入统一路径服务"`）

---

### A0-4: D1 pathEvidence 渲染（绝对路径聚合）

**Files:** 修改 `src/access-gate/gate/decision/evaluate-request.ts`（pathEvidence）；Test `gate.test.ts` 及其它旧格式断言——**已枚举回归面**：`tests/access-gate/decision/guidance.test.ts` 含 `write path: … @ /project`（含 100 项构造用例），逐一更新；其余按“全库 grep 旧格式断言”清单处理

**Interfaces:** ask 证据 `<operation> path: <abs1>, <abs2>`（每 cwd 候选一组，`@ cwd` 移除）；判定与展示同一 resolvePath 结果

- [ ] **Step 1: 失败测试（非循环命令，Phase 1 中 for 不产生 ask 证据）**

```typescript
test("ask: path evidence shows resolved absolute paths, deduped", async () => {
  const { runtime, prompts } = makeRuntime(["Allow once"]);
  await evaluateTool("bash", { command: "touch a b" }, runtime);
  assert.ok(prompts[0]!.includes("write path: /project/a, /project/b"));
});
```

- [ ] **Step 2: 确认失败（旧格式含 @ cwd）**
- [ ] **Step 3: 实现 pathEvidence**：按 cwd 候选 resolvePath，distinct 绝对路径聚合；span 保留
- [ ] **Step 4: 全库 grep 旧格式断言逐一更新；跑通 gate 全量**
- [ ] **Step 5: Commit**（`git commit -m "feat(gate): path 证据绝对路径聚合（D1），判定与展示同值"`）

---

### Phase 1 / Task 1: region pass（parser 作用域标记 + 非 for 保留字区拒绝）

**Files:** `src/access-gate/shell-parse/parser.ts`；`src/access-gate/shell-parse/types.ts`（`ShellCommandNode` **不加** `loopScope` 回指字段——W1：region pass 内部临时簿记不落 IR，避免 LoopScope↔命令循环引用）；Test `parser.test.ts`

**Interfaces:**
- Produces: `ShellProgram { commands, unsafeSyntax }` 保持扁平；`LoopScope { variable: ShellArg; words: readonly ShellArg[]; hasIn: boolean; opBefore: ShellOperator; trailingOperator: ShellOperator | null; body: readonly ShellCommandNode[]; redirections: ShellRedirectionNode[]; headerSpan: SourceSpan; doneSpan: SourceSpan }`（R1 补全）——`opBefore` = for-group 的前操作符（Task 5 前向 `|`/`&` 守卫与归约首条承载所需）；`trailingOperator` = loop 后首条命令的 operatorBefore（后置 `|`/`&` 守卫）；**`body` = body 命令（唯一来源，R3）**；**`redirections` = header 区（pre-do）与 done 之后（post-done）的 loop 级重定向（归约时头部裁掉后必须从该字段重挂载，否则丢失）**；**`headerSpan`/`doneSpan` = `for...in...; do` 与 **终止分隔符（`;` 或 newline）+ `done`** 的原始坐标区间（`reduceToFlat` 裁剪边界；region pass 按实际形态记录——多行 for 的 `\ndone` 前置分隔符是换行而非 `;`，S2）**；**`ShellProgram.loopScopes: LoopScope[]`（必填、恒初始化数组——parser 单点产出 `[]` 或真实值；构造点零改动、消费点无 undefined 分歧，J1；每条 loop 一条，结构扫描判据：空 body loop 也必须可拒；`body` 持命令引用、单向无环——命令不回指，W1）**；`ShellProgram.opaqueRegions: { keyword: string; span: SourceSpan }[]`（非 for 保留字区，**同 J1：必填恒初始化数组**）
- region pass 规则:**命令位判定先跳过 env 赋值词**(raw 前缀 `^[A-Za-z_][A-Za-z0-9_]*=`,与 parser 既有 preamble 同规则)；**赋值词 + 组首 `for` → unsafeSyntax（R2：bash 赋值前缀只合法于简单命令，`FOO=1 for ...` 是语法错误、建模永不执行命令无意义；合法形态 `FOO=1; for ...` 照常识别）**+ 未引用的 `for` 进入作用域;`do`/`done` 仅在作用域内作边界词(不作为 executable);**作用域内开局 `do` 之外的组首 `do` → unsafeSyntax;组首 `done` 即闭合作用域(bash 语义)--随后多余 `done` → unsafeSyntax(行为钉死防实现选错);组首保留字(do/done/then/fi/elif/esac/`]]`/`))`)在无对应开放范围时 → unsafeSyntax(G6,对齐 bash "syntax error near unexpected token" 语义)**;嵌套 for → opaque 拒绝;for-header 变量须纯标识符词(C 风格 `for ((` → opaque,其 **opaque 消费终点 = 配对 `done`**,与 while 同机制--H2);缺 done/畸形 → unsafeSyntax;**命令位保留字清单含 `time`/`!` 与 `[[`/`((`(条件/算术关键字,复合命令同类)→ opaque 归类(统一 compound-command,不落 unsafe,也不落 unknown);`time`/`!` 的 opaque 消费终点 = 整条 pipeline 末(`time cmd1 | cmd2`、`! a || b` 全域吞下);简单命令主体的 `time ls`/`! ls` 不在此列--region pass 见简单主体直接放行,交由 A0-1 的 normalize 剥离建模**;**命令位 `for` 之前的同组前导重定向（pre-for）与 header 区（pre-do）及 done 之后的（post-done）三类重定向 token 一并采集进 `LoopScope.redirections`**（I1：`> out for f in a; do x; done` 的 `> out` 属 loop 级，遗漏即归约丢写意图）；`MAX_NESTING=64`;`for f in a b c\ndo...`(newline 分隔)按分隔符接受

- [ ] **Step 1: 失败测试**：`for f in a b c; do echo x; done` → 命令列表 = [echo]（for/do/done 被消费为边界词）+ loopScopes = [{var:f, words:[a,b,c], body:[echo]}]（body 引用即回指，命令不持有 loop 引用，W1）；**空 body `for f in a; do ; done` → loopScopes 仍含该 loop（拒绝不依赖命令标签）**；`'for'`/`echo for` 不误判；**组首 vs 参数歧义**：`for f in a; do echo done; done` → 正确闭合在真实 `done`（`echo done` 中的 done 是参数、不闭合）、scope 外的孤立 `done`（组首）→ unsafeSyntax；**`for f in a in b; do ...` 第二个 `in` 是词表元素（list=[a,in,b]）**；**`for f in do; do echo; done` → 未引用 `do` 终止词表（list=[] → 空词表守卫拒绝）；`for f in "do"; do echo; done` → list=[do]（H2：词表收集止于未引用 `do`，quoted 区分，与 `in` 同规则）**；**body 含注释 `for f in a; do # 注释
 echo x; done` → 标签不受影响（注释已由 lexer 剥离）**；嵌套 do/done 配对正确（外层 loopScopes 的 body 含内层命令引用，按 body 内容断言而非命令回指）；`if true; then ls; fi` → opaqueRegions=[if]；`for ((i=0;i<3;i++))` → opaqueRegions（header 非标识符）；`for f in a | b`、`for f in a && b; do`、`for f in a || b; do` → **unsafeSyntax**（V1 钉死：for-header 内出现 `|`/`&&`/`||` 是结构错误而非未知区域，走 parse 级拒绝、非 opaqueRegions）；缺 `done`/缺 `fi` → unsafeSyntax；**`FOO=1 for f in a; do x; done` → unsafeSyntax（R2，bash 语法错）；`FOO=1; for f in a; do x; done` → loopScope 正确识别（分号形态，env 前导不挡命令位）**；**`echo for f in a; do x; done` → unsafeSyntax（无开放范围的组首 `do`，G6）**；**`time for f in a; do x; done` 与 `! for f in a; do x; done` → opaqueRegions**；**`for f in a; do do; done`（体内组首 do）→ unsafeSyntax**；多行 for（newline 分隔 do/done）→ loopScope 正确；深度超限 → unsafeSyntax；**嵌套配对矩阵**：`for f in a; do if true; then ls; fi; done` → for 正确闭合 + opaqueRegions=[if]（if-in-for）；`for f in a; do while true; do x; done; done` → while 的 done 不吞外层 for 的 done（while-in-for）；`while read x; do for g in b; do echo $g; done; done` → while opaque 正确闭合、内层 for 标签独立（for-in-while）；**`for f a b; do ...`（无 `in` 但有词表，bash 语法错）→ unsafeSyntax**；**深括号消费（G9）**：`( echo a; echo b )` → 单一 opaqueRegions（区内 `;` 不切组）、`(( x = 1; y = 2 ))` → opaqueRegions、`case a in x) echo;; esac` → 单一 opaqueRegions[case]（深度追踪：括号/花括号与 case 区内 operator 不参与切分）**；**结束符位置（I11）**：`while true; do echo done; done` → 单 opaqueRegions[while]（参数位 done 不闭合）、`if true; then echo "fi"; fi` → 单 opaqueRegions[if]（引号 fi 不闭合）
- [ ] **Step 2: 确认失败 → Step 3: 实现 region pass**（在既有"按操作符切组"的 token 流上做**栈式区域扫描**：维护作用域栈；命令位词 `for`（未引用）→ 压栈收集 header；`do`/`done` 匹配进出；非 for 保留字（if/while/case/select/function/`(`/`{`/`[[`/`((`）→ 吞到匹配结束符记 opaqueRegions；其余照旧切组对命令打标签；**深层消费（G9）：`(`/`((`/`{` 区与 case 区内，lexer 把 `;`/`&&` 当 operator——消费状态须跟踪括号/花括号深度，深度 >0 时 operator 不进组切分；逐关键字钉消费终点表：if→fi、while/until/for→done、case→esac、select→done、function→`}`、`[[`→`]]`、`((`→`))`、`(`→`)`、`{`→`}`、time/!→pipeline 末；**结束符判定（I11）**：opaque 消费的结束符查找 = 组首（命令位）+ 未引用——任意 token 位置（`echo done` 的参数位）或引号 token（`echo "fi"`）一律不做闭合判定，与 G6 组首语义同规则**）
- [ ] **Step 4: 跑通 parser 全量（既有用例不变，新断言增补）**
- [ ] **Step 5: Commit**（`git commit -m "feat(parse): region pass——for 作用域标签 + 非 for 保留字区 opaque"`）

---

### Phase 1 / Task 2: compound-command code + 结构扫描（fail-closed 落地）

**Files:** `src/access-gate/gate/plan/shell-compiler.ts`；`src/access-gate/gate/decision-code-catalog.ts`；`src/access-gate/gate/decision-types.ts`；Test `gate.test.ts`

**Interfaces:** Produces `"compound-command"` DecisionCode（`shell-form`/`command`）+ guidance `"compound-command-hint"`；结构扫描在 **parse 后、preflight 前**：`opaqueRegions` 非空 → `reject("compound-command", keyword)`；Phase 1：`program.loopScopes.length > 0` → `reject("compound-command", "for")`（**判据 = 列表非空而非命令标签**——空 body loop 也必须拒）；**keyword 受控枚举表（H3，封闭 union，防拒绝文案漂移）**：`if`/`while`/`until`/`case`/`select`/`function`/`time`/`!`/`for ((…))`/`[[`/`((`/`(`/`{`——region pass 只输出来自该表的 keyword，新增形态需同步改表；**guidance 文本守 D-023 静态目录纪律（T3）：静态 catalog 单一表格、指向 unroll/Direct 的可行建议、不提供绕过或建议不支持的形态，不内联散落（X15′ 定稿）**：

```
"compound-command-hint": "This compound control-flow form cannot be approved as written. Unroll it into literal commands or use a Direct read/grep/find/ls tool. Do not retry this Shell form unchanged."
```

- [ ] **Step 1: 失败测试**：`for f in a b c; do echo x; done` → block + `compound-command`（非 unknown 噪音、非 `opaque-command`）；`if true; then ls; fi` → block + `compound-command`
- [ ] **Step 2: 确认失败 → Step 3: 实现**（catalog 全量表 + 联合类型；compiler parse 后插结构扫描）
- [ ] **Step 4: 跑通 → Step 5: Commit**（`git commit -m "feat(gate): compound-command 拒绝码 + 结构扫描（Level 1 fail-closed）"`）

---

### Phase 1 / Task 3: 中点门禁 + A0 回归

- [ ] **Step 1:** `npm test` 全绿
- [ ] **Step 2: 行为锁清单核对**：for/if/while/case/function → 干净 block（compound-command）；**`[[`/`((` 从 dynamic-shell 分类变为 compound-command（仍是拒，锁分类非漂移）**；**`time ls`/`! ls` 简单主体剥离建模、`time for...`/`! for...` opaque（锁 A0-1 剥离与 region pass 分界）**；`builtin cd`/`command cd` → cd 追踪（非 unknown-ask）；动态 token 仍 hard deny（#7 不变）；D1 展示生效；`cd ~/x`/`cd "~/x"` 修复；**零新放行路径**
- [ ] **Step 3: Commit**（`git commit -m "test: Level 1 fail-closed 行为锁"`）

---

### Phase 2 / Task 4: 归约引擎 A——denoteWord 绑定求值（仅 $f、须双引号区段）

**Files:** Modify `src/access-gate/command-semantics/denote.ts`；Test `denote.test.ts`

**Interfaces:** env 接受 `literals` 绑定；**单一 raw 扫描器（O2）**：`scanVarRefs(raw) → Array<{ refName; rawPos; valuePos; inDoubleQuotes; escaped }>`——denoteWord 与 reduceToFlat 同源消费（防双扫描漂移，同 expandTildeArg 单源纪律）；判定规则：**raw 级逐段**判定引号（value 已丢分段：`x"$f"y` 与裸 `$f` 的 value 同为 `$f`）；仅统计**双引号区段内**的未修饰 `$f`/`${f}`（后不接 `[A-Za-z0-9_]`，防 `$fx`）；**双引号区内反斜杠转义按 lexer 的 DOUBLE_QUOTE_ESCAPES 跳过（`\$`/`\\`/`\"` 是字面元，`"pre\$fx"` 不是变量引用——O1）**；常量前缀/后缀拼接；裸 `$f`（未在双引号区段）/`${f...}`/`$((`/`${!`/命令替换/反引号/其他 `$X` → opaque

- [ ] **Step 1: 失败测试**：`"$f"` → 字面集合；`"== $f"` → `== a`/`== b`；`x"$f"y` → 拼接 static；**`"${f}x"`（双引号内花括号、未修饰）→ static**；**裸 `$f` → opaque**（字段拆分/glob 分歧）；**裸 `${f}`（未引号态）→ opaque（与裸 `$f` 并列锁防漏，Q2）**；`$fx` opaque；`'$f'` 单引号字面；修饰/算数/间接/`$HOME` opaque
- [ ] **Step 2: 确认失败 → Step 3: 实现（基于 A0-2 骨架，env 生效 + 双引号区段追踪 + 陷阱扫描）；**入口短路（N3，与 G10 双保险）：`arg.dynamic` 且非合法 `$f` 引用 → 直接 `opaque`**——防非 `$` 动态字符（glob 类）词判 static 后归约重 lex 落 `dynamic-shell` 的分类漂移**
- [ ] **Step 4: 跑通 → Step 5: Commit**（`git commit -m "feat(semantics): denoteWord 绑定求值（双引号内 $f 字面集合）"`）

---

### Phase 2 / Task 5: verifyLoopScope（strict 守卫矩阵）

**Files:** Create `src/access-gate/command-semantics/loop.ts`；Test `loop.test.ts`

**Interfaces:** `verifyLoopScope(scope: LoopScope, limits) → { wordValues: readonly string[] } | null`（body 命令唯一来源 = `scope.body`——R3 防双源漂移，region pass 装配时命令标签与 scope.body 必须同指；**函数内以词表值构造 `env = { f: literals(wordValues) }` 供 body 词 denoteWord 用，签名不另传 env，H6**）

- [ ] **Step 1: 失败测试（守卫矩阵）**：字面词表+静态 body → 可建模；`"$f"` 字面词表 → 可建模；无 `in`/空表/`*.txt` 词表/含 `~user`/`~+` 词表 → null；body 含 cd/pushd/popd（**含 `builtin cd`/`command cd` 前缀形态**——专项用例：`for f in a; do builtin cd /tmp; touch "$f"; done` → null，防既有下近似随可建模 loop 扩大）、if/while、break/continue/exit/return/exec/shift、嵌套 for、`f=`/`export f=`/`read f`/`declare f`、`unset f`/`readonly`/`alias`/`unalias`/`trap`/`source`/`.`/`eval`/`set`（状态变异内建全覆盖）→ null；**状态变异黑名单统一展开 builtin/command 前缀形态**：`builtin|command` + {eval, source, `.`, exec, export, readonly, declare, typeset, local, unset, read, shift, set, trap, alias, unalias} → null（专项用例：`for f in a; do builtin eval "$f"; done` → null）；**wrapper 链检查（O3）**：body 命令 `node.wrapper` 含 `exec` → null（exec 是 wrapper 成员、永不出现在 executable 位，按其名黑名单检查永不命中——专项用例：`for f in a; do exec ls; done` → null；`env cd` 经 executable=cd 已命中 cd 黑名单 ✓，`nohup`/`timeout` wrapper 在 body 无害放行）；**`prefixedCommand` 返回 `opaque-options` 的前缀形态（`command -p touch`/`command -v grep` 等）在 body 中一律 → null（保守拒，R2）**；**body 内裸 `$f` → null**；**body 与词表任何词（除被建模的 `$f` 引用）`dynamic=true` → null（G10）**——未引号 `[`/`*` 等非 `$` 动态字符词经 denoteWord 按内容可能判 static、但归约文本重 lex 后 dynamic=true 会落 `dynamic-shell`，导致 verify 放行与最终分类漂移；此规则保证"可建模集 ≡ 归约后重解析可放行集"；**空 body（`for f in a; do ; done`）→ 钉死 `compound-command`（归约前以空 body 判 null 直接进 loop 拒绝类别，不让 compileFlat 侧报 unsafe-syntax 的意外分类）**；`$HOME`/`$(...)` → null；**body 命令含 heredoc/hereString 重定向 → null（干净归类，避免归约搬运 heredoc 原文；fdDuplicate/fdClose `2>&1`/`2>&-` 不拒——无路径语义）**；**loop 级管道一律不建模（统一拒绝）**：loop 的 opBefore 为 `|`/`&` **或** `trailingOperator`（loop 后首命令）为 `|`/`&` → null（判定==展开逐字成立，不依赖 preflight 跨边界特判）；**done 后孤立 `&`（无后继命令 → `trailingOperator` 缺省为 null）也要收进守卫**——将 done 后的孤立 `&` 并入 `trailingOperator` 一并拒（H3：钉死"loop 级 & 一律拒"承诺覆盖该形态）；词表 `"a b"`（含空格）与 `""`（空值）与重复值 → 明确行为锁测试；body 内 `X=$f`（非循环变量、值静态）→ 允许但锁行为（后续 `$X` 使用被动态拒绝）；N×body > maxCommands → null；**header 区重定向目标须静态可求值**：`for f in a > dir/"$f"; do ...` → null（header 中 `$f` 未赋值、bash 语义病态；目标同 body 词一样须 denoteWord static）；**loop 级重定向目标统一检查**：`LoopScope.redirections` 全部 target（pre-do + post-done，如 `done > "$g"`）须 denoteWord static，否则 null → `compound-command`（与 header 检查同分类，不落 dynamic-shell——防 pre-do/post-done 同类形态分类漂移）**；**loop 级重定向 target 含 `$f` → null（N2：post-done 位 `$f` 未赋值/最后值病态语义，逐迭代重挂载 ≠ 运行时行为，保守拒；与 header 区 `$f` 拒同分类；字面目标 `done > out` 不受影响）**；loop 级 heredoc/hereString（如 `done << EOF`）→ null（R3：显式分类、干净拒绝，而非自校验兜底）**
- [ ] **Step 2: 确认失败 → Step 3: 实现**（基于 A0-2/Phase 1 IR 与 denoteWord；词表每词 denoteWord(env) 须 static + 词首 `~` 经 expandTildeArg；body 命令黑名单 + 逐词 static；**黑名单匹配含 builtin/command 前缀展开，经 A0-1 的 `prefixedCommand` 单点判定**（与 cd 追踪同一函数，Q1））
- [ ] **Step 4: 跑通 → Step 5: Commit**（`git commit -m "feat(semantics): verifyLoopScope strict 守卫矩阵"`）

---

### Phase 2 / Task 6: reduceToFlat（文本归约 + 重 lex 自校验）

**Files:** Create `src/access-gate/command-semantics/reduce.ts`；Test `reduce.test.ts`

**Interfaces:** `reduceToFlat(rawCommand, scopes: readonly LoopScope[], scopeWordValues: readonly { scope: LoopScope; values: readonly string[] }[]) → { text: string; segments: Array<{ kind: "verbatim" | "expanded"; text: string; spanInReduced: SourceSpan; originalSpan: SourceSpan }> } | null`（H4：LoopScope 无 ID 字段，scopeWordValues 按数组配对钉死，禁现造 key）(G1:**单次调用处理命令内全部可建模 scopes--一个 pass 模板实例化,不存在拼接**;S1:rawCommand = 原始 toolCall 命令文本--raw 切片的前提;body 走 `scope.body`(R3 单源))--**以原始命令文本的 raw 切片为基础合成**(body 命令直接取原 raw span 文本,其余字节原样保留--引号/转义/空白不动;**决不从解码值重序列化**:`grep -v "x y" file` 的引号必须保留,否则参数漂移可能下近似);对每个词表值 v、每条在范围 body 命令:**只在双引号区段内且非转义（O2 的 `scanVarRefs`：`inDoubleQuotes && !escaped`——`"pre\$fx"` 的 `\$` 是字面、不替换）的 `$f` 替换点改写**(插入经**值转义**的 v:`"`→`\"`、`$`→`\$`、反引号→`\``、`\`→`\\`、**`\n`/`\r`→`\n`/`\r`**--T1:含换行的值不原样插入断行;转义后仍重 lex 不成 → 自校验 null 回退,分类行为写死,不靠意外);头部 `for...in...; do` + 尾部 `; done` 文本**裁掉**；**verbatim 排除集 = headerSpan ∪ doneSpan ∪ redirections 各 span（N1：pre-for/pre-do/post-done 重定向区间必须一并从 verbatim 排出，否则与重挂载双写或自校验失败）**；body 命令间保留原 `;`/`&&`/`||` 链；**迭代间 `;` 连接**；loop 整体重定向（来源 = `LoopScope.redirections`，**含三类位置：pre-for 前导 / pre-do 头部 / post-done 尾部**——`> out for...`、`for f in a > out; do`、`done > out`）→ **首条 `> out`、后续 `>> out`**（truncate 一次语义）；**重挂载基于原始 raw 切片**:取原文中该重定向的 fd+操作符+target 切片,fd 前缀与 target 引号原样保留,迭代 ≥2 仅改操作符字符--`>`→`>>`、`2>`→`2>>`、`>|`→`>>`(显式映射表且**界定向导**:仅**截断类**(`>`/`>|`/`2>`/`2>|`)在迭代 ≥2 改 `>>`;`<>`(O_RDWR 每次打开即 rw,**非 truncate-once**)、`>>`、`<`、fd 复制(`2>&1`/`2>&-`)保持**原样不变**--禁止把非截断形态误改写;`&>`/`&>>` 形态不建模 → 拒)--**禁止从 parsed 值重建文本**;首条展开命令承载 loop 自身 operatorBefore;**,尾侧 trailingOperator 不手动放置——verbatim-after 天然携带（`&&`/`||`/`;` 保持并落在最后一条迭代后，bash 的 for 退出状态 = 最后 body，语义恰一致；`|`/`&` 已被守卫拒，不达此层——N4）**;**每条归约命令带双坐标**:装配按**归约文本坐标区间**摊还--verbatim 段原 span 整体偏移累积 Δ、expanded 段逐拷贝对应 body 命令原始 span;**单遍处理多 scope 时 verbatim/expanded 交错,Δ 随替换顺序自然累积(无跨 scope 拼接、禁止按序 zip)**;装配 = 每条 parsed 命令的 reduced span 匹配 `spanInReduced` → 取对应 `originalSpan`;operation 直挂 `span`(归约坐标)与 `originalSpan`(原始坐标),无独立 mapping 表跨层传递;合成归约文本后**立即重 lex/parse 自校验**--任何解析失败/残余动态 → 返回 null(fail-closed 兜底);补测试:body 含 `grep -v "x y" file` → 归约文本引号原样;body 含 `\$` 转义词 → 原文保留

- [ ] **Step 1: 失败测试**:`for f in a b; do cat "$f"; done` → text `cat a; cat b`(重解析为 2 条字面命令、无动态);**拼接分隔符健全性**:`cmd1; for f in a; do x; done; cmd2` → `cmd1; x; x; cmd2`(无 `;;`/缺失分隔符,正常路径断言);`"== $f"` 常量拼接;`do a && b; done` body 链保留、迭代间 `;`；`done > out` → `touch a > out; touch b >> out`；**`for f in a > out; do ...`（pre-do 重定向）→ 首条 `> out`、后续 `>> out`（重挂载自 LoopScope.redirections）**；**`> out for f in a b; do echo x; done`（pre-for 前导，I1）→ 归约 `echo x > out; echo x >> out` 且 D1 展示 `write path: /project/out`**；词表 `~/x` → 归约文本含 homedir 绝对路径;值含 `"`/`$`/反引号的转义后重解析成功;**构造错误(如含残余动态)→ null**；**env 前导（分号形态）：`FOO=1; for f in a b; do touch "$f"; done` → 归约 `FOO=1; touch a; touch b`（FOO=1 为前置简单命令、verbatim 保留——H5；赋值词+组首 for 已被 R2 拒，不以 `FOO=1 for` 形态出现）**
- [ ] **Step 2: 确认失败 → Step 3: 实现**（纯文本合成；禁止第二套替换逻辑——一切替换经 denoteWord 结果）
- [ ] **Step 4: 跑通 → Step 5: Commit**（`git commit -m "feat(semantics): reduceToFlat 文本归约 + 重 lex 自校验"`）

---

### Phase 2 / Task 7: 管线集成（结构扫描 → verify → 归约 → 既有管线）

**Files:** `src/access-gate/gate/plan/shell-compiler.ts`；Test `gate.test.ts`、`access-request.test.ts`

**Interfaces:** Phase 1 Task 2 的结构扫描升级:`program.loopScopes` 逐条 `verifyLoopScope`(body = `scope.body`,由 region pass 装配)→ null 则 `compound-command`;通过则 `reduceToFlat`--**null(含值转义/构造失败/自校验失败)→ `compound-command`**(fail-closed 兜底闭合);**单次归约(G1:Task 6 签名 = 一个 pass 处理全部可建模 scope,无拼接)--verbatim 段覆盖全部非 loop 文本(含 loop 之间与首尾),flat 文本中每条命令均按所在 segment 的 Δ 偏移映射回原坐标(X3′)**,交给**内层 `compileFlat(flatText)`**(lex→parse→preflight→dynamic→control-flow→逐条编译,复用既有逻辑;**不递归外层** `compileShellDraft`;**以原始 input 的 cwd/projectRoot/stagingDir 初始化分析起点**--Q3:loop 前的 cd 已在归约文本内,但初始 cwd 来自 input.cwd);`opaqueRegions` 不变;**残余动态由既有 `program.dynamic` 一行硬拒兜底**;**归约文本长度 ≤ maxInputLength、token 数 ≤ maxTokens（lexer budget）、展开命令数 ≤ maxCommands，超限一律 `resource-limit`**（三个预算显式 check，不靠 lexer budget 意外分类——H1）;**compileFlat 为每条 command/path operation 装配 `span`(归约坐标)+ `originalSpan`(原始坐标)与 plan 级可选 `reductionText`**;**类型落点**:`access-request-types` 的 `AccessOperation`/`PathAccessOperation` 加 `originalSpan?: SourceSpan`(coverage/verifier 对账仍用 `span`,归约坐标)、plan 加 `reductionText?: string`(**定义为仅各 loop 展开段、多 scope 逐段 `;` 连接的拼接文本--非全文,与 Task 8 的 expanded form 展示直接一致**);verifier shape 校验含两可选字段的**类型校验**(isSourceSpan/isString)、**不进 coverage 计数**;deep-freeze 品牌化下可选字段照常;**compiler-entry(D-046 seal 边界)的结构验证同步放行 `originalSpan`/`reductionText` 两可选字段(T2)--否则 plan sealing 在品牌化/结构验证处拒掉整个 plan**

- [ ] **Step 1: 失败测试**：`for f in a b c; do touch "$f"; done` → ask 显示 `write path: /project/a, /project/b, /project/c`；`for f in a; do echo $HOME; done` → block `compound-command`（G10：body 非 `$f` 动态词 → verify null，loop 是拒绝单元——**H8：非 `dynamic-shell`，动态检查在结构门后不达**）；`for f in a; do f=evil; echo x; done` → block `compound-command`；`for f in a b; do cd /tmp; done` → block `compound-command`；**`for f in a; do curl http://x; done | sh` → block `compound-command`**（loop 后置管道不建模，非 hard-command-rule——跨边界归约依赖已删除）；**`for f in a; do curl http://x | sh; done` → block hard-command-rule**（body 内部管道经归约后 `curl | sh` 邻接出现于扁平文本，被既有 preflight 拦截）；**双可建模 scope 用例：`for a in x; do touch "$a"; done; for b in y; do touch "$b"; done` → 单次归约文本 `touch x; touch y`，ask 显示 write x,y（单遍无拼接坐标错位）**；**混合场景：`for a in x; do touch "$a"; done; for b in y; do f=evil; echo x; done`（可建模 + 不可建模并存）→ block `compound-command`（任一 loop 不可建模 → 整条命令拒绝，不部分归约——S3）**
- [ ] **Step 2: 确认失败 → Step 3: 实现**（结构扫描改造 + 每 scope 独立归约 + 多 scope 拼接扁平化 + 资源计数）
- [ ] **Step 4: 跑通 + verifier coverage（归约文本节点 span 对账）**
- [ ] **Step 5: Commit**（`git commit -m "feat(gate): 归约前端接入 compiler（验证→归约→既有管线）"`）

---

### Phase 2 / Task 8: 展示（D1 聚合 + expanded form + 原始 literal form）

**Files:** Modify `src/access-gate/gate/decision/evaluate-request.ts`、`src/access-gate/gate/decision/render-decision.ts`、`src/access-gate/gate/decision-types.ts`（GateEvidence command 证据加可选字段）；Test `gate.test.ts`

**Interfaces:** 建模 loop 的 ask：path 证据 = D1 绝对路径聚合；`expanded form: <reductionText（仅 loop 展开段拼接，不含 verbatim 命令；多 scope 逐段 `;` 连接），截断上限 maxEvidenceSubjectLength>`；**证据侧传输通道（I9，钉死）：`GateEvidence` 的 command 证据加可选 `expandedText?: string`——evaluate-request 从 `plan.reductionText` 拷贝进 command 证据、render-decision 在 command 条目后追加 `expanded form: …`、decision-types 与 verifier 对可选字段只做浅校验（可选可空）、deep-freeze/品牌化照常**——不扩展 renderDecision 签名、不做 subject 拼接体操；**配套消费规则：归约路径 command 证据的 literal form 一律取 `op.originalSpan ?? op.span` 切原始命令文本**（防漏改时拿归约坐标切原文）；path 证据不依赖 span（D1 绝对聚合）；同类 command 证据按（类别 + literal + originalSpan）去重防 N 条噪音

- [ ] **Step 1: 失败测试**：`for f in ~/a ~/b; do touch "$f"; done` → `write path: /home/u/a, /home/u/b` + expanded form 含 `touch /home/u/a` + literal form 含原始 `"$f"`；body 重复 N 次同类命令去重（"and N additional items" 不爆量）
- [ ] **Step 2: 确认失败 → Step 3: 实现 → Step 4: 跑通 → Step 5: Commit**

---

### Phase 2 / 收尾

- [ ] **Step 1:** `npm test` 全绿
- [ ] **Step 2: 判定==展开抽查**：可建模 for 的归约文本与 gate 判定逐条对账（含 tilde、`"== $f"`、`done > out`、`&&` 与 `||` 前置的上近似方向确认——`cd x || for...` 归约后 `||` 只守卫首条、后续迭代仍建模 = 安全方向上近似；**loop 级 `|`/`&`（前或后）不在建模面，一律 compound-command**）
- [ ] **Step 2a: 差分语料回归（固守卫矩阵为可回归 corpus）**——50+ 用例：合法子集（字面词表/引号 `$f`/常量拼接/tilde/body 链/重定向/pre-do/多 scope/`&&`/`||` 上近似）逐一与手工 unroll 文本比对（判定==展开逐条断言）；非法形态（动态/重赋值/嵌套/early-exit/变异内建全覆盖/管道/loop 级 `|`&`&`/畸形 header/无范围组首保留字）断言拒绝码（dynamic-shell/compound-command/unsafe-syntax 分类不漂移）
- [ ] **Step 3: Commit**（`git commit -m "test: Phase 2 判定==展开对账"`）

---

### Task 9: 文档与记录收尾

**Files:** `docs/decisions.md`（D-018 负空间）、`CONTEXT.md`、`README.md`（用户使用入口，若有"控制流不建模/Shell 限制"表述同步，无则跳过）、`src/bootstrap/principles.md`（若有提及）

- [ ] **Step 1:** D-018/CONTEXT Negative Space 改口："IR 是扁平命令列表（region pass 打作用域标签）；仅建模可静态归约的 for（字面词表 + 双引号内 `$f` 绑定）；其余复合结构与不可静态求值的展开保持 fail-closed；tilde 词级处理为单一来源（expandTildeArg：cd/重定向/归约词表），路径层 string-mode tilde 为既有文档化边界；展示与判定同值（D1）。"
- [ ] **Step 2:** 自审计划：需求覆盖、占位符扫描、接口一致性（expandTildeArg/denoteWord/verifyLoopScope/reduceToFlat 前后一致）
- [ ] **Step 3: Commit**（`git commit -m "docs: 记录归约前端 for 建模决策与结构收敛（D1/tilde 单源）"`）

---

## T-063: 待创建