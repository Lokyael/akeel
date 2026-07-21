import assert from "node:assert/strict";
import test from "node:test";
import { appendRight, renderProfileFooter, type FooterSnapshot } from "../../src/access-gate/ui/profile-footer";

const snapshot: FooterSnapshot = {
  cwd: "~/workspace/pi-skills",
  branch: "main",
  sessionName: undefined,
  profileName: "develop",
  stats: "↑480k ↓21k R2.1M $0.245",
  context: "35.2%/272k (auto)",
  extensionStatuses: new Map(),
  provider: "cctq_codex",
  model: "gpt-5.6-luna",
  thinkingLevel: "high",
};

test("renders the complete bottom UI as exactly two lines", () => {
  const lines = renderProfileFooter(snapshot, 120);

  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /develop$/);
  assert.doesNotMatch(lines[0]!, /Profile:/);
  assert.match(lines[1]!, /↑480k/);
  assert.match(lines[1]!, /gpt-5.6-luna • high$/);
});

test("right-aligns Profile after stripping ANSI styling codes from width calculations", () => {
  const line = appendRight("location", "\u001b[2mdevelop\u001b[0m", 40);

  assert.equal(line.length, 40 + 8);
  assert.equal(line.endsWith("\u001b[2mdevelop\u001b[0m"), true);
  assert.equal(line.indexOf("\u001b[2mdevelop"), 40 - "develop".length);
});

test("truncates both rows without allowing content to overlap", () => {
  const lines = renderProfileFooter(snapshot, 48);

  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(line.length <= 48);
  assert.match(lines[0]!, /develop$/);
  assert.match(lines[1]!, /gpt-5.6-luna • high$/);
});
