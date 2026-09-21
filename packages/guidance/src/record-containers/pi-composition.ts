/**
 * pi-composition.ts — Extension tool registration for Project Record container validation
 *
 * Registers `akeel_validate_records` tool:
 * A pure, deterministic Direct tool allowing the agent to verify Project Record
 * containers (docs/candidates.md, docs/task.md, docs/decisions.md), including
 * slot placement and Candidate/Task field hygiene, without Shell overhead or
 * Access Gate interpreter delegation boundaries.
 */

import { resolve } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { validateRecordContainers } from "./validator.js";

export const VALIDATE_RECORDS_TOOL = "akeel_validate_records";

const VALIDATE_PARAMETERS = Type.Object({
  projectRoot: Type.Optional(Type.String({
    description: "Optional relative or absolute project root directory. Defaults to the workspace cwd.",
  })),
}, { additionalProperties: false });

export function installRecordContainerValidator(pi: ExtensionAPI): void {
  pi.registerTool({
    name: VALIDATE_RECORDS_TOOL,
    label: "AKeel Validate Records",
    description: "Validate Project Record containers (docs/candidates.md, docs/task.md, docs/decisions.md) for slot placement, unique slot invariant, prefix matching, and Candidate/Task field hygiene.",
    parameters: VALIDATE_PARAMETERS,
    executionMode: "sequential",
    constrainedSampling: { type: "json_schema", strict: "prefer" },
    async execute(_toolCallId, rawParams, _signal, _onUpdate, context: ExtensionContext) {
      const params = (rawParams ?? {}) as { projectRoot?: string };
      const root = params.projectRoot ? resolve(context.cwd, params.projectRoot) : context.cwd;
      const result = validateRecordContainers(root);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { result },
      };
    },
  });
}

export default function defaultRecordContainerValidator(pi: ExtensionAPI): void {
  installRecordContainerValidator(pi);
}
