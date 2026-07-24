import assert from "node:assert/strict";
import test from "node:test";
import { resolveProfiles } from "../../src/access-gate/profile/resolve";
import { validateProfiles } from "../../src/access-gate/profile/validate";
import type { RawProfiles } from "../../src/access-gate/profile/types";

const base = {
  description: "Read project files.",
  shellPolicy: {
    inspect: "allow",
    modify: "deny",
    execute: "deny",
    destroy: "deny",
    unknown: "deny",
  },
  pathPolicy: {
    default: { read: "deny", list: "deny", search: "deny", write: "deny" },
    rules: [{ path: "project/**", read: "allow", list: "allow", search: "allow" }],
  },
} as const;

test("validates a profile with a description and complete policies", () => {
  const result = validateProfiles({ profiles: { "keel-read": base }, defaultProfile: "keel-read" });
  assert.equal(result.ok, true);
});

test("rejects an unknown profile field and invalid decision", () => {
  const result = validateProfiles({
    profiles: {
      broken: {
        ...base,
        extra: true,
        shellPolicy: { ...base.shellPolicy, modify: "maybe" },
      },
    },
  });
  assert.equal(result.ok, false);
});

test("resolves inherited profiles and unions path rules", () => {
  const raw: RawProfiles = {
    profiles: {
      "keel-read": base,
      "keel-plan": {
        extends: ["keel-read"],
        description: "Write project task documents.",
        pathPolicy: {
          rules: [{ path: "project/docs/**", write: "allow" }],
        },
      },
    },
    defaultProfile: "keel-plan",
  };
  const result = resolveProfiles(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.profiles["keel-plan"].pathPolicy.rules.length, 2);
  // Child rules are prepended; they shadow parent rules with the same path via first-match.
  assert.equal(result.value.profiles["keel-plan"].pathPolicy.rules[0]?.path, "project/docs/**");
});

test("rejects inheritance cycles", () => {
  const result = resolveProfiles({
    profiles: {
      a: { extends: ["b"], description: "A" },
      b: { extends: ["a"], description: "B" },
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /cycle/i);
});

test("resolves profile defaults without sharing mutable objects", () => {
  const result = resolveProfiles({ profiles: { one: { ...base, description: "One" } } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  result.value.profiles.one.pathPolicy.rules.push({ path: "project/tmp/**", write: "allow" });
  assert.equal(result.value.profiles.one.pathPolicy.rules.length, 2);
  const second = resolveProfiles({ profiles: { one: { ...base, description: "One" } } });
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.value.profiles.one.pathPolicy.rules.length, 1);
});
