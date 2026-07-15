/**
 * bootstrap — Injects Karpathy principles + verification iron law at session start
 * and after every compaction. Soft enforcement (recommend, not demand).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BOOTSTRAP_MARKER = "pi-keel:core-principles";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

// ─── Bootstrap Content (loaded from file for easy editing) ───

const CORE_PRINCIPLES = readFileSync(resolve(EXTENSION_DIR, "principles.md"), "utf-8");

// ─── Bootstrap Injection Logic ───

let needsInjection = true;

export default function piSkillsBootstrap(pi: ExtensionAPI) {
  // On session start, mark for injection
  pi.on("session_start", async () => {
    needsInjection = true;
  });

  // After compaction, re-inject (the old bootstrap was trimmed out)
  pi.on("session_compact", async () => {
    needsInjection = true;
  });

  // Inject bootstrap into context before each turn
  pi.on("context", async (event) => {
    if (!needsInjection) return;

    // Don't inject if already present in the messages
    if (bootstrapAlreadyPresent(event.messages)) return;

    const bootstrapMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: CORE_PRINCIPLES }],
      timestamp: Date.now(),
    };

    // Insert after any compaction summaries but before real messages
    const insertAt = findInsertionPoint(event.messages);

    needsInjection = false;

    return {
      messages: [
        ...event.messages.slice(0, insertAt),
        bootstrapMessage,
        ...event.messages.slice(insertAt),
      ],
    };
  });
}

// ─── Helpers ───

function bootstrapAlreadyPresent(messages: unknown[]): boolean {
  for (const msg of messages) {
    const content = (msg as { content?: unknown }).content;
    if (typeof content === "string" && content.includes(BOOTSTRAP_MARKER)) {
      return true;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: string }).text === "string" &&
          (part as { text: string }).text.includes(BOOTSTRAP_MARKER)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function findInsertionPoint(messages: unknown[]): number {
  // Skip compaction summary entries at the start
  let i = 0;
  while (
    i < messages.length &&
    (messages[i] as { role?: string } | undefined)?.role === "compactionSummary"
  ) {
    i += 1;
  }
  return i;
}
