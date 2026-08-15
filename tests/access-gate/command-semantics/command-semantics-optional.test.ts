// 可选工具建模（D-041）：默认不加载；config.yaml optionalAdapters 显式启用才注册；
// 未知启用名 → 响亮报错 + fail-closed（不加载任何 optional）。
// 语义细节（token 级）见 command-semantics-herdr.test.ts。

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lex } from "../../../src/access-gate/shell-parse/lexer";
import { parse } from "../../../src/access-gate/shell-parse/parser";
import { analyzeSemantics } from "../../../src/access-gate/command-semantics/registry";
import { resetConfig } from "../../../src/access-gate/config";
import type { CommandSemantics } from "../../../src/access-gate/command-semantics/types";

function analyze(cmd: string): CommandSemantics {
  const { program } = parse(lex(cmd).tokens);
  return analyzeSemantics(program.commands[0]!);
}

function setup(configYaml: string): { cleanup: () => void } {
  const parent = mkdtempSync(join(tmpdir(), "pi-keel-optional-"));
  const agentDir = mkdtempSync(join(parent, "agent-"));
  mkdirSync(join(agentDir, "pi-keel"), { recursive: true });
  writeFileSync(join(agentDir, "pi-keel", "config.yaml"), configYaml, "utf-8");
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  return {
    cleanup: () => {
      resetConfig();
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

function captureError<T>(fn: () => T): { value: T; messages: string[] } {
  const messages: string[] = [];
  const original = console.error;
  console.error = (m: unknown) => { messages.push(String(m)); };
  try {
    return { value: fn(), messages };
  } finally {
    console.error = original;
  }
}

test("optional adapters are not loaded by default (bare herdr stays unknown)", () => {
  resetConfig();
  const { cleanup } = setup(""); // 空 config.yaml
  try {
    const sem = analyze("herdr agent list");
    assert.equal(sem.commandClass, "unknown", "herdr must not be modeled without explicit opt-in");
  } finally {
    cleanup();
  }
});

test("enabling herdr registers token-level semantics", () => {
  resetConfig();
  const { cleanup } = setup("optionalAdapters:\n  - herdr\n");
  try {
    assert.equal(analyze("herdr agent list").commandClass, "execute");
    assert.equal(analyze("herdr status").commandClass, "inspect");
    assert.equal(analyze("herdr --session dev status").commandClass, "inspect");
    const update = analyze("herdr update");
    assert.equal(update.commandClass, "execute");
    assert.ok(update.effects.includes("network"), `update must carry network effect, got: ${update.effects.join(",")}`);
  } finally {
    cleanup();
  }
});

test("enabling herdr does not change unrelated commands", () => {
  resetConfig();
  const { cleanup } = setup("optionalAdapters:\n  - herdr\n");
  try {
    assert.equal(analyze("git status").commandClass, "inspect");
    assert.equal(analyze("unknowncmd").commandClass, "unknown");
  } finally {
    cleanup();
  }
});

test("user commands section still overrides an enabled optional adapter", () => {
  resetConfig();
  const { cleanup } = setup([
    "commands:",
    "  commands:",
    "    herdr:",
    "      class: inspect",
    "optionalAdapters:",
    "  - herdr",
    "",
  ].join("\n"));
  try {
    const sem = analyze("herdr agent list");
    assert.equal(sem.commandClass, "inspect", "user commands definition must win over optional adapter");
    assert.ok(sem.reason.includes("user-defined"));
  } finally {
    cleanup();
  }
});

test("unknown optional adapter name reports loudly and loads nothing (fail-closed)", () => {
  resetConfig();
  const { cleanup } = setup("optionalAdapters:\n  - nosuchadapter\n  - herdr\n");
  try {
    const { value, messages } = captureError(() => analyze("herdr agent list"));
    assert.equal(value.commandClass, "unknown", "unknown name must fail closed: no optional adapters loaded");
    assert.ok(
      messages.some((m) => m.includes("unknown adapter") && m.includes("nosuchadapter")),
      `expected loud error, got: ${messages.join(" | ")}`,
    );
  } finally {
    cleanup();
  }
});
