/**
 * validate-skills.ts — Skill quality gate checks.
 *
 * Checks:
 *   1. description follows trigger-sentence convention ("Use when..." for disciplines)
 *   2. Directory name matches frontmatter "name"
 *   3. description length ≤ 1024 chars
 *   4. SKILL.md line count ≤ 200 (warning only)
 *   5. /skill: body references must never invoke user-invoked skills (D-036)
 *
 * 规则行为测试迁出至 tests/validate-skills.test.ts（node:test）。
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";

const SKILLS_ROOT = join(import.meta.dirname!, "..", "skills");
const SKILL_LAYERS = ["foundations", "disciplines", "workflows"] as const;

/** 触发句前缀（disciplines 强制 + 模型可调用 workflow 告警共用）。 */
const TRIGGER_PREFIXES = ["Use when", "Use before", "Use after", "Use during"] as const;

interface FrontmatterResult {
  values: Record<string, unknown>;
  error?: string;
}

export interface SkillMeta {
  /** Directory name (e.g. "codebase-design") */
  dirName: string;
  /** Layer: foundations, disciplines, or workflows */
  layer: string;
  /** Frontmatter parsing error, if present */
  frontmatterError?: string;
  /** Parsed frontmatter name */
  name: string;
  /** Parsed frontmatter description */
  description: string;
  /** Parsed frontmatter disable-model-invocation */
  disableModelInvocation: boolean;
  /** Complete SKILL.md content */
  content: string;
  /** SKILL.md line count */
  lineCount: number;
}

// ─── Frontmatter parser ───

function parseFrontmatter(content: string): FrontmatterResult {
  const lines = content.split(/\r?\n/);
  const opening = lines[0]?.replace(/^\uFEFF/, "");
  if (opening !== "---") {
    return { values: {}, error: 'missing opening "---" delimiter' };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && (line === "---" || line === "..."),
  );
  if (closingIndex === -1) {
    return { values: {}, error: 'missing closing "---" delimiter' };
  }

  try {
    const document = parseDocument(lines.slice(1, closingIndex).join("\n"));
    if (document.errors.length > 0) {
      return { values: {}, error: document.errors[0].message };
    }

    const value = document.toJSON();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { values: {}, error: "frontmatter must be a YAML mapping" };
    }

    return { values: value as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { values: {}, error: `unable to parse YAML: ${message}` };
  }
}

// ─── Collect all SKILL.md files ───

