import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTrackedEntries,
  validateTrackedPortability,
  type TrackedEntry,
} from "../scripts/validate-repository-portability";

test("parseTrackedEntries parses zero-separated git stage records", () => {
  const output = "100644 abc 0\tsrc/file.ts\x00120000 def 0\tsrc/link\x00";
  const entries = parseTrackedEntries(output);
  assert.deepEqual(entries, [
    { mode: "100644", path: "src/file.ts" },
    { mode: "120000", path: "src/link" },
  ]);
});

test("validateTrackedPortability detects Windows forbidden characters and reserved names", () => {
  const entries: TrackedEntry[] = [
    { mode: "100644", path: "src/bad:name.ts" },
    { mode: "100644", path: "docs/trailing. " },
    { mode: "100644", path: "docs/trailing." },
    { mode: "100644", path: "packages/nul/index.ts" },
    { mode: "100644", path: "src/COM1.json" },
  ];

  const violations = validateTrackedPortability(entries, () => Buffer.from("clean\n"));
  assert.equal(violations.length, 5);
  assert.equal(violations[0]?.rule, "windows-forbidden-character");
  assert.equal(violations[1]?.rule, "windows-trailing-character");
  assert.equal(violations[2]?.rule, "windows-trailing-character");
  assert.equal(violations[3]?.rule, "windows-reserved-name");
  assert.equal(violations[4]?.rule, "windows-reserved-name");
});

test("validateTrackedPortability detects case-fold collisions across paths", () => {
  const entries: TrackedEntry[] = [
    { mode: "100644", path: "README.md" },
    { mode: "100644", path: "readme.md" },
  ];

  const violations = validateTrackedPortability(entries, () => Buffer.from("clean\n"));
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.rule, "case-fold-collision");
});

test("validateTrackedPortability rejects UTF-8 BOM and CRLF line endings in text", () => {
  const entries: TrackedEntry[] = [
    { mode: "100644", path: "src/bom.ts" },
    { mode: "100644", path: "src/crlf.ts" },
    { mode: "100644", path: "assets/binary.dat" },
    { mode: "120000", path: "src/symlink" },
  ];

  const files: Record<string, Buffer> = {
    "src/bom.ts": Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]),
    "src/crlf.ts": Buffer.from("line1\r\nline2\n"),
    "assets/binary.dat": Buffer.from([0x00, 0x0d, 0x0a, 0x01]), // binary containing CR is ignored
    "src/symlink": Buffer.from("target"),
  };

  const violations = validateTrackedPortability(entries, (path) => files[path] ?? Buffer.from(""));
  assert.equal(violations.length, 2);
  assert.equal(violations[0]?.rule, "utf8-bom-disallowed");
  assert.equal(violations[1]?.rule, "crlf-or-cr-disallowed");
});
