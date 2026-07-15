/**
 * bootstrap — Injects Karpathy principles + verification iron law at session start
 * and after every compaction. Soft enforcement (recommend, not demand).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BOOTSTRAP_MARKER = "pi-keel:core-principles";
const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(EXTENSION_DIR, "..");
const SKILLS_DIR = resolve(PACKAGE_ROOT, "skills");

// ─── Bootstrap Content (Karpathy Principles + Verification Iron Law) ───

const CORE_PRINCIPLES = `\
<PI_KEEL_PRINCIPLES>
${BOOTSTRAP_MARKER}

## Core Behavioral Principles

These principles are your DNA. They apply to EVERY interaction — before any
skill check, before any tool call, before any response.

### 1. Think Before Coding

*Don't assume. Don't hide confusion. Surface tradeoffs.*

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

*Minimum code that solves the problem. Nothing speculative.*

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

**Test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

*Touch only what you must. Clean up only your own mess.*

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**Test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

*Define success criteria. Loop until verified.*

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
\`\`\`
1. [Step] → verify: [check]
2. [Step] → verify: [check]
\`\`\`

### 5. Verify Before Claiming

*Evidence before assertions, always.*

BEFORE claiming any status:
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim

Never use "should", "probably", "seems to". Run the command. Read the output.
Then claim the result.

### 6. Keep Docs in Sync

*Every code change must include its doc counterpart.*

After every significant code change, ask: which project documentation is now stale?
Scan actual doc files in the project (README, USAGE, ADR, CONTEXT, AGENTS,
pages/, docs/ — whatever exists). Fix stale info immediately.
Prefer removing hardcoded counts over letting them rot.
Include doc changes in the same commit as code changes.

**Test:** Would a new team member be misled by the docs? If yes, fix them.

---

## Skill Usage Rule

When a skill matches your task, use it. Skills capture battle-tested discipline
that prevents common failure modes. Read the matching SKILL.md with the read
tool, then follow the skill's process.

Available skills are listed in <available_skills>. If you're unsure which skill
applies, try /skill:survey-context first — it will orient you.

User instructions take precedence over skills, which override default behavior.
</PI_KEEL_PRINCIPLES>`;

// ─── Bootstrap Injection Logic ───

interface BootstrapState {
  needsInjection: boolean;
  injectedInTurn: number;
  currentTurn: number;
}

const state: BootstrapState = {
  needsInjection: true,
  injectedInTurn: -1,
  currentTurn: 0,
};

export default function piSkillsBootstrap(pi: ExtensionAPI) {
  // On session start, mark for injection
  pi.on("session_start", async () => {
    state.needsInjection = true;
    state.currentTurn = 0;
    state.injectedInTurn = -1;
  });

  // After compaction, re-inject (the old bootstrap was trimmed out)
  pi.on("session_compact", async () => {
    state.needsInjection = true;
  });

  // After each agent turn ends, increment turn counter
  pi.on("agent_end", async () => {
    state.currentTurn += 1;
    // Reset injection flag — it gets re-set by session_compact if needed
    if (state.injectedInTurn >= 0) {
      state.needsInjection = false;
    }
  });

  // Inject bootstrap into context before each turn
  pi.on("context", async (event) => {
    if (!state.needsInjection) return;

    // Don't inject if already present in the messages
    if (bootstrapAlreadyPresent(event.messages)) return;

    const bootstrapMessage = {
      role: "user" as const,
      content: [{ type: "text" as const, text: CORE_PRINCIPLES }],
      timestamp: Date.now(),
    };

    // Insert after any compaction summaries but before real messages
    const insertAt = findInsertionPoint(event.messages);

    state.injectedInTurn = state.currentTurn;

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
