/**
 * validator.ts — Pure record container slot verification
 *
 * Checks Project Record containers (docs/candidates.md, docs/task.md, docs/decisions.md):
 *   1. Exactly one slot heading matching `## X-0NN: 待创建`
 *   2. Slot heading must be the last non-empty line (no content after slot)
 *   3. Slot prefix letter matches the container (C->candidates, T->task, D->decisions)
 *
 * Missing optional containers are skipped safely without error.
 * Pure verification only; no auto-mutation.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ContainerPrefix = "C" | "T" | "D";

export interface ContainerSpec {
  readonly file: string;
  readonly prefix: ContainerPrefix;
}

export const STANDARD_CONTAINERS: readonly ContainerSpec[] = Object.freeze([
  { file: "docs/candidates.md", prefix: "C" },
  { file: "docs/task.md", prefix: "T" },
  { file: "docs/decisions.md", prefix: "D" },
]);

export const RECORD_SLOT_RE = /^## ([CTD])-0\d{2,}: 待创建$/;

export const TASK_KINDS = Object.freeze(new Set([
  "feature",
  "bug",
  "refactor",
  "investigation",
  "maintenance",
]));

export const TASK_STATUSES = Object.freeze(new Set([
  "draft",
  "in-progress",
  "verified",
]));

export const TASK_REVERSAL_SURFACES = Object.freeze(new Set([
  "user-boundary",
  "engineering",
]));

interface MarkdownFence {
  marker: "`" | "~";
  length: number;
}

function openingFence(line: string): MarkdownFence | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1]![0] === "`" && match[2]!.includes("`"))) return undefined;
  return { marker: match[1]![0] as MarkdownFence["marker"], length: match[1]!.length };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const content = line.replace(/^ {0,3}/, "");
  let markerLength = 0;
  while (content[markerLength] === fence.marker) markerLength++;
  return markerLength >= fence.length && /^[ \t]*$/.test(content.slice(markerLength));
}

function structuralLines(content: string): string[] {
  let fence: MarkdownFence | undefined;
  return content.split(/\r?\n/).map((line) => {
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      return "";
    }
    const opening = openingFence(line);
    if (!opening) return line;
    fence = opening;
    return "";
  });
}

const TASK_HEADING_RE = /^## (T-\d{2,}): (.+)$/;
const METADATA_BULLET_RE = /^-\s+(?:\*\*)?([^*\n:]+?)(?::\*\*|:)\s*(.*)$/;
const LEGACY_METADATA_BULLET_RE = /^-\s+\*\*([^*\n:]+):\*\*\s*(.*)$/;
const TASK_FIELD_LINE_RE = /^(?:\*\*)?(Kind|Status|Reversal surface)(?::\*\*|:)\s*(.*)$/;
const CANDIDATE_FIELD_LINE_RE = /^(?:\*\*)?(Why Not Now|Revisit condition|Status)(?::\*\*|:)\s*(.*)$/;

/**
 * Validates the metadata structure and canonical terms of active Task records.
 * Cleaned/empty task containers (only slot placeholder) pass cleanly.
 */
