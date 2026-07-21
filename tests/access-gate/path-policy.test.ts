import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decidePath, resolvePath } from "../../src/access-gate/path/policy";
import { DEFAULT_BLOCKED_PATHS } from "../../src/access-gate/path/blocked-paths";
import type { ResolvedProfile } from "../../src/access-gate/profile/types";

function profile(): ResolvedProfile {
  return {
    name: "test",
    description: "test",
    shellPolicy: { readOnly: "allow", mutating: "ask", unclassified: "ask" },
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
  const root = mkdtempSync(join(tmpdir(), "pi-access-path-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "plan.md"), "plan");
    const project = resolvePath(root, root, staging, "docs/plan.md");
    const staged = resolvePath(root, root, staging, join(staging, "remote.md"));
    const external = resolvePath(root, root, staging, "/tmp/other.md");
    assert.equal(project.scope, "project");
    assert.equal(project.virtualPath, "project/docs/plan.md");
    assert.equal(staged.scope, "staging");
    assert.equal(staged.virtualPath, "staging/remote.md");
    assert.equal(external.scope, "external");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("uses the first matching rule for each path operation", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-path-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    mkdirSync(join(root, "docs"));
    const path = resolvePath(root, root, staging, "docs/new.md");
    assert.equal(decidePath(path, profile(), "read").decision, "allow");
    assert.equal(decidePath(path, profile(), "write").decision, "allow");
    const firstMatchWins = profile();
    firstMatchWins.pathPolicy.rules = [
      { path: "project/**", write: "deny" },
      { path: "project/docs/**", write: "allow" },
    ];
    assert.equal(decidePath(path, firstMatchWins, "write").decision, "deny");
    const source = resolvePath(root, root, staging, "src/new.ts");
    assert.equal(decidePath(source, profile(), "write").decision, "ask", source.virtualPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});

test("blocked paths are hard denied for every operation", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-access-path-"));
  const staging = mkdtempSync(join(tmpdir(), "pi-access-staging-"));
  try {
    writeFileSync(join(root, ".env"), "SECRET");
    const path = resolvePath(root, root, staging, ".env");
    for (const operation of ["read", "list", "search", "write"] as const) {
      const result = decidePath(path, profile(), operation, DEFAULT_BLOCKED_PATHS);
      assert.equal(result.decision, "deny");
      assert.equal(result.hard, true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
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
