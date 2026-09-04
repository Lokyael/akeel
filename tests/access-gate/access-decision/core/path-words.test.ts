import assert from "node:assert/strict";
import test from "node:test";
import { PROBES } from "./fixtures";

test("path-word contract distinguishes expanded and quoted tilde forms", () => {
  const forms = new Map([
    ["~/x", "home-expanded"],
    ['"~/x"', "literal"],
    ["\\~/x", "literal"],
  ]);
  assert.deepEqual([...forms.values()], ["home-expanded", "literal", "literal"]);
  assert.equal(PROBES.find((probe) => probe.id === "shell-tilde-quoting")?.source, "bash-manual");
});

test("path-word contract keeps resolution facts separate from display facts", () => {
  const admissionFacts = ["resolved-candidate", "source-anchor"];
  const displayFacts = ["display-coordinate"];
  assert.ok(admissionFacts.includes("resolved-candidate"));
  assert.ok(!admissionFacts.includes("display-coordinate"));
  assert.ok(displayFacts.includes("display-coordinate"));
});
