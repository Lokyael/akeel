/** validate-docs.ts Decision hygiene contract tests. */

import assert from "node:assert/strict";
import test from "node:test";
import { checkContextHygiene, checkDecisionHygiene } from "../scripts/validate-docs";
import { checkCandidateHygiene, checkTaskHygiene } from "../packages/guidance/src/record-containers/validator";

const decisionId = "D-" + "123";
const validDecision = `## ${decisionId}: Example

**Reversal surface:** engineering

**Decision:** Keep the boundary explicit.

**Rules:**

- The rule stays at the owning seam.
- **Plan:** is ordinary nested content, not record metadata.

> **History:** can name an external concept inside a quotation.

**Compatibility:** Existing callers retain the public seam.

**Why:** It prevents drift. An external contract may end on 2030-01-01.

**Impact:** Callers use one contract.

**Rejected:** A duplicated contract.

**Out of Scope:** A separate migration tool.
`;

test("Decision hygiene accepts the minimal metadata and open specification sections", () => {
  const result = checkDecisionHygiene(validDecision);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("Decision hygiene requires one explicit valid reversal surface", () => {
  const missing = checkDecisionHygiene(validDecision.replace("**Reversal surface:** engineering\n\n", ""));
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.includes("Reversal surface")));

  const invalid = checkDecisionHygiene(validDecision.replace("engineering", "team-default"));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("user-boundary or engineering")));

  const duplicate = checkDecisionHygiene(validDecision.replace("**Decision:**", "**Reversal surface:** user-boundary\n\n**Decision:**"));
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((error) => error.includes("duplicate")));
});

test("Decision hygiene rejects retired Status and Origin metadata", () => {
  for (const metadata of ["**Status:** active", "**Origin:** C-123"]) {
    const result = checkDecisionHygiene(validDecision.replace("**Reversal surface:**", `${metadata}\n**Reversal surface:**`));
    assert.equal(result.ok, false, metadata);
    assert.ok(result.errors.some((error) => error.includes(metadata.split(":")[0]!.slice(2))), metadata);
  }
});

test("Decision hygiene rejects missing required fields and section order drift", () => {
  for (const field of ["Decision", "Why"]) {
    const missing = checkDecisionHygiene(validDecision.replace(new RegExp(`\\*\\*${field}:\\*\\*[^\\n]*\\n`), ""));
    assert.equal(missing.ok, false, field);
    assert.ok(missing.errors.some((error) => error.includes(`missing required Decision field: ${field}`)), field);
  }

  const requiredDrift = checkDecisionHygiene(validDecision.replace("**Decision:**", "**Why:** temporary\n\n**Decision:**"));
  assert.equal(requiredDrift.ok, false);
  assert.ok(requiredDrift.errors.some((error) => error.includes("order")));

  const trailingDrift = checkDecisionHygiene(validDecision.replace("**Rejected:**", "**Out of Scope:** temporary\n\n**Rejected:**"));
  assert.equal(trailingDrift.ok, false);
  assert.ok(trailingDrift.errors.some((error) => error.includes("order")));
});

test("Decision hygiene rejects top-level process fields but ignores nested labels", () => {
  for (const metadata of [
    "**Migration:** promoted from C-123",
    "**Migration history:** promoted from C-123",
    "**Reviewed by:** Alice",
    "**Reviewer:** Alice",
    "**Author:** Alice",
    "**Timestamp:** 2026-09-09T08:00:00Z",
    "**迁移历史:** 从 C-123 迁移",
    "**Plan:** implement in two slices",
  ]) {
    const result = checkDecisionHygiene(validDecision.replace("**Why:**", `${metadata}\n\n**Why:**`));
    assert.equal(result.ok, false, metadata);
    assert.ok(result.errors.some((error) => error.includes("process-history metadata")), metadata);
  }
});

test("Decision hygiene rejects task references and explicit migration history markers", () => {
  const task = checkDecisionHygiene(validDecision.replace("It prevents drift.", "It was implemented during T-122."));
  assert.equal(task.ok, false);
  assert.ok(task.errors.some((error) => error.includes("T-122")));

  for (const marker of [
    "dismissed C-123",
    "migrated from C-123",
    "promoted from C-123",
    "moved from C-123",
    "从 C-123 迁移",
  ]) {
    const result = checkDecisionHygiene(validDecision.replace("Example", `Example (${marker})`));
    assert.equal(result.ok, false, marker);
    assert.ok(result.errors.some((error) => error.includes("process-history marker")), marker);
  }

  const liveCandidateReference = checkDecisionHygiene(
    validDecision.replace("It prevents drift.", "The deferred alternative remains tracked in C-123."),
  );
  assert.equal(liveCandidateReference.ok, true);
});

