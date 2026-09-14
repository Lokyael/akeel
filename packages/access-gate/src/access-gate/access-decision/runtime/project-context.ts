export type ProjectContext = Readonly<{
  readonly cwd: string;
  readonly projectRoot: string;
  readonly stagingRoot: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function invalidContext(): TypeError {
  return new TypeError("invalid project context");
}

export function createProjectContext(input: unknown): ProjectContext {
  if (!isRecord(input) || !hasExactKeys(input, ["cwd", "projectRoot", "stagingRoot"])) throw invalidContext();
  if (!isAbsolutePath(input.cwd) || !isAbsolutePath(input.projectRoot) || !isAbsolutePath(input.stagingRoot)) {
    throw invalidContext();
  }
  return Object.freeze({
    cwd: input.cwd,
    projectRoot: input.projectRoot,
    stagingRoot: input.stagingRoot,
  });
}
