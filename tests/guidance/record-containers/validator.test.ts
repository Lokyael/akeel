import assert from "node:assert/strict";
import test from "node:test";
import {
  checkContainerContent,
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
