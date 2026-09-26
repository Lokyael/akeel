import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createPlatformProfileRegistry,
  type PlatformProfileFactory,
} from "../../packages/platform-runtime/src/profile";

test("platform profile registry keeps Linux and Windows as peer profiles", () => {
  const linux = { id: "linux" } as PlatformProfileFactory;
  const windows = { id: "windows" } as PlatformProfileFactory;
  const registry = createPlatformProfileRegistry([linux, windows]);

  assert.deepEqual(registry.profiles, [linux, windows]);
  assert.equal(registry.find("linux"), linux);
  assert.equal(registry.find("windows"), windows);
  assert.equal(Object.isFrozen(registry.profiles), true);
});

test("platform runtime exposes no Pi resource surface", () => {
  const manifest: unknown = JSON.parse(readFileSync(join(import.meta.dirname!, "../../packages/platform-runtime/package.json"), "utf8"));
  assert.equal(typeof manifest, "object");
  assert.equal("pi" in (manifest as Record<string, unknown>), false);
});
