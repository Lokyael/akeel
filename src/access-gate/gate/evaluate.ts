import { compileDirectToolCall } from "./direct-tool-compiler";
import { compileShellCall } from "./shell-compiler";
import { isRecord, type CompileResult, type CompilerContext } from "./access-request";
import { evaluateRequest } from "./evaluate-request";
import { renderCompilationFailure, renderDecision } from "./render-decision";
import type { GateDecision } from "./decision-types";
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
  if (compiled.kind === "reject") return renderCompilationFailure(compiled);
  return adaptDecision(await evaluateRequest(compiled.plan, input.profile, runtime), runtime);
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