function collectSkills(): SkillMeta[] {
  const skills: SkillMeta[] = [];
  for (const layer of SKILL_LAYERS) {
    const layerDir = join(SKILLS_ROOT, layer);
    if (!existsSync(layerDir)) continue;

    for (const entry of readdirSync(layerDir)) {
      const entryPath = join(layerDir, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      const skillFile = join(entryPath, "SKILL.md");
      if (!existsSync(skillFile)) {
        console.warn(`⚠ MISSING: ${skillFile} — no SKILL.md in skill directory`);
        continue;
      }

      const content = readFileSync(skillFile, "utf-8");
      const fm = parseFrontmatter(content);
      const name = fm.values["name"];
      const description = fm.values["description"];
      const disableModelInvocation = fm.values["disable-model-invocation"] === true;
      skills.push({
        dirName: entry,
        layer,
        frontmatterError: fm.error,
        name: typeof name === "string" ? name : "",
        description: typeof description === "string" ? description : "",
        disableModelInvocation,
        content,
        lineCount: content.split(/\r?\n/).length,
      });
    }
  }
  return skills;
}

// ─── Checks ───

export interface CheckResult {
  pass: boolean;
  warnings: string[];
  errors: string[];
}

function checkFrontmatter(skill: SkillMeta): CheckResult {
  if (!skill.frontmatterError) return { pass: true, warnings: [], errors: [] };
  return {
    pass: false,
    warnings: [],
    errors: [`invalid frontmatter: ${skill.frontmatterError}`],
  };
}

export function checkDescriptionConvention(skill: SkillMeta): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (skill.frontmatterError) return { pass: true, warnings, errors };

  if (!skill.description) {
    errors.push(`missing description — all skills MUST have a description in frontmatter`);
    return { pass: false, warnings, errors };
  }

  // Disciplines must start with "Use when/before/after/during..."
  if (skill.layer === "disciplines") {
    if (!TRIGGER_PREFIXES.some((t) => skill.description.startsWith(t))) {
      errors.push(
        `description MUST start with "Use when/before/after/during..." (disciplines auto-match convention). Got: "${skill.description.slice(0, 60)}..."`
      );
    }
  }

  // Foundations: should be descriptive, no strict format enforcement

  // Workflows with disable-model-invocation: manual-only skills — description MUST be an
  // explicit invocation guide, not a model-facing trigger promise that can never fire.
  if (
    skill.layer === "workflows" &&
    skill.disableModelInvocation &&
    !skill.description.startsWith(`Use /skill:${skill.name}`)
  ) {
    errors.push(
      `description MUST start with "Use /skill:${skill.name}" (disable-model-invocation skills are user-invoked only; model-facing trigger wording would never fire). Got: "${skill.description.slice(0, 60)}..."`
    );
  }

  // Model-invocable workflows (no disable-model-invocation): trigger sentence first —
  // the trigger is what the model matches on; burying it mid-description weakens matching.
  if (skill.layer === "workflows" && !skill.disableModelInvocation) {
    if (!TRIGGER_PREFIXES.some((t) => skill.description.startsWith(t))) {
      warnings.push(
        `description should start with "Use when/before/after/during..." (model-invocable workflow convention). Got: "${skill.description.slice(0, 60)}..."`
      );
    }
  }

  // Description length
  if (skill.description.length > 1024) {
    errors.push(
      `description too long: ${skill.description.length} chars (max 1024). Models have limited consumption windows.`
    );
  }

  return { pass: errors.length === 0, warnings, errors };
}

function checkNameConsistency(skill: SkillMeta): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (skill.frontmatterError) return { pass: true, warnings, errors };

  if (!skill.name) {
    errors.push(`missing "name" in frontmatter — every SKILL.md must have a name field`);
    return { pass: false, warnings, errors };
  }

  if (skill.name !== skill.dirName) {
    errors.push(
      `name/directory mismatch: frontmatter name="${skill.name}", directory="${skill.dirName}". They MUST match to prevent naming drift.`
    );
  }

  return { pass: errors.length === 0, warnings, errors };
}

function checkLineCount(skill: SkillMeta): CheckResult {
  const warnings: string[] = [];
  if (skill.lineCount > 200) {
    warnings.push(
      `SKILL.md is ${skill.lineCount} lines (threshold: 200). Consider splitting into sub-files (e.g., tests.md, mocking.md pattern).`
    );
  }
  return { pass: true, warnings, errors: [] };
}

// ─── CDN / external URL detection ───

function checkExternalUrls(skill: SkillMeta): CheckResult {
  const warnings: string[] = [];

  // Match http:// or https:// URLs that look like CDN or external resource loads
  const urlPattern = /https?:\/\/(?:unpkg|cdn|jsdelivr|esm\.sh|skypack|cdnjs)\./gi;
  const matches = skill.content.match(urlPattern);
  if (matches && matches.length > 0) {
    warnings.push(
      `Found ${matches.length} CDN/external URL reference(s). Skills should not depend on external CDN resources.`
    );
  }

  return { pass: true, warnings, errors: [] };
}

// ─── /skill: 交叉引用检查：user-invoked 目标只能以用户指令形式出现 ───
// D-036 将 workflows 分为手动调用（disable-model-invocation）与模型调用。
// 手动调用的 skill 只能由用户发起；另一技能正文若用祈使式（hand off to /
// invoke / run / call）引用它，模型执行时该调用不可达且静默失败——mattpocock
// 上游同型缺陷（2026-08-15 修复）。正确形态是把动作明确交给用户
// （"tell the user to run /skill:..."）。含 user/human/them 用户面向措辞的行、
// 描述性提及（when running /skill:X）与自身描述自我引用一律放行。

