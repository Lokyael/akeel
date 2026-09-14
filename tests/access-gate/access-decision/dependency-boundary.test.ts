import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname!, "../../../packages/access-gate/src/access-gate/access-decision");
const packageName = "akeel";
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

const retiredFiles = [
  "core/canonical.ts",
  "core/admission.ts",
  "core/policy.ts",
  "core/shell-compile.ts",
  "core/shell-policy.ts",
  "core/display.ts",
  "core/render.ts",
  "core/credential-boundary.ts",
  "core/shell-paths.ts",
  "core/shell-flow.ts",
  "core/shell-language.ts",
  "core/shell-words.ts",
  "core/program-semantics/index.ts",
  "core/program-semantics/option-scanner.ts",
  "core/program-semantics/types.ts",
  "runtime/service.ts",
  "runtime/policy-state.ts",
  "adapters/credential-boundary.ts",
  "core/types.ts",
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

test("all 18 legacy files and shims are physically retired", () => {
  for (const file of retiredFiles) {
    const fullPath = join(root, file);
    assert.equal(existsSync(fullPath), false, `${file} still exists on disk`);
  }
});

test("new access-decision boundary has no forbidden imports", () => {
  const files = filesUnder(root);
  for (const file of files) {
    for (const specifier of importsIn(file)) {
      assert.notEqual(specifier, packageName, `${relative(process.cwd(), file)} imports the package itself`);
      assert.ok(!specifier.includes("packages/access-gate/src/access-gate/"), `${relative(process.cwd(), file)} imports source by absolute path`);
      const resolvedSpecifier = resolve(dirname(file), specifier);
      assert.ok(
        !legacyDirectories.some((directory) => resolvedSpecifier.includes(`/packages/access-gate/src/access-gate/${directory}/`)),
        `${relative(process.cwd(), file)} imports legacy directory through ${specifier}`,
      );
    }
  }
});

test("the production extension reaches only the unified trust chain", () => {
  const entry = join(root, "../index.ts");
  const forbidden = new Set(retiredFiles.map((file) => resolve(join(root, file))));
  const visited = new Set<string>();
  const pending = [resolve(entry)];

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/^(?!import\s+type\b)(?:import|export)\s+[\s\S]*?from\s+["']([^"']+)["'];?/gm)) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) continue;
      const base = resolve(dirname(file), specifier);
      const target = existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(join(base, "index.ts")) ? join(base, "index.ts") : undefined;
      if (target !== undefined) pending.push(resolve(target));
    }
  }

  for (const file of forbidden) assert.equal(visited.has(file), false, `${relative(process.cwd(), file)} is reachable from production`);
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
