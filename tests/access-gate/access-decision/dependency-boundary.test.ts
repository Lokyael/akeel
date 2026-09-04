import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname!, "../../../src/access-gate/access-decision");
const packageName = "pi-keel";
const legacyDirectories = [
  "shell-parse",
  "command-semantics",
  "path",
  "security",
  "gate",
  "profile",
  "config",
  "session",
  "ui",
];

function filesUnder(directory: string): string[] {
  if (!statSync(directory, { throwIfNoEntry: false })) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

function importsIn(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\))/g)].map(
    (match) => match[1] ?? match[2]!,
  );
}

test("new access-decision boundary has no forbidden imports", () => {
  const files = filesUnder(root);
  for (const file of files) {
    for (const specifier of importsIn(file)) {
      assert.notEqual(specifier, packageName, `${relative(process.cwd(), file)} imports the package itself`);
      assert.ok(!specifier.includes("src/access-gate/"), `${relative(process.cwd(), file)} imports source by absolute path`);
      const resolvedSpecifier = resolve(dirname(file), specifier);
      assert.ok(
        !legacyDirectories.some((directory) => resolvedSpecifier.includes(`/src/access-gate/${directory}/`)),
        `${relative(process.cwd(), file)} imports legacy directory through ${specifier}`,
      );
    }
  }
});

test("new access-decision layers only depend inward", () => {
  const files = filesUnder(root);
  for (const file of files) {
    const layer = file.match(/access-decision[/\\](core|adapters|runtime)[/\\]/)?.[1];
    if (!layer) continue;
    for (const specifier of importsIn(file)) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolve(dirname(file), specifier);
      if (layer === "core") assert.ok(!resolved.includes("/adapters/") && !resolved.includes("/runtime/"));
      if (layer === "adapters") assert.ok(!resolved.includes("/runtime/"));
    }
  }
});
