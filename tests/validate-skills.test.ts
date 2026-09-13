/**
 * validate-skills.test.ts — validate-skills.ts 规则行为测试。
 *
 * 原内嵌 self-check（脚本行数膨胀主因）按等价迁移为 node:test 参数化用例：
 *   1. 手动调用（disable-model-invocation）描述约定必须拒绝违规
 *   2. 模型可调用 workflow 触发句前置约定必须告警 / 不误报
 *   3. principles.md 锚点规则必须拒绝不存在引用、放行真实引用
 *   4. /skill: 交叉引用规则必须拒绝悬空目标与手动 workflow 祈使调用，并放行用户面向 / 描述性 / 自身引用
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
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

test("preflight and review publish safe-autonomy surface contracts", () => {
  const preflight = readFileSync(
    new URL("../skills/disciplines/change-preflight/SKILL.md", import.meta.url),
    "utf8",
  );
  const review = readFileSync(
    new URL("../skills/disciplines/code-review/SKILL.md", import.meta.url),
    "utf8",
  );

  assert.match(preflight, /read-only/i);
  assert.match(preflight, /never (?:modify|delete|commit)/i);
  assert.match(preflight, /run-id/i);
  assert.match(preflight, /quarantine/i);
  assert.match(preflight, /sensitive/i);
  assert.match(preflight, /BLOCKED/);
  assert.match(preflight, /dedicated.*temporary|専用.*临时/i);
  assert.doesNotMatch(preflight, /automatically remove|自动移除/i);

  assert.match(review, /immutable committed|不可变.*提交/i);
  assert.match(review, /mutable task|mutable.*surface/i);
  assert.match(review, /read-only.*READY|READY.*read-only/i);
});

test("delegated review and grilling publish fail-closed owner cleanup contracts", () => {
  const review = readFileSync(
    new URL("../skills/disciplines/code-review/SKILL.md", import.meta.url),
    "utf8",
  );
  const grill = readFileSync(
    new URL("../skills/workflows/grill-docs/SKILL.md", import.meta.url),
    "utf8",
  );

  for (const contract of [review, grill]) {
    assert.match(contract, /resolved base commit OID/i);
    assert.match(contract, /created by this run/i);
    assert.match(contract, /branch tip[^.]*base commit OID/i);
    assert.match(contract, /explicit approval[^.]*worktree[^.]*branch/i);
    assert.match(contract, /herdr worktree remove --workspace <workspace-id>/);
    assert.match(contract, /non-force/i);
    assert.match(contract, /dirty[^.]*diverged[^.]*unknown[^.]*reused[^.]*provenance-mismatched[^.]*force-required/i);
    assert.match(contract, /idle[^.]*done[^.]*not[^.]*process[^.]*exited/i);
    assert.match(contract, /blocked[^.]*explicitly abandons/i);
    assert.match(contract, /do not (?:expose|copy)[^.]*workspace lists[^.]*terminal history/i);
    assert.doesNotMatch(contract, /no active process remains/i);
    assert.match(contract, /never use[^.]*prefix-based[^.]*deletion/i);
  }

  assert.ok(
    review.indexOf("## 5. Clean Up Child Resources") > review.indexOf("## 4. Check Staleness"),
    "review cleanup must follow result reporting and staleness checking",
  );
});

test("debugging skills publish the current reproduction and causal-debugging contracts", () => {
  const root = new URL("../skills/disciplines/", import.meta.url);
  const reproductionUrl = new URL("bug-reproduction/SKILL.md", root);
  const debuggingUrl = new URL("systematic-debugging/SKILL.md", root);

  assert.ok(existsSync(reproductionUrl), "bug-reproduction must provide the feedback-signal capability");
  const debuggingSkills = readdirSync(root)
    .filter((name) => name.startsWith("bug-") || name === "systematic-debugging")
    .sort();
  assert.deepEqual(debuggingSkills, ["bug-reproduction", "systematic-debugging"]);

  const reproduction = readFileSync(reproductionUrl, "utf8");
  const debugging = readFileSync(debuggingUrl, "utf8");

  assert.match(reproduction, /^name: bug-reproduction$/m);
  assert.match(reproduction, /^description: Use when .*lacks a reliable.*signal/m);
  assert.match(reproduction, /reliable[\s\S]*probabilistic[\s\S]*blocked/);
  assert.match(reproduction, /iteration cost[\s\S]*observed rate/i);
  assert.match(reproduction, /Return the result to the caller/);

  assert.match(debugging, /^name: systematic-debugging$/m);
  assert.match(debugging, /^description: Use when investigating the root cause/m);
  assert.match(debugging, /principles\.md Project Records — Record Lifecycle/);
  assert.match(debugging, /\/skill:bug-reproduction/);
  assert.match(debugging, /discriminating experiment/);
  assert.match(debugging, /supported root cause/);
  assert.match(debugging, /Reuse an active Task Record that owns the reported issue/);
  assert.match(debugging, /Phase 5 begins with a `Confirmed` root cause and explicit user authorization/);
  assert.match(debugging, /\/skill:test-driven-development/);
  assert.match(debugging, /\/skill:fix-validation/);
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

test("implementation planning publishes an implementation-ready Task Plan contract", () => {
  const planningUrl = new URL(
    "../skills/disciplines/implementation-planning/SKILL.md",
    import.meta.url,
  );
  assert.ok(existsSync(planningUrl), "implementation-planning must be distributed");

  const planning = readFileSync(planningUrl, "utf8");
  const survey = readFileSync(
    new URL("../skills/workflows/survey-context/SKILL.md", import.meta.url),
    "utf8",
  );
  const design = readFileSync(
    new URL("../skills/workflows/brainstorm-design/SKILL.md", import.meta.url),
    "utf8",
  );
  const implementation = readFileSync(
    new URL("../skills/workflows/implement-work/SKILL.md", import.meta.url),
    "utf8",
  );

  assert.match(planning, /^name: implementation-planning$/m);
  assert.match(planning, /^description: Use when approved Requirements and Design need an implementation-ready Plan/m);
  assert.doesNotMatch(planning, /^disable-model-invocation: true$/m);
  assert.match(planning, /Plan Slice/);
  assert.match(planning, /Requirements covered/);
  assert.match(planning, /Depends on/);
  assert.match(planning, /Acceptance Criteria/);
  assert.match(planning, /Files and Seams/);
  assert.match(planning, /Verification/);
  assert.match(planning, /Task Record remains `draft`/);
  assert.match(survey, /`implementation-planning`/);
  assert.match(design, /`implementation-planning`/);
  assert.match(implementation, /approved Plan Slices/);
  assert.match(implementation, /`implementation-planning`/);
});

test("task lifecycle keeps checkpoints sparse and context current-tree only", () => {
  const principles = readFileSync(
    new URL("../src/bootstrap/principles.md", import.meta.url),
    "utf8",
  );
  const implementation = readFileSync(
    new URL("../skills/workflows/implement-work/SKILL.md", import.meta.url),
    "utf8",
  );
  const survey = readFileSync(
    new URL("../skills/workflows/survey-context/SKILL.md", import.meta.url),
    "utf8",
  );

  assert.match(principles, /Before implementation or clearing, every T-ID must have a complete Task Record/);
  assert.match(principles, /Update the Task Record only for cross-session continuity, handoff, or material authority changes/);
  assert.match(principles, /clear the Task in the completion commit before starting another Task/);
  assert.match(implementation, /Before implementation, confirm reachable Git history contains/);
  assert.match(implementation, /Do not commit Task Record changes for individual slices, tests, or steps/);
  assert.match(implementation, /commit the final landing change; it clears the Task before another Task starts/);
  assert.match(survey, /Routine survey reads the current tree only/);
  assert.match(survey, /does not load cleared Task Records from Git history/);
});

test("instruction editing publishes semantic preservation with an AKeel repository overlay", () => {
  const editingUrl = new URL(
    "../skills/disciplines/instruction-editing/SKILL.md",
    import.meta.url,
  );
  assert.ok(existsSync(editingUrl), "instruction-editing must be distributed");

  const editing = readFileSync(editingUrl, "utf8");
  const repositoryOverlay = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");

  assert.match(editing, /^name: instruction-editing$/m);
  assert.match(editing, /^description: Use when revising agent-facing prompts, skills, or operational instructions/m);
  assert.doesNotMatch(editing, /^disable-model-invocation: true$/m);
  assert.match(editing, /^### 1\. Inventory Behavioral Meaning$/m);
  assert.match(editing, /^### 2\. Express the Current Contract$/m);
  assert.match(editing, /^### 3\. Build Cohesive Structure$/m);
  assert.match(editing, /^### 4\. Normalize Terminology$/m);
  assert.match(editing, /^### 5\. Choose the Wording Direction$/m);
  assert.match(editing, /^### 6\. Validate References$/m);
  assert.match(editing, /^### 7\. Verify Semantic Preservation$/m);
  assert.match(repositoryOverlay, /^## AKeel Prompt Surface 维护约定$/m);
  assert.match(repositoryOverlay, /`instruction-editing`/);
  assert.match(repositoryOverlay, /D-054/);
  assert.match(repositoryOverlay, /`literal form`/);
  assert.match(repositoryOverlay, /`fixed text`/);
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
  assert.match(debugging, /module boundary prevents locking down the issue[\s\S]*?module-design/);
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

test("Candidate boundary guidance is shared and lazy-loaded only by Candidate actions", () => {
  const guideUrl = new URL("../skills/workflows/survey-context/candidate-review.md", import.meta.url);
  assert.equal(existsSync(guideUrl), true, "expected the shared Candidate review companion");

  const guide = readFileSync(guideUrl, "utf8");
  const survey = readFileSync(new URL("../skills/workflows/survey-context/SKILL.md", import.meta.url), "utf8");
  const domain = readFileSync(new URL("../skills/disciplines/domain-modeling/SKILL.md", import.meta.url), "utf8");
  const candidateSection = survey.slice(
    survey.indexOf("### 4. Review Candidates on explicit request"),
    survey.indexOf("### 5. Read active tasks"),
  );

  assert.match(candidateSection, /read `candidate-review\.md` only for this explicit branch/);
  assert.doesNotMatch(survey.slice(0, survey.indexOf("### 4. Review Candidates on explicit request")), /candidate-review\.md/);
  assert.match(domain, /creating, revising, merging, or splitting a Candidate[\s\S]*?`\.\.\/\.\.\/workflows\/survey-context\/candidate-review\.md`/);

  for (const contract of [
    /same unresolved question/,
    /same objective revisit evidence/,
    /independently promoted, implemented, or verified/,
    /current truth, historical comparison, or index/,
    /multiple modes, safety boundaries, or lifecycles/,
    /thematic similarity alone/i,
    /investigation inventory/,
    /zero-loss/i,
  ]) {
    assert.match(guide, contract);
  }
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