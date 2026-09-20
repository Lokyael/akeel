import type { ShellWord } from "../language";
import { parseSegment, type OptionSpec, type SegmentContract } from "./segment-parser";
import { path, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

const HERDR_OPTIONS: readonly OptionSpec<string>[] = Object.freeze([
  // Info & global flags
  { key: "help", names: ["--help", "-h"], arity: "flag" },
  { key: "version", names: ["--version", "-V", "-v"], arity: "flag" },
  { key: "handoff", names: ["--handoff"], arity: "flag" },
  { key: "defaultConfig", names: ["--default-config"], arity: "flag" },
  { key: "skill", names: ["--skill"], arity: "flag" },
  { key: "noFocus", names: ["--no-focus"], arity: "flag" },
  { key: "wait", names: ["--wait"], arity: "flag" },

  // Global & route value options
  { key: "session", names: ["--session"], arity: "required" },
  { key: "machine", names: ["--machine"], arity: "required" },
  { key: "remote", names: ["--remote"], arity: "required" },
  { key: "remoteKeybindings", names: ["--remote-keybindings"], arity: "required" },
  { key: "cwd", names: ["--cwd", "-C"], arity: "required", forms: ["separate", "equals", "attached"] },
  { key: "path", names: ["--path"], arity: "required" },
  { key: "pane", names: ["--pane"], arity: "required" },
  { key: "kind", names: ["--kind"], arity: "required" },
  { key: "timeout", names: ["--timeout"], arity: "required" },
  { key: "source", names: ["--source"], arity: "required" },
  { key: "lines", names: ["--lines"], arity: "required" },
  { key: "format", names: ["--format"], arity: "required" },
  { key: "branch", names: ["--branch"], arity: "required" },
  { key: "label", names: ["--label"], arity: "required" },
  { key: "workspace", names: ["--workspace"], arity: "required" },
  { key: "base", names: ["--base"], arity: "required" },
]);

const HERDR_CONTRACT: SegmentContract<string> = Object.freeze({
  options: HERDR_OPTIONS,
});

const INSPECT_ACTIONS = new Set(["list", "get", "read", "explain", "wait", "report-metadata"]);
const EXECUTE_ACTIONS = new Set(["start", "prompt", "send-keys", "attach"]);
const MODIFY_ACTIONS = new Set(["create", "open", "close", "remove", "rename", "focus"]);

export function analyzeHerdrProgram(args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 0) {
    return result("inspect", ["read"]);
  }

  const parsed = parseSegment(args, HERDR_CONTRACT);

  if (parsed.kind === "malformed") {
    return result("unknown", [], [], { opaque: true, hardBoundary: true });
  }

  if (parsed.kind === "indeterminate") {
    return result("unknown", [], [], { opaque: true });
  }

  // Check for top-level help or version flags
  if (parsed.options.some((opt) => opt.key === "help" || opt.key === "version")) {
    return result("inspect", ["read"]);
  }

  const positionals = parsed.operands;
  if (positionals.length === 0) {
    return result("inspect", ["read"]);
  }

  const subcommand = positionals[0]!.text;
  const action = positionals[1]?.text;

  if (subcommand === "status") {
    return result("inspect", ["read"]);
  }

  if (subcommand === "agent") {
    if (action === undefined || INSPECT_ACTIONS.has(action)) {
      return result("inspect", ["read"]);
    }
    if (EXECUTE_ACTIONS.has(action)) {
      return result("execute", ["execute"], [], { opaque: true });
    }
    if (MODIFY_ACTIONS.has(action)) {
      return result("modify", ["read", "write"]);
    }
    return result("unknown", [], [], { opaque: true });
  }

  if (subcommand === "workspace" || subcommand === "worktree") {
    if (action !== undefined && INSPECT_ACTIONS.has(action)) {
      return result("inspect", ["read"]);
    }
    if (action !== undefined && MODIFY_ACTIONS.has(action)) {
      const paths: ProgramPath[] = [];
      for (const opt of parsed.options) {
        if (opt.kind === "valued") {
          if (opt.key === "cwd") {
            paths.push(path(opt.value, "source"));
          } else if (opt.key === "path") {
            paths.push(path(opt.value, "target"));
          }
        }
      }
      return result("modify", ["read", "write"], paths, { opaque: paths.length === 0 });
    }
    return result("unknown", [], [], { opaque: true });
  }

  if (["pane", "tab", "session", "notification", "integration"].includes(subcommand)) {
    if (action !== undefined && INSPECT_ACTIONS.has(action)) {
      return result("inspect", ["read"]);
    }
    return result("modify", ["read", "write"], [], { opaque: true });
  }

  return result("unknown", [], [], { opaque: true });
}
