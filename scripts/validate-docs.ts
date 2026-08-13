/**
 * validate-docs.ts — Next-ID slots 不变量结构校验 + 决策 ID 引用存活校验
 *
 * 一、记录容器（docs/candidates.md、docs/task.md、docs/decisions.md）：
 *   1. 恰有一个占位槽位行 `## X-0NN: 待创建`
 *   2. 槽位是文件最后非空行（记录只能出现在槽位之前）
 *   3. 槽位前缀字母与容器匹配（C→candidates、T→task、D→decisions）
 *
 * 二、决策 ID 引用存活校验（AGENTS.md 决策 ID 引用纪律）：
 *   代码（src/、tests/ 的 .ts）与文档层（docs/、skills/ 的 .md，以及
 *   CONTEXT.md、AGENTS.md、README.md）中的 `D-xxx` 引用必须命中 docs/decisions.md 的
 *   存活标题（`## D-NNN:`，排除待创建槽位）。决策合并/剪除后引用即悬空——
 *   Git 保留历史是溯源手段，不是保留悬空引用的理由；剪除时应在同一变更内
 *   把引用更新到吸收条目。
 *
 * 只做结构性校验，不做编号 vs Git 历史的比对——编号可被合法重编号（如连续任务压缩），
 * 历史比对会对合法操作误报。
 * 编号正确性由消费式占位结构（填充即消费）+ 记录纪律保障。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONTAINERS: ReadonlyArray<{ file: string; prefix: "C" | "T" | "D" }> = [
  { file: "docs/candidates.md", prefix: "C" },
  { file: "docs/task.md", prefix: "T" },
  { file: "docs/decisions.md", prefix: "D" },
];

const SLOT_RE = /^## ([CTD])-0\d{2,}: 待创建$/;
const DECISION_HEADING_RE = /^## (D-\d{3}): /;
const DECISION_REF_RE = /\bD-\d{3}\b/g;

interface CheckResult {
  ok: boolean;
  errors: string[];
}

function checkContainer(file: string, expectedPrefix: string, content: string): CheckResult {
  const errors: string[] = [];
  const nonEmpty = content
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter((x) => x.line.trim().length > 0);
  const slots = nonEmpty.filter((x) => SLOT_RE.test(x.line));
  const last = nonEmpty[nonEmpty.length - 1];

  if (slots.length !== 1) {
    errors.push(`${file}: expected exactly one slot heading (## X-0NN: 待创建), found ${slots.length}`);
  } else {
    const slot = slots[0]!;
    const prefix = SLOT_RE.exec(slot.line)![1]!;
    if (prefix !== expectedPrefix) {
      errors.push(`${file}: slot prefix ${prefix} does not match container (expected ${expectedPrefix})`);
    }
    if (slot.index !== last.index) {
      errors.push(
        `${file}: slot heading is not the last non-empty line (line ${slot.index + 1}; last non-empty is line ${last.index + 1})`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// ─── 决策 ID 引用存活校验 ───

/** 存活决策 ID：decisions.md 中 `## D-NNN: ` 标题，排除待创建槽位。 */
function collectLiveDecisionIds(content: string): Set<string> {
  const ids = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const m = DECISION_HEADING_RE.exec(line);
    if (m && !line.includes("待创建")) ids.add(m[1]!);
  }
  return ids;
}

/** 逐行扫描单个文件的决策引用；返回未命中存活集合的错误列表（纯函数，供自检）。 */
function scanRefs(file: string, content: string, liveIds: Set<string>): string[] {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    // 槽位标题（`## X-0NN: 待创建`）的编号不是存活决策引用，跳过；只锚定标题行，
    // 避免同行的真实引用被误跳过（如 CONTEXT Glossary 条目同时含“待创建”与 D-xxx）
    if (/^## [CTD]-\d+: 待创建$/.test(lines[i]!)) continue;
    for (const m of lines[i]!.matchAll(DECISION_REF_RE)) {
      if (!liveIds.has(m[0]!)) {
        errors.push(`${file}:${i + 1}: ${m[0]} does not resolve to a live decision in docs/decisions.md`);
      }
    }
  }
  return errors;
}

/** 递归收集目录下所有 .ts 文件。 */
function walkTsFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(p, out);
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
}

/** 递归收集目录下所有 .md 文件（docs/、skills/）。 */
function walkMdFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkMdFiles(p, out);
    else if (entry.name.endsWith(".md")) out.push(p);
  }
}

/** 扫描代码与文档层文件，校验决策引用是否全部存活。 */
function checkDecisionRefs(liveIds: Set<string>, files: readonly string[]): CheckResult {
  const errors: string[] = [];
  for (const file of files) {
    errors.push(...scanRefs(file, readFileSync(file, "utf-8"), liveIds));
  }
  return { ok: errors.length === 0, errors };
}

// ─── 自检：违规样例必须被拒绝（负向验证，锁规则防回归） ───

function selfCheck(): void {
  const cases: Array<[string, string, "C" | "T" | "D", boolean]> = [
    ["valid", "# Tasks\n\n> header\n\n## T-044: 待创建\n", "T", true],
    ["no-slot", "# Tasks\n\n> header\n", "T", false],
    ["two-slots", "# Tasks\n\n## T-044: 待创建\n\n## T-045: 待创建\n", "T", false],
    ["slot-not-last", "# Tasks\n\n## T-044: 待创建\n\nsomething after\n", "T", false],
    ["wrong-prefix", "# Candidates\n\n## T-008: 待创建\n", "C", false],
  ];
  for (const [name, content, expectedPrefix, expectOk] of cases) {
    const result = checkContainer("docs/task.md", expectedPrefix, content);
    if (result.ok !== expectOk) {
      const detail = result.errors[0] ? ` (${result.errors[0]})` : "";
      console.error(`❌ self-check FAILED: [${name}] expected ok=${expectOk}, got ok=${result.ok}${detail}`);
      process.exit(1);
    }
  }

  // 决策引用自检：存活集合只含真实标题，槽位 ID 不算存活
  const live = new Set(["D-001", "D-028", "D-040"]);
  const refCases: Array<[string, string, number]> = [
    ["live-ref", "// 显式作用域键（D-024）", 1], // D-024 不在存活集合 → 报错（剪除 ID 即悬空）
    ["pruned-id", "// D-034 覆盖层一致性", 1], // 剪除 ID 必须报错（纪律 2）
    ["slot-line-skipped", "## D-043: 待创建", 0], // 槽位标题行不扫描，编号不算存活
    ["live-with-slot-word", "// 槽位机制见 D-028（待创建占位）", 0], // 非标题行含“待创建”仍扫描（D-028 存活）
    ["live-ok", "// D-040 值性质", 0],
    ["multiple", "// D-001 与 D-028 都存活", 0],
    ["no-ref", "const x = 1;", 0],
  ];
  for (const [name, line, expected] of refCases) {
    const errors = scanRefs("fixture.ts", line, live);
    if (errors.length !== expected) {
      console.error(`❌ self-check FAILED: [${name}] expected ${expected} error(s), got ${errors.length}: ${errors.join("; ")}`);
      process.exit(1);
    }
  }

  // 存活集合提取：标题加入集合，槽位标题排除
  const headings = "## D-001: Soft 技能匹配\n## D-028: 统一 Project Record 模型\n## D-043: 待创建\n";
  const ids = collectLiveDecisionIds(headings);
  if (!ids.has("D-001") || !ids.has("D-028") || ids.has("D-043") || ids.size !== 2) {
    console.error(`❌ self-check FAILED: [live-ids] expected {D-001, D-028}, got ${JSON.stringify([...ids])}`);
    process.exit(1);
  }
}

// ─── main ───

function main(): void {
  selfCheck();
  let totalErrors = 0;
  for (const { file, prefix } of CONTAINERS) {
    const content = readFileSync(join(import.meta.dirname!, "..", file), "utf-8");
    const result = checkContainer(file, prefix, content);
    if (result.ok) {
      console.log(`  ✅ ${file} — slot invariant ok`);
    } else {
      for (const e of result.errors) console.log(`  ❌ ${e}`);
      totalErrors += result.errors.length;
    }
  }
  const decisionsContent = readFileSync(join(import.meta.dirname!, "..", "docs/decisions.md"), "utf-8");
  const liveIds = collectLiveDecisionIds(decisionsContent);
  // 代码层（src/tests）与文档层（docs/skills + 根文档）全部纳入存活校验
  const refFiles: string[] = [];
  walkTsFiles(join(import.meta.dirname!, "..", "src"), refFiles);
  walkTsFiles(join(import.meta.dirname!, "..", "tests"), refFiles);
  walkMdFiles(join(import.meta.dirname!, "..", "docs"), refFiles);
  walkMdFiles(join(import.meta.dirname!, "..", "skills"), refFiles);
  for (const rootFile of ["CONTEXT.md", "AGENTS.md", "README.md"]) {
    refFiles.push(join(import.meta.dirname!, "..", rootFile));
  }
  const refResult = checkDecisionRefs(liveIds, refFiles);
  if (refResult.ok) {
    console.log(`  ✅ 代码层 + 文档层 — ${liveIds.size} live decisions, all D-xxx refs resolve`);
  } else {
    for (const e of refResult.errors) console.log(`  ❌ ${e}`);
    totalErrors += refResult.errors.length;
  }
  console.log(`\n${CONTAINERS.length} containers + decision refs checked. ${totalErrors} error(s).`);
  if (totalErrors > 0) {
    console.log("❌ Validation FAILED — fix before committing.");
    process.exit(1);
  }
  console.log("✅ All slot invariants and decision refs hold.");
}

main();
