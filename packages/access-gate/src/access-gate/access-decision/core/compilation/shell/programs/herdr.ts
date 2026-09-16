import type { ShellWord } from "../language";
import { optionPaths, result } from "./shared";
import type { ProgramPath, ProgramSemantic } from "./types";

const HERDR_VALUE_OPTIONS = new Set([
  "--cwd",
  "--path",
  "--session",
  "--remote",
  "--remote-keybindings",
  "--pane",
  "--kind",
  "--timeout",
  "--source",
  "--lines",
  "--format",
  "--branch",
  "--label",
  "--workspace",
  "--base",
  "-C",
]);

const INSPECT_ACTIONS = new Set(["list", "get", "read", "explain", "wait", "report-metadata"]);
const EXECUTE_ACTIONS = new Set(["start", "prompt", "send-keys", "attach"]);
const MODIFY_ACTIONS = new Set(["create", "open", "close", "remove", "rename", "focus"]);

function extractPositionals(args: readonly ShellWord[]): ShellWord[] {
  const positionals: ShellWord[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]!;
    if (word.text === "--") {
      for (let rest = index + 1; rest < args.length; rest += 1) {
        positionals.push(args[rest]!);
      }
      break;
    }
    if (word.text.startsWith("-")) {
      if (!word.text.includes("=") && HERDR_VALUE_OPTIONS.has(word.text) &&
        index + 1 < args.length && !args[index + 1]!.text.startsWith("-")) {
        index += 1;
      }
      continue;
    }
    positionals.push(word);
  }
  return positionals;
}

export function analyzeHerdrProgram(args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 0 || args.some((word) => ["--help", "-h", "--version", "-V", "-v"].includes(word.text))) {
    return result("inspect", ["read"]);
  }

  const positionals = extractPositionals(args);
  if (positionals.length === 0) {
    return result("inspect", ["read"]);
  }

  const subcommand = positionals[0]!.text;
  const action = positionals[1]?.text;

  if (subcommand === "status") {
    return result("inspect", ["read"]);
  }

  if (subcommand === "agent") {
    if (action === undefined) {
      return result("inspect", ["read"]);
    }
    if (INSPECT_ACTIONS.has(action)) {
      return result("inspect", ["read"]);
    }
    if (action !== undefined && EXECUTE_ACTIONS.has(action)) {
      return result("execute", ["execute"], [], { opaque: true });
    }
    if (action !== undefined && MODIFY_ACTIONS.has(action)) {
      return result("modify", ["read", "write"]);
    }
    return result("unknown", [], [], { opaque: true });
  }

  if (subcommand === "workspace" || subcommand === "worktree") {
    if (action !== undefined && INSPECT_ACTIONS.has(action)) {
      return result("inspect", ["read"]);
    }
    if (action !== undefined && MODIFY_ACTIONS.has(action)) {
      const paths: ProgramPath[] = [
        ...optionPaths(args, new Set(["--cwd", "-C"]), "source"),
        ...optionPaths(args, new Set(["--path"]), "target"),
      ];
      return result("modify", ["read", "write"], paths);
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
