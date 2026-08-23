/**
 * validate-skills.test.ts — validate-skills.ts 规则行为测试。
 *
 * 原内嵌 self-check（脚本行数膨胀主因）按等价迁移为 node:test 参数化用例：
 *   1. 手动调用（disable-model-invocation）描述约定必须拒绝违规
 *   2. 模型可调用 workflow 触发句前置约定必须告警 / 不误报
 *   3. principles.md 锚点规则必须拒绝不存在引用、放行真实引用
 *   4. /skill: 交叉引用规则必须拦截祈使式、放行用户面向 / 描述性 / 自身引用
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDescriptionConvention,
  checkPrinciplesRefs,
  checkUserInvokedReferences,
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

test("user-invoked reference rule blocks imperatives and passes benign mention forms", () => {
  const userInvoked = skill({
    dirName: "improve-architecture",
    name: "improve-architecture",
    description: "Use /skill:improve-architecture when the codebase feels like a ball of mud.",
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
    { bullet: make({ content: "hand off to `/skill:improve-architecture`." }), violates: true },
    // 祈使式句首大写 → 违规
    { bullet: make({ content: "Hand off to `/skill:improve-architecture`." }), violates: true },
    // 用户面向措辞 → 放行
    { bullet: make({ content: "tell the user to run `/skill:improve-architecture`." }), violates: false },
    // 描述性提及 → 放行
    { bullet: make({ content: "invoked automatically when running `/skill:improve-architecture`." }), violates: false },
    // 模型可调用目标 → 放行
    { bullet: make({ content: "run `/skill:fix-validation`." }), violates: false },
    // 自身引用 → 放行
    { bullet: make({ dirName: "improve-architecture", name: "improve-architecture", content: "Use /skill:improve-architecture when the codebase feels like a ball of mud." }), violates: false },
  ];
  for (const { bullet, violates } of cases) {
    const result = checkUserInvokedReferences(bullet, registry);
    const fired = result.errors.length > 0;
    assert.equal(fired, violates, `content: "${bullet.content}"`);
  }
});