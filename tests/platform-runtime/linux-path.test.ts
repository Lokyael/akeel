import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createLinuxPathSession,
  isPlatformPathProof,
  projectPathAuthorization,
} from "../../packages/platform-runtime/src";

test("Linux path session issues sealed root relations and revalidatable workspace identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-linux-path-"));
  try {
    const blocked = join(root, "blocked");
    mkdirSync(join(root, "src"));
    mkdirSync(blocked);
    writeFileSync(join(root, "src", "index.ts"), "export {};\n");
    const session = createLinuxPathSession({ purpose: "access-gate", cwd: root, home: root });
    const catalog = await session.path.compileRootCatalog(session.workspace, [root, blocked]);
    const result = await session.path.resolve({
      workspace: session.workspace,
      catalog,
      base: session.workspace,
      literal: "src/index.ts",
      kind: "literal",
    });

    assert.equal(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.equal(isPlatformPathProof(result.proof), true);
    const view = projectPathAuthorization(result.proof);
    assert.ok(view);
    assert.equal(view.canonicalDisplay, join(root, "src", "index.ts"));
    assert.deepEqual(view.relations[0]?.relations, ["descendant", "traversed"]);
    assert.equal(view.relations.some((entry) => entry.root === catalog.roots[1]), false);

    const stamp = session.path.stampWorkspace(session.workspace);
    const restored = await session.path.revalidateWorkspace(stamp);
    assert.ok(restored);
    assert.equal(restored.canonicalDisplay, session.workspace.canonicalDisplay);
    await session.close();
    await assert.rejects(() => session.path.compileRootCatalog(session.workspace, [root]), /closed/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Linux path proof preserves symlink traversal, missing leaf, and multi-link risks", async () => {
  const root = mkdtempSync(join(tmpdir(), "akeel-linux-path-risk-"));
  try {
    const target = join(root, "target");
    mkdirSync(target);
    writeFileSync(join(target, "shared.txt"), "shared\n");
    linkSync(join(target, "shared.txt"), join(target, "alias.txt"));
    symlinkSync(target, join(root, "linked"));
    const session = createLinuxPathSession({ purpose: "access-gate", cwd: root });
    const catalog = await session.path.compileRootCatalog(session.workspace, [root, target]);

    const linked = await session.path.resolve({
      workspace: session.workspace,
      catalog,
      base: session.workspace,
      literal: "linked/shared.txt",
      kind: "literal",
    });
    assert.equal(linked.kind, "resolved");
    if (linked.kind !== "resolved") return;
    const linkedView = projectPathAuthorization(linked.proof);
    assert.ok(linkedView);
    assert.equal(linkedView.risks.includes("reparse-traversal"), true);
    assert.equal(linkedView.risks.includes("multiple-links"), true);
    assert.equal(linkedView.relations.some((entry) => entry.root === catalog.roots[1] && entry.relations.includes("descendant")), true);

    const missing = await session.path.resolve({
      workspace: session.workspace,
      catalog,
      base: session.workspace,
      literal: "target/missing.txt",
      kind: "literal",
    });
    assert.equal(missing.kind, "resolved");
    if (missing.kind === "resolved") {
      assert.equal(projectPathAuthorization(missing.proof)?.risks.includes("missing-leaf"), true);
    }
    await session.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
