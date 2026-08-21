// 配置回归：已退役的 optional adapter 配置不得重新激活工具。

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { analyzeSemantics } from "../../../src/access-gate/command-semantics/registry";
import { resetConfigCache } from "../../../src/access-gate/config";

function setup(configYaml: string): { cleanup: () => void } {
  const parent = mkdtempSync(join(tmpdir(), "pi-keel-config-"));
  const agentDir = mkdtempSync(join(parent, "agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "config.yaml"), configYaml, "utf-8");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  return {
    cleanup: () => {
      resetConfigCache();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

test("legacy optional adapter configuration does not activate a retired tool", () => {
  resetConfigCache();
  const legacyKey = "optionalAdapters";
  const { cleanup } = setup(`${legacyKey}:\n  - retired-tool\n`);
  try {
    const { program } = parse(lex("retired-tool agent list").tokens);
    const semantics = analyzeSemantics(program.commands[0]!);
    assert.equal(semantics.commandClass, "unknown");
  } finally {
    cleanup();
  }
});
