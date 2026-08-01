import { compileToolCall } from "./compiler-entry";
import { evaluateRequest } from "./evaluate-request";
import { renderCompilationFailure, renderDecision } from "./render-decision";
import type { GateDecision } from "./decision-types";
import type { GateResult, GateRuntime, ToolCallInput } from "./types";
import { TOOL_SCHEMAS } from "./tool-schemas";
import type { GateCategory } from "./categories";

/** 将 tool surface 映射到 gate 分类。不在管辖范围内的工具 = passthrough。 */
export function classifyTool(surface: string): GateCategory {
  if (surface === "bash") return "shell";
  if (TOOL_SCHEMAS[surface]) return "filesystem";
  return "passthrough";
}

export async function evaluateToolCall(input: ToolCallInput, runtime: GateRuntime): Promise<GateResult> {
  // 不在 gate 管辖范围内的工具 passthrough，不做任何拦截。
  if (classifyTool(input.surface) === "passthrough") {
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
  return adaptDecision(evaluateRequest(compiled.plan, input.profile), runtime);
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
    return {
      kind: "block",
      reason: "The operation is pending approval, but no interactive approval UI is available in this environment. The operation was not executed. Do not retry it automatically; tell the user it needs approval.",
      code: "approval-required",
    };
  }
  const choice = await runtime.select(`${title}\n\n${clean(detail)}\n\nAllow this operation once?`, ["Allow once", "Deny"]);
  return choice === "Allow once"
    ? { kind: "allow" }
    : {
        kind: "block",
        reason: "The user denied the operation. It was not executed. Do not retry it; wait for the user's next instruction.",
        code: "user-denied",
      };
}
