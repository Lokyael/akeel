import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { createProjectLifecycle } from "../../../../src/access-gate/access-decision";

function project(): { readonly root: string; readonly nested: string; readonly cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "pi-keel-project-"));
  const nested = join(root, "packages", "app");
  mkdirSync(join(root, ".git"));
  mkdirSync(nested, { recursive: true });
  return { root, nested, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("project lifecycle discovers the enclosing Git root and owns a staging directory", () => {
  const fixture = project();
  try {
    const lifecycle = createProjectLifecycle(fixture.nested);

    assert.equal(lifecycle.context.cwd, fixture.nested);
    assert.equal(lifecycle.context.projectRoot, fixture.root);
    assert.equal(existsSync(lifecycle.context.stagingRoot), true);

    lifecycle.dispose();
    assert.equal(existsSync(lifecycle.context.stagingRoot), false);
  } finally {
    fixture.cleanup();
  }
});

test("project lifecycle rejects a cwd outside a discoverable project", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-keel-no-project-"));
  try {
    assert.throws(() => createProjectLifecycle(cwd), /invalid project lifecycle/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("project lifecycle rejects relative cwd before creating staging", () => {
  const fixture = project();
  const before = readdirSync(tmpdir()).filter((entry) => entry.startsWith("pi-access-decision-"));
  try {
    assert.throws(() => createProjectLifecycle(relative(process.cwd(), fixture.nested)), /invalid project lifecycle/);
    assert.deepEqual(
      readdirSync(tmpdir()).filter((entry) => entry.startsWith("pi-access-decision-")),
      before,
    );
  } finally {
    fixture.cleanup();
  }
});
