import type { ShellWord } from "../language";
import { parseSegment, type OptionSpec, type ParsedOption, type SegmentContract } from "./segment-parser";
import { path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

export const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "npx"]);

type PkgOptionKey = "path" | "selector" | "global" | "flag" | "help" | "version";

const PACKAGE_OPTIONS: readonly OptionSpec<PkgOptionKey>[] = Object.freeze([
  // Info & version flags
  { key: "help" as const, names: ["--help", "-h"], arity: "flag" as const },
  { key: "version" as const, names: ["--version", "-v"], arity: "flag" as const },

  // Global flag
  { key: "global" as const, names: ["--global", "-g"], arity: "flag" as const },

  // Other safe flags
  {
    key: "flag" as const,
    names: [
      "--workspaces",
      "--json",
      "--parseable",
      "--long",
      "--all",
      "--depth",
      "--include",
      "--omit",
      "--prod",
      "--production",
      "--dry-run",
      "--ignore-scripts",
      "--offline",
      "--frozen-lockfile",
      "--lockfile-only",
      "--no-fund",
      "--no-audit",
      "--silent",
      "--verbose",
    ],
    arity: "flag" as const,
  },

  // Real filesystem path options
  {
    key: "path" as const,
    names: ["--prefix", "--cache", "--userconfig", "--globalconfig", "--cwd", "--dir", "-C"],
    arity: "required" as const,
    forms: ["separate" as const, "equals" as const, "attached" as const],
  },

  // Selectors and non-path value options (e.g. package names, filters, registries)
  {
    key: "selector" as const,
    names: ["--workspace", "-w", "--filter", "-F", "--registry"],
    arity: "required" as const,
    forms: ["separate" as const, "equals" as const, "attached" as const],
  },
]);

const PACKAGE_CONTRACT: SegmentContract<PkgOptionKey> = Object.freeze({
  options: PACKAGE_OPTIONS,
});

const INSPECT_SUBCOMMANDS = new Set([
  "view",
  "info",
  "outdated",
  "ls",
  "list",
  "search",
  "audit",
  "whoami",
  "ping",
  "root",
  "help",
]);

const MODIFY_INIT_SUBCOMMANDS = new Set(["init", "version", "dedupe"]);
const MODIFY_CONFIG_SUBCOMMANDS = new Set(["config", "cache"]);

const EXECUTE_SUBCOMMANDS = new Set([
  "install",
  "ci",
  "update",
  "remove",
  "uninstall",
  "run",
  "start",
  "stop",
  "restart",
  "exec",
  "test",
  "build",
  "publish",
  "pack",
  "link",
  "unlink",
  "prune",
]);

function isPathReference(value: string): boolean {
  return (
    value.startsWith("/") ||
    value === "." ||
    value === ".." ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~")
  );
}

function extractPathOptions(
  options: readonly ParsedOption<PkgOptionKey>[],
  role: "source" | "target",
): ProgramPath[] {
  const paths: ProgramPath[] = [];
  for (const opt of options) {
    if (opt.kind === "valued") {
      if (opt.key === "path") {
        paths.push(path(opt.value, role));
      } else if (opt.key === "selector" && isPathReference(opt.value.text)) {
        paths.push(path(opt.value, role));
      }
    }
  }
  return paths;
}

export function analyzePackageManagerProgram(name: string, args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 0) {
    return result("inspect", ["read"]);
  }

  const parsed = parseSegment(args, PACKAGE_CONTRACT);
  const isMalformed = parsed.kind === "malformed";
  const isUnknown = parsed.kind === "indeterminate";

  const options = parsed.kind === "complete" || parsed.kind === "indeterminate" ? parsed.options : [];
  const operands = parsed.kind === "complete" || parsed.kind === "indeterminate" ? parsed.operands : [];

  const hasHelp = options.some((opt) => opt.key === "help");
  const hasVersion = options.some((opt) => opt.key === "version");
  const hasGlobal = options.some((opt) => opt.key === "global");

  if (operands.length === 0 && (hasHelp || hasVersion)) {
    return result("inspect", ["read"]);
  }

  if (name === "npx") {
    return result("execute", ["execute"], [], { opaque: true });
  }

  const first = operands[0]?.text ?? "";

  if (INSPECT_SUBCOMMANDS.has(first)) {
    return result("inspect", ["read"], extractPathOptions(options, "source"), {
      opaque: hasGlobal || isUnknown || isMalformed,
    });
  }

  if (MODIFY_INIT_SUBCOMMANDS.has(first)) {
    return result(
      "modify",
      ["read", "write"],
      [
        path({ text: ".", start: 0, end: 0, quote: "bare" }, "target", 0),
        ...extractPathOptions(options, "target"),
      ],
      { recursive: true, opaque: isUnknown || isMalformed },
    );
  }

  if (MODIFY_CONFIG_SUBCOMMANDS.has(first)) {
    return result("modify", ["read", "write"], extractPathOptions(options, "target"), { opaque: true });
  }

  if (EXECUTE_SUBCOMMANDS.has(first)) {
    return result("execute", ["execute"], extractPathOptions(options, "source"), { opaque: true });
  }

  return result("unknown", [], [], { opaque: true });
}
