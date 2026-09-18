import type { ShellWord } from "../language";
import { parseSegment, type OptionSpec, type SegmentContract } from "./segment-parser";
import { path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

type UvOptionKey = "path" | "scalar" | "flag" | "help" | "version";

const UV_OPTIONS: readonly OptionSpec<UvOptionKey>[] = Object.freeze([
  // Help & Version
  { key: "help" as const, names: ["--help", "-h"], arity: "flag" as const },
  { key: "version" as const, names: ["--version", "-V", "-v"], arity: "flag" as const },

  // Other safe flags
  {
    key: "flag" as const,
    names: [
      "--no-project",
      "--no-config",
      "--isolated",
      "--offline",
      "--allow-insecure-host",
      "--verbose",
      "--quiet",
      "--color",
      "--native-tls",
      "--no-native-tls",
    ],
    arity: "flag" as const,
  },

  // Path options (source paths)
  {
    key: "path" as const,
    names: ["--directory", "--project", "--cache-dir", "--config-file", "-C"],
    arity: "required" as const,
    forms: ["separate" as const, "equals" as const, "attached" as const],
  },

  // Scalar / non-path options
  {
    key: "scalar" as const,
    names: ["--python", "-p"],
    arity: "required" as const,
    forms: ["separate" as const, "equals" as const, "attached" as const],
  },
]);

const UV_CONTRACT: SegmentContract<UvOptionKey> = Object.freeze({
  options: UV_OPTIONS,
});

export function analyzeUvProgram(args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 0) {
    return result("inspect", ["read"]);
  }

  const parsed = parseSegment(args, UV_CONTRACT);
  const isMalformed = parsed.kind === "malformed";
  const isUnknown = parsed.kind === "indeterminate";

  const options = parsed.kind === "complete" || parsed.kind === "indeterminate" ? parsed.options : [];
  const operands = parsed.kind === "complete" || parsed.kind === "indeterminate" ? parsed.operands : [];

  const hasHelp = options.some((opt) => opt.key === "help");
  const hasVersion = options.some((opt) => opt.key === "version");

  if (operands.length === 0 && (hasHelp || hasVersion)) {
    return result("inspect", ["read"]);
  }

  const first = operands[0]?.text ?? "";
  if (first === "run") {
    return result("execute", ["execute"], [], { opaque: true });
  }

  if (first === "help" || hasHelp) {
    const paths: ProgramPath[] = [];
    for (const opt of options) {
      if (opt.kind === "valued" && opt.key === "path") {
        paths.push(path(opt.value, "source"));
      }
    }
    return result("inspect", ["read"], paths, { opaque: isUnknown || isMalformed });
  }

  return result("unknown", [], [], { opaque: true });
}
