import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLinuxPathEvidence } from "../../../../../packages/access-gate/src/access-gate/access-decision/core/compilation/path-evidence";

const linuxPathEvidence = createLinuxPathEvidence();

test("the trusted Linux path port preserves lexical and symlink-target traversal evidence", (t) => {
  const root = mkdtempSync(join(tmpdir(), "akeel-path-evidence-"));
  t.after(() => import("node:fs").then(({ rmSync }) => rmSync(root, { recursive: true, force: true })));
  const target = join(root, "target");
  mkdirSync(target);
  const link = join(root, "link");
  symlinkSync(target, link);

  const evidence = linuxPathEvidence.resolve(root, "link/missing.txt");
  assert.ok(evidence);
  assert.equal(evidence.candidate, join(target, "missing.txt"));
  assert.ok(evidence.traversed.includes(link));
  assert.ok(evidence.traversed.includes(target));
});

test("canonical resolution follows existing symlink components", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-shell-path-"));
  const target = join(root, "target");
  mkdirSync(target);
  symlinkSync(target, join(root, "link"), "dir");
  try {
    const evidence = linuxPathEvidence.resolve(root, "link/secret");
    assert.equal(evidence?.candidate, join(target, "secret"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a relative shell path resolves against the command cwd", () => {
  assert.equal(linuxPathEvidence.resolve("/workspace/project", "../README.md")?.candidate, "/workspace/README.md");
});

test("an absolute shell path remains rooted and dot segments normalize", () => {
  assert.equal(linuxPathEvidence.resolve("/workspace/project", "/var/./log/../tmp")?.candidate, "/var/tmp");
});

test("parent traversal cannot produce a path above the root", () => {
  assert.equal(linuxPathEvidence.resolve("/workspace/project", "../../../../etc/hosts")?.candidate, "/etc/hosts");
});

test("a home-relative path resolves only with explicit home context", () => {
  assert.equal(linuxPathEvidence.resolve("/workspace/project", "~/config", { home: "/home/agent" })?.candidate, "/home/agent/config");
  assert.equal(linuxPathEvidence.resolve("/workspace/project", "~/config"), undefined);
});

test("a quoted tilde is resolved as a literal path when marked literal", () => {
  assert.equal(
    linuxPathEvidence.resolve("/workspace/project", "~/config", { pathKind: "literal" })?.candidate,
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
    assert.equal(linuxPathEvidence.resolve(root, "link-0/file"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("circular symlink traversal fails closed without hanging", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-circular-link-"));
  try {
    const linkA = join(root, "linkA");
    const linkB = join(root, "linkB");
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);
    assert.equal(linuxPathEvidence.resolve(root, "linkA/file"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
