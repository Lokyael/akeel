import assert from "node:assert/strict";
import test from "node:test";
import {
  checkCandidateHygiene,
  checkContainerContent,
  checkTaskHygiene,
  validateRecordContainers,
} from "../../../packages/guidance/src/record-containers/validator";

test("checkContainerContent: accepts valid container with trailing slot", () => {
  const content = `# Candidates\n\n## C-001: 某候选\n\n- **Why Not Now:** 略\n\n## C-002: 待创建\n`;
  const res = checkContainerContent("docs/candidates.md", content, "C");
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkContainerContent: handles CRLF line endings and trailing whitespace", () => {
  const content = "# Tasks\r\n\r\n## T-001: Task One\r\n\r\n## T-002: 待创建\r\n\r\n  \r\n";
  const res = checkContainerContent("docs/task.md", content, "T");
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkContainerContent: rejects content with missing slot", () => {
  const content = `# Decisions\n\n## D-002: Decision Two\n\n**Decision:** 内容\n`;
  const res = checkContainerContent("docs/decisions.md", content, "D");
  assert.equal(res.ok, false);
  assert.match(res.errors[0]!, /expected exactly one slot heading.*found 0/);
});

test("checkContainerContent: rejects content with multiple slots", () => {
  const content = `# Tasks\n\n## T-001: 待创建\n\n## T-002: 待创建\n`;
  const res = checkContainerContent("docs/task.md", content, "T");
  assert.equal(res.ok, false);
  assert.match(res.errors[0]!, /expected exactly one slot heading.*found 2/);
});

test("checkContainerContent: rejects slot with mismatched prefix", () => {
  const content = `# Tasks\n\n## C-010: 待创建\n`;
  const res = checkContainerContent("docs/task.md", content, "T");
  assert.equal(res.ok, false);
  assert.match(res.errors[0]!, /slot prefix C does not match container \(expected T\)/);
});

test("checkContainerContent: rejects slot that is not the last non-empty line", () => {
  const content = `# Candidates\n\n## C-010: 待创建\n\n## C-011: 意外添加的候选正文\n`;
  const res = checkContainerContent("docs/candidates.md", content, "C");
  assert.equal(res.ok, false);
  assert.match(res.errors[0]!, /slot heading is not the last non-empty line/);
});

test("checkContainerContent: rejects empty or whitespace-only content", () => {
  const res = checkContainerContent("docs/task.md", "   \n\n  ", "T");
  assert.equal(res.ok, false);
  assert.match(res.errors[0]!, /expected exactly one slot heading.*found 0/);
});

test("validateRecordContainers: skips missing optional containers safely", () => {
  const mockReader = (relPath: string): string | null => {
    if (relPath === "docs/task.md") {
      return "# Tasks\n\n## T-001: 待创建\n";
    }
    return null; // candidates.md and decisions.md do not exist
  };

  const res = validateRecordContainers("/dummy/root", { readFn: mockReader });
  assert.equal(res.ok, true);
  assert.deepEqual(res.checked, ["docs/task.md"]);
  assert.deepEqual(res.errors, []);
});

test("validateRecordContainers: reports errors across multiple existing containers", () => {
  const mockReader = (relPath: string): string | null => {
    if (relPath === "docs/candidates.md") {
      return "# Candidates\n\n## C-001: 待创建\n\n残留内容\n";
    }
    if (relPath === "docs/task.md") {
      const mockSlot = "## " + "D-" + "001: 待创建\n";
      return "# Tasks\n\n" + mockSlot; // wrong prefix
    }
    if (relPath === "docs/decisions.md") {
      return "# Decisions\n\n## D-002: 待创建\n"; // ok
    }
    return null;
  };

  const res = validateRecordContainers("/dummy/root", { readFn: mockReader });
  assert.equal(res.ok, false);
  assert.deepEqual(res.checked, ["docs/candidates.md", "docs/task.md", "docs/decisions.md"]);
  assert.equal(res.errors.length, 2);
  assert.match(res.errors[0]!, /docs\/candidates\.md: slot heading is not the last non-empty line/);
  assert.match(res.errors[1]!, /docs\/task\.md: slot prefix D does not match container \(expected T\)/);
});