export function checkTaskHygiene(content: string, file = "docs/task.md"): ContainerCheckResult {
  const errors: string[] = [];
  const lines = structuralLines(content);

  let inTask = false;
  let currentTaskId = "";
  let inMetadata = false;
  const seenFields = new Set<string>();

  function finishCurrentTask(): void {
    if (!inTask) return;
    for (const required of ["Kind", "Status", "Reversal surface"] as const) {
      if (!seenFields.has(required)) {
        errors.push(`${file}: ${currentTaskId}: missing required Task field: ${required}`);
      }
    }
    inTask = false;
    inMetadata = false;
    currentTaskId = "";
    seenFields.clear();
  }

  function checkMetadataCompleteness(): void {
    for (const required of ["Kind", "Status", "Reversal surface"] as const) {
      if (!seenFields.has(required)) {
        errors.push(`${file}: ${currentTaskId}: missing required Task field: ${required}`);
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^## /.test(line)) {
      if (RECORD_SLOT_RE.test(line)) {
        finishCurrentTask();
        continue;
      }
      const match = TASK_HEADING_RE.exec(line);
      if (!match) {
        errors.push(`${file}:${i + 1}: malformed Task heading: ${line}`);
        continue;
      }
      finishCurrentTask();
      inTask = true;
      currentTaskId = match[1]!;
      inMetadata = true;
      continue;
    }

    if (!inTask) continue;

    if (/^### /.test(line)) {
      if (inMetadata) {
        checkMetadataCompleteness();
        inMetadata = false;
      }
      continue;
    }

    if (inMetadata) {
      const trimmed = line.trim();
      const bulletMatch = METADATA_BULLET_RE.exec(trimmed);
      if (bulletMatch) {
        const field = bulletMatch[1]!.trim();
        const value = bulletMatch[2]!.trim();
        const isLegacyMetadata = LEGACY_METADATA_BULLET_RE.test(trimmed);

        if (seenFields.has(field)) {
          errors.push(`${file}:${i + 1}: duplicate Task field: ${field}`);
          continue;
        }
        if (field !== "Kind" && field !== "Status" && field !== "Reversal surface") {
          if (isLegacyMetadata) {
            errors.push(`${file}:${i + 1}: unrecognized Task metadata field: ${field}`);
          } else {
            inMetadata = false;
          }
          continue;
        }
        seenFields.add(field);

        if (field === "Kind") {
          if (!TASK_KINDS.has(value)) {
            errors.push(
              `${file}:${i + 1}: invalid Task Kind '${value}' (expected: ${[...TASK_KINDS].join(" | ")})`,
            );
          }
          continue;
        }

        if (field === "Status") {
          if (!TASK_STATUSES.has(value)) {
            errors.push(
              `${file}:${i + 1}: invalid Task Status '${value}' (expected: ${[...TASK_STATUSES].join(" | ")})`,
            );
          }
          continue;
        }

        if (field === "Reversal surface") {
          if (!TASK_REVERSAL_SURFACES.has(value)) {
            errors.push(
              `${file}:${i + 1}: invalid Task Reversal surface '${value}' (expected: ${[...TASK_REVERSAL_SURFACES].join(" | ")})`,
            );
          }
          continue;
        }

        errors.push(`${file}:${i + 1}: unrecognized Task metadata field: ${field}`);
        continue;
      }

      const malformed = TASK_FIELD_LINE_RE.exec(trimmed);
      if (malformed) {
        const field = malformed[1]!;
        seenFields.add(field);
        errors.push(
          `${file}:${i + 1}: expected Task metadata format '- ${field}: <value>' (Markdown emphasis is optional)`,
        );
      } else if (trimmed.length > 0) {
        inMetadata = false;
      }
    }
  }

  finishCurrentTask();

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

const CANDIDATE_HEADING_RE = /^## (C-\d{2,}): (.+)$/;

/**
 * Validates candidate records in docs/candidates.md.
 * Candidate records are parked by definition while present; they must NOT carry Status metadata.
 * Promoted or dismissed candidates must be removed in the same change per principles.md and D-028.
 */
export function checkCandidateHygiene(content: string, file = "docs/candidates.md"): ContainerCheckResult {
  const errors: string[] = [];
  const lines = structuralLines(content);

  let inCandidate = false;
  let currentCandidateId = "";
  const seenFields = new Set<string>();

  function finishCurrentCandidate(): void {
    if (!inCandidate) return;
    for (const required of ["Why Not Now", "Revisit condition"] as const) {
      if (!seenFields.has(required)) {
        errors.push(`${file}: ${currentCandidateId}: missing required Candidate field: ${required}`);
      }
    }
    inCandidate = false;
    currentCandidateId = "";
    seenFields.clear();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^## /.test(line)) {
      if (RECORD_SLOT_RE.test(line)) {
        finishCurrentCandidate();
        continue;
      }
      const match = CANDIDATE_HEADING_RE.exec(line);
      if (match) {
        finishCurrentCandidate();
        inCandidate = true;
        currentCandidateId = match[1]!;
        continue;
      }
      finishCurrentCandidate();
      continue;
    }

    if (!inCandidate) continue;

    const trimmed = line.trim();
    const bulletMatch = METADATA_BULLET_RE.exec(trimmed);
    if (bulletMatch) {
      const field = bulletMatch[1]!.trim();
      const value = bulletMatch[2]!.trim();
      if (field.toLowerCase() === "status") {
        errors.push(
          `${file}:${i + 1}: ${currentCandidateId}: Candidate records must not contain Status metadata (candidates are parked while present; promoted or dismissed candidates must be removed in the same change per principles.md and D-028)`,
        );
        continue;
      }
      if (field === "Why Not Now" || field === "Revisit condition") {
        if (seenFields.has(field)) {
          errors.push(`${file}:${i + 1}: duplicate Candidate field: ${field}`);
        } else {
          seenFields.add(field);
        }
        if (value.length === 0) {
          errors.push(`${file}:${i + 1}: Candidate field must not be empty: ${field}`);
        }
      }
      continue;
    }

    const malformed = CANDIDATE_FIELD_LINE_RE.exec(trimmed);
    if (malformed) {
      const field = malformed[1]!;
      seenFields.add(field);
      if (field === "Status") {
        errors.push(
          `${file}:${i + 1}: ${currentCandidateId}: Candidate records must not contain Status metadata`,
        );
      } else {
        errors.push(
          `${file}:${i + 1}: expected Candidate field format '- ${field}: <value>' (Markdown emphasis is optional)`,
        );
      }
    }
  }

  finishCurrentCandidate();

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

export interface ContainerCheckResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface ProjectCheckResult {
  readonly ok: boolean;
  readonly checked: readonly string[];
  readonly errors: readonly string[];
}

export interface ValidateOptions {
  readonly containers?: readonly ContainerSpec[];
  readonly readFn?: (relativeFilePath: string) => string | null;
}

/**
 * Validates the raw text content of a single container file.
 */
export function checkContainerContent(
  file: string,
  content: string,
  expectedPrefix: string,
): ContainerCheckResult {
  const errors: string[] = [];
  const nonEmpty = content
    .split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter((x) => x.line.trim().length > 0);

  const slots = nonEmpty.filter((x) => RECORD_SLOT_RE.test(x.line));
  const last = nonEmpty[nonEmpty.length - 1];

  if (slots.length !== 1) {
    errors.push(`${file}: expected exactly one slot heading (## X-0NN: 待创建), found ${slots.length}`);
  } else {
    const slot = slots[0]!;
    const prefix = RECORD_SLOT_RE.exec(slot.line)![1]!;
    if (prefix !== expectedPrefix) {
      errors.push(`${file}: slot prefix ${prefix} does not match container (expected ${expectedPrefix})`);
    }
    if (slot.index !== last!.index) {
      errors.push(
        `${file}: slot heading is not the last non-empty line (line ${slot.index + 1}; last non-empty is line ${last!.index + 1})`,
      );
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

/**
 * Validates all standard Project Record containers present in a project.
 * Missing optional containers are skipped safely.
 */
export function validateRecordContainers(
  projectRoot: string,
  options: ValidateOptions = {},
): ProjectCheckResult {
  const containers = options.containers ?? STANDARD_CONTAINERS;
  const readFn =
    options.readFn ??
    ((relPath: string): string | null => {
      try {
        const fullPath = resolve(projectRoot, relPath);
        return readFileSync(fullPath, "utf-8");
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "ENOENT"
        ) {
          return null;
        }
        throw err;
      }
    });

  const checked: string[] = [];
  const allErrors: string[] = [];

  for (const { file, prefix } of containers) {
    const content = readFn(file);
    if (content === null) {
      continue;
    }
    checked.push(file);
    const result = checkContainerContent(file, content, prefix);
    if (!result.ok) {
      allErrors.push(...result.errors);
    }
    if (prefix === "C") {
      const candidateHygiene = checkCandidateHygiene(content, file);
      if (!candidateHygiene.ok) {
        allErrors.push(...candidateHygiene.errors);
      }
    }
    if (prefix === "T") {
      const taskHygiene = checkTaskHygiene(content, file);
      if (!taskHygiene.ok) {
        allErrors.push(...taskHygiene.errors);
      }
    }
  }

  return Object.freeze({
    ok: allErrors.length === 0,
    checked: Object.freeze(checked),
    errors: Object.freeze(allErrors),
  });
}
