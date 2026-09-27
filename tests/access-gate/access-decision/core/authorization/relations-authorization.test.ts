import assert from "node:assert/strict";
import test from "node:test";
import {
  type PlatformPathProof,
  type RootCatalog,
  projectPathAuthorization,
} from "akeel-platform-runtime";
import { createPlatformValueIssuer } from "../../../../../packages/platform-runtime/src/internal/sealed-values";
import {
  authorizeAdmission,
  createMandatoryBoundaries,
  freezeUnifiedPolicySnapshot,
  projectUnifiedAdmission,
} from "../../../../../packages/access-gate/src/access-gate/access-decision/core/authorization";
import {
  compileManagedCall,
  createCompileEnvironment,
  type DirectManagedCall,
} from "../../../../../packages/access-gate/src/access-gate/access-decision/core/compilation";

const issuer = createPlatformValueIssuer("linux");

// Compile a catalog containing 5 distinct roots
const catalog: RootCatalog = issuer.issueRootCatalog([
  "/app",             // 0: allowed workspace root
  "/tmp/staging",     // 1: staging root
  "/home/user/.pi",   // 2: credential root
  "/agent/npm",       // 3: capability root
  "/app/blocked",     // 4: blocked root
]);

const allowedRefs = new Set([catalog.roots[0]!, catalog.roots[1]!]);
const credentialRefs = new Set([catalog.roots[2]!]);
const capabilityRefs = new Set([catalog.roots[3]!]);
const blockedRefs = new Set([catalog.roots[4]!]);

const mandatory = createMandatoryBoundaries({
  credentialRoots: ["/home/user/.pi"],
  capabilityRoots: ["/agent/npm"],
  credentialRootRefs: credentialRefs,
  capabilityRootRefs: capabilityRefs,
});

const policy = freezeUnifiedPolicySnapshot({
  paths: {
    read: "allow",
    write: "allow",
    edit: "allow",
    list: "allow",
    search: "allow",
    allowedRoots: ["/app", "/tmp/staging"],
    blockedRoots: ["/app/blocked"],
    blockedPaths: [],
    allowedRootRefs: allowedRefs,
    blockedRootRefs: blockedRefs,
    blockedPathRefs: new Set(),
  },
  commands: {
    inspect: "allow",
    modify: "allow",
    execute: "allow",
    opaque: "allow",
    destroy: "allow",
    unknown: "allow",
  },
});

function directAdmission(operation: DirectManagedCall["surface"], proof: PlatformPathProof) {
  const display = projectPathAuthorization(proof)!.canonicalDisplay;
  const environment = createCompileEnvironment({
    cwd: "/app",
    pathEvidence: {
      resolve() {
        return {
          candidate: display,
          traversed: [display],
          proof,
        };
      },
    },
  });
  const compilation = compileManagedCall(
    operation === "write"
      ? { surface: "write", arguments: { path: "anything", content: "ok" } }
      : operation === "edit"
        ? { surface: "edit", arguments: { path: "anything", edits: [{ oldText: "a", newText: "b" }] } }
        : operation === "search"
          ? { surface: "search", arguments: { path: "anything", pattern: "query" } }
          : { surface: operation, arguments: { path: "anything" } },
    environment,
  );
  const admission = projectUnifiedAdmission(compilation);
  assert.ok(admission, "admission projection must succeed");
  return admission;
}

test("Path proof with credential relations triggers hard-boundary without inspecting path string", () => {
  const credentialProof = issuer.issuePathProof({
    literal: "anything",
    canonicalDisplay: "/opaque/display",
    nativeIdentity: "dev:1:ino:100",
    catalog,
    relations: [{ rootIndex: 2, relations: ["descendant"] }],
  });

  const result = authorizeAdmission(directAdmission("read", credentialProof), mandatory, policy);
  assert.deepEqual(result, { kind: "deny", code: "hard-boundary" });
});

