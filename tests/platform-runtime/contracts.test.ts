import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as publicRuntime from "../../packages/platform-runtime/src/index";
import {
  PLATFORM_RUNTIME_CONTRACT_VERSION,
  PlatformDomain,
  createPlatformRuntimeRegistry,
  isPlatformPathProof,
  isRuntimeRoot,
  matchRootRelations,
  projectPathAuthorization,
  samePlatformObject,
  type PlatformRuntimeFactory,
} from "../../packages/platform-runtime/src/index";
import { createPlatformValueIssuer } from "../../packages/platform-runtime/src/internal/sealed-values";

function linuxEvidence() {
  const issuer = createPlatformValueIssuer("linux");
  const workspace = issuer.issueWorkspace("/workspace", "dev:1:workspace");
  const catalog = issuer.issueRootCatalog(["dev:1:workspace", "dev:1:blocked"]);
  const terminal = issuer.issueObjectIdentity("dev:1:inode:20");
  const proof = issuer.issuePathProof({
    literal: "src/index.ts",
    canonicalDisplay: "/workspace/src/index.ts",
    nativeIdentity: "dev:1:inode:20",
    catalog,
    relations: [{ rootIndex: 0, relations: ["descendant"] }],
    terminalObject: terminal,
    traversedObjects: [terminal],
    risks: [],
  });
  return { issuer, workspace, catalog, terminal, proof };
}

test("sealed platform evidence rejects copied shapes and freezes authorization projections", () => {
  const { proof, terminal, catalog } = linuxEvidence();
  assert.equal(isPlatformPathProof(proof), true);
  assert.equal(isPlatformPathProof({ ...proof }), false);
  assert.throws(() => PlatformDomain.issue(Symbol("forged"), "linux"), /unauthorized/u);

  const view = projectPathAuthorization(proof);
  assert.ok(view);
  assert.equal(view.canonicalDisplay, "/workspace/src/index.ts");
  assert.equal(view.relations[0]?.relations[0], "descendant");
  assert.equal(view.terminalObject, terminal);
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.relations), true);
  assert.equal(Object.isFrozen(view.relations[0]?.relations), true);

  const matched = matchRootRelations(view, new Set([catalog.roots[0]!]));
  assert.equal(matched.has("descendant"), true);
  assert.equal(matched.has("equal"), false);
  const unmatched = matchRootRelations(view, new Set([catalog.roots[1]!]));
  assert.equal(unmatched.size, 0);
});

test("platform values fail closed across domains", () => {
  const linux = linuxEvidence();
  const windows = createPlatformValueIssuer("windows");
  const windowsWorkspace = windows.issueWorkspace("C:\\workspace", "volume:1:file:10");

  assert.equal(linux.issuer.readWorkspace(windowsWorkspace), undefined);
  assert.throws(
    () => windows.issueRuntimeRoot("session-envelope", windowsWorkspace, linux.proof),
    /domain mismatch/u,
  );
  assert.equal(samePlatformObject(linux.terminal, { ...linux.terminal }), false);

  const sameObject = linux.issuer.issueObjectIdentity("dev:1:inode:20");
  const otherObject = linux.issuer.issueObjectIdentity("dev:1:inode:21");
  assert.equal(samePlatformObject(linux.terminal, sameObject), true);
  assert.equal(samePlatformObject(linux.terminal, otherObject), false);
});

test("runtime roots represent lifecycle owners rather than standalone staging", () => {
  const { issuer, workspace, proof } = linuxEvidence();
  const session = issuer.issueRuntimeRoot("session-envelope", workspace, proof);
  const run = issuer.issueRuntimeRoot("workflow-run", workspace, proof);

  assert.equal(isRuntimeRoot(session), true);
  assert.equal(session.role, "session-envelope");
  assert.equal(run.role, "workflow-run");
  assert.throws(() => issuer.issueRuntimeRoot("staging" as never, workspace, proof), /runtime role/u);
});

test("platform registry validates peer factories without opening sessions", () => {
  let opened = 0;
  const linux = {
    id: "linux",
    async openSession() {
      opened++;
      throw new Error("not used");
    },
  } satisfies PlatformRuntimeFactory;
  const windows = {
    id: "windows",
    async openSession() {
      opened++;
      throw new Error("not used");
    },
  } satisfies PlatformRuntimeFactory;
  const registry = createPlatformRuntimeRegistry([linux, windows]);

  assert.deepEqual(registry.factories, [linux, windows]);
  assert.equal(registry.find("linux"), linux);
  assert.equal(registry.find("windows"), windows);
  assert.equal(Object.isFrozen(registry.factories), true);
  assert.equal(opened, 0);
  assert.throws(() => createPlatformRuntimeRegistry([linux, linux]), /invalid platform registry/u);
});

test("public runtime exports contracts but not the internal issuer", () => {
  assert.equal(PLATFORM_RUNTIME_CONTRACT_VERSION, 1);
  assert.equal("createPlatformValueIssuer" in publicRuntime, false);
});

test("platform runtime exposes no Pi resource surface", () => {
  const manifest: unknown = JSON.parse(readFileSync(join(import.meta.dirname!, "../../packages/platform-runtime/package.json"), "utf8"));
  assert.equal(typeof manifest, "object");
  assert.equal("pi" in (manifest as Record<string, unknown>), false);
});
