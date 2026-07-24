import type { DecisionCode, Guidance, GuidanceId } from "./decision-types";

const GUIDANCE_CATALOG: Readonly<Partial<Record<DecisionCode, readonly Guidance[]>>> = {
  "dynamic-shell": [{ id: "batch-inspection-tools", safety: "recheck" }],
  "opaque-command": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "unsafe-syntax": [{ id: "split-supported-commands", safety: "recheck" }],
  "shell-policy-denied": [{ id: "profile-restriction", safety: "recheck" }],
  "path-denied": [{ id: "profile-restriction", safety: "recheck" }],
  "unknown-tool": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "invalid-tool-input": [{ id: "literal-command-or-direct-tool", safety: "recheck" }],
  "resource-limit": [{ id: "split-supported-commands", safety: "recheck" }],
};

export function guidanceFor(code: DecisionCode): readonly Guidance[] {
  return GUIDANCE_CATALOG[code] ?? [];
}

const GUIDANCE_TEXT: Readonly<Record<GuidanceId, string>> = {
  "batch-inspection-tools": "Use Direct read/grep/find/ls instead of Shell for batch inspection",
  "literal-command-or-direct-tool": "Use a supported command or a Direct tool (read, grep, find, ls)",
  "split-supported-commands": "Split the command into supported operations or use Direct tools",
  "profile-restriction": "This operation is not allowed by the active Profile",
};

export function guidanceText(id: GuidanceId): string {
  return GUIDANCE_TEXT[id] ?? id;
}
