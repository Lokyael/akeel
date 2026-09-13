import type { ShellWord } from "../language";
import { hasUnknownOption } from "./option-scanner";
import { firstCommand, INFO_FLAGS, optionPaths, result } from "./shared";
import type { ProgramSemantic } from "./types";

export function analyzeUvProgram(args: readonly ShellWord[]): ProgramSemantic {
  if (args.length === 1 && INFO_FLAGS.has(args[0]!.text)) return result("inspect", ["read"]);
  const valueOptions = new Set(["--directory", "--project", "--cache-dir", "--config-file", "--python", "-C"]);
  const knownOptions = new Set([
    ...valueOptions, "--no-project", "--no-config", "--isolated", "--offline", "--allow-insecure-host", "--verbose",
    "--quiet", "--color", "--native-tls", "--no-native-tls", "--help", "-h", "--version", "-V",
  ]);
  const unknownOption = hasUnknownOption(args, knownOptions, valueOptions);
  const first = firstCommand(args, valueOptions);
  if (first === "run") return result("execute", ["execute"], [], { opaque: true });
  if (first === "help" || first === "--help") {
    return result("inspect", ["read"], optionPaths(args, valueOptions, "source"), { opaque: unknownOption });
  }
  return result("unknown", [], [], { opaque: true });
}
