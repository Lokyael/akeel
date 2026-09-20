/**
 * bootstrap — Injects core behavioral principles into the system prompt.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

// ─── Bootstrap Content (loaded from file for easy editing) ───

const CORE_PRINCIPLES = readFileSync(resolve(EXTENSION_DIR, "principles.md"), "utf-8").trim();

// ─── Bootstrap Injection Logic ───

export default function akeelBootstrap(pi: ExtensionAPI): () => void {
  return pi.on("before_agent_start", (event) => {
    if (event.systemPromptOptions && typeof event.systemPromptOptions === "object") {
      const existing = typeof event.systemPromptOptions.sections === "object" && event.systemPromptOptions.sections !== null
        ? event.systemPromptOptions.sections
        : {};
      event.systemPromptOptions.sections = {
        ...existing,
        akeel_principles: CORE_PRINCIPLES,
      };
    }
  });
}
