import {
  ANALYSIS_LIMITS,
  createRequest,
  isRecord,
  pathOperation,
  reject,
  validateInputLength,
  type CompileResult,
  type DirectToolCompilerInput,
  type ToolSurface,
} from "./access-request";
import type { Effect } from "../command-semantics/types";

const DIRECT_SURFACES = new Set(["read", "write", "edit", "find", "grep", "ls"]);
const DIRECT_FIELDS: Record<string, readonly string[]> = {
  read: ["path"],
  write: ["path", "content"],
  edit: ["path", "oldText", "newText"],
  find: ["path", "pattern"],
  grep: ["path", "pattern", "glob"],
  ls: ["path"],
};

function validateInput(surface: string, args: Record<string, unknown>): string | null {
  const fields = new Set(DIRECT_FIELDS[surface]);
  for (const key of Object.keys(args)) {
    if (!fields.has(key)) return `unknown field: ${key}`;
  }
  for (const key of ["path", "pattern", "glob", "content", "oldText", "newText"]) {
    if (args[key] !== undefined && typeof args[key] !== "string") return `${key} must be a string`;
    if (typeof args[key] === "string" && args[key].length > ANALYSIS_LIMITS.maxArgumentLength) return `${key} exceeds the analysis budget`;
  }
  if (["read", "write", "edit"].includes(surface) && (typeof args.path !== "string" || args.path.trim() === "")) return "path is required and cannot be empty";
  if (["find", "grep", "ls"].includes(surface) && args.path !== undefined && (typeof args.path !== "string" || args.path.trim() === "")) return "path cannot be empty";
  if (surface === "write" && typeof args.content !== "string") return "content is required";
  if (surface === "edit" && (typeof args.oldText !== "string" || typeof args.newText !== "string")) return "edit text fields are required";
  if (surface === "grep" && typeof args.pattern !== "string") return "pattern is required";
  return null;
}

export function compileDirectToolCall(input: DirectToolCompilerInput): CompileResult {
  if (!DIRECT_SURFACES.has(input.surface)) return reject("unknown-tool", input.surface);
  if (!isRecord(input.args)) return reject("invalid-tool-input", "Direct tool args must be a plain object");
  let validationError: string | null;
  try {
    validationError = validateInput(input.surface, input.args);
  } catch {
    return reject("invalid-tool-input", "Direct tool args could not be inspected");
  }
  if (validationError) return reject("invalid-tool-input", validationError);

  const operation = input.surface === "read" ? "read"
    : input.surface === "ls" ? "list"
      : input.surface === "find" || input.surface === "grep" ? "search"
        : "write";
  const target = typeof input.args.path === "string" && input.args.path.trim() !== "" ? input.args.path : ".";
  const state = {
    cwd: input.cwd,
    candidates: [{ cwd: input.cwd, certainty: "exact" as const, branch: "direct" }],
  };
  let serializedArgs: string;
  try {
    serializedArgs = JSON.stringify(input.args);
  } catch {
    return reject("invalid-tool-input", "Direct tool args must be JSON serializable");
  }
  const inputLimit = validateInputLength(serializedArgs, "direct tool arguments");
  if (inputLimit) return inputLimit;

  const span = { start: 0, end: 0 };
  const effects: readonly Effect[] = operation === "write"
    ? ["write"]
    : operation === "search"
      ? ["read", "search"]
      : ["read"];
  const commandClass = operation === "write" ? "mutating" as const : "readOnly" as const;
  const path = pathOperation(operation, target, state, "argument", "exact", span);
  const command = { kind: "command" as const, origin: "direct" as const, commandClass, executable: `direct:${input.surface}`, effects, span };
  const effectOperations = effects.map((effect) => ({ kind: "effect" as const, effect, confidence: "exact" as const, span }));
  const operations = [command, ...effectOperations, path];
  return createRequest(input.surface as ToolSurface, operations, state.candidates, {
    commandSpans: [span],
    redirectionSpans: [],
    commandCount: 1,
    pathOperationCount: 1,
    effectOperationCount: effectOperations.length,
    cwdCandidateCount: state.candidates.length,
  }, serializedArgs.length, { projectRoot: input.projectRoot, stagingDir: input.stagingDir });
}
