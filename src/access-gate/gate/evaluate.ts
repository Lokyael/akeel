import { compileDirectToolCall } from "./direct-tool-compiler";
import { compileShellCall } from "./shell-compiler";
import { isRecord, type CompileResult, type CompilerContext } from "./access-request";
import { evaluateRequest } from "./evaluate-request";
import { renderDecision } from "./render-decision";
import { askOnce } from "./unknown-command";
import type { GateResult, GateRuntime, ToolCallInput } from "./types";

export type ToolCompilerInput = CompilerContext & {
  surface: string;
  args: unknown;
};

export function compileToolCall(input: ToolCompilerInput): CompileResult {
  if (input.surface === "bash") {
    const args = isRecord(input.args) ? input.args : {};
    return compileShellCall({ ...input, command: typeof args.command === "string" ? args.command : "" });
  }
  return compileDirectToolCall(input);
}

function compilerRejectToDecision(result: Extract<CompileResult, { kind: "reject" }>): import("./decision-types").GateDecision {
  const code = result.code;
  const evidence = result.evidence;
  if (code === "unknown-tool" || code === "invalid-tool-input"
    || code === "dynamic-shell" || code === "unsafe-syntax" || code === "threat"
    || code === "opaque-command" || code === "dangerous-command" || code === "hard-command-rule"
    || code === "unsupported-redirection" || code === "uncertain-cwd" || code === "unknown-effect"
    || code === "resource-limit") {
    return { disposition: "deny", code, enforcement: "hard", evidence, guidance: [] };
  }
  return { disposition: "deny", code: "invalid-tool-input", enforcement: "hard", evidence, guidance: [] };
}

export async function evaluateToolCall(input: ToolCallInput, runtime: GateRuntime): Promise<GateResult> {
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

async function adaptDecision(decision: import("./decision-types").GateDecision, runtime: GateRuntime): Promise<GateResult> {
  if (decision.disposition === "allow") return { kind: "allow" };
  if (decision.disposition === "ask") {
    const rendered = renderDecision(decision);
    return askOnce(runtime, "Access profile approval", rendered.kind === "block" ? rendered.reason : "approval required");
  }
  return renderDecision(decision);
}
