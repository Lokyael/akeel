import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

type PiManifest = Readonly<{
  readonly extensions?: readonly string[];
  readonly skills?: readonly string[];
}>;

type PackageManifest = Readonly<{
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly pi?: PiManifest;
}>;

const root = resolve(import.meta.dirname!, "..");

function readPackage(relativePath: string): PackageManifest {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8")) as PackageManifest;
}

function assertManifestResourcesExist(packageRoot: string, manifest: PiManifest | undefined): void {
  assert.ok(manifest, `${packageRoot} must declare a pi manifest`);
  for (const resource of [...(manifest.extensions ?? []), ...(manifest.skills ?? [])]) {
    assert.ok(resource.startsWith("./"), `${packageRoot} resource must be relative: ${resource}`);
    assert.ok(existsSync(join(root, packageRoot, resource)), `${packageRoot} resource is missing: ${resource}`);
  }
}

function filesNamed(directory: string, name: string): string[] {
  const matches: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...filesNamed(path, name));
    else if (entry.name === name) matches.push(path);
  }
  return matches;
}

test("three capability packages expose independent Pi manifests", () => {
  const packages = [
    ["packages/guidance", "akeel-guidance"],
    ["packages/access-gate", "akeel-access-gate"],
    ["packages/context-pruner", "akeel-context-pruner"],
  ] as const;

  for (const [packageRoot, expectedName] of packages) {
    const manifest = readPackage(`${packageRoot}/package.json`);
    assert.equal(manifest.name, expectedName);
    assertManifestResourcesExist(packageRoot, manifest.pi);
  }
});

test("guidance owns bootstrap and skills without duplicating principles", () => {
  const manifest = readPackage("packages/guidance/package.json");
  assert.deepEqual(manifest.pi?.extensions, [
    "./src/bootstrap/index.ts",
    "./src/artifact-exchange/pi-composition.ts",
    "./src/record-containers/pi-composition.ts",
  ]);
  assert.deepEqual(manifest.pi?.skills, ["./skills/disciplines", "./skills/workflows"]);
  const principles = filesNamed(join(root, "packages/guidance"), "principles.md");
  assert.deepEqual(principles, [join(root, "packages/guidance/src/bootstrap/principles.md")]);
});

test("runtime packages declare only their own extension and required dependency", () => {
  const accessGate = readPackage("packages/access-gate/package.json");
  const contextPruner = readPackage("packages/context-pruner/package.json");

  assert.deepEqual(accessGate.pi?.extensions, ["./src/access-gate"]);
  assert.deepEqual(contextPruner.pi?.extensions, ["./src/context-pruner"]);
  assert.equal(accessGate.dependencies?.yaml, "^2.9.0");
  assert.equal(contextPruner.dependencies?.yaml, undefined);
});

test("each capability package carries the repository license", () => {
  const license = readFileSync(join(root, "LICENSE"), "utf8");
  for (const packageRoot of ["packages/guidance", "packages/access-gate", "packages/context-pruner"]) {
    assert.equal(
      readFileSync(join(root, packageRoot, "LICENSE"), "utf8"),
      license,
      `${packageRoot} must carry the repository LICENSE for independent publication`,
    );
  }
});

test("root akeel manifest loads each capability exactly once", () => {
  const manifest = readPackage("package.json");
  assert.deepEqual(manifest.pi?.extensions, [
    "./packages/guidance/src/bootstrap/index.ts",
    "./packages/guidance/src/artifact-exchange/pi-composition.ts",
    "./packages/guidance/src/record-containers/pi-composition.ts",
    "./packages/access-gate/src/access-gate",
    "./packages/context-pruner/src/context-pruner",
  ]);
  assert.deepEqual(manifest.pi?.skills, [
    "./packages/guidance/skills/disciplines",
    "./packages/guidance/skills/workflows",
  ]);
  assertManifestResourcesExist(".", manifest.pi);
});