test("Path proof with traversed credential triggers hard-boundary on read", () => {
  const traversedCredentialProof = issuer.issuePathProof({
    literal: "symlink",
    canonicalDisplay: "/app/link",
    nativeIdentity: "dev:1:ino:101",
    catalog,
    relations: [
      { rootIndex: 0, relations: ["descendant"] },
      { rootIndex: 2, relations: ["traversed"] },
    ],
  });

  const result = authorizeAdmission(directAdmission("read", traversedCredentialProof), mandatory, policy);
  assert.deepEqual(result, { kind: "deny", code: "hard-boundary" });
});

test("Recursive search reaching ancestor of credential root triggers hard-boundary", () => {
  const searchAncestorProof = issuer.issuePathProof({
    literal: "/home/user",
    canonicalDisplay: "/home/user",
    nativeIdentity: "dev:1:ino:102",
    catalog,
    relations: [{ rootIndex: 2, relations: ["ancestor"] }],
  });

  const searchResult = authorizeAdmission(directAdmission("search", searchAncestorProof), mandatory, policy);
  assert.deepEqual(searchResult, { kind: "deny", code: "hard-boundary" });

  // Ordinary read of an ancestor is not a credential hit if it is within allowed roots
  const readAllowedAncestorProof = issuer.issuePathProof({
    literal: "/app",
    canonicalDisplay: "/app",
    nativeIdentity: "dev:1:ino:103",
    catalog,
    relations: [
      { rootIndex: 0, relations: ["equal"] },
      { rootIndex: 4, relations: ["ancestor"] }, // ancestor of /app/blocked
    ],
  });
  const readResult = authorizeAdmission(directAdmission("read", readAllowedAncestorProof), mandatory, policy);
  assert.deepEqual(readResult, { kind: "allow" });

  // But search on ancestor of blocked root is denied!
  const searchBlockedResult = authorizeAdmission(directAdmission("search", readAllowedAncestorProof), mandatory, policy);
  assert.deepEqual(searchBlockedResult, { kind: "deny", code: "hard-boundary" });
});

test("Capability path proof grants read exemption but hard-denies mutations", () => {
  const capabilityProof = issuer.issuePathProof({
    literal: "pkg",
    canonicalDisplay: "/agent/npm/pkg",
    nativeIdentity: "dev:1:ino:104",
    catalog,
    relations: [{ rootIndex: 3, relations: ["descendant"] }],
  });

  assert.deepEqual(authorizeAdmission(directAdmission("read", capabilityProof), mandatory, policy), { kind: "allow" });
  assert.deepEqual(authorizeAdmission(directAdmission("list", capabilityProof), mandatory, policy), { kind: "allow" });
  assert.deepEqual(authorizeAdmission(directAdmission("write", capabilityProof), mandatory, policy), { kind: "deny", code: "hard-boundary" });
  assert.deepEqual(authorizeAdmission(directAdmission("edit", capabilityProof), mandatory, policy), { kind: "deny", code: "hard-boundary" });
});

test("Path proof within allowed roots authorizes operations per configured policy", () => {
  const allowedProof = issuer.issuePathProof({
    literal: "src/file.ts",
    canonicalDisplay: "/app/src/file.ts",
    nativeIdentity: "dev:1:ino:105",
    catalog,
    relations: [{ rootIndex: 0, relations: ["descendant"] }],
  });

  assert.deepEqual(authorizeAdmission(directAdmission("read", allowedProof), mandatory, policy), { kind: "allow" });
  assert.deepEqual(authorizeAdmission(directAdmission("write", allowedProof), mandatory, policy), { kind: "allow" });

  const unallowedProof = issuer.issuePathProof({
    literal: "/etc/passwd",
    canonicalDisplay: "/etc/passwd",
    nativeIdentity: "dev:1:ino:106",
    catalog,
    relations: [],
  });
  assert.deepEqual(authorizeAdmission(directAdmission("read", unallowedProof), mandatory, policy), { kind: "deny", code: "hard-boundary" });
});
