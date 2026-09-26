import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { createProjectLifecycle } from "../../../../packages/access-gate/src/access-gate/access-decision/runtime/index";
import { LINUX_SESSIONS_BASE } from "../../../../packages/platform-runtime/src/index";

function project(): { readonly root: string; readonly nested: string; readonly cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "akeel-project-"));
  const nested = join(root, "packages", "app");
  mkdirSync(join(root, ".git"));
  mkdirSync(nested, { recursive: true });
  return { root, nested, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("project lifecycle uses the session cwd as access root and owns staging", () => {
  const fixture = project();
  try {
    const lifecycle = createProjectLifecycle(fixture.nested);

    assert.equal(lifecycle.context.cwd, fixture.nested);
    assert.equal(lifecycle.context.projectRoot, fixture.nested);
    assert.equal(existsSync(lifecycle.context.stagingRoot), true);
    const sessionRoot = dirname(lifecycle.context.stagingRoot);
    assert.equal(existsSync(join(sessionRoot, "lock.json")), true);
    assert.equal(existsSync(join(sessionRoot, "session.json")), true);
    assert.equal(statSync(sessionRoot).mode & 0o777, 0o700);
    assert.equal(statSync(lifecycle.context.stagingRoot).mode & 0o777, 0o700);
    assert.equal(statSync(join(sessionRoot, "session.json")).mode & 0o777, 0o600);
    const manifest = JSON.parse(readFileSync(join(sessionRoot, "session.json"), "utf8"));
    assert.equal(manifest.sessionId, sessionRoot.split("/").at(-1));

    lifecycle.dispose();
    assert.equal(existsSync(sessionRoot), false);
  } finally {
    fixture.cleanup();
  }
});

test("project lifecycle places staging inside a session envelope", () => {
  const cwd = mkdtempSync(join(tmpdir(), "akeel-session-test-"));
  try {
    const lifecycle = createProjectLifecycle(cwd);
    assert.match(
      lifecycle.context.stagingRoot,
      new RegExp(`^${LINUX_SESSIONS_BASE.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}/session-[A-Za-z0-9]+/staging$`),
    );
    lifecycle.dispose();
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("project lifecycle accepts a non-Git cwd as access root", () => {
  const cwd = mkdtempSync(join(tmpdir(), "akeel-no-project-"));
  try {
    const lifecycle = createProjectLifecycle(cwd);
    assert.equal(lifecycle.context.projectRoot, cwd);
    lifecycle.dispose();
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("project lifecycle keeps a multi-repository parent as access root", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-workspace-"));
  try {
    mkdirSync(join(root, "app", ".git"), { recursive: true });
    mkdirSync(join(root, "tools", ".git"), { recursive: true });
    const lifecycle = createProjectLifecycle(root);
    assert.equal(lifecycle.context.projectRoot, root);
    lifecycle.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project lifecycle ignores symlinked Git metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-symlinked-git-"));
  const target = mkdtempSync(join(tmpdir(), "akeel-git-target-"));
  try {
    symlinkSync(target, join(root, ".git"), "dir");
    const lifecycle = createProjectLifecycle(root);
    assert.equal(lifecycle.context.projectRoot, root);
    lifecycle.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("project lifecycle ignores Git file metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-gitfile-"));
  try {
    writeFileSync(join(root, ".git"), "gitdir: /outside/repository\n");
    const lifecycle = createProjectLifecycle(root);
    assert.equal(lifecycle.context.projectRoot, root);
    lifecycle.dispose();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project lifecycle rejects relative cwd before creating staging", () => {
  const fixture = project();
  const sessionsParent = LINUX_SESSIONS_BASE;
  const entries = (): string[] => existsSync(sessionsParent)
    ? readdirSync(sessionsParent).filter((entry) => entry.startsWith("session-"))
    : [];
  const before = entries();
  try {
    assert.throws(() => createProjectLifecycle(relative(process.cwd(), fixture.nested)), /invalid project lifecycle/);
    assert.deepEqual(entries(), before);
  } finally {
    fixture.cleanup();
  }
});
