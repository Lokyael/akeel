import { bashCommandFromArgs, compileToolCall } from "../plan/compiler-entry";
import { evaluateRequest } from "./evaluate-request";
import { renderCompilationFailure, renderDecision } from "./render-decision";
import type { GateDecision } from "../decision-types";
import type { GateResult, GateRuntime, ToolCallInput } from "../host";
import type { GateCategory } from "../plan/categories";
import { TOOL_SURFACE_SET } from "../../domain";
import type { ToolSurface } from "../../domain";

/**
 * 将 tool surface 映射到 gate 分类。不在管辖范围内的工具 = passthrough。
 * 管辖面以 domain 的 TOOL_SURFACE_SET 为单一来源；TOOL_SCHEMAS 只做 schema 查询。
 */
export function classifyTool(surface: string): GateCategory {
  if (!TOOL_SURFACE_SET.has(surface as ToolSurface)) return "passthrough";
  return surface === "bash" ? "shell" : "filesystem";
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
  const rawCommand = bashCommandFromArgs(input.surface, input.args);
  return adaptDecision(evaluateRequest(compiled.plan, input.profile), runtime, rawCommand);
}

async function adaptDecision(decision: GateDecision, runtime: GateRuntime, rawCommand?: string): Promise<GateResult> {
  if (decision.disposition === "allow") return { kind: "allow" };
  if (decision.disposition === "ask") {
    const rendered = renderDecision(decision, rawCommand);
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