const USER_INVOKED_IMPERATIVE = /(?:hand off to|invoke|run|call the skills? tool with|call)\s*$/i;

export function checkUserInvokedReferences(skill: SkillMeta, registry: Map<string, SkillMeta>): CheckResult {
  const errors: string[] = [];
  const lines = skill.content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/\/skill:([a-z0-9-]+)/g)) {
      const target = registry.get(match[1]!);
      if (!target || !target.disableModelInvocation) continue;
      // 自身描述中的自我引用（user-invoked 约定 "Use /skill:<name>"）不是交叉调用
      if (target.dirName === skill.dirName) continue;
      // 用户面向措辞：动作交给用户（"tell the user to run ..."），不是模型调用
      if (/\b(?:user|human|them)\b/i.test(line)) continue;
      // 祈使式引导紧贴提及（行尾锚定，剥离开场反引号）→ 违规
      if (USER_INVOKED_IMPERATIVE.test(line.slice(0, match.index!).replace(/[`\s]+$/, ""))) {
        errors.push(
          `\`/skill:${match[1]}\` is user-invoked (disable-model-invocation) — a skill body cannot invoke it; phrase the hand-off as an instruction for the user (e.g. "tell the user to run /skill:${match[1]}"). Line ${index + 1}: "${line.trim().slice(0, 80)}"`
        );
      }
    }
  }
  return { pass: errors.length === 0, warnings: [], errors };
}

// ─── principles.md 锚点存在性校验 ───
// 技能引用 principles.md 锚点（D-030 单一来源的引用机制），锚点被删除/改名会让引用静默失效：
//   - "per principles.md Quick Reference — Record Lifecycle" → Quick Reference 下的 ### 标题
//   - "per principles.md §7" → 编号标题（### 7. Declare What You Exclude）
//   - "principles.md Next-ID slots" → 粗体锚点（**Next-ID slots**）
// 本检查锁住引用可解析性。

const PRINCIPLES_FILE = join(SKILLS_ROOT, "..", "src", "bootstrap", "principles.md");

export interface PrinciplesAnchors {
  /** Quick Reference 与 Project Records 两节的 ### 锚点（S4b 拆节后合并收集）。 */
  anchorSections: Set<string>;
  /** 编号标题（§N → 标题文本）；值仅作可读性参考，解析只用键。 */
  sections: Set<string>;
  bold: Set<string>;
}

export function loadPrinciplesAnchors(): PrinciplesAnchors {
  const anchors: PrinciplesAnchors = { anchorSections: new Set(), sections: new Set(), bold: new Set() };
  const content = readFileSync(PRINCIPLES_FILE, "utf-8");
  let inAnchorSection = false;
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!;
      // Quick Reference 与 Project Records 都是可引用锚点节（S4b 拆节后项目记录锚点独立成节）
      if (level === 2) inAnchorSection = text === "Quick Reference" || text === "Project Records";
      if (inAnchorSection && level >= 3) anchors.anchorSections.add(text);
      const numbered = text.match(/^(\d+)[.．]\s+(.+)$/);
      if (numbered) anchors.sections.add(numbered[1]!);
      continue;
    }
    const boldMatch = line.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) anchors.bold.add(boldMatch[1]!);
  }
  return anchors;
}

interface PrinciplesRef {
  kind: "qr" | "sec" | "bare";
  value: string;
  raw: string;
}

