/**
 * validate-skills.ts — Skill quality gate checks.
 *
 * Checks:
 *   1. description follows trigger-sentence convention ("Use when..." for disciplines)
 *   2. Directory name matches frontmatter "name"
 *   3. description length ≤ 1024 chars
 *   4. SKILL.md line count ≤ 200 (warning only)
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

interface SkillMeta {
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

interface CheckResult {
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

function checkDescriptionConvention(skill: SkillMeta): CheckResult {
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

// ─── principles.md 锚点存在性校验 ───
// 技能引用 principles.md 锚点（D-030 单一来源的引用机制），锚点被删除/改名会让引用静默失效：
//   - "per principles.md Quick Reference — Record Lifecycle" → Quick Reference 下的 ### 标题
//   - "per principles.md §7" → 编号标题（### 7. Declare What You Exclude）
//   - "principles.md Next-ID slots" → 粗体锚点（**Next-ID slots**）
// 本检查锁住引用可解析性。

const PRINCIPLES_FILE = join(SKILLS_ROOT, "..", "src", "bootstrap", "principles.md");

interface PrinciplesAnchors {
  /** Quick Reference 与 Project Records 两节的 ### 锚点（S4b 拆节后合并收集）。 */
  anchorSections: Set<string>;
  /** 编号标题（§N → 标题文本）；值仅作可读性参考，解析只用键。 */
  sections: Set<string>;
  bold: Set<string>;
}

function loadPrinciplesAnchors(): PrinciplesAnchors {
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

function checkPrinciplesRefs(skill: SkillMeta, anchors: PrinciplesAnchors): CheckResult {
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

// ─── Self-check: 锚点规则必须拒绝不存在的引用，同时放行真实引用 ───

function selfCheckPrinciplesAnchorRule(anchors: PrinciplesAnchors): void {
  const violating: SkillMeta = {
    dirName: "sample",
    layer: "workflows",
    frontmatterError: undefined,
    name: "sample",
    description: "sample",
    disableModelInvocation: false,
    content: [
      "per principles.md Quick Reference — Record Lifecycle",
      "per principles.md Project Records — Record Lifecycle",
      "per principles.md Project\nRecords — Also-Not-Real", // 折行引用必须被提取并拒绝（锁折行提取）
      "per principles.md §7",
      "per principles.md Quick Reference — This-Anchor-Does-Not-Exist",
      "per principles.md Project Records — Also-Not-Real",
      "per principles.md §99",
    ].join("\n"),
    lineCount: 4,
  };
  const result = checkPrinciplesRefs(violating, anchors);
  const fired = result.errors.filter((e) => e.includes("This-Anchor-Does-Not-Exist") || e.includes("Also-Not-Real") || e.includes("§99")).length;
  const falsePositive = result.errors.some((e) => e.includes("Record Lifecycle") || e.includes("§7"));
  if (fired < 5 || falsePositive) {
    console.error(
      `❌ Self-check FAILED: principles anchor rule did not behave correctly (fired=${fired}, falsePositive=${falsePositive}). Fix the rule or the self-check.`
    );
    process.exit(1);
  }
}

// ─── Self-check: the manual-invocation rule must actually reject violations ───

function selfCheckManualInvocationRule(): void {
  const violating: SkillMeta = {
    dirName: "sample",
    layer: "workflows",
    frontmatterError: undefined,
    name: "sample",
    description: "Compact the conversation when the user asks for a handoff.",
    disableModelInvocation: true,
    content: "",
    lineCount: 1,
  };
  // Boundary sample: the phrase is present mid-string but NOT a prefix. The rule must
  // reject it too — otherwise a regression from startsWith to includes would silently
  // pass (real files satisfy both, so positive validation cannot catch the relaxation).
  const midString: SkillMeta = {
    ...violating,
    description: "When the user asks for a handoff, Use /skill:sample to compact the conversation.",
  };
  for (const sample of [violating, midString]) {
    const result = checkDescriptionConvention(sample);
    const ruleFired = result.errors.some((e) => e.includes("Use /skill:sample"));
    if (!ruleFired) {
      console.error(
        "❌ Self-check FAILED: manual-invocation rule did not reject a violating description. Fix the rule or the self-check."
      );
      process.exit(1);
    }
  }
}

// ─── Self-check: model-invocable workflow trigger-first convention must warn on violations ───

function selfCheckModelInvocableConvention(): void {
  const violating: SkillMeta = {
    dirName: "sample",
    layer: "workflows",
    frontmatterError: undefined,
    name: "sample",
    description: "Per-task context bootstrap — descriptive-first description.",
    disableModelInvocation: false,
    content: "",
    lineCount: 1,
  };
  const result = checkDescriptionConvention(violating);
  const ruleFired = result.warnings.some((w) => w.includes("model-invocable workflow convention"));
  if (!ruleFired) {
    console.error(
      "❌ Self-check FAILED: model-invocable workflow convention did not warn on a descriptive-first description. Fix the rule or the self-check."
    );
    process.exit(1);
  }
  // 触发句前置的描述不应误报（warn 只针对描述优先措辞）
  const conforming: SkillMeta = {
    ...violating,
    description: "Use when the user wants to stress-test their thinking.",
  };
  const ok = checkDescriptionConvention(conforming);
  if (ok.warnings.some((w) => w.includes("model-invocable workflow convention"))) {
    console.error(
      "❌ Self-check FAILED: model-invocable workflow convention false-positives on a trigger-first description. Fix the rule or the self-check."
    );
    process.exit(1);
  }
}

// ─── Main ───

function main() {
  selfCheckManualInvocationRule();
  selfCheckModelInvocableConvention();
  const principlesAnchors = loadPrinciplesAnchors();
  selfCheckPrinciplesAnchorRule(principlesAnchors);
  const skills = collectSkills();
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

main();
