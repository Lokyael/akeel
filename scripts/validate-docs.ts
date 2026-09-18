/**
 * validate-docs.ts — Project Record 槽位、Decision 引用和 Decision hygiene 校验
 *
 * 一、记录容器（docs/candidates.md、docs/task.md、docs/decisions.md）：
 *   1. 恰有一个占位槽位行 `## X-0NN: 待创建`
 *   2. 槽位是文件最后非空行（记录只能出现在槽位之前）
 *   3. 槽位前缀字母与容器匹配（C→candidates、T→task、D→decisions）
 *
 * 二、决策 ID 引用存活校验（AGENTS.md 决策 ID 引用纪律）：
 *   代码（packages/、tests/ 的 .ts）与文档层（docs/、packages/guidance/skills/ 的 .md，以及
 *   CONTEXT.md、AGENTS.md、README.md）中的 `D-xxx` 引用必须命中 docs/decisions.md 的
 *   存活标题（`## D-NNN:`，排除待创建槽位）。决策合并/剪除后引用即悬空——
 *   Git 保留历史是溯源手段，不是保留悬空引用的理由；剪除时应在同一变更内
 *   把引用更新到吸收条目。
 *
 * 三、Decision hygiene：存活 Decision 的顶层字段顺序、Reversal surface 值和明显过程历史标记。
 * 该检查只覆盖可确定的结构，不替代人工的语义零损失审计。
 *
 * 只做结构性校验，不做编号 vs Git 历史的比对——编号可被合法重编号（如连续任务压缩），
 * 历史比对会对合法操作误报。
 * 编号正确性由消费式占位结构（填充即消费）+ 记录纪律保障。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  checkContainerContent,
  RECORD_SLOT_RE,
  STANDARD_CONTAINERS,
} from "../packages/guidance/src/record-containers/validator.js";

const CONTAINERS = STANDARD_CONTAINERS;
const SLOT_RE = RECORD_SLOT_RE;
const DECISION_HEADING_RE = /^## (D-\d{3}): (.+)$/;
const DECISION_REF_RE = /\bD-\d{3}\b/g;

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

function checkContainer(file: string, expectedPrefix: string, content: string): CheckResult {
  const result = checkContainerContent(file, content, expectedPrefix);
  return { ok: result.ok, errors: [...result.errors] };
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

/** 递归收集目录下所有 .md 文件（docs/、packages/guidance/skills/）。 */
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
  const headings = "## D-001: Soft 技能匹配\n## D-028: 统一 Project Record 模型与 Candidate 显式复审\n## D-043: 待创建\n";
  const ids = collectLiveDecisionIds(headings);
  if (!ids.has("D-001") || !ids.has("D-028") || ids.has("D-043") || ids.size !== 2) {
    console.error(`❌ self-check FAILED: [live-ids] expected {D-001, D-028}, got ${JSON.stringify([...ids])}`);
    process.exit(1);
  }
}

// ─── Decision hygiene ───

const TOP_LEVEL_FIELD_RE = /^\*\*([^*\n]+):\*\*(?:\s.*)?$/;
const REVERSAL_RE = /^\*\*Reversal surface:\*\* (?:user-boundary|engineering)$/;
const TASK_REF_RE = /\bT-\d{3}\b/;
const PROCESS_WORD_RE = /\bdismiss(?:ed|al)?\s*(?:\(|（)?C-\d{3}\b|\b(?:migrated|promoted|moved)\s+from\s+[CT]-\d{3}\b|(?:从|由)\s*[CT]-\d{3}\s*(?:迁移|提升|移入|转入)/i;
const PROCESS_FIELDS = new Set([
  "status",
  "origin",
  "created",
  "created by",
  "created on",
  "updated",
  "updated by",
  "updated on",
  "date",
  "timestamp",
  "author",
  "history",
  "progress",
  "evidence",
  "plan",
  "verification",
  "implementation",
  "migration",
  "migration history",
  "transition",
  "transition history",
  "review",
  "review on",
  "reviewed by",
  "reviewed on",
  "reviewer",
  "commit",
  "pr",
  "日期",
  "时间戳",
  "作者",
  "创建日期",
  "更新时间",
  "迁移历史",
  "评审人",
]);
const TRAILING_SECTION_RANK = new Map([
  ["Impact", 0],
  ["Rejected", 1],
  ["Out of Scope", 2],
]);

interface DecisionEntry {
  id: string;
  title: string;
  lines: string[];
}

interface MarkdownFence {
  marker: "`" | "~";
  length: number;
}

function openingFence(line: string): MarkdownFence | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1]![0] === "`" && match[2]!.includes("`"))) return undefined;
  return { marker: match[1]![0] as MarkdownFence["marker"], length: match[1]!.length };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const content = line.replace(/^ {0,3}/, "");
  let markerLength = 0;
  while (content[markerLength] === fence.marker) markerLength++;
  return markerLength >= fence.length && /^[ \t]*$/.test(content.slice(markerLength));
}

