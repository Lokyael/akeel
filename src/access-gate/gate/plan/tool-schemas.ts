import type { Effect, CommandClass } from "../../command-semantics";
import type { DirectToolSurface, PathOperation } from "../../domain";

// Centralized tool schema definitions — single source of truth for Direct tool
// parameter validation.  Adding a new tool or parameter only requires a schema
// entry here; the compiler validates against these schemas automatically.

interface FieldSchema {
  readonly type: "string" | "integer" | "array";
  readonly required: boolean;
  readonly min?: number;
}

export interface ToolSchema {
  readonly fields: Record<string, FieldSchema>;
  readonly pathOperation: PathOperation;
  readonly effects: readonly Effect[];
  readonly commandClass: CommandClass;
}

// 键集受 DirectToolSurface 编译期约束（G）：增删 Direct 工具漏改 schema = 编译错误，无需运行时同步测试。
export const TOOL_SCHEMAS: Record<DirectToolSurface, ToolSchema> = {
  read: {
    fields: {
      path:   { type: "string", required: true },
      offset: { type: "integer", required: false, min: 0 },
      limit:  { type: "integer", required: false, min: 0 },
    },
    pathOperation: "read",
    effects: ["read"],
    commandClass: "inspect",
  },
  write: {
    fields: {
      path:    { type: "string", required: true },
      content: { type: "string", required: true },
    },
    pathOperation: "write",
    effects: ["write"],
    commandClass: "modify",
  },
  edit: {
    fields: {
      path:  { type: "string", required: true },
      edits: { type: "array", required: true },
    },
    pathOperation: "write",
    effects: ["write"],
    commandClass: "modify",
  },
  find: {
    fields: {
      path:    { type: "string", required: false },
      pattern: { type: "string", required: false },
    },
    pathOperation: "search",
    effects: ["read", "search"],
    commandClass: "inspect",
  },
  grep: {
    fields: {
      path:    { type: "string", required: false },
      pattern: { type: "string", required: true },
      glob:    { type: "string", required: false },
    },
    pathOperation: "search",
    effects: ["read", "search"],
    commandClass: "inspect",
  },
  ls: {
    fields: {
      path: { type: "string", required: false },
    },
    pathOperation: "list",
    effects: ["read"],
    commandClass: "inspect",
  },
} as const;
