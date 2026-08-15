import { scanThreats } from "../../security";
import { reject } from "./builder";
import type { CompilationReject } from "./access-request-types";
import type { ShellCommandNode, ShellProgram } from "../../shell-parse";
import { canonicalExecutableName } from "../../command-semantics";
import { HARD_RULE_INTERPRETERS } from "../../command-semantics";

// ── hard command rules（结构级） ──
// 无条件拦截形态，不因 Profile 或用户批准放行（F1）：
//   - download → pipe → interpreter（curl/wget 下载并管道进解释器）
//   - download → && → execute（下载后执行）
//   - eval 远程内容
// 匹配基于 parse 后的命令结构（executable/args/操作符），而非原始文本：
//   - 引号拆分（s'h'、pyth'on3、ev'al）在 lexer 词义层即解码归一，不再逃逸；
//   - 注释与字符串字面量不产生执行结构，不再误报。
// 解释器名单与 interpreter adapter 同源（interpreters.ts）：
// 语言运行时自动进入硬规则集，tsx 由此被拦截（curl | tsx）。
// 新形态直接添加检查函数到 PREFLIGHT_CHECKS。

const DOWNLOADERS = new Set(["curl", "wget"]);

/** 归一化 executable 为解释器名（basename + 版本/别名映射）；非解释器返回 null。
 * executable 的 value 已是 lexer 解码后的词值——引号拆分（s'h' → sh）在词义层
 * 即归一，不再需要 shellWord 二次规范化（词义单点，D-037 后）。
 * undefined 来自可选链（node.executable?.value）。 */
function interpreterName(raw: string | undefined): string | null {
  if (!raw) return null;
  const base = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
  const canonical = canonicalExecutableName(base);
  return HARD_RULE_INTERPRETERS.has(canonical) ? canonical : null;
}

function commandName(node: ShellCommandNode): string | null {
  return node.executable?.value?.toLowerCase() ?? null;
}

function isDownloader(node: ShellCommandNode): boolean {
  const name = commandName(node);
  return name !== null && DOWNLOADERS.has(name);
}

/** curl 至少携带一个非选项参数（URL）；wget 需显式 -O - 输出到 stdout。 */
function downloadPipesStdout(node: ShellCommandNode): boolean {
  if (node.args.length === 0) return false;
  const name = commandName(node);
  if (name === "curl") return true;
  // wget -O - / -O- 分离或附着形式；其它 -O FILE 落到文件不进入管道
  return node.args.some((arg, i) => {
    const v = arg.value;
    return (v === "-O" && i + 1 < node.args.length && (node.args[i + 1]!.value ?? "") === "-")
      || (v.startsWith("-O") && v.endsWith("-") && v.length > 2);
  });
}

/** 下载命令带输出到文件（curl -o / wget -O）的任意非空目标。 */
function downloadWritesFile(node: ShellCommandNode): boolean {
  const flag = commandName(node) === "curl" ? "-o" : "-O";
  const long = commandName(node) === "curl" ? "--output" : "--output-document";
  return node.args.some((arg, i) => {
    const v = arg.value;
    if (v === flag) {
      const next = i + 1 < node.args.length ? node.args[i + 1]!.value ?? "" : "";
      return next !== "" && next !== "-";
    }
    // 附着形式 -oFILE（-o- 是 stdout，不视为写文件）；长选项 --output=FILE
    if (!v.startsWith("--") && v.startsWith(flag) && v.length > flag.length && !v.endsWith("-")) return true;
    if (v.startsWith(`${long}=`) && v.length > long.length + 1) return true;
    return false;
  });
}

/** 后续节点是否直接执行解释器（含 sudo sh、./x 形式）。 */
function executesInterpreter(node: ShellCommandNode): boolean {
  if (interpreterName(node.executable?.value)) return true;
  const name = commandName(node);
  if (name === "sudo") {
    const first = node.args[0]?.value ?? "";
    return interpreterName(first) !== null || first.startsWith("./");
  }
  return (node.executable?.value ?? "").startsWith("./");
}

function pipeToInterpreter(program: ShellProgram): string | null {
  const commands = program.commands;
  for (let i = 0; i + 1 < commands.length; i++) {
    const current = commands[i]!;
    if (!isDownloader(current) || !downloadPipesStdout(current)) continue;
    // 下载器 stdout 必须直接进入管道（紧邻 |），与 raw-text 模式 curl\s+\S+\s*\| 一致
    if (commands[i + 1]!.operatorBefore !== "|") continue;
    // 管道进入后，后续任意解释器节点都拦截（含 tee 落地 + sh 执行的间接形态；
    // 中间节点不稀释形态检查——原 \|.*(?:sh|...) 语义）
    if (commands.slice(i + 1).some(executesInterpreter)) {
      return commandName(current) === "wget" ? "wget-pipe-interpreter" : "curl-pipe-interpreter";
    }
  }
  return null;
}

function downloadThenExecute(program: ShellProgram): string | null {
  const commands = program.commands;
  for (let i = 0; i + 1 < commands.length; i++) {
    const current = commands[i]!;
    const next = commands[i + 1]!;
    if (next.operatorBefore !== "&&") continue;
    if (!isDownloader(current) || !downloadWritesFile(current)) continue;
    if (executesInterpreter(next)) {
      return commandName(current) === "wget" ? "wget-download-exec" : "curl-download-exec";
    }
  }
  return null;
}

function evalRemoteContent(program: ShellProgram): string | null {
  for (const node of program.commands) {
    if (commandName(node) !== "eval") continue;
    // 命令替换形态（$() 或反引号）内含下载器才算远程内容执行；
    // 纯本地字符串（eval 'echo curl'）不拦，与原 \beval\s+"\?\$\?\( 语义一致
    if (node.args.some((arg) =>
      /\$\([^)]*\b(?:curl|wget)\b|`[^`]*\b(?:curl|wget)\b/i.test(arg.value))) {
      return "eval-remote-content";
    }
  }
  return null;
}

// ── preflight orchestrator ──
// Stateless checks that run after parse, before dynamic/opaque rejection.
// Each check returns a string id on match, or null.
// Add new checks to PREFLIGHT_CHECKS — the compiler pipeline picks them up automatically.

interface PreflightCheck {
  name: string;
  check: (program: ShellProgram) => string | null;
  code: "threat" | "hard-command-rule";
}

const PREFLIGHT_CHECKS: readonly PreflightCheck[] = [
  { name: "threat", check: threatScan, code: "threat" },
  { name: "curl-pipe", check: pipeToInterpreter, code: "hard-command-rule" },
  { name: "download-exec", check: downloadThenExecute, code: "hard-command-rule" },
  { name: "eval-remote", check: evalRemoteContent, code: "hard-command-rule" },
];

/**
 * token 级威胁文本：所有命令节点的参数值拼接。
 * 注释已被 lexer 丢弃；heredoc 内容在 redirection 检查阶段被拒，不在此展开。
 */
function threatScan(program: ShellProgram): string | null {
  const text = program.commands
    .flatMap((node) => [
      ...node.envAssignments,
      ...node.wrapper,
      ...node.wrapperPositionals,
      node.executable,
      ...node.args,
    ])
    .flatMap((arg) => (arg ? [arg.value] : []))
    .join(" ");
  return scanThreats(text);
}

export function runPreflight(program: ShellProgram): CompilationReject | null {
  for (const check of PREFLIGHT_CHECKS) {
    const result = check.check(program);
    if (result) return reject(check.code, result);
  }
  return null;
}
