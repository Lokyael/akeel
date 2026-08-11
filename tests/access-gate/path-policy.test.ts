import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { makeContext } from "./helpers";
import { decidePath, resolvePath } from "../../src/access-gate/path/policy";
import { DEFAULT_BLOCKED_PATHS } from "../../src/access-gate/path/blocked-paths";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";

function profile(): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { inspect: "allow", modify: "ask", execute: "deny", destroy: "deny", unknown: "ask" },
    pathPolicy: {
      default: { read: "deny", list: "deny", search: "deny", write: "deny" },
      rules: [
        { path: "project/docs/**", write: "allow" },
        { path: "project/**", read: "allow", list: "allow", search: "allow", write: "ask" },
        { path: "staging/**", read: "allow", list: "allow", search: "allow", write: "allow" },
      ],
    },
  };
}

test("resolves project and staging paths separately from external paths", () => {
  const ctx = makeContext("pi-access-path-", (root) => {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "task.md"), "task");
  });
  try {
    const project = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, "docs/task.md");
    const staged = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, join(ctx.stagingDir, "remote.md"));
    const external = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, "/tmp/other.md");
    assert.equal(project.scope, "project");
    assert.equal(project.virtualPath, "project/docs/task.md");
    assert.equal(staged.scope, "staging");
    assert.equal(staged.virtualPath, "staging/remote.md");
    assert.equal(external.scope, "external");
  } finally {
    ctx.cleanup();
  }
});

test("uses the first matching rule for each path operation", () => {
  const ctx = makeContext("pi-access-path-", (root) => mkdirSync(join(root, "docs")));
  try {
    const path = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, "docs/new.md");
    assert.equal(decidePath(path, profile(), "read").decision, "allow");
    assert.equal(decidePath(path, profile(), "write").decision, "allow");
    const firstMatchWins = profile();
    firstMatchWins.pathPolicy.rules = [
      { path: "project/**", write: "deny" },
      { path: "project/docs/**", write: "allow" },
    ];
    assert.equal(decidePath(path, firstMatchWins, "write").decision, "deny");
    const source = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, "src/new.ts");
    assert.equal(decidePath(source, profile(), "write").decision, "ask", source.virtualPath);
  } finally {
    ctx.cleanup();
  }
});

test("blocked paths are hard denied for every operation", () => {
  const ctx = makeContext("pi-access-path-", (root) => writeFileSync(join(root, ".env"), "SECRET"));
  try {
    const path = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, ".env");
    for (const operation of ["read", "list", "search", "write"] as const) {
      const result = decidePath(path, profile(), operation, DEFAULT_BLOCKED_PATHS);
      assert.equal(result.decision, "deny");
      assert.equal(result.hard, true);
    }
  } finally {
    ctx.cleanup();
  }
});

test("home paths match ~/ profile rules via the home form", () => {
  const ctx = makeContext("pi-access-path-", () => undefined);
  try {
    const p = profile();
    p.pathPolicy.rules.push({ path: "~/.config/pi/**", write: "ask" });
    const target = join(homedir(), ".config", "pi", "keel", "config.json");
    const path = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, target);
    assert.equal(path.scope, "external");
    const decision = decidePath(path, p, "write");
    assert.equal(decision.decision, "ask");
    assert.equal(decision.pattern, "~/.config/pi/**");
  } finally {
    ctx.cleanup();
  }
});

test("blocked home paths stay hard denied despite ~/ write rules", () => {
  const ctx = makeContext("pi-access-path-", () => undefined);
  try {
    const p = profile();
    p.pathPolicy.rules.push({ path: "~/**", write: "ask" });
    const path = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, join(homedir(), ".ssh", "config"));
    const decision = decidePath(path, p, "write", DEFAULT_BLOCKED_PATHS);
    assert.equal(decision.decision, "deny");
    assert.equal(decision.hard, true);
  } finally {
    ctx.cleanup();
  }
});

test("symlink escapes are hard denied", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-path-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  const outside = mkdtempSync(join(tmpdir(), "pi-access-outside-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(outside, join(root, "linked"), "dir");
    const path = resolvePath(root, root, staging, "linked/secret.txt");
    const result = decidePath(path, profile(), "read");
    assert.equal(result.decision, "deny");
    assert.equal(result.hard, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
