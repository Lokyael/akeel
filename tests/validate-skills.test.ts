/**
 * validate-skills.test.ts — validate-skills.ts 规则行为测试。
 *
 * 原内嵌 self-check（脚本行数膨胀主因）按等价迁移为 node:test 参数化用例：
 *   1. 手动调用（disable-model-invocation）描述约定必须拒绝违规
 *   2. 模型可调用 workflow 触发句前置约定必须告警 / 不误报
 *   3. principles.md 锚点规则必须拒绝不存在引用、放行真实引用
 *   4. /skill: 交叉引用规则必须拒绝悬空目标与手动 workflow 祈使调用，并放行用户面向 / 描述性 / 自身引用
 */

import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDescriptionConvention,
  checkPrinciplesRefs,
  checkSkillReferences,
  loadPrinciplesAnchors,
  type SkillMeta,
} from "../scripts/validate-skills";

function skill(overrides: Partial<SkillMeta> = {}): SkillMeta {
  return {
    dirName: "sample",
    layer: "workflows",
    frontmatterError: undefined,
    name: "sample",
    description: "sample",
    disableModelInvocation: false,
    content: "",
    lineCount: 1,
    ...overrides,
  };
}

test("manual-invocation description rule rejects violating descriptions", () => {
  const violating = skill({
    description: "Compact the conversation when the user asks for a handoff.",
    disableModelInvocation: true,
  });
  // Boundary: 短语在串中而非前缀——startsWith→includes 回归必须仍被拒
  const midString = skill({
    description: "When the user asks for a handoff, Use /skill:sample to compact the conversation.",
    disableModelInvocation: true,
  });
  for (const sample of [violating, midString]) {
    const result = checkDescriptionConvention(sample);
    assert.ok(
      result.errors.some((e) => e.includes("Use /skill:sample")),
      `expected manual-invocation rejection for: ${sample.description}`
    );
  }
});

test("model-invocable workflow convention warns on descriptive-first, not trigger-first", () => {
  const descriptive = skill({ description: "Per-task context bootstrap — descriptive-first description." });
  const result = checkDescriptionConvention(descriptive);
  assert.ok(
    result.warnings.some((w) => w.includes("model-invocable workflow convention")),
    "expected warning on descriptive-first description"
  );

  const triggerFirst = skill({ description: "Use when the user wants to stress-test their thinking." });
  const ok = checkDescriptionConvention(triggerFirst);
  assert.ok(
    !ok.warnings.some((w) => w.includes("model-invocable workflow convention")),
    "false positive on trigger-first description"
  );
});

test("review readiness skills publish distinct invocation and authority contracts", () => {
  const root = new URL("../skills/disciplines/", import.meta.url);
  const preflightUrl = new URL("change-preflight/SKILL.md", root);
  const retiredAuditUrl = new URL("code-audit/SKILL.md", root);

  assert.ok(existsSync(preflightUrl), "change-preflight must be distributed");
  assert.ok(!existsSync(retiredAuditUrl), "code-audit must not remain as a second trigger surface");

  const preflight = readFileSync(preflightUrl, "utf8");
  const review = readFileSync(new URL("code-review/SKILL.md", root), "utf8");
  const cleanup = readFileSync(new URL("code-cleanup/SKILL.md", root), "utf8");

  assert.match(preflight, /^name: change-preflight$/m);
  assert.match(preflight, /^description: Use before independent review or commit/m);
  assert.doesNotMatch(preflight, /^disable-model-invocation: true$/m);

  assert.match(review, /^description: .*independent.*fixed Review Surface.*without modifying files/m);
  assert.doesNotMatch(review, /^disable-model-invocation: true$/m);

  assert.match(cleanup, /^description: .*explicitly requests.*named scope.*behavior-preserving/m);
  assert.doesNotMatch(cleanup, /at the end of a development phase/);
});

test("module design and modularity assessment publish distinct invocation contracts", () => {
  const moduleDesign = readFileSync(
    new URL("../skills/disciplines/module-design/SKILL.md", import.meta.url),
    "utf8",
  );
  const assessModularity = readFileSync(
    new URL("../skills/workflows/assess-modularity/SKILL.md", import.meta.url),
    "utf8",
  );

  assert.match(moduleDesign, /^name: module-design$/m);
  assert.match(moduleDesign, /^description: Use when designing or revising a known module or interface/m);
  assert.doesNotMatch(moduleDesign, /^disable-model-invocation: true$/m);

  assert.match(assessModularity, /^name: assess-modularity$/m);
  assert.match(assessModularity, /^description: Use \/skill:assess-modularity /m);
  assert.match(assessModularity, /^disable-model-invocation: true$/m);
});