function structuralLines(content: string): string[] {
  let fence: MarkdownFence | undefined;
  return content.split(/\r?\n/).map((line) => {
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      return "";
    }
    const opening = openingFence(line);
    if (!opening) return line;
    fence = opening;
    return "";
  });
}

function decisionEntries(content: string): { entries: DecisionEntry[]; errors: string[] } {
  const lines = structuralLines(content);
  const entries: DecisionEntry[] = [];
  const errors: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!/^## /.test(line)) continue;
    if (SLOT_RE.test(line)) continue;

    const heading = DECISION_HEADING_RE.exec(line);
    if (!heading || heading[2]!.trim().length === 0) {
      errors.push(`docs/decisions.md:${index + 1}: malformed Decision heading: ${line}`);
      continue;
    }
    const end = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^## /.test(candidate));
    entries.push({
      id: heading[1]!,
      title: heading[2]!,
      lines: lines.slice(index + 1, end === -1 ? lines.length : end),
    });
  }
  return { entries, errors };
}

function normalizedField(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Check only deterministic Decision hygiene; semantic pruning remains a human decision. */
export function checkDecisionHygiene(content: string): CheckResult {
  const parsed = decisionEntries(content);
  const errors = [...parsed.errors];
  for (const entry of parsed.entries) {
    const seen = new Set<string>();
    let hasDecision = false;
    let hasWhy = false;
    let trailingRank = -1;

    for (const line of [entry.title, ...entry.lines]) {
      if (TASK_REF_RE.test(line)) {
        errors.push(`${entry.id}: task reference is process history: ${line.trim()}`);
      }
      if (PROCESS_WORD_RE.test(line)) {
        errors.push(`${entry.id}: process-history marker is not allowed: ${line.trim()}`);
      }

      const label = TOP_LEVEL_FIELD_RE.exec(line)?.[1];
      if (!label) continue;
      if (PROCESS_FIELDS.has(normalizedField(label))) {
        errors.push(`${entry.id}: process-history metadata is not allowed: ${line.trim()}`);
        continue;
      }

      if (label === "Reversal surface") {
        if (seen.has(label)) errors.push(`${entry.id}: duplicate Decision field: ${label}`);
        if (hasDecision) errors.push(`${entry.id}: Reversal surface must appear before Decision`);
        if (!REVERSAL_RE.test(line)) errors.push(`${entry.id}: Reversal surface must be user-boundary or engineering`);
        seen.add(label);
        continue;
      }

      if (label === "Decision") {
        if (seen.has(label)) errors.push(`${entry.id}: duplicate Decision field: ${label}`);
        if (hasWhy) errors.push(`${entry.id}: Decision section order is invalid`);
        seen.add(label);
        hasDecision = true;
        continue;
      }

      if (label === "Why") {
        if (seen.has(label)) errors.push(`${entry.id}: duplicate Decision field: ${label}`);
        if (!hasDecision) errors.push(`${entry.id}: Why must appear after Decision`);
        seen.add(label);
        hasWhy = true;
        continue;
      }

      const rank = TRAILING_SECTION_RANK.get(label);
      if (rank !== undefined) {
        if (seen.has(label)) errors.push(`${entry.id}: duplicate Decision field: ${label}`);
        if (!hasWhy || rank <= trailingRank) errors.push(`${entry.id}: Decision trailing section order is invalid at ${label}`);
        seen.add(label);
        trailingRank = Math.max(trailingRank, rank);
        continue;
      }

      if (!hasDecision || hasWhy) {
        errors.push(`${entry.id}: top-level specification section must appear between Decision and Why: ${label}`);
      }
    }

    for (const required of ["Reversal surface", "Decision", "Why"] as const) {
      if (!seen.has(required)) errors.push(`${entry.id}: missing required Decision field: ${required}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// ─── CONTEXT.md Hygiene 校验 ───

export const CONTEXT_REQUIRED_SECTIONS = [
  "Glossary",
  "Architecture",
  "Active Decisions",
  "Negative Space",
] as const;

export const MAX_ARCHITECTURE_BULLET_CHARS = 1_000;

const KNOWN_SKILL_NAMES = [
  "module-design",
  "assess-modularity",
  "implementation-planning",
  "instruction-editing",
  "implement-work",
  "change-preflight",
  "code-review",
  "code-cleanup",
  "bug-reproduction",
  "systematic-debugging",
  "grill-docs",
  "survey-context",
  "doc-sync",
  "test-driven-development",
  "domain-modeling",
  "security-review",
  "fix-validation",
  "herdr",
];

export function checkContextHygiene(content: string): CheckResult {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/);

  // 1. 校验四大标准一级标题的完备性与顺序
  const h2Headings: Array<{ title: string; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("## ")) {
      h2Headings.push({ title: line.slice(3).trim(), lineIndex: i });
    }
  }

  const titles = h2Headings.map((h) => h.title);
  let lastIndex = -1;
  for (const expected of CONTEXT_REQUIRED_SECTIONS) {
    const idx = titles.indexOf(expected);
    if (idx === -1) {
      errors.push(`CONTEXT.md: missing required section '## ${expected}'`);
    } else if (idx < lastIndex) {
      errors.push(
        `CONTEXT.md: section '## ${expected}' is out of order (expected canonical order: ${CONTEXT_REQUIRED_SECTIONS.join(" → ")})`,
      );
    } else {
      lastIndex = idx;
    }
  }

  // 2. 校验 Architecture 章节的段落负荷与反累加器规则
  const archHeading = h2Headings.find((h) => h.title === "Architecture");
  if (archHeading) {
    const nextHeading = h2Headings.find((h) => h.lineIndex > archHeading.lineIndex);
    const archEnd = nextHeading ? nextHeading.lineIndex : lines.length;
    const archLines = lines.slice(archHeading.lineIndex + 1, archEnd);

    const bullets: Array<{ text: string; startLine: number }> = [];
    let currentBullet: { text: string; startLine: number } | null = null;

    for (let i = 0; i < archLines.length; i++) {
      const line = archLines[i]!;
      const actualLineNum = archHeading.lineIndex + 2 + i;
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        if (currentBullet) bullets.push(currentBullet);
        currentBullet = { text: line.trim().slice(2).trim(), startLine: actualLineNum };
      } else if (currentBullet && line.startsWith("  ")) {
        currentBullet.text += " " + line.trim();
      } else if (line.trim().length > 0) {
        if (currentBullet) {
          bullets.push(currentBullet);
          currentBullet = null;
        }
        bullets.push({ text: line.trim(), startLine: actualLineNum });
      } else {
        if (currentBullet) {
          bullets.push(currentBullet);
          currentBullet = null;
        }
      }
    }
    if (currentBullet) bullets.push(currentBullet);

    for (const b of bullets) {
      const charCount = Array.from(b.text).length;
      if (charCount > MAX_ARCHITECTURE_BULLET_CHARS) {
        const preview = b.text.slice(0, 60) + "...";
        errors.push(
          `CONTEXT.md: Architecture entry at line ${b.startLine} exceeds budget (${charCount} chars > ${MAX_ARCHITECTURE_BULLET_CHARS} max): "${preview}"`,
        );
      }

      let matchedSkills = 0;
      for (const skill of KNOWN_SKILL_NAMES) {
        if (b.text.includes(skill)) matchedSkills++;
      }
      if (matchedSkills >= 4) {
        errors.push(
          `CONTEXT.md: Architecture entry at line ${b.startLine} enumerates skill workflow roster (${matchedSkills} skills). Skill workflows belong in SKILL.md per principles.md.`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
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
  const hygieneResult = checkDecisionHygiene(decisionsContent);
  if (hygieneResult.ok) {
    console.log("  ✅ docs/decisions.md — Decision hygiene ok");
  } else {
    for (const error of hygieneResult.errors) console.log(`  ❌ ${error}`);
    totalErrors += hygieneResult.errors.length;
  }
  const contextContent = readFileSync(join(import.meta.dirname!, "..", "CONTEXT.md"), "utf-8");
  const contextHygieneResult = checkContextHygiene(contextContent);
  if (contextHygieneResult.ok) {
    console.log("  ✅ CONTEXT.md — Context hygiene ok");
  } else {
    for (const error of contextHygieneResult.errors) console.log(`  ❌ ${error}`);
    totalErrors += contextHygieneResult.errors.length;
  }
  const liveIds = collectLiveDecisionIds(decisionsContent);
  // 代码层（packages/、tests）与文档层（docs/、packages/guidance/skills/ + 根文档）全部纳入存活校验
  const refFiles: string[] = [];
  walkTsFiles(join(import.meta.dirname!, "..", "packages"), refFiles);
  walkTsFiles(join(import.meta.dirname!, "..", "tests"), refFiles);
  walkMdFiles(join(import.meta.dirname!, "..", "docs"), refFiles);
  walkMdFiles(join(import.meta.dirname!, "..", "packages", "guidance", "skills"), refFiles);
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
  console.log(`\n${CONTAINERS.length} containers + Decision hygiene + refs checked. ${totalErrors} error(s).`);
  if (totalErrors > 0) {
    console.log("❌ Validation FAILED — fix before committing.");
    process.exit(1);
  }
  console.log("✅ All document validation contracts hold.");
}

if (import.meta.main) main();
