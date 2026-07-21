import { decidePath, resolvePath } from "../path";
import type { PathOperation } from "../profile/types";
import { analyzeShellCommand } from "./analyze-shell";
import { askOnce, decisionBlock } from "./unknown-command";
import type { GateResult, GateRuntime, ToolCallInput } from "./types";

const TOOL_OPERATIONS: Record<string, PathOperation> = {
  read: "read",
  write: "write",
  edit: "write",
  find: "search",
  grep: "search",
  ls: "list",
};

function pathForTool(surface: string, args: Record<string, unknown>): string | null {
  const value = args.path;
  if (typeof value === "string" && value.trim() !== "") return value;
  if (surface === "read" || surface === "write" || surface === "edit") return null;
  return ".";
}

export async function evaluateToolCall(input: ToolCallInput, runtime: GateRuntime): Promise<GateResult> {
  if (input.surface === "bash") {
    const command = typeof input.args.command === "string" ? input.args.command : "";
    if (!command.trim()) return decisionBlock("bash command is missing");
    return analyzeShellCommand({
      command,
      cwd: input.cwd,
      projectRoot: input.projectRoot,
      stagingDir: input.stagingDir,
      profile: input.profile,
      runtime,
    });
  }

  const operation = TOOL_OPERATIONS[input.surface];
  if (operation) {
    const target = pathForTool(input.surface, input.args);
    if (!target) return decisionBlock(`${input.surface} path is missing`);
    const path = resolvePath(input.cwd, input.projectRoot, input.stagingDir, target);
    const decision = decidePath(path, input.profile, operation);
    if (decision.decision === "deny") return decisionBlock(`${operation} path denied: ${target} (${decision.reason})`);
    if (decision.decision === "ask") return askOnce(runtime, "Access profile approval", `${operation} path: ${target}`);
    return { kind: "allow" };
  }

  const decision = input.profile.shellPolicy.unclassified;
  if (decision === "deny") return decisionBlock(`unclassified tool denied: ${input.surface}`);
  if (decision === "ask") return askOnce(runtime, "Access profile approval", `unclassified tool: ${input.surface}`);
  return { kind: "allow" };
}
