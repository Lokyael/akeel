import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveShellPath } from "../../../../src/access-gate/access-decision/core/index";

const linuxPathContract = {
  source: "linux-manual",
  referenceStatus: "externally-proven",
} as const;

test("canonical resolution follows existing symlink components", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-shell-path-"));
  const target = join(root, "target");
  mkdirSync(target);
  symlinkSync(target, join(root, "link"), "dir");
  try {
    assert.equal(resolveShellPath(root, "link/secret"), join(target, "secret"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a relative shell path resolves against the command cwd", () => {
  assert.equal(resolveShellPath("/workspace/project", "../README.md"), "/workspace/README.md");
  assert.equal(linuxPathContract.source, "linux-manual");
});

test("an absolute shell path remains rooted and dot segments normalize", () => {
  assert.equal(resolveShellPath("/workspace/project", "/var/./log/../tmp"), "/var/tmp");
  assert.equal(linuxPathContract.referenceStatus, "externally-proven");
});

test("parent traversal cannot produce a path above the root", () => {
  assert.equal(resolveShellPath("/workspace/project", "../../../../etc/hosts"), "/etc/hosts");
});

test("a home-relative path resolves only with explicit home context", () => {
  assert.equal(resolveShellPath("/workspace/project", "~/config", { home: "/home/agent" }), "/home/agent/config");
  assert.equal(resolveShellPath("/workspace/project", "~/config"), undefined);
});

test("a quoted tilde is resolved as a literal path when marked literal", () => {
  assert.equal(
    resolveShellPath("/workspace/project", "~/config", { pathKind: "literal" }),
    "/workspace/project/~/config",
  );
});

test("symlink traversal beyond the analysis bound fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-deep-link-"));
  try {
    const target = join(root, "target");
    mkdirSync(target);
    for (let index = 41; index >= 0; index -= 1) {
      const link = join(root, `link-${index}`);
      const next = index === 41 ? target : join(root, `link-${index + 1}`);
      symlinkSync(next, link, "dir");
    }
    assert.equal(resolveShellPath(root, "link-0/file"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
