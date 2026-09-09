import assert from "node:assert/strict";
import test from "node:test";
import {
  createCredentialBoundary,
  pathHitsCredentialBoundary,
} from "../../../../src/access-gate/access-decision/core/index";

const boundary = createCredentialBoundary(["/home/user/.pi/agent"]);

for (const path of [
  "/home/user/.pi/agent/auth.json",
  "/home/user/.pi/agent/auth.json.bak",
  "/home/user/.pi/agent/auth.json.old",
  "/home/user/.pi/agent/auth.json~",
  "/home/user/.pi/agent/auth.json.2025",
]) {
  test(`credential boundary rejects ${path}`, () => {
    assert.equal(pathHitsCredentialBoundary(path, [], boundary), true);
  });
}

for (const path of [
  "/home/user/.pi/agent/auth.json.template",
  "/home/user/.pi/agent/auth.json.sample",
  "/home/user/.pi/agent/auth.json.example",
  "/home/user/.pi/agent/auth.json.skeleton",
  "/home/user/.pi/agent/settings.json",
  "/home/user/.pi/agent/sessions/auth.json",
  "/home/user/.pi/other/auth.json",
]) {
  test(`credential boundary leaves ${path} outside its protected class`, () => {
    assert.equal(pathHitsCredentialBoundary(path, [], boundary), false);
  });
}

test("credential boundary catches a protected path in traversal prefixes", () => {
  assert.equal(
    pathHitsCredentialBoundary(
      "/workspace/link/notes.md",
      ["/", "/workspace/link", "/home/user/.pi/agent/auth.json"],
      boundary,
    ),
    true,
  );
});

test("credential boundary requires non-empty absolute roots", () => {
  assert.throws(() => createCredentialBoundary([]), /invalid credential boundary/);
  assert.throws(() => createCredentialBoundary(["relative-agent"]), /invalid credential boundary/);
  assert.throws(() => createCredentialBoundary(["/agent/\u0000"]), /invalid credential boundary/);
});

test("credential boundary cannot be forged by copying its public shape", () => {
  assert.equal(
    pathHitsCredentialBoundary(
      "/home/user/.pi/agent/auth.json",
      [],
      { roots: ["/home/user/.pi/agent"] },
    ),
    true,
  );
});