test("validateRecordContainers: returns empty checked list when no containers exist", () => {
  const res = validateRecordContainers("/dummy/root", { readFn: () => null });
  assert.equal(res.ok, true);
  assert.deepEqual(res.checked, []);
  assert.deepEqual(res.errors, []);
});

test("checkTaskHygiene: accepts valid active Task record with draft and in-progress statuses", () => {
  for (const status of ["draft", "in-progress"]) {
    const content = `# Tasks\n\n## T-001: Sample Feature\n\n- **Kind:** feature\n- **Status:** ${status}\n- **Reversal surface:** engineering\n\n### Background & Goal\n\nGoal.\n\n## T-002: 待创建\n`;
    const res = checkTaskHygiene(content);
    assert.equal(res.ok, true, `expected status '${status}' to be valid`);
    assert.deepEqual(res.errors, []);
  }
});

test("checkTaskHygiene: rejects persisted verified status after lifecycle simplification", () => {
  const content = `# Tasks\n\n## T-001: Sample Task\n\n- Kind: refactor\n- Status: verified\n- Reversal surface: engineering\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("invalid Task Status 'verified'")));
});

test("checkTaskHygiene: accepts empty / cleared task container", () => {
  const content = `# Tasks\n\n> 活跃任务\n\n## T-044: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkTaskHygiene: accepts plain metadata without Markdown emphasis", () => {
  const content = `# Tasks\n\n## T-001: Task\n\n- Kind: refactor\n- Status: in-progress\n- Reversal surface: engineering\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkTaskHygiene: rejects malformed metadata with a format hint", () => {
  const content = `# Tasks\n\n## T-001: Task\n\nKind: refactor\nStatus: in-progress\nReversal surface: engineering\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("expected Task metadata format")));
});

test("checkTaskHygiene: rejects Origin metadata", () => {
  const content = `# Tasks\n\n## T-001: Task\n\n- **Kind:** refactor\n- **Status:** in-progress\n- **Reversal surface:** user-boundary\n- **Origin:** C-012\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("unrecognized Task metadata field: Origin")));
});

test("checkTaskHygiene: rejects unknown plain metadata", () => {
  const content = `# Tasks\n\n## T-001: Task\n\n- Kind: refactor\n- Status: in-progress\n- Reversal surface: user-boundary\n- Origin: C-012\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("unrecognized Task metadata field: Origin")));
});

test("checkTaskHygiene: rejects non-standard Task Status such as complete", () => {
  const content = `# Tasks\n\n## T-001: Task\n\n- **Kind:** refactor\n- **Status:** complete\n- **Reversal surface:** user-boundary\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("invalid Task Status 'complete'")));
});

test("checkTaskHygiene: rejects invalid Task Kind and Reversal surface", () => {
  const badKind = `# Tasks\n\n## T-001: Task\n\n- **Kind:** enhancement\n- **Status:** draft\n- **Reversal surface:** engineering\n\n## T-002: 待创建\n`;
  const resKind = checkTaskHygiene(badKind);
  assert.equal(resKind.ok, false);
  assert.ok(resKind.errors.some((e) => e.includes("invalid Task Kind 'enhancement'")));

  const badSurface = `# Tasks\n\n## T-001: Task\n\n- **Kind:** bug\n- **Status:** draft\n- **Reversal surface:** internal\n\n## T-002: 待创建\n`;
  const resSurface = checkTaskHygiene(badSurface);
  assert.equal(resSurface.ok, false);
  assert.ok(resSurface.errors.some((e) => e.includes("invalid Task Reversal surface 'internal'")));
});

