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
import { TOOL_SCHEMAS } from "./tool-schemas";

function validateEditEntries(edits: unknown): string | null {
  if (!Array.isArray(edits)) return "edits must be an array";
  if (edits.length === 0) return "edits must not be empty";
  if (edits.length > ANALYSIS_LIMITS.maxEditEntries) return "edits exceeds the analysis budget";
  for (const [index, edit] of edits.entries()) {
    if (!isRecord(edit)) return `edits[${index}] must be a plain object`;
    if (typeof edit.oldText !== "string") return `edits[${index}].oldText must be a string`;
    if (typeof edit.newText !== "string") return `edits[${index}].newText must be a string`;
    if (edit.oldText.length > ANALYSIS_LIMITS.maxArgumentLength) return `edits[${index}].oldText exceeds the analysis budget`;
    if (edit.newText.length > ANALYSIS_LIMITS.maxArgumentLength) return `edits[${index}].newText exceeds the analysis budget`;
  }
  return null;
}

/** Validate tool args against the centralized schema. */
function validateAgainstSchema(
  args: Record<string, unknown>,
  schema: ToolSchema,
): string | null {
  const allowedKeys = new Set(Object.keys(schema.fields));
  for (const key of Object.keys(args)) {
    if (!allowedKeys.has(key)) return `unknown field: ${key}`;
    const field = schema.fields[key];
    if (!field) continue;
    if (field.type === "string") {
      if (typeof args[key] !== "string") return `${key} must be a string`;
      if ((args[key] as string).length > ANALYSIS_LIMITS.maxArgumentLength) return `${key} exceeds the analysis budget`;
    } else if (field.type === "integer") {
      if (typeof args[key] !== "number" || !Number.isInteger(args[key])) return `${key} must be an integer`;
      if (field.min !== undefined && (args[key] as number) < field.min) return `${key} must be >= ${field.min}`;
    } else if (field.type === "array") {
      if (key === "edits") {
        const err = validateEditEntries(args[key]);
        if (err) return err;
      } else {
        if (!Array.isArray(args[key])) return `${key} must be an array`;
      }
    }
  }
  for (const [key, field] of Object.entries(schema.fields)) {
    if (field.required && (args[key] === undefined || args[key] === "")) {
      return `${key} is required`;
    }
  }
  return null;
}

export function compileDirectToolCall(input: DirectToolCompilerInput): CompileResult {
  const schema = TOOL_SCHEMAS[input.surface];
  if (!schema) return reject("unknown-tool", input.surface);
  if (!isRecord(input.args)) return reject("invalid-tool-input", "Direct tool args must be a plain object");

  let validationError: string | null;
  try {
    validationError = validateAgainstSchema(input.args, schema);
  } catch {
    return reject("invalid-tool-input", "Direct tool args could not be inspected");
  }
  if (validationError) return reject("invalid-tool-input", validationError);

  const operation = schema.pathOperation;
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
  const effects = [...schema.effects];
  const path = pathOperation(operation, target, state, "argument", "exact", span);
  const command = {
    kind: "command" as const,
    origin: "direct" as const,
    commandClass: schema.commandClass,
    executable: `direct:${input.surface}`,
    effects,
    span,
  };
  const effectOperations = effects.map((effect) => ({
    kind: "effect" as const,
    effect,
    confidence: "exact" as const,
    span,
  }));
  const operations = [command, ...effectOperations, path];
  return createRequest(
    input.surface as ToolSurface, operations, state.candidates,
    {
      commandSpans: [span],
      redirectionSpans: [],
      commandCount: 1,
      pathOperationCount: 1,
      effectOperationCount: effectOperations.length,
      cwdCandidateCount: state.candidates.length,
    },
    serializedArgs.length,
    { projectRoot: input.projectRoot, stagingDir: input.stagingDir },
  );
}
