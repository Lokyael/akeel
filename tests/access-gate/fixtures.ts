export type GitDiffCommandOptions = Readonly<{
  readonly flags?: readonly string[];
  readonly revision?: string;
  readonly paths?: readonly string[];
}>;

export function gitDiffCommand({
  flags = ["--find-renames", "--find-copies"],
  revision = "HEAD",
  paths = ["src/old.ts", "src/new.ts"],
}: GitDiffCommandOptions = {}): string {
  return ["git", "diff", ...flags, revision, "--", ...paths].join(" ");
}