test("checkTaskHygiene: rejects missing required Task fields", () => {
  const missingStatus = `# Tasks\n\n## T-001: Task\n\n- **Kind:** feature\n- **Reversal surface:** engineering\n\n### Plan\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(missingStatus);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("missing required Task field: Status")));
});

test("checkTaskHygiene: rejects duplicate metadata fields", () => {
  const duplicate = `# Tasks\n\n## T-001: Task\n\n- **Kind:** feature\n- **Kind:** bug\n- **Status:** in-progress\n- **Reversal surface:** engineering\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(duplicate);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("duplicate Task field: Kind")));
});

test("checkTaskHygiene: ignores code blocks containing example task headings", () => {
  const withFence = `# Tasks\n\n## T-001: Real Task\n\n- **Kind:** feature\n- **Status:** in-progress\n- **Reversal surface:** engineering\n\n\`\`\`markdown\n## T-999: Fake Task\n- **Status:** complete\n\`\`\`\n\n## T-002: 待创建\n`;
  const res = checkTaskHygiene(withFence);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("validateRecordContainers: enforces Task hygiene on docs/task.md", () => {
  const mockReader = (relPath: string): string | null => {
    if (relPath === "docs/task.md") {
      return "# Tasks\n\n## T-001: Task\n\n- **Kind:** bug\n- **Status:** complete\n- **Reversal surface:** engineering\n\n## T-002: 待创建\n";
    }
    return null;
  };

  const res = validateRecordContainers("/dummy/root", { readFn: mockReader });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("invalid Task Status 'complete'")));
});

// ─── Candidate Hygiene Tests ───

test("checkCandidateHygiene: accepts plain candidate fields without Markdown emphasis", () => {
  const content = `# Candidates\n\n## C-001: Sample Idea\n\n- Why Not Now: Not needed yet.\n- Revisit condition: Upstream API is released.\n\n## C-002: 待创建\n`;
  const res = checkCandidateHygiene(content);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkCandidateHygiene: rejects missing required fields", () => {
  const content = `# Candidates\n\n## C-001: Sample Idea\n\n- Why Not Now: Not needed yet.\n\n## C-002: 待创建\n`;
  const res = checkCandidateHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("missing required Candidate field: Revisit condition")));
});

test("checkCandidateHygiene: rejects malformed fields with a format hint", () => {
  const content = `# Candidates\n\n## C-001: Sample Idea\n\nWhy Not Now: Not needed yet.\nRevisit condition: Upstream API is released.\n\n## C-002: 待创建\n`;
  const res = checkCandidateHygiene(content);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("expected Candidate field format")));
});

test("checkCandidateHygiene: accepts valid candidate records without status metadata", () => {
  const content = `# Candidates\n\n## C-001: Sample Idea\n\n- **Why Not Now:** Not needed yet.\n- **Revisit condition:** Upstream API is released.\n\n## C-002: 待创建\n`;
  const res = checkCandidateHygiene(content);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkCandidateHygiene: accepts empty / cleared candidates container", () => {
  const content = `# Candidates\n\n> Header\n\n## C-001: 待创建\n`;
  const res = checkCandidateHygiene(content);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test("checkCandidateHygiene: rejects candidates containing Status metadata (promoted, dismissed, parked)", () => {
  for (const status of ["promoted", "dismissed", "parked", "active"]) {
    const content = `# Candidates\n\n## C-001: Sample Idea\n\n- **Status:** ${status}\n- **Why Not Now:** Reason.\n- **Revisit condition:** Condition.\n\n## C-002: 待创建\n`;
    const res = checkCandidateHygiene(content);
    assert.equal(res.ok, false, `expected status '${status}' to be rejected in candidates`);
    assert.ok(res.errors.some((e) => e.includes("Candidate records must not contain Status metadata")));
  }
});

test("validateRecordContainers: enforces Candidate hygiene on docs/candidates.md", () => {
  const mockReader = (relPath: string): string | null => {
    if (relPath === "docs/candidates.md") {
      return "# Candidates\n\n## C-001: Stale Candidate\n\n- **Status:** promoted\n- **Why Not Now:** Done.\n\n## C-002: 待创建\n";
    }
    return null;
  };

  const res = validateRecordContainers("/dummy/root", { readFn: mockReader });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("Candidate records must not contain Status metadata")));
});