function extractPrinciplesRefs(content: string): PrinciplesRef[] {
  const refs: PrinciplesRef[] = [];
  // 捕获到句末（。或换行）；尾随续文（如 ") only when..."）由 checkPrinciplesRefs 的子串判定容忍；
  // 节名允许折行（principles.md Project\nRecords — X，domain-modeling 既有折行形式）
  const qr = /principles\.md\s+(?:Quick\s+Reference|Project\s+Records)\s+—\s+([^\n。]+)/g;
  for (const m of content.matchAll(qr)) {
    refs.push({ kind: "qr", value: m[1]!.trim(), raw: m[0]! });
  }
  const sec = /principles\.md\s+§\s*(\d+[a-z]?)/g;
  for (const m of content.matchAll(sec)) {
    refs.push({ kind: "sec", value: m[1]!, raw: m[0]! });
  }
  // 裸 §N 引用（无 principles.md 前缀）：技能内 § 只用于原则编号引用（如 "(§9 Centralize...)"）；
  // 编号归位时这类引用同样必须存活——曾因裸 § 未被提取而静默悬空（S4a 回归）
  const bareSec = /(?:^|[^\w])§\s*(\d+[a-z]?)/g;
  for (const m of content.matchAll(bareSec)) {
    refs.push({ kind: "sec", value: m[1]!, raw: m[0]! });
  }
  // bare 锚点：principles.md 后跟非 "Quick Reference" / "§" 的词组（如 Next-ID slots）
  const bare = /principles\.md\s+([A-Z][A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)*)/g;
  for (const m of content.matchAll(bare)) {
    const head = m[1]!.replace(/\s+/g, " ");
    if (head.startsWith("Quick Reference") || head.startsWith("Project Records")) continue;
    refs.push({ kind: "bare", value: head, raw: m[0]! });
  }
  return refs;
}

export function checkPrinciplesRefs(skill: SkillMeta, anchors: PrinciplesAnchors): CheckResult {
  const errors: string[] = [];
  for (const ref of extractPrinciplesRefs(skill.content)) {
    let found = false;
    if (ref.kind === "sec") {
      found = anchors.sections.has(ref.value);
    } else {
      // 引用文本可能带尾部续文（"... Lifecycle) only when..."）或跨行折行——
      // 空白归一化后用已知锚点做子串包含判定；锚点被删除/改名时引用不再
      // 包含任何已知锚点 → 报错（防静默断链）
      const normalized = ref.value.replace(/\s+/g, " ");
      const pool = ref.kind === "qr"
        ? anchors.anchorSections
        : new Set([...anchors.anchorSections, ...anchors.bold]);
      for (const anchor of pool) {
        if (normalized.includes(anchor)) { found = true; break; }
      }
    }
    if (!found) {
      errors.push(`principles.md anchor not found: "${ref.raw}" (resolved ${ref.kind}:${ref.value})`);
    }
  }
  return { pass: errors.length === 0, warnings: [], errors };
}

// ─── Main ───

function main() {
  const principlesAnchors = loadPrinciplesAnchors();
  const skills = collectSkills();
  const skillRegistry = new Map(skills.map((skill) => [skill.dirName, skill]));
  console.log(`Validating ${skills.length} skills...\n`);

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const skill of skills) {
    const label = `[${skill.layer}/${skill.dirName}]`;
    const checks = [
      checkFrontmatter(skill),
      checkDescriptionConvention(skill),
      checkNameConsistency(skill),
      checkLineCount(skill),
      checkExternalUrls(skill),
      checkPrinciplesRefs(skill, principlesAnchors),
      checkUserInvokedReferences(skill, skillRegistry),
    ];

    const skillErrors = checks.flatMap((c) => c.errors);
    const skillWarnings = checks.flatMap((c) => c.warnings);

    if (skillErrors.length === 0 && skillWarnings.length === 0) {
      console.log(`  ✅ ${label} — pass`);
    } else {
      for (const e of skillErrors) console.log(`  ❌ ${label} ${e}`);
      for (const w of skillWarnings) console.log(`  ⚠️  ${label} ${w}`);
      totalErrors += skillErrors.length;
      totalWarnings += skillWarnings.length;
    }
  }

  console.log(`\n${skills.length} skills checked. ${totalErrors} error(s), ${totalWarnings} warning(s).`);

  if (totalErrors > 0) {
    console.log("❌ Validation FAILED — fix errors above before committing.");
    process.exit(1);
  }

  if (totalWarnings > 0) {
    console.log("⚠️  Validation passed with warnings — review before committing.");
  } else {
    console.log("✅ All checks passed.");
  }
}

// 脚本直跑时执行校验；被测试导入时仅暴露规则函数（自检已迁至 tests/）。
if (import.meta.main) {
  main();
}
