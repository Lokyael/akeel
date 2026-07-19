/**
 * permission-engine.test.ts — Permission engine and wildcard matching tests.
 *
 * Run: npx tsx tests/security-gate/permission-engine.test.ts
 */

import { wildcardMatch } from "../../src/security-gate/shared/wildcard";
import { evaluatePermission, buildRuleset } from "../../src/security-gate/policy/permission";
import type { SecurityConfig } from "../../src/security-gate/types";

// ─── Test helpers ───

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { console.error("  FAIL:", msg); failed++; }
}

function section(name: string): void {
  console.log("\n" + name);
}

// ─── Minimal config for buildRuleset tests ───

function testConfig(overrides?: Partial<SecurityConfig>): SecurityConfig {
  return {
    level: "standard",
    permission: {
      "*": "ask",
      path: { "*": "allow", ".env": "deny" },
      read: { "*": "allow" },
      write: { "*": "ask", "*.lock": "deny" },
      edit: { "*": "ask", "*.lock": "deny" },
      external_directory: "ask",
      bash: {},
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// 1. wildcardMatch
// ═══════════════════════════════════════════════

section("1. wildcardMatch");

// Basic * matching
assert(wildcardMatch("*", "anything"), "* matches anything");
assert(wildcardMatch("*.ts", "file.ts"), "*.ts matches file.ts");
assert(wildcardMatch("*.ts", "src/file.ts"), "*.ts matches nested path (* matches any chars incl /)");
assert(wildcardMatch("src/**", "src/a/b/c"), "** matches nested directories");
assert(wildcardMatch("**/.git/config", "a/b/.git/config"), "** matches any prefix");

// ? matching
assert(wildcardMatch("file.???", "file.txt"), "? matches single char (txt=3)");
assert(wildcardMatch("file.???", "file.ts") === false, "??? does NOT match 2-char extension");
assert(wildcardMatch("file.?", "file.ts") === false, "? does NOT match two chars");

// Case sensitivity
assert(wildcardMatch("*.ts", "FILE.TS"), "matching is case-insensitive");

// Regex special chars in patterns are escaped
assert(wildcardMatch(".env", ".env"), ".env matches .env literally");
assert(wildcardMatch(".env", "xenv") === false, ".env does NOT match xenv");
assert(wildcardMatch("file[0-9].ts", "file1.ts") === false, "[ is literal, not regex range");

// Edge cases
assert(wildcardMatch("", ""), "empty pattern matches empty value");
assert(wildcardMatch("", "x") === false, "empty pattern does NOT match non-empty value");
assert(wildcardMatch("*.env", ".env"), "*.env matches .env (* matches zero chars)");

// ═══════════════════════════════════════════════
// 2. buildRuleset
// ═══════════════════════════════════════════════

section("2. buildRuleset");

// Default rule is first
{
  const rules = buildRuleset("read", testConfig());
  assert(rules[0].surface === "*" && rules[0].pattern === "*" && rules[0].action === "ask",
    "default rule: surface=*, pattern=*, action=ask");
}

// Path rules are included after default
{
  const rules = buildRuleset("write", testConfig());
  const pathRules = rules.filter(r => r.surface === "path");
  assert(pathRules.length === 2, "2 path rules: *:allow, .env:deny");
  assert(pathRules.some(r => r.pattern === "*" && r.action === "allow"), "path * → allow");
  assert(pathRules.some(r => r.pattern === ".env" && r.action === "deny"), "path .env → deny");
}

// Tool-specific rules for write surface
{
  const rules = buildRuleset("write", testConfig());
  const toolRules = rules.filter(r => r.surface === "write");
  assert(toolRules.length === 2, "2 write rules: *:ask, *.lock:deny");
}

// Tool-specific rules for edit surface
{
  const rules = buildRuleset("edit", testConfig());
  const toolRules = rules.filter(r => r.surface === "edit");
  assert(toolRules.length === 2, "2 edit rules: *:ask, *.lock:deny");
}

// read surface: tool config is Record, not string
{
  const rules = buildRuleset("read", testConfig());
  const toolRules = rules.filter(r => r.surface === "read");
  assert(toolRules.length === 1, "1 read rule: *:allow");
}

// bash surface: no tool-specific rules
{
  const rules = buildRuleset("bash", testConfig());
  const toolRules = rules.filter(r => r.surface === "bash");
  assert(toolRules.length === 0, "no tool-specific rules for bash surface");
}

// tool config as string (PermissionAction, not Record)
{
  const cfg = testConfig({ permission: { ...testConfig().permission, write: "allow" } });
  const rules = buildRuleset("write", cfg);
  const toolRules = rules.filter(r => r.surface === "write");
  assert(toolRules.length === 1, "1 write rule when config is string");
  assert(toolRules[0].pattern === "*", "write string → pattern *");
  assert(toolRules[0].action === "allow", "write string → action allow");
}

// ═══════════════════════════════════════════════
// 3. evaluatePermission
// ═══════════════════════════════════════════════

section("3. evaluatePermission");

// Last matching rule wins
{
  const rules = [
    { surface: "write", pattern: "*", action: "ask" as const, source: "config" as const },
    { surface: "write", pattern: "src/**", action: "allow" as const, source: "config" as const },
  ];
  const result = evaluatePermission("write", "src/main.ts", rules);
  assert(result.action === "allow", "src/** allow overrides *:ask for src/main.ts");
}

// Non-matching rule is skipped
{
  const rules = [
    { surface: "write", pattern: "*.lock", action: "deny" as const, source: "config" as const },
    { surface: "write", pattern: "*", action: "allow" as const, source: "config" as const },
  ];
  const result = evaluatePermission("write", "src/main.ts", rules);
  assert(result.action === "allow", "*.lock deny skipped for src/main.ts, *:allow wins");
}

// Deny blocks
{
  const rules = [
    { surface: "write", pattern: "*", action: "allow" as const, source: "config" as const },
    { surface: "write", pattern: ".env", action: "deny" as const, source: "config" as const },
  ];
  const result = evaluatePermission("write", ".env", rules);
  assert(result.action === "deny", ".env deny wins");
}

// Surface mismatch: rule for "write" doesn't apply to "read"
{
  const rules = [
    { surface: "write", pattern: "*", action: "deny" as const, source: "config" as const },
  ];
  const result = evaluatePermission("read", "file.txt", rules);
  assert(result.action === "ask", "write-only rule does NOT apply to read surface (falls back to default)");
}

// Universal rule (* surface) matches any surface
{
  const rules = [
    { surface: "*", pattern: "*", action: "deny" as const, source: "config" as const },
  ];
  const result = evaluatePermission("bash", "ls", rules);
  assert(result.action === "deny", "* surface matches any tool surface");
}

// Fallback to ask when no rules match
{
  const result = evaluatePermission("unknown_tool", "anything", []);
  assert(result.action === "ask", "empty rules → ask (fail-safe)");
}

// Path rule (surface="path") matched explicitly by caller — evaluatePermission
// treats surface="path" as a named surface, not a universal match.
// Path protection is done by permission.ts iterating path rules separately.
{
  // This tests that path rules ARE included in the ruleset and can be matched
  // when the caller explicitly uses surface="path" or wildcardMatch.
  const rules = [
    { surface: "path", pattern: ".env", action: "deny" as const, source: "config" as const },
  ];
  const result = evaluatePermission("path", ".env", rules);
  assert(result.action === "deny", "path rule matched when caller uses surface=path");
}

// ═══════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════

console.log("\n" + "=".repeat(45));
console.log("  RESULTS:", passed, "passed,", failed, "failed");
console.log("=".repeat(45));

if (failed > 0) process.exit(1);
