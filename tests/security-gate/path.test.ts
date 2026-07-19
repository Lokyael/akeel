import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { resolveToolPath, decidePath } from "../../src/security-gate/policy/path";
import type { SecurityConfig } from "../../src/security-gate/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function config(overrides?: Partial<SecurityConfig>): SecurityConfig {
  return {
    level: "standard",
    permission: {
      "*": "ask",
      path: { "*": "allow" },
      read: { "*": "allow" },
      write: { "*": "ask" },
      edit: { "*": "ask" },
      external_directory: "ask",
      bash: {},
    },
    ...overrides,
  };
}

const cwd = mkdtempSync(join(tmpdir(), "pi-keel-path-"));
mkdirSync(join(cwd, "docs"));
mkdirSync(join(cwd, "src"));
writeFileSync(join(cwd, "src", "file.ts"), "ok");
writeFileSync(join(cwd, ".env"), "secret");
const outside = mkdtempSync(join(tmpdir(), "pi-keel-outside-"));
writeFileSync(join(outside, "secret.txt"), "secret");
symlinkSync(outside, join(cwd, "linked-outside"), "dir");

console.log("path resolution");
{
  const path = resolveToolPath(cwd, "docs/../src/file.ts");
  assert(path.insideCwd, "normalized relative path stays inside cwd");
  assert(path.relative === "src/file.ts", "relative path is canonicalized");
  assert(path.classifiable, "normal path is classifiable");
}
{
  const path = resolveToolPath(cwd, "../secret");
  assert(!path.insideCwd, "parent traversal leaves cwd");
  assert(path.classifiable, "ordinary external path remains classifiable");
}
{
  const path = resolveToolPath(cwd, "docs-malicious/file.md");
  assert(path.relative === "docs-malicious/file.md", "shared prefix is not treated as docs");
  assert(path.insideCwd, "sibling name remains inside cwd");
  assert(path.relative !== null && path.relative !== "docs/file.md" && !path.relative.startsWith("docs/"), "shared prefix is not treated as docs");
}
{
  const path = resolveToolPath(cwd, "@.env");
  assert(path.relative === ".env", "one leading @ is removed before resolution");
}
{
  const path = resolveToolPath(cwd, "C:\\secret\\file");
  assert(!path.classifiable, "Windows drive path is not treated as POSIX relative path");
}
{
  const path = resolveToolPath(cwd, "linked-outside/file.txt");
  assert(path.symlinkEscape, "symlink parent escaping cwd is rejected");
}

console.log("path decisions");
{
  const decision = decidePath(resolveToolPath(cwd, ".env"), config(), "read");
  assert(decision.action === "deny" && decision.hard, "sensitive file is immutable hard deny");
}
{
  const decision = decidePath(resolveToolPath(cwd, "@.env"), config(), "read");
  assert(decision.action === "deny" && decision.hard, "@ alias cannot bypass sensitive path deny");
}
{
  const sshConfig = decidePath(resolveToolPath(cwd, "~/.ssh/config"), config({
    permission: { ...config().permission, path: { "*": "allow", "~/.ssh/*": "deny", "~/.ssh/config": "allow" } },
  }), "read");
  const sshKey = decidePath(resolveToolPath(cwd, "~/.ssh/id_rsa"), config(), "read");
  assert(sshConfig.action === "allow", "exact ~/.ssh/config read exception is allowed");
  assert(sshKey.action === "deny" && sshKey.hard, "other SSH files remain hard denied");
}
{
  const decision = decidePath(resolveToolPath(cwd, "../secret.txt"), config(), "read");
  assert(decision.action === "ask", "ordinary external read follows external_directory");
}
{
  const decision = decidePath(resolveToolPath(cwd, "../secret.txt"), config({
    permission: { ...config().permission, external_directory: "allow" },
  }), "read");
  assert(decision.action === "allow", "external_directory allow applies only to ordinary external paths");
}
{
  const decision = decidePath(resolveToolPath(cwd, "linked-outside/file.txt"), config({
    permission: { ...config().permission, external_directory: "allow" },
  }), "write");
  assert(decision.action === "deny" && decision.hard, "external allow cannot bypass symlink escape");
}
{
  const decision = decidePath(resolveToolPath(cwd, "docs/file.md"), config(), "write");
  assert(decision.action === "ask", "normal write follows operation-specific permission");
}

console.log("hardPath from config");
{
  // 自定义 hardPath 覆盖默认 — `hardPath` 替换了 DEFAULT_HARD_PATH，.env 不再不可变
  const customCfg = config({
    permission: { ...config().permission, hardPath: ["custom.txt"] },
  });
  const d1 = decidePath(resolveToolPath(cwd, ".env"), customCfg, "read");
  assert(d1.hard !== true, "custom hardPath does not include .env");

  const d2 = decidePath(resolveToolPath(cwd, "custom.txt"), customCfg, "read");
  assert(d2.hard === true, "custom hardPath includes custom.txt");
}
{
  // 空 hardPath = 无不可变路径
  const noHard = config({
    permission: { ...config().permission, hardPath: [] },
  });
  const d = decidePath(resolveToolPath(cwd, ".env"), noHard, "read");
  assert(d.hard !== true, "empty hardPath disables all immutable rules");
}
{
  // hardPath 克隆独立性
  const cfg1 = config({
    permission: { ...config().permission, hardPath: ["a.txt"] },
  });
  const cloned = { ...cfg1, permission: { ...cfg1.permission, hardPath: [...cfg1.permission.hardPath!] } };
  cloned.permission.hardPath!.push("b.txt");
  assert(cfg1.permission.hardPath!.length === 1, "hardPath clone is independent");
}

console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
