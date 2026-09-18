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
  }

  return Object.freeze({
    ok: allErrors.length === 0,
    checked: Object.freeze(checked),
    errors: Object.freeze(allErrors),
  });
}
