import { compileDirectToolCall } from "./direct-tool-compiler";
import { compileShellCall } from "./shell-compiler";
import { isRecord, type CompileResult, type CompilerContext } from "./access-request";
import { evaluateRequest } from "./evaluate-request";
import { renderDecision } from "./render-decision";
import type { HardDenyCode, GateDecision } from "./decision-types";
import { DecisionBuilder } from "./decision-builder";
import type { GateResult, GateRuntime, ToolCallInput } from "./types";
import { TOOL_SCHEMAS } from "./tool-schemas";
import type { GateCategory } from "./categories";

export type ToolCompilerInput = CompilerContext & {
  surface: string;
  args: unknown;
};

/** 将 tool surface 映射到 gate 分类。不在管辖范围内的工具 = passthrough。 */
export function classifyTool(surface: string): { category: GateCategory } {
  if (surface === "bash") return { category: "shell" };
  if (TOOL_SCHEMAS[surface]) return { category: "filesystem" };
  return { category: "passthrough" };
}

export function compileToolCall(input: ToolCompilerInput): CompileResult {
  if (input.surface === "bash") {
    const args = isRecord(input.args) ? input.args : {};
    return compileShellCall({ ...input, command: typeof args.command === "string" ? args.command : "" });
  }
  return compileDirectToolCall(input);
}

// Compiler 可产出的 reject code 集合。新增 compile-stage DecisionCode 时必须加入此集合。
const COMPILER_REJECT_CODES: ReadonlySet<HardDenyCode> = new Set([
  "unknown-tool",
  "invalid-tool-input",
  "dynamic-shell",
  "unsafe-syntax",
  "threat",
  "opaque-command",
  "destroy-command",
  "hard-command-rule",
  "unsupported-redirection",
  "uncertain-cwd",
  "unknown-effect",
  "resource-limit",
]);

function compilerRejectToDecision(result: Extract<CompileResult, { kind: "reject" }>): GateDecision {
  const code = result.code;
  const evidence = result.evidence;
  if (COMPILER_REJECT_CODES.has(code as HardDenyCode)) {
    const subject = evidence[0]?.subject ?? code;
    const span = evidence[0]?.span;
    return new DecisionBuilder().hard(code as HardDenyCode, subject, span).build();
  }
  // 防御：未知 reject code 不可能到达。如果到达此处，说明 compiler
  // 产出了一个不在 COMPILER_REJECT_CODES 中的新 code。
  return DecisionBuilder.hard("unknown-tool", "unexpected compiler reject code");
}

export async function evaluateToolCall(input: ToolCallInput, runtime: GateRuntime): Promise<GateResult> {
  // 不在 gate 管辖范围内的工具 passthrough，不做任何拦截。
  if (classifyTool(input.surface).category === "passthrough") {
    return { kind: "allow" };
  }

  const compiled = compileToolCall({
    surface: input.surface,
    args: input.args,
    cwd: input.cwd,
    projectRoot: input.projectRoot,
    stagingDir: input.stagingDir,
  });
  if (compiled.kind === "reject") return renderDecision(compilerRejectToDecision(compiled));
  return adaptDecision(await evaluateRequest(compiled.request, input.profile, runtime), runtime);
}

async function adaptDecision(decision: GateDecision, runtime: GateRuntime): Promise<GateResult> {
  if (decision.disposition === "allow") return { kind: "allow" };
  if (decision.disposition === "ask") {
    const rendered = renderDecision(decision);
    return askOnce(runtime, "Access profile approval", rendered.kind === "block" ? rendered.reason : "approval required");
  }
  return renderDecision(decision);
}

// ── host adapter: approval prompt ──

function clean(value: string): string {
  return value.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

async function askOnce(runtime: GateRuntime, title: string, detail: string): Promise<GateResult> {
  if (!runtime.hasUI || !runtime.select) {
    return { kind: "block", reason: "approval required but no interactive UI is available", code: "approval-required" };
  }
  const choice = await runtime.select(`${title}\n\n${clean(detail)}\n\nAllow this operation once?`, ["Allow once", "Deny"]);
  return choice === "Allow once"
    ? { kind: "allow" }
    : { kind: "block", reason: "user denied the operation", code: "user-denied" };
}
