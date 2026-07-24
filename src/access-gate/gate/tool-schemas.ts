import type { Effect, CommandClass } from "../command-semantics/types";
import type { PathOperationKind } from "./access-request";

// Centralized tool schema definitions — single source of truth for Direct tool
// parameter validation.  Adding a new tool or parameter only requires a schema
// entry here; the compiler validates against these schemas automatically.

export interface FieldSchema {
  readonly type: "string" | "integer" | "array";
  readonly required: boolean;
  readonly min?: number;
  readonly items?: Record<string, string>;
}

export interface ToolSchema {
  readonly fields: Record<string, FieldSchema>;
  readonly pathOperation: PathOperationKind;
  readonly effects: readonly Effect[];
  readonly commandClass: CommandClass;
}

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  read: {
    fields: {
      path:   { type: "string", required: true },
      offset: { type: "integer", required: false, min: 0 },
      limit:  { type: "integer", required: false, min: 0 },
    },
    pathOperation: "read",
    effects: ["read"],
    commandClass: "readOnly",
  },
  write: {
    fields: {
      path:    { type: "string", required: true },
      content: { type: "string", required: true },
    },
    pathOperation: "write",
    effects: ["write"],
    commandClass: "mutating",
  },
  edit: {
    fields: {
      path:  { type: "string", required: true },
      edits: { type: "array", required: true, items: { oldText: "string", newText: "string" } },
    },
    pathOperation: "write",
    effects: ["write"],
    commandClass: "mutating",
  },
  find: {
    fields: {
      path:    { type: "string", required: false },
      pattern: { type: "string", required: false },
    },
    pathOperation: "search",
    effects: ["read", "search"],
    commandClass: "readOnly",
  },
  grep: {
    fields: {
      path:    { type: "string", required: false },
      pattern: { type: "string", required: true },
      glob:    { type: "string", required: false },
    },
    pathOperation: "search",
    effects: ["read", "search"],
    commandClass: "readOnly",
  },
  ls: {
    fields: {
      path: { type: "string", required: false },
    },
    pathOperation: "list",
    effects: ["read"],
    commandClass: "readOnly",
  },
} as const;
