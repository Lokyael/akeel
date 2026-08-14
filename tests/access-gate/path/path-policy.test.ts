import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { makeContext } from "../shared/fixtures";
import { decidePath, resolvePath } from "../../../src/access-gate/path/policy";
import { DEFAULT_BLOCKED_PATHS } from "../../../src/access-gate/path/blocked-paths";
import type { ResolvedProfile } from "../../../src/access-gate/profile/types";

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
  const ctx = makeContext("pi-access-path-");
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
  const ctx = makeContext("pi-access-path-");
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

test("home credential files are hard denied", () => {
  const ctx = makeContext("pi-access-path-");
  try {
    const credentials = [".git-credentials", ".netrc", ".pypirc"];
    // ~/.npmrc 刻意不拦：npm config 写路径依赖 keel-build 的 ~/** write=ask 承诺（gate-policy-matrix 锁定）
    for (const file of credentials) {
      const path = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, join(homedir(), file));
      for (const operation of ["read", "list", "search", "write"] as const) {
        const result = decidePath(path, profile(), operation, DEFAULT_BLOCKED_PATHS);
        assert.equal(result.decision, "deny", `${file} ${operation}`);
        assert.equal(result.hard, true, `${file} ${operation}`);
      }
    }
    const ghHosts = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, join(homedir(), ".config", "gh", "hosts.yml"));
    assert.equal(decidePath(ghHosts, profile(), "read", DEFAULT_BLOCKED_PATHS).hard, true);
    // gh 配置目录整体 blocked（read/list/search/write 全操作）
    for (const operation of ["read", "list", "search", "write"] as const) {
      const gh = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, join(homedir(), ".config", "gh", "config.yml"));
      assert.equal(decidePath(gh, profile(), operation, DEFAULT_BLOCKED_PATHS).hard, true, `${operation}`);
    }
    // **/ 形态：project 子目录的凭据文件同样硬拒（与 home 形态对称）
    for (const file of [".git-credentials", ".netrc", ".pypirc"]) {
      const nested = resolvePath(ctx.cwd, ctx.projectRoot, ctx.stagingDir, join("sub", file));
      assert.equal(decidePath(nested, profile(), "read", DEFAULT_BLOCKED_PATHS).hard, true, `${file}`);
    }
  } finally {
    ctx.cleanup();
  }
});
