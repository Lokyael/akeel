/**
 * tool-gate.test.ts — One-time approval behavior for tool and bash gates.
 *
 * Run: npx tsx tests/security-gate/tool-gate.test.ts
 */

import { evaluateToolPermission } from "../../src/security-gate/pipeline/permission";
import { evaluateBashCommand } from "../../src/security-gate/pipeline/bash";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SecurityConfig } from "../../src/security-gate/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function testConfig(overrides?: Partial<SecurityConfig>): SecurityConfig {
  return {
    level: "standard",
    permission: {
      "*": "ask",
      path: { "*": "allow" },
      read: { "*": "allow" },
      write: { "*": "ask" },
      edit: { "*": "ask" },
      external_directory: "ask",
      bash: {},
    },
    ...overrides,
  };
}

function createContext(selections: string[]): {
  ctx: ExtensionContext;
  prompts: string[][];
} {
  const prompts: string[][] = [];
  const ctx = {
    hasUI: true,
    ui: {
      select: async (_prompt: string, options: string[]) => {
        prompts.push(options);
        return selections.shift();
      },
    },
  } as unknown as ExtensionContext;
  return { ctx, prompts };
}

async function run(): Promise<void> {
  console.log("\n1. Tool approval is one-time");
  {
    const { ctx, prompts } = createContext(["Allow once", "Allow once"]);
    const input = { surface: "custom_tool", value: "*", cwd: process.cwd(), ctx, config: testConfig() };
    const first = await evaluateToolPermission(input);
    const second = await evaluateToolPermission(input);

    assert(first === null, "first Allow once permits the current tool call");
    assert(second === null, "second Allow once permits the current tool call");
    assert(prompts.length === 2, "the same tool is approved independently on the second call");
    assert(prompts.every((options) => options.length === 2 && options[0] === "Allow once" && options[1] === "Deny"),
      "tool approval offers only Allow once and Deny");
  }

  console.log("\n2. Bash approval is one-time");
  {
    const { ctx, prompts } = createContext(["Allow once", "Allow once"]);
    const input = { command: "npm install", ctx, config: testConfig() };
    const first = await evaluateBashCommand(input);
    const second = await evaluateBashCommand(input);

    assert(first.kind === "allow", "first Allow once permits the current bash call");
    assert(second.kind === "allow", "second Allow once permits the current bash call");
    assert(prompts.length === 2, "bash asks again after a one-time approval");
    assert(prompts.every((options) => options.length === 2 && options[0] === "Allow once" && options[1] === "Deny"),
      "bash approval offers only Allow once and Deny");
  }

  console.log("\n3. Bash critical rules cannot be relaxed by config");
  {
    const { ctx } = createContext([]);
    const configWithAllow = testConfig();
    configWithAllow.permission.bash = { "rm -rf /": "allow", "unknown-command": "allow" };
    const critical = await evaluateBashCommand({ command: "rm -rf /", ctx, config: configWithAllow });
    const unknown = await evaluateBashCommand({ command: "unknown-command", ctx, config: configWithAllow });
    assert(critical?.kind === "block", "critical taxonomy rule remains blocked despite bash allow");
    assert(unknown?.kind === "block", "unknown command remains blocked despite wildcard-like bash allow");
  }

  console.log("\n4. Broad directory reads require approval");
  {
    const { ctx, prompts } = createContext(["Deny"]);
    const result = await evaluateToolPermission({ surface: "find", value: ".", cwd: process.cwd(), ctx, config: testConfig() });
    assert(result?.kind === "block", "broad find is not auto-allowed");
    assert(prompts.length === 1, "broad find prompts for approval");
  }

  console.log("\n5. Literal bash reads use canonical path policy");
  {
    const { ctx } = createContext([]);
    const result = await evaluateBashCommand({ command: "cat .env", cwd: process.cwd(), ctx, config: testConfig() });
    assert(result?.kind === "block", "bash literal sensitive read is hard denied");
  }

  console.log("\n6. Permissive retains critical bash rules");
  {
    const { ctx } = createContext([]);
    const permissive = testConfig({ level: "permissive" });
    const result = await evaluateBashCommand({ command: "echo $(rm -rf /)", ctx, config: permissive });
    assert(result?.kind === "block", "permissive does not disable command substitution hard block");
  }

  console.log("\n7. Hard shell boundaries");
  {
    const cases = [
      ["printf x>.env", "no-space redirect"],
      ["sed -n 1p .env", "sed protected read"],
      ["cat <(rm -rf /)", "process substitution"],
      ['"/bin/rm" -rf /', "quoted executable"],
    ] as const;
    for (const [command, label] of cases) {
      const { ctx, prompts } = createContext(["Allow once"]);
      const result = await evaluateBashCommand({ command, cwd: process.cwd(), ctx, config: testConfig() });
      assert(result?.kind === "block", `${label} is blocked`);
      assert(prompts.length === 0, `${label} is hard blocked without an approval prompt`);
    }
  }

  console.log(`\n  RESULTS: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void run();
