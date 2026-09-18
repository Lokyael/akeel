import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import installRecordContainerValidator, {
  installRecordContainerValidator as namedInstall,
  VALIDATE_RECORDS_TOOL,
} from "../../../packages/guidance/src/record-containers/pi-composition";

type Tool = Readonly<{
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: unknown;
  readonly execute: (...args: any[]) => Promise<any> | any;
}>;

function fakePi() {
  const tools = new Map<string, Tool>();
  const pi = {
    registerTool(tool: Tool): void {
      tools.set(tool.name, tool);
    },
  } as unknown as ExtensionAPI;
  return { pi, tools };
}

function fakeContext(cwd: string): ExtensionContext {
  return {
    cwd,
    hasUI: false,
    ui: {},
  } as unknown as ExtensionContext;
}

test("pi-composition registers akeel_validate_records tool with correct metadata", () => {
  const { pi, tools } = fakePi();
  installRecordContainerValidator(pi);

  const tool = tools.get(VALIDATE_RECORDS_TOOL);
  assert.ok(tool, "tool must be registered");
  assert.equal(tool.name, "akeel_validate_records");
  assert.equal(tool.label, "AKeel Validate Records");
  assert.match(tool.description, /Validate Project Record containers/);
});

test("named install exports same functionality as default export", () => {
  const { pi, tools } = fakePi();
  namedInstall(pi);
  assert.ok(tools.has(VALIDATE_RECORDS_TOOL));
});

test("akeel_validate_records executes against workspace cwd and reports valid status", async () => {
  const tempDir = join(tmpdir(), `akeel-test-records-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tempDir, "docs"), { recursive: true });
  writeFileSync(join(tempDir, "docs", "task.md"), "# Tasks\n\n## T-001: First\n\n## T-002: 待创建\n");

  try {
    const { pi, tools } = fakePi();
    installRecordContainerValidator(pi);
    const tool = tools.get(VALIDATE_RECORDS_TOOL)!;

    const ctx = fakeContext(tempDir);
    const output = await tool.execute("call-1", {}, undefined, undefined, ctx);

    assert.ok(output.details?.result);
    assert.equal(output.details.result.ok, true);
    assert.deepEqual(output.details.result.checked, ["docs/task.md"]);
    assert.deepEqual(output.details.result.errors, []);

    const parsed = JSON.parse(output.content[0].text);
    assert.equal(parsed.ok, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("akeel_validate_records executes and reports slot errors", async () => {
  const tempDir = join(tmpdir(), `akeel-test-records-err-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tempDir, "docs"), { recursive: true });
  writeFileSync(join(tempDir, "docs", "task.md"), "# Tasks\n\n## T-001: 待创建\n\nsomething after slot\n");

  try {
    const { pi, tools } = fakePi();
    installRecordContainerValidator(pi);
    const tool = tools.get(VALIDATE_RECORDS_TOOL)!;

    const ctx = fakeContext(tempDir);
    const output = await tool.execute("call-2", {}, undefined, undefined, ctx);

    assert.ok(output.details?.result);
    assert.equal(output.details.result.ok, false);
    assert.equal(output.details.result.errors.length, 1);
    assert.match(output.details.result.errors[0], /slot heading is not the last non-empty line/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("akeel_validate_records supports explicit projectRoot parameter", async () => {
  const tempDir = join(tmpdir(), `akeel-test-subproject-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const subDir = join(tempDir, "sub-repo");
  mkdirSync(join(subDir, "docs"), { recursive: true });
  writeFileSync(join(subDir, "docs", "candidates.md"), "# Candidates\n\n## C-010: 待创建\n");

  try {
    const { pi, tools } = fakePi();
    installRecordContainerValidator(pi);
    const tool = tools.get(VALIDATE_RECORDS_TOOL)!;

    const ctx = fakeContext(tempDir);
    const output = await tool.execute("call-3", { projectRoot: "sub-repo" }, undefined, undefined, ctx);

    assert.ok(output.details?.result);
    assert.equal(output.details.result.ok, true);
    assert.deepEqual(output.details.result.checked, ["docs/candidates.md"]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
