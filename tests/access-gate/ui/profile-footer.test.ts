import assert from "node:assert/strict";
import test from "node:test";
import { fallbackWidthHelpers, fitLine, renderProfileFooter, thinkingLevelFromEntries, type FooterSnapshot } from "../../../src/access-gate/ui/footer-layout";
import { selectWidthHelpers } from "../../../src/access-gate/ui/profile-footer";

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
  const lines = renderProfileFooter(snapshot, 120, fallbackWidthHelpers());

  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /develop$/);
  assert.doesNotMatch(lines[0]!, /Profile:/);
  assert.match(lines[1]!, /↑480k/);
  assert.match(lines[1]!, /gpt-5.6-luna • high$/);
});

test("right-aligns Profile after stripping ANSI styling codes from width calculations", () => {
  const line = fitLine("location", "\u001b[2mdevelop\u001b[0m", 40, fallbackWidthHelpers());

  assert.equal(line.length, 40 + 8);
  assert.equal(line.endsWith("\u001b[2mdevelop\u001b[0m"), true);
  assert.equal(line.indexOf("\u001b[2mdevelop"), 40 - "develop".length);
});

test("truncates both rows without allowing content to overlap", () => {
  const lines = renderProfileFooter(snapshot, 48, fallbackWidthHelpers());

  assert.equal(lines.length, 2);
  for (const line of lines) assert.ok(line.length <= 48);
  assert.match(lines[0]!, /develop$/);
  assert.match(lines[1]!, /gpt-5.6-luna • high$/);
});

test("selectWidthHelpers: uses pi-tui helpers when the module shape matches", () => {
  const calls: string[] = [];
  const fakeTui = {
    visibleWidth: (s: string) => { calls.push(`vw:${s}`); return s.length + 1; },
    truncateToWidth: (s: string, w: number, e?: string, p?: boolean) => {
      calls.push(`tw:${s}:${w}:${e}:${p}`);
      return `${s.slice(0, 2)}...`;
    },
    unrelated: () => {},
  };
  const helpers = selectWidthHelpers(fakeTui);
  assert.equal(helpers.visibleWidth("abc"), 4);
  assert.equal(helpers.truncate("hello", 5), "he...");
  // pi-tui 分支以默认省略符 "..." 且不 pad 调用 truncateToWidth
  assert.deepEqual(calls, ["vw:abc", "tw:hello:5:...:false"]);
});

test("selectWidthHelpers: falls back to hand-rolled helpers when unavailable", () => {
  assert.equal(selectWidthHelpers(null).visibleWidth("a\u001b[2mb\u001b[0m"), 2);
  assert.equal(selectWidthHelpers({}).visibleWidth("abc"), 3);
  assert.equal(selectWidthHelpers({ visibleWidth: "not-a-fn" }).truncate("abcdef", 5), "ab...");
});

test("thinkingLevelFromEntries: 取最近一次 thinking_level_change", () => {
  const entries = [
    { type: "message", text: "hi" },
    { type: "thinking_level_change", thinkingLevel: "low" },
    { type: "thinking_level_change", thinkingLevel: "high" },
  ];
  assert.equal(thinkingLevelFromEntries(entries), "high");
});

test("thinkingLevelFromEntries: 无匹配返回 off", () => {
  assert.equal(thinkingLevelFromEntries([]), "off");
  assert.equal(thinkingLevelFromEntries([{ type: "message", text: "hi" }]), "off");
});

test("thinkingLevelFromEntries: 非字符串 level 与非法条目跳过", () => {
  assert.equal(thinkingLevelFromEntries([{ type: "thinking_level_change", thinkingLevel: 3 }]), "off");
  assert.equal(thinkingLevelFromEntries(["junk", { type: "thinking_level_change", thinkingLevel: "low" }]), "low");
});
