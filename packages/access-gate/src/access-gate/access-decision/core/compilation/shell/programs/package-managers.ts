import type { ShellWord } from "../language";
import { hasUnknownOption } from "./option-scanner";
import { firstCommand, INFO_FLAGS, optionPaths, path, result } from "./shared";
import type { ProgramSemantic } from "./types";

export const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "npx"]);

const PACKAGE_VALUE_OPTIONS = new Set([
  "--prefix", "--registry", "--cache", "--userconfig", "--globalconfig", "--cwd", "--dir", "--filter",
  "--workspace", "-w", "-C", "-F",
]);
const PACKAGE_PATH_OPTIONS = new Set([
  "--prefix", "--cache", "--userconfig", "--globalconfig", "--cwd", "--dir", "--workspace", "-C",
]);
const PACKAGE_SAFE_OPTIONS = new Set([
  ...PACKAGE_VALUE_OPTIONS,
  "--global", "-g", "--workspaces", "--json", "--parseable", "--long", "--all", "--depth", "--include",
  "--omit", "--prod", "--production", "--dry-run", "--ignore-scripts", "--offline", "--frozen-lockfile",
  "--lockfile-only", "--no-fund", "--no-audit", "--silent", "--verbose", "--help", "-h", "--version", "-v",
]);

export function analyzePackageManagerProgram(name: string, args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 1 && INFO_FLAGS.has(args[0]!.text)) return result("inspect", ["read"]);
  const first = firstCommand(args, PACKAGE_VALUE_OPTIONS);
  if (name === "npx") return result("execute", ["execute"], [], { opaque: true });
  const globalScope = args.some((word) =>
    word.text === "-g" || word.text === "--global" || word.text.startsWith("--global=") || word.text.startsWith("-g="));
  const unknownOption = hasUnknownOption(args, PACKAGE_SAFE_OPTIONS, PACKAGE_VALUE_OPTIONS);
  if (["view", "info", "outdated", "ls", "list", "search", "audit", "whoami", "ping", "root", "help"].includes(first)) {
    return result("inspect", ["read"], optionPaths(args, PACKAGE_PATH_OPTIONS, "source"), {
      opaque: globalScope || unknownOption,
    });
  }
  if (["init", "version", "dedupe"].includes(first)) {
    return result("modify", ["read", "write"], [
      path({ text: ".", start: 0, end: 0, quote: "bare" }, "target", 0),
      ...optionPaths(args, PACKAGE_PATH_OPTIONS, "target"),
    ], { recursive: true, opaque: unknownOption });
  }
  if (["config", "cache"].includes(first)) {
    return result("modify", ["read", "write"], optionPaths(args, PACKAGE_PATH_OPTIONS, "target"), { opaque: true });
  }
  if ([
    "install", "ci", "update", "remove", "uninstall", "run", "start", "stop", "restart", "exec", "test",
    "build", "publish", "pack", "link", "unlink", "prune",
  ].includes(first)) {
    return result("execute", ["execute"], optionPaths(args, PACKAGE_PATH_OPTIONS, "source"), { opaque: true });
  }
  return result("unknown", [], [], { opaque: true });
}