test("Decision hygiene does not satisfy required fields from fenced code", () => {
  const fencedOnly = [
    `## ${decisionId}: Example`,
    "",
    "```markdown",
    "**Reversal surface:** engineering",
    "**Decision:** This is an example.",
    "**Why:** This is not record structure.",
    "```",
  ].join("\n");
  const result = checkDecisionHygiene(fencedOnly);
  assert.equal(result.ok, false);
  for (const field of ["Reversal surface", "Decision", "Why"]) {
    assert.ok(result.errors.some((error) => error.includes(`missing required Decision field: ${field}`)), field);
  }
});

test("Decision hygiene ignores fenced headings and process examples", () => {
  const fencedId = "D-" + "999";
  for (const [opening, closing] of [["~~~markdown", "~~~"], ["   ````markdown", "   ````"]]) {
    const fencedExample = [
      opening,
      `## ${fencedId}: Not a record`,
      "**Origin:** C-123",
      "This example mentions T-122 and promoted from C-123.",
      closing,
      "",
      "**Why:**",
    ].join("\n");
    const result = checkDecisionHygiene(validDecision.replace("**Why:**", fencedExample));
    assert.deepEqual(result.errors, [], opening);
  }
});

test("Decision hygiene rejects malformed Decision headings instead of skipping them", () => {
  for (const heading of ["## D-" + "12: Example", `## ${decisionId}:`, "## Decision 123: Example"]) {
    const result = checkDecisionHygiene(validDecision.replace(`## ${decisionId}: Example`, heading));
    assert.equal(result.ok, false, heading);
    assert.ok(result.errors.some((error) => error.includes("heading")), heading);
  }
});

// ─── CONTEXT.md Hygiene Tests ───

const validContext = `# AKeel Context

## Glossary

- **Term**: Meaning.

## Architecture

- Subsystem A handles pipeline X.
- Subsystem B handles pipeline Y.

## Active Decisions

- [D-002 Title](docs/decisions.md#d-002-title)

## Negative Space

- Deliberate exclusion.
`;

test("Context hygiene accepts valid minimal CONTEXT structure", () => {
  const result = checkContextHygiene(validContext);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("Context hygiene rejects missing required sections", () => {
  const missingArch = validContext.replace(
    "## Architecture\n\n- Subsystem A handles pipeline X.\n- Subsystem B handles pipeline Y.\n\n",
    "",
  );
  const result = checkContextHygiene(missingArch);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("missing required section '## Architecture'")));
});

test("Context hygiene rejects out of order sections", () => {
  const outOfOrder = `# AKeel Context

## Architecture

- Subsystem A.

## Glossary

- Term: Meaning.

## Active Decisions

- [D-002](docs/decisions.md)

## Negative Space

- Exclusion.
`;
  const result = checkContextHygiene(outOfOrder);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("out of order")));
});

test("Context hygiene rejects Architecture bullet exceeding character budget", () => {
  const longBullet = "- " + "A".repeat(1001);
  const withLong = validContext.replace("- Subsystem A handles pipeline X.", longBullet);
  const result = checkContextHygiene(withLong);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("exceeds budget")));
});

test("Context hygiene rejects Architecture enumerating skill roster", () => {
  const skillDump =
    "- Skills include module-design, assess-modularity, implementation-planning, and instruction-editing.";
  const withDump = validContext.replace("- Subsystem A handles pipeline X.", skillDump);
  const result = checkContextHygiene(withDump);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("enumerates skill workflow roster")));
});

// ─── Task Hygiene Tests ───

test("Task hygiene accepts valid minimal Task Record", () => {
  const validTask = `# Tasks\n\n## T-001: Sample Task\n\n- **Kind:** refactor\n- **Status:** verified\n- **Reversal surface:** user-boundary\n\n### Plan\n\n## T-002: 待创建\n`;
  const result = checkTaskHygiene(validTask);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("Task hygiene rejects non-standard status like complete", () => {
  const badTask = `# Tasks\n\n## T-001: Sample Task\n\n- **Kind:** refactor\n- **Status:** complete\n- **Reversal surface:** user-boundary\n\n### Plan\n\n## T-002: 待创建\n`;
  const result = checkTaskHygiene(badTask);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("invalid Task Status 'complete'")));
});

// ─── Candidate Hygiene Tests ───

test("Candidate hygiene accepts valid candidate records", () => {
  const validCandidate = `# Candidates\n\n## C-001: Sample Idea\n\n- **Why Not Now:** Not needed yet.\n- **Revisit condition:** Upstream API is released.\n\n## C-002: 待创建\n`;
  const result = checkCandidateHygiene(validCandidate);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("Candidate hygiene rejects candidates with Status metadata", () => {
  const badCandidate = `# Candidates\n\n## C-001: Sample Idea\n\n- **Status:** promoted\n- **Why Not Now:** Done.\n- **Revisit condition:** Upstream API is released.\n\n## C-002: 待创建\n`;
  const result = checkCandidateHygiene(badCandidate);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("Candidate records must not contain Status metadata")));
});