test("module design integrates boundary evidence and failure handling", () => {
  const moduleDesign = readFileSync(
    new URL("../skills/disciplines/module-design/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(moduleDesign, /^## Evaluate the Boundary$/m);
  assert.match(moduleDesign, /^### Test Surface$/m);
  assert.match(moduleDesign, /Adapter count is evidence, not a rule/);
  assert.match(moduleDesign, /A second independent consumer is useful evidence, not a prerequisite/);
  assert.match(moduleDesign, /Prefer testing through the public interface/);
  assert.match(moduleDesign, /higher-level seam[\s\S]*inherently integration-dependent|inherently integration-dependent[\s\S]*higher-level seam/);
  assert.match(moduleDesign, /Constrain invalid states[\s\S]*?Handle remaining failures explicitly/);
  assert.doesNotMatch(moduleDesign, /One Adapter = Hypothetical, Two = Real/);
});

test("modularity guidance routes known seam failures", () => {
  const debugging = readFileSync(
    new URL("../skills/disciplines/systematic-debugging/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(debugging, /module boundary prevents locking down this bug[\s\S]*?module-design/);
  assert.match(debugging, /recurring module-boundary problem[\s\S]*?assess-modularity/);
});

test("principles anchor rule rejects missing anchors and passes live ones", () => {
  const anchors = loadPrinciplesAnchors();
  const violating = skill({
    content: [
      "per principles.md Quick Reference — Record Lifecycle",
      "per principles.md Project Records — Record Lifecycle",
      "per principles.md Project\nRecords — Also-Not-Real", // 折行引用必须被提取并拒绝（锁折行提取）
      "per principles.md §7",
      "per principles.md Quick Reference — This-Anchor-Does-Not-Exist",
      "per principles.md Project Records — Also-Not-Real",
      "per principles.md §99",
    ].join("\n"),
  });
  const result = checkPrinciplesRefs(violating, anchors);
  const fired = result.errors.filter(
    (e) => e.includes("This-Anchor-Does-Not-Exist") || e.includes("Also-Not-Real") || e.includes("§99")
  ).length;
  // 与原 self-check 同契约：缺失锚点错误 ≥5（含折行提取），真实锚点零误报
  assert.ok(fired >= 5, `expected >=5 missing-anchor errors, got ${fired}: ${result.errors.join("; ")}`);
  assert.ok(
    !result.errors.some((e) => e.includes("Record Lifecycle") || e.includes("§7")),
    `false positive on live anchors: ${result.errors.join("; ")}`
  );
});

test("survey-context keeps Candidate review explicit and bounded", () => {
  const content = readFileSync(new URL("../skills/workflows/survey-context/SKILL.md", import.meta.url), "utf8");
  assert.match(content, /^description: .*when the user explicitly requests Candidate review/m);
  assert.match(content, /Candidate review is an explicit branch of this workflow, not part of the routine survey/);
  assert.match(content, /During a routine survey, keep the context focused on current truth and active Tasks/);
  assert.match(content, /explicitly requests review of all candidates/);
  assert.match(content, /names one or more `C-xxx` records/);
  assert.match(content, /locate each heading with Direct `grep` and read only from that heading through the next `##` heading/);
  assert.match(content, /report a missing ID and keep the remaining requested scope unchanged/);
});

test("skill reference rule rejects missing targets", () => {
  const source = skill({
    dirName: "source",
    name: "source",
    content: "run `/skill:missing-skill`.",
  });
  const result = checkSkillReferences(source, new Map([[source.dirName, source]]));
  assert.ok(
    result.errors.some((error) => error.includes("missing-skill") && error.includes("not found")),
    `expected a missing-target error, got: ${result.errors.join("; ")}`,
  );
});

test("user-invoked reference rule blocks imperatives and passes benign mention forms", () => {
  const userInvoked = skill({
    dirName: "assess-modularity",
    name: "assess-modularity",
    description: "Use /skill:assess-modularity to scan a repository for module-boundary friction.",
    disableModelInvocation: true,
  });
  const registry = new Map<string, SkillMeta>([
    [userInvoked.dirName, userInvoked],
    [
      "fix-validation",
      { ...userInvoked, dirName: "fix-validation", name: "fix-validation", disableModelInvocation: false },
    ],
  ]);
  const make = (overrides: Partial<SkillMeta>): SkillMeta => ({
    ...skill(),
    dirName: "code-cleanup",
    layer: "disciplines",
    name: "code-cleanup",
    description: "Use when cleaning up.",
    ...overrides,
  });
  const cases: Array<{ bullet: SkillMeta; violates: boolean }> = [
    // 祈使式 "hand off to" → 违规
    { bullet: make({ content: "hand off to `/skill:assess-modularity`." }), violates: true },
    // 祈使式句首大写 → 违规
    { bullet: make({ content: "Hand off to `/skill:assess-modularity`." }), violates: true },
    // 用户面向措辞 → 放行
    { bullet: make({ content: "tell the user to run `/skill:assess-modularity`." }), violates: false },
    // 描述性提及 → 放行
    { bullet: make({ content: "invoked automatically when running `/skill:assess-modularity`." }), violates: false },
    { bullet: make({ content: "A call to `/skill:assess-modularity` is documented here." }), violates: false },
    { bullet: make({ content: "The command run is represented by `/skill:assess-modularity`." }), violates: false },
    // 模型可调用目标 → 放行
    { bullet: make({ content: "run `/skill:fix-validation`." }), violates: false },
    // 同一祈使子句中较后的手动目标仍必须被拦截
    { bullet: make({ content: "run `/skill:fix-validation` and `/skill:assess-modularity`." }), violates: true },
    // modal 指令与缩进 Markdown 列表同样属于模型调用
    { bullet: make({ content: "You should run `/skill:assess-modularity`." }), violates: true },
    { bullet: make({ content: "The workflow must invoke `/skill:assess-modularity`." }), violates: true },
    { bullet: make({ content: "  - run `/skill:assess-modularity`." }), violates: true },
    // 自身引用 → 放行
    { bullet: make({ dirName: "assess-modularity", name: "assess-modularity", content: "Use /skill:assess-modularity to scan a repository for module-boundary friction." }), violates: false },
  ];
  for (const { bullet, violates } of cases) {
    const result = checkSkillReferences(bullet, registry);
    const fired = result.errors.length > 0;
    assert.equal(fired, violates, `content: "${bullet.content}"`);
  }
});