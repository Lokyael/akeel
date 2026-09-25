import type { ShellWord } from "../language";
import { parseSegment, type OptionSpec, type SegmentContract } from "./segment-parser";
import { path, result } from "./shared";
import type { ProgramCwdChange, ProgramPath, ProgramPathBase, ProgramSemantic } from "./types";

export const BUILD_TOOLS = new Set([
  "cargo",
  "go",
  "make",
  "gmake",
  "mvn",
  "mvnw",
  "gradle",
  "gradlew",
  "java",
  "javac",
]);

function indeterminateBuildTool(): ProgramSemantic {
  // An unknown option may precede and hide a destructive target. It must not
  // degrade to policy-controlled opaque execution.
  return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
}

// ---------------------------------------------------------------------------
// Cargo
// ---------------------------------------------------------------------------

type CargoOptionKey = "help" | "version" | "path-source" | "path-target" | "flag" | "selector";

const CARGO_OPTIONS: readonly OptionSpec<CargoOptionKey>[] = Object.freeze([
  { key: "help", names: ["--help", "-h"], arity: "flag" },
  { key: "version", names: ["--version", "-V"], arity: "flag" },
  {
    key: "path-source",
    names: ["--manifest-path", "--path"],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "path-target",
    names: ["--target-dir"],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "flag",
    names: [
      "--release",
      "--frozen",
      "--locked",
      "--offline",
      "--verbose",
      "-v",
      "-q",
      "--quiet",
      "--all-targets",
      "--workspace",
      "--all",
    ],
    arity: "flag",
  },
  {
    key: "selector",
    names: ["-p", "--package", "--bin", "--example", "--test", "--bench", "--features"],
    arity: "required",
    forms: ["separate", "equals"],
  },
]);

const CARGO_CONTRACT: SegmentContract<CargoOptionKey> = Object.freeze({
  options: CARGO_OPTIONS,
});

const CARGO_INSPECT_SUBCOMMANDS = new Set([
  "metadata",
  "tree",
  "verify-project",
  "locate-project",
  "pkgid",
  "search",
  "help",
  "version",
]);

function analyzeCargo(args: readonly ShellWord[]): ProgramSemantic {
  const parsed = parseSegment(args, CARGO_CONTRACT, { stopAtFirstOperand: false, interspersed: true });
  if (parsed.kind === "malformed") {
    return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  }
  if (parsed.kind === "indeterminate" && !parsed.operands.some((operand) => operand.text === "clean")) {
    return indeterminateBuildTool();
  }

  const isUnknown = parsed.kind === "indeterminate";
  const paths: ProgramPath[] = [];
  let hasInfoFlag = false;

  for (const opt of parsed.options) {
    if (opt.key === "help" || opt.key === "version") {
      hasInfoFlag = true;
    } else if (opt.key === "path-source" && opt.kind === "valued") {
      paths.push(path(opt.value, "source"));
    } else if (opt.key === "path-target" && opt.kind === "valued") {
      paths.push(path(opt.value, "target"));
    }
  }

  let operands = parsed.operands;
  // Handle rustup/cargo toolchain prefix like cargo +nightly ...
  if (operands.length > 0 && operands[0]!.text.startsWith("+")) {
    operands = operands.slice(1);
  }

  if (operands.length === 0) {
    return result("inspect", hasInfoFlag ? [] : ["read"], paths, { opaque: isUnknown });
  }

  const subcommand = operands[0]!.text;
  if (subcommand === "clean") {
    return result("destroy", ["delete"], paths, { hardBoundary: true });
  }

  if (CARGO_INSPECT_SUBCOMMANDS.has(subcommand)) {
    return result("inspect", ["read"], paths, { opaque: isUnknown });
  }

  return result("execute", ["execute"], paths, { opaque: true });
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

type GoOptionKey = "help" | "version" | "cwd" | "path-target" | "flag" | "selector";

const GO_OPTIONS: readonly OptionSpec<GoOptionKey>[] = Object.freeze([
  { key: "help", names: ["--help", "-h"], arity: "flag" },
  { key: "version", names: ["--version"], arity: "flag" },
  {
    key: "cwd",
    names: ["-C"],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "path-target",
    names: ["-o"],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "flag",
    names: ["-v", "-x", "-n", "-race", "-cover", "-work", "-trimpath"],
    arity: "flag",
  },
  {
    key: "selector",
    names: ["-tags", "-ldflags", "-gcflags", "-asmflags", "-pkgdir", "-mod"],
    arity: "required",
    forms: ["separate", "equals"],
  },
]);

const GO_CONTRACT: SegmentContract<GoOptionKey> = Object.freeze({
  options: GO_OPTIONS,
});

const GO_INSPECT_SUBCOMMANDS = new Set(["version", "env", "list", "doc", "help"]);

function analyzeGo(args: readonly ShellWord[]): ProgramSemantic {
  const parsed = parseSegment(args, GO_CONTRACT, { stopAtFirstOperand: false, interspersed: true });
  if (parsed.kind === "malformed") {
    return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  }
  if (parsed.kind === "indeterminate" && !parsed.operands.some((operand) => operand.text === "clean")) {
    return indeterminateBuildTool();
  }

  const isUnknown = parsed.kind === "indeterminate";
  const paths: ProgramPath[] = [];
  const cwdChanges: ProgramCwdChange[] = [];
  let hasInfoFlag = false;

  for (const opt of parsed.options) {
    if (opt.key === "help" || opt.key === "version") {
      hasInfoFlag = true;
    } else if (opt.key === "cwd" && opt.kind === "valued") {
      const base: ProgramPathBase = cwdChanges.length > 0 ? "command-cwd" : "invocation-cwd";
      paths.push(path(opt.value, "source", opt.value.start, base));
      cwdChanges.push(Object.freeze({
        path: Object.freeze({ text: opt.value.text, role: "source" }),
        start: opt.value.start,
        base,
      }));
    } else if (opt.key === "path-target" && opt.kind === "valued") {
      paths.push(path(opt.value, "target"));
    }
  }

  // Extract explicit .go source files from operands
  for (const op of parsed.operands) {
    if (op.text.endsWith(".go")) {
      paths.push(path(op, "source"));
    }
  }

  const operands = parsed.operands;
  if (operands.length === 0) {
    return result("inspect", hasInfoFlag ? [] : ["read"], paths, { cwdChanges, opaque: isUnknown });
  }

  const subcommand = operands[0]!.text;
  if (subcommand === "clean") {
    return result("destroy", ["delete"], paths, { cwdChanges, hardBoundary: true });
  }

  if (GO_INSPECT_SUBCOMMANDS.has(subcommand)) {
    const isPureVersion = subcommand === "version" && operands.length === 1;
    return result("inspect", isPureVersion ? [] : ["read"], paths, { cwdChanges, opaque: isUnknown });
  }

  return result("execute", ["execute"], paths, { cwdChanges, opaque: true });
}

// ---------------------------------------------------------------------------
// Make & Gmake
// ---------------------------------------------------------------------------

type MakeOptionKey = "help" | "version" | "inspect-flag" | "cwd" | "path-source" | "flag";

const MAKE_OPTIONS: readonly OptionSpec<MakeOptionKey>[] = Object.freeze([
  { key: "help", names: ["--help", "-h"], arity: "flag" },
  { key: "version", names: ["--version", "-v"], arity: "flag" },
  {
    key: "inspect-flag",
    names: ["-p", "--print-data-base", "-q", "--question", "-n", "--dry-run", "--just-print", "--recon"],
    arity: "flag",
  },
  {
    key: "cwd",
    names: ["-C", "--directory"],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "path-source",
    names: ["-f", "--file", "--makefile"],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "flag",
    names: ["-k", "-s", "-j", "-B", "--always-make", "-i", "-r", "-d", "-e", "-w", "--print-directory"],
    arity: "flag",
  },
]);

const MAKE_CONTRACT: SegmentContract<MakeOptionKey> = Object.freeze({
  options: MAKE_OPTIONS,
});

const MAKE_DESTROY_TARGETS = new Set([
  "clean",
  "distclean",
  "mrproper",
  "clobber",
  "realclean",
  "clean-all",
  "cleandir",
]);

function isMakeDestroyTarget(target: string): boolean {
  if (MAKE_DESTROY_TARGETS.has(target)) return true;
  const lower = target.toLowerCase();
  return (
    lower === "clean" ||
    lower.startsWith("clean-") ||
    lower.startsWith("clean_") ||
    lower.startsWith("clean.") ||
    lower.endsWith("-clean") ||
    lower.endsWith("_clean") ||
    lower === "cleanall"
  );
}

function analyzeMake(args: readonly ShellWord[]): ProgramSemantic {
  const parsed = parseSegment(args, MAKE_CONTRACT, { stopAtFirstOperand: false, interspersed: true });
  if (parsed.kind === "malformed") {
    return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  }
  if (parsed.kind === "indeterminate" && !parsed.operands.some((operand) => isMakeDestroyTarget(operand.text))) {
    return indeterminateBuildTool();
  }

  const isUnknown = parsed.kind === "indeterminate";
  const paths: ProgramPath[] = [];
  const cwdChanges: ProgramCwdChange[] = [];
  let hasInspectFlag = false;
  let hasVersionOrHelp = false;

  for (const opt of parsed.options) {
    if (opt.key === "help" || opt.key === "version") {
      hasVersionOrHelp = true;
    } else if (opt.key === "inspect-flag") {
      hasInspectFlag = true;
    } else if (opt.key === "cwd" && opt.kind === "valued") {
      const base: ProgramPathBase = cwdChanges.length > 0 ? "command-cwd" : "invocation-cwd";
      paths.push(path(opt.value, "source", opt.value.start, base));
      cwdChanges.push(Object.freeze({
        path: Object.freeze({ text: opt.value.text, role: "source" }),
        start: opt.value.start,
        base,
      }));
    } else if (opt.key === "path-source" && opt.kind === "valued") {
      paths.push(path(opt.value, "source"));
    }
  }

  // Check operands (targets) with comprehensive destroy detection
  for (const op of parsed.operands) {
    if (isMakeDestroyTarget(op.text)) {
      return result("destroy", ["delete"], paths, { cwdChanges, hardBoundary: true });
    }
  }

  if (hasVersionOrHelp && parsed.operands.length === 0 && !hasInspectFlag) {
    return result("inspect", [], paths, { cwdChanges, opaque: isUnknown });
  }

  if (hasInspectFlag || (parsed.operands.length === 1 && parsed.operands[0]!.text === "help")) {
    return result("inspect", ["read"], paths, { cwdChanges, opaque: isUnknown });
  }

  return result("execute", ["execute"], paths, { cwdChanges, opaque: true });
}

// ---------------------------------------------------------------------------
// Maven (mvn, mvnw)
// ---------------------------------------------------------------------------

type MavenOptionKey = "help" | "version" | "path-source" | "flag" | "selector";

const MAVEN_OPTIONS: readonly OptionSpec<MavenOptionKey>[] = Object.freeze([
  { key: "help", names: ["--help", "-h"], arity: "flag" },
  { key: "version", names: ["--version", "-v", "-V"], arity: "flag" },
  {
    key: "path-source",
    names: ["-f", "--file", "-s", "--settings", "-t", "--toolchains"],
    arity: "required",
    forms: ["separate", "equals", "attached"],
  },
  {
    key: "flag",
    names: [
      "-B",
      "--batch-mode",
      "-q",
      "--quiet",
      "-e",
      "--errors",
      "-X",
      "--debug",
      "-U",
      "--update-snapshots",
      "-N",
      "--non-recursive",
      "-DskipTests",
      "-fae",
      "--fail-at-end",
      "-fn",
      "--fail-never",
    ],
    arity: "flag",
  },
  {
    key: "selector",
    names: ["-pl", "--projects", "-am", "--also-make", "-amd", "--also-make-dependents", "-P", "--activate-profiles"],
    arity: "required",
    forms: ["separate", "equals"],
  },
]);

const MAVEN_CONTRACT: SegmentContract<MavenOptionKey> = Object.freeze({
  options: MAVEN_OPTIONS,
  matchExtraOption: (token: ShellWord) => {
    if (token.text.startsWith("-D")) {
      return { key: "flag" as const, name: "-D" };
    }
    return undefined;
  },
});

const MAVEN_INSPECT_GOALS = new Set([
  "dependency:tree",
  "dependency:list",
  "dependency:analyze",
  "dependency:resolve",
  "dependency:sources",
  "help:effective-pom",
  "help:effective-settings",
  "help:describe",
  "help:system",
  "help:all-profiles",
  "help:active-profiles",
  "help",
]);

function isMavenCleanGoal(goal: string): boolean {
  return goal === "clean" || goal.startsWith("clean:") || goal.endsWith(":clean");
}

function analyzeMaven(args: readonly ShellWord[]): ProgramSemantic {
  const parsed = parseSegment(args, MAVEN_CONTRACT, { stopAtFirstOperand: false, interspersed: true });
  if (parsed.kind === "malformed") {
    return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  }
  if (parsed.kind === "indeterminate" && !parsed.operands.some((operand) => isMavenCleanGoal(operand.text))) {
    return indeterminateBuildTool();
  }

  const isUnknown = parsed.kind === "indeterminate";
  const paths: ProgramPath[] = [];
  let hasInfoFlag = false;

  for (const opt of parsed.options) {
    if (opt.key === "help" || opt.key === "version") {
      hasInfoFlag = true;
    } else if (opt.key === "path-source" && opt.kind === "valued") {
      paths.push(path(opt.value, "source"));
    }
  }

  // Check for clean in any operand (veto rule, including fully qualified plugin goals)
  for (const op of parsed.operands) {
    if (isMavenCleanGoal(op.text)) {
      return result("destroy", ["delete"], paths, { hardBoundary: true });
    }
  }

  if (parsed.operands.length === 0) {
    return result("inspect", hasInfoFlag ? [] : ["read"], paths, { opaque: isUnknown });
  }

  const allInspect = parsed.operands.every((op) => MAVEN_INSPECT_GOALS.has(op.text));
  if (allInspect) {
    return result("inspect", ["read"], paths, { opaque: isUnknown });
  }

  return result("execute", ["execute"], paths, { opaque: true });
}

// ---------------------------------------------------------------------------
// Gradle (gradle, gradlew)
// ---------------------------------------------------------------------------

type GradleOptionKey = "help" | "version" | "dry-run" | "path-source" | "flag" | "selector";

const GRADLE_OPTIONS: readonly OptionSpec<GradleOptionKey>[] = Object.freeze([
  { key: "help", names: ["--help", "-h"], arity: "flag" },
  { key: "version", names: ["--version", "-v"], arity: "flag" },
  { key: "dry-run", names: ["-m", "--dry-run"], arity: "flag" },
  {
    key: "path-source",
    names: [
      "-p",
      "--project-dir",
      "-b",
      "--build-file",
      "-c",
      "--settings-file",
      "-g",
      "--gradle-user-home",
      "--project-cache-dir",
      "-I",
      "--init-script",
    ],
    arity: "required",
    forms: ["separate", "equals"],
  },
  {
    key: "flag",
    names: [
      "--daemon",
      "--no-daemon",
      "-q",
      "--quiet",
      "-i",
      "--info",
      "-d",
      "--debug",
      "-s",
      "--stacktrace",
      "--offline",
      "--refresh-dependencies",
      "--parallel",
      "--continue",
      "--scan",
    ],
    arity: "flag",
  },
  {
    key: "selector",
    names: ["-x", "--exclude-task"],
    arity: "required",
    forms: ["separate", "equals"],
  },
]);

const GRADLE_CONTRACT: SegmentContract<GradleOptionKey> = Object.freeze({
  options: GRADLE_OPTIONS,
  matchExtraOption: (token: ShellWord) => {
    if (token.text.startsWith("-D") || token.text.startsWith("-P")) {
      return { key: "flag" as const, name: token.text.slice(0, 2) };
    }
    return undefined;
  },
});

const GRADLE_INSPECT_TASKS = new Set([
  "tasks",
  "projects",
  "dependencies",
  "dependencyInsight",
  "properties",
  "help",
  "components",
  "model",
  "outgoingVariants",
  "resolvableConfigurations",
]);

function isGradleCleanTask(task: string): boolean {
  const parts = task.split(":");
  const taskName = parts[parts.length - 1] ?? "";
  return taskName === "clean" || taskName.startsWith("clean");
}

function isGradleInspectTask(task: string): boolean {
  const parts = task.split(":");
  const taskName = parts[parts.length - 1] ?? "";
  return GRADLE_INSPECT_TASKS.has(taskName);
}

function analyzeGradle(args: readonly ShellWord[]): ProgramSemantic {
  const parsed = parseSegment(args, GRADLE_CONTRACT, { stopAtFirstOperand: false, interspersed: true });
  if (parsed.kind === "malformed") {
    return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  }
  if (parsed.kind === "indeterminate" && !parsed.operands.some((operand) => isGradleCleanTask(operand.text))) {
    return indeterminateBuildTool();
  }

  const isUnknown = parsed.kind === "indeterminate";
  const paths: ProgramPath[] = [];
  let hasVersionOrHelp = false;
  let hasDryRun = false;

  for (const opt of parsed.options) {
    if (opt.key === "help" || opt.key === "version") {
      hasVersionOrHelp = true;
    } else if (opt.key === "dry-run") {
      hasDryRun = true;
    } else if (opt.key === "path-source" && opt.kind === "valued") {
      paths.push(path(opt.value, "source"));
    }
  }

  // Check for clean tasks (veto rule, including subproject tasks like :app:clean)
  for (const op of parsed.operands) {
    if (isGradleCleanTask(op.text)) {
      return result("destroy", ["delete"], paths, { hardBoundary: true });
    }
  }

  if (hasDryRun) {
    return result("inspect", ["read"], paths, { opaque: isUnknown });
  }

  if (parsed.operands.length === 0) {
    return result("inspect", hasVersionOrHelp ? [] : ["read"], paths, { opaque: isUnknown });
  }

  const allInspect = parsed.operands.every((op) => isGradleInspectTask(op.text));
  if (allInspect) {
    return result("inspect", ["read"], paths, { opaque: isUnknown });
  }

  return result("execute", ["execute"], paths, { opaque: true });
}

// ---------------------------------------------------------------------------
// Java & Javac
// ---------------------------------------------------------------------------

function analyzeJava(args: readonly ShellWord[]): ProgramSemantic {
  let isInfo = false;
  const paths: ProgramPath[] = [];
  let i = 0;
  let jarFile: ShellWord | undefined;
  let mainClassOrSource: ShellWord | undefined;

  while (i < args.length) {
    const arg = args[i]!;
    if (
      arg.text === "-version" ||
      arg.text === "--version" ||
      arg.text === "-v" ||
      arg.text === "-help" ||
      arg.text === "--help" ||
      arg.text === "-h" ||
      arg.text === "-?"
    ) {
      isInfo = true;
      i += 1;
      continue;
    }
    if (arg.text === "-jar") {
      if (i + 1 < args.length) {
        jarFile = args[i + 1];
        i += 2;
        break; // remaining arguments are passed to the jar application
      }
      return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
    }
    if (
      arg.text === "-cp" ||
      arg.text === "-classpath" ||
      arg.text === "--class-path" ||
      arg.text === "-p" ||
      arg.text === "--module-path" ||
      arg.text === "-m" ||
      arg.text === "--module"
    ) {
      i += 2;
      continue;
    }
    if (
      arg.text.startsWith("-D") ||
      arg.text.startsWith("-X") ||
      arg.text.startsWith("-ea") ||
      arg.text.startsWith("-agentlib:") ||
      arg.text.startsWith("-agentpath:") ||
      arg.text.startsWith("-javaagent:")
    ) {
      i += 1;
      continue;
    }
    if (!arg.text.startsWith("-")) {
      mainClassOrSource = arg;
      i += 1;
      break;
    }
    i += 1;
  }

  if (isInfo && jarFile === undefined && mainClassOrSource === undefined) {
    return result("inspect", [], paths);
  }

  if (jarFile !== undefined) {
    paths.push(path(jarFile, "source"));
  } else if (mainClassOrSource !== undefined && mainClassOrSource.text.endsWith(".java")) {
    paths.push(path(mainClassOrSource, "source"));
  }

  return result("execute", ["execute"], paths, { opaque: true });
}

const JAVAC_TWO_ARG_OPTIONS = new Set([
  "-cp",
  "-classpath",
  "--class-path",
  "-sourcepath",
  "--source-path",
  "-encoding",
  "-source",
  "--source",
  "-target",
  "--target",
  "--release",
  "-bootclasspath",
  "-processorpath",
  "--processor-path",
  "-processor",
  "-s",
  "-h",
  "--module-path",
  "-p",
  "--upgrade-module-path",
]);

function analyzeJavac(args: readonly ShellWord[]): ProgramSemantic {
  let isInfo = false;
  const paths: ProgramPath[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i]!;
    if (
      arg.text === "-version" ||
      arg.text === "--version" ||
      arg.text === "-v" ||
      arg.text === "-help" ||
      arg.text === "--help" ||
      arg.text === "-h"
    ) {
      isInfo = true;
      i += 1;
      continue;
    }
    if (arg.text === "-d") {
      if (i + 1 < args.length) {
        paths.push(path(args[i + 1]!, "target"));
        i += 2;
        continue;
      }
      return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
    }
    if (JAVAC_TWO_ARG_OPTIONS.has(arg.text)) {
      i += 2;
      continue;
    }
    if (arg.text.startsWith("-")) {
      i += 1;
      continue;
    }
    // Check for @argfile syntax
    if (arg.text.startsWith("@") && arg.text.length > 1) {
      const fileText = arg.text.slice(1);
      const pathKind = fileText === "~" || fileText.startsWith("~/") ? "literal" : arg.pathKind;
      paths.push(path({ text: fileText, start: arg.start + 1, end: arg.end, quote: arg.quote, pathKind }, "source"));
      i += 1;
      continue;
    }
    paths.push(path(arg, "source"));
    i += 1;
  }

  if (isInfo && paths.length === 0) {
    return result("inspect", [], paths);
  }

  return result("execute", ["execute"], paths, { opaque: true });
}

// ---------------------------------------------------------------------------
// Unified Entrypoint
// ---------------------------------------------------------------------------

export function analyzeBuildToolProgram(name: string, args: readonly ShellWord[]): ProgramSemantic {
  switch (name) {
    case "cargo":
      return analyzeCargo(args);
    case "go":
      return analyzeGo(args);
    case "make":
    case "gmake":
      return analyzeMake(args);
    case "mvn":
    case "mvnw":
      return analyzeMaven(args);
    case "gradle":
    case "gradlew":
      return analyzeGradle(args);
    case "java":
      return analyzeJava(args);
    case "javac":
      return analyzeJavac(args);
    default:
      return result("unknown", ["execute"], [], { opaque: true, hardBoundary: true });
  }
}
