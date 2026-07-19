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
import { join, basename } from "node:path";

const SKILLS_ROOT = join(import.meta.dirname!, "..", "skills");

interface SkillMeta {
  /** Full path to SKILL.md */
  filePath: string;
  /** Directory name (e.g. "codebase-design") */
  dirName: string;
  /** Layer: foundations, disciplines, or workflows */
  layer: string;
  /** Parsed frontmatter name */
  name: string;
  /** Parsed frontmatter description */
  description: string;
  /** SKILL.md line count */
  lineCount: number;
}

// ─── Frontmatter parser ───

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

// ─── Collect all SKILL.md files ───

function collectSkills(): SkillMeta[] {
  const skills: SkillMeta[] = [];
  for (const layer of ["foundations", "disciplines", "workflows"]) {
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
      skills.push({
        filePath: skillFile,
        dirName: entry,
        layer,
        name: fm["name"] || "",
        description: fm["description"] || "",
        lineCount: content.split("\n").length,
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

function checkDescriptionConvention(skill: SkillMeta): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!skill.description) {
    errors.push(`missing description — all skills MUST have a description in frontmatter`);
    return { pass: false, warnings, errors };
  }

  // Disciplines must start with "Use when/before/after/during..."
  if (skill.layer === "disciplines") {
    const validTriggers = ["Use when", "Use before", "Use after", "Use during"];
    if (!validTriggers.some((t) => skill.description.startsWith(t))) {
      errors.push(
        `description MUST start with "Use when/before/after/during..." (disciplines auto-match convention). Got: "${skill.description.slice(0, 60)}..."`
      );
    }
  }

  // Foundations: should be descriptive, no strict format enforcement
  // Workflows: should describe trigger condition

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
  const content = readFileSync(skill.filePath, "utf-8");

  // Match http:// or https:// URLs that look like CDN or external resource loads
  const urlPattern = /https?:\/\/(?:unpkg|cdn|jsdelivr|esm\.sh|skypack|cdnjs)\./gi;
  const matches = content.match(urlPattern);
  if (matches && matches.length > 0) {
    warnings.push(
      `Found ${matches.length} CDN/external URL reference(s). Skills should not depend on external CDN resources.`
    );
  }

  return { pass: true, warnings, errors: [] };
}

// ─── Main ───

function main() {
  const skills = collectSkills();
  console.log(`Validating ${skills.length} skills...\n`);

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const skill of skills) {
    const label = `[${skill.layer}/${skill.dirName}]`;
    const checks = [
      checkDescriptionConvention(skill),
      checkNameConsistency(skill),
      checkLineCount(skill),
      checkExternalUrls(skill),
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
