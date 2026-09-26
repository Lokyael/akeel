import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { win32 } from "node:path";
import { promisify } from "node:util";
import type {
  ExtensionAPI,
  ToolCallEvent,
  ToolCallEventResult,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  createPowerShellExecutor,
  type PowerShellExecutor,
  type PowerShellProcessResult,
} from "./executor";
import { issuePowerShellExecutionTicket, type PowerShellExecutionTicket } from "./ticket";

const execFileAsync = promisify(execFile);

export const WINDOWS_DIRECT_SURFACES = Object.freeze(["read", "write", "edit", "grep", "find", "ls"] as const);
const WINDOWS_BLOCKED_SURFACES = new Set<string>(["bash", ...WINDOWS_DIRECT_SURFACES]);

export const WINDOWS_BOOTSTRAP_BLOCK_REASON =
  "Blocked because the native Windows profile is still initializing; ordinary PowerShell execution is unavailable.";
export const WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON =
  "Blocked because the native Windows profile is not initialized.";

const HANDSHAKE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$PSNativeCommandArgumentPassing = 'Standard'",
  "[pscustomobject]@{",
  "  edition = [string]$PSVersionTable.PSEdition",
  "  major = [int]$PSVersionTable.PSVersion.Major",
  "  minor = [int]$PSVersionTable.PSVersion.Minor",
  "  languageMode = [string]$ExecutionContext.SessionState.LanguageMode",
  "  processPath = [string][Environment]::ProcessPath",
  "  argumentPassing = [string]$PSNativeCommandArgumentPassing",
  "} | ConvertTo-Json -Compress",
].join("; ");

const RUNTIME_PREFIX = [
  "$ErrorActionPreference = 'Stop'",
  "if ([Environment]::ProcessPath -ne $env:AKEEL_VERIFIED_PWSH) { throw 'PowerShell executable identity changed' }",
  "if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -ne 7 -or $PSVersionTable.PSVersion.Minor -lt 4) { throw 'Unsupported PowerShell runtime' }",
  "if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'Unsupported PowerShell language mode' }",
  "$PSNativeCommandArgumentPassing = 'Standard'",
  "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)",
  "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
  "if ($PSNativeCommandArgumentPassing -ne 'Standard' -or [Console]::OutputEncoding.CodePage -ne 65001) { throw 'Unsupported PowerShell runtime configuration' }",
].join("; ");

const MAX_HANDSHAKE_OUTPUT_BYTES = 16 * 1024;
export type PowerShellHandshake = Readonly<{
  readonly edition: "Core";
  readonly major: 7;
  readonly minor: number;
  readonly languageMode: "FullLanguage";
  readonly processPath: string;
  readonly argumentPassing: "Standard";
}>;

export type VerifiedPowerShellExecutable = Readonly<{
  readonly path: string;
  readonly identity: string;
  readonly version: Readonly<{ readonly major: 7; readonly minor: number }>;
  readonly languageMode: "FullLanguage";
  readonly argumentPassing: "Standard";
}>;

export type PowerShellProbe = (executable: string) => Promise<PowerShellHandshake>;
export type PowerShellPathExists = (path: string) => Promise<boolean>;

export type ResolvePowerShellOptions = Readonly<{
  readonly pathEnv?: string;
  readonly pathExists?: PowerShellPathExists;
  readonly probe?: PowerShellProbe;
}>;

export type WindowsBootstrapOptions = Readonly<{
  readonly resolvePowerShell?: () => Promise<VerifiedPowerShellExecutable>;
  readonly executor?: PowerShellExecutor;
  readonly ownerPathPattern?: RegExp;
}>;

export type WindowsBootstrapState = Readonly<{
  readonly initialized: boolean;
  readonly executable?: VerifiedPowerShellExecutable;
}>;

export function normalizeWindowsExecutablePath(value: string): string {
  return win32.normalize(value).replace(/\\/gu, "/").toLowerCase();
}

export function isSupportedPowerShellHandshake(value: unknown): value is PowerShellHandshake {
  if (!isRecord(value)) return false;
  return value.edition === "Core" && value.major === 7 &&
    typeof value.minor === "number" && Number.isInteger(value.minor) && value.minor >= 4 &&
    value.languageMode === "FullLanguage" && value.argumentPassing === "Standard" &&
    typeof value.processPath === "string" && value.processPath.length > 0 && !value.processPath.includes("\u0000");
}

export function freezeVerifiedPowerShellExecutable(
  launcher: string,
  handshake: PowerShellHandshake,
): VerifiedPowerShellExecutable {
  if (!isSupportedPowerShellHandshake(handshake)) throw new TypeError("unsupported PowerShell handshake");
  if (!isPwshExecutablePath(launcher) || !isPwshExecutablePath(handshake.processPath)) {
    throw new TypeError("PowerShell executable identity is not a fully-qualified pwsh.exe");
  }
  // The PATH entry may be a package-manager shim (for example Scoop). The
  // PowerShell process reports the final executable identity; freeze that path
  // and never spawn the mutable shim after the handshake.
  const reported = normalizeWindowsExecutablePath(handshake.processPath);
  return Object.freeze({
    path: handshake.processPath,
    identity: `${reported}|Core|7.${handshake.minor}|FullLanguage|Standard`,
    version: Object.freeze({ major: 7 as const, minor: handshake.minor }),
    languageMode: "FullLanguage" as const,
    argumentPassing: "Standard" as const,
  });
}

export async function resolvePowerShellExecutable(options: ResolvePowerShellOptions = {}): Promise<string> {
  const pathEnv = options.pathEnv ?? process.env.PATH ?? process.env.Path ?? "";
  const pathExists = options.pathExists ?? defaultPathExists;
  const candidates = pathEnv.split(";")
    .filter((entry) => entry.length > 0)
    .map((entry) => win32.join(entry, "pwsh.exe"));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("PowerShell Core executable pwsh.exe was not found on PATH");
}

export async function discoverVerifiedPowerShell(
  options: ResolvePowerShellOptions = {},
): Promise<VerifiedPowerShellExecutable> {
  const executable = await resolvePowerShellExecutable(options);
  const probe = options.probe ?? probePowerShellCore;
  const handshake = await probe(executable);
  return freezeVerifiedPowerShellExecutable(executable, handshake);
}

export function issueTracerExecutionTicket(
  toolCallId: string,
  command: string,
  workspaceIdentity: string,
): PowerShellExecutionTicket {
  return issuePowerShellExecutionTicket({ toolCallId, command, workspaceIdentity });
}

type WindowsPowerShellToolDetails = Readonly<{
  readonly exitCode: number | null;
  readonly truncated: boolean;
  readonly blocked?: boolean;
}>;

const windowsPowerShellParameters = Type.Object({
  command: Type.String(),
  timeout: Type.Optional(Type.Number()),
});

type WindowsPowerShellInput = { readonly command: string; readonly timeout?: number };

export function createWindowsPowerShellTool(
  executorForTool: () => PowerShellExecutor | undefined,
  ticketForCall: (toolCallId: string) => PowerShellExecutionTicket | undefined,
): ToolDefinition<typeof windowsPowerShellParameters, WindowsPowerShellToolDetails> {
  return {
    name: "powershell",
    label: "powershell",
    description: "Execute PowerShell commands through the native Windows AKeel executor.",
    promptSnippet: "Execute PowerShell commands",
    promptGuidelines: ["The Windows profile accepts only commands with an AKeel execution ticket."],
    parameters: windowsPowerShellParameters,
    execute: async (toolCallId, params, signal, onUpdate, context) => {
      const executor = executorForTool();
      const ticket = ticketForCall(toolCallId);
      if (!executor || !ticket) {
        return {
          content: [{ type: "text", text: WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON }],
          details: { exitCode: null, truncated: false, blocked: true },
        };
      }
      const input = params as WindowsPowerShellInput;
      const result = await executor.execute(ticket, {
        toolCallId,
        command: input.command,
        cwd: context.cwd,
        timeoutMs: input.timeout,
        signal,
        onData: (chunk) => onUpdate?.({ content: [{ type: "text", text: chunk }], details: { exitCode: null, truncated: false } }),
      });
      return toPowerShellToolResult(result);
    },
  };
}

export function isOwnedWindowsPowerShellTool(
  tool: Readonly<{ readonly name: string; readonly sourceInfo?: Readonly<{ readonly path: string; readonly source: string }> }>,
  ownerPathPattern = /(?:^|[/\\])(?:access-gate|akeel-access-gate)(?:[/\\]|$)/iu,
): boolean {
  return tool.name === "powershell" && tool.sourceInfo !== undefined &&
    (tool.sourceInfo.source === "local" || tool.sourceInfo.source === "package") &&
    ownerPathPattern.test(tool.sourceInfo.path);
}

export function installWindowsBootstrap(pi: ExtensionAPI, options: WindowsBootstrapOptions = {}): void {
  let executable: VerifiedPowerShellExecutable | undefined;
  let executor: PowerShellExecutor | undefined;
  let initialized = false;
  let initializing: Promise<void> | undefined;
  const tickets = new Map<string, PowerShellExecutionTicket>();

  pi.registerTool(createWindowsPowerShellTool(() => executor, (toolCallId) => tickets.get(toolCallId)));

  const initialize = async (): Promise<void> => {
    if (initializing !== undefined) return initializing;
    initializing = (async () => {
      try {
        executable = await (options.resolvePowerShell ?? (() => discoverVerifiedPowerShell()))();
        executor = options.executor ?? createPowerShellExecutor(executable, RUNTIME_PREFIX);
        const tools = pi.getAllTools();
        const powershell = tools.find((tool) => tool.name === "powershell");
        const directToolsValid = WINDOWS_DIRECT_SURFACES.every((name) => {
          const tool = tools.find((candidate) => candidate.name === name);
          return tool?.sourceInfo.source === "builtin";
        });
        if (!powershell || !isOwnedWindowsPowerShellTool(powershell, options.ownerPathPattern) || !directToolsValid) {
          throw new Error("Windows tool ownership or Direct tool source verification failed");
        }
        const active = pi.getActiveTools().filter((name) => name !== "bash");
        pi.setActiveTools([...new Set([...active, ...WINDOWS_DIRECT_SURFACES, "powershell"])]);
        initialized = true;
      } catch {
        executable = undefined;
        executor = undefined;
        initialized = false;
      }
    })().finally(() => {
      initializing = undefined;
    });
    return initializing;
  };

  pi.on("session_start", () => initialize());
  pi.on("session_shutdown", () => {
    tickets.clear();
    executor = undefined;
    executable = undefined;
    initialized = false;
  });
  pi.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | undefined => {
    if (!WINDOWS_BLOCKED_SURFACES.has(event.toolName) && event.toolName !== "powershell") return undefined;
    if (!initialized) return { block: true, reason: WINDOWS_BOOTSTRAP_UNAVAILABLE_REASON };
    return { block: true, reason: WINDOWS_BOOTSTRAP_BLOCK_REASON };
  });

}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function probePowerShellCore(executable: string): Promise<PowerShellHandshake> {
  const result = await execFileAsync(executable, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    HANDSHAKE_SCRIPT,
  ], { windowsHide: true, maxBuffer: MAX_HANDSHAKE_OUTPUT_BYTES, timeout: 15_000, encoding: "utf8" });
  const parsed: unknown = JSON.parse(result.stdout.trim());
  if (!isSupportedPowerShellHandshake(parsed)) throw new Error("PowerShell Core handshake was not supported");
  return parsed;
}

function toPowerShellToolResult(result: PowerShellProcessResult): {
  content: { type: "text"; text: string }[];
  details: WindowsPowerShellToolDetails;
} {
  return {
    content: [{ type: "text", text: result.output }],
    details: { exitCode: result.exitCode, truncated: result.truncated },
  };
}

function isPwshExecutablePath(value: string): boolean {
  return win32.isAbsolute(value) && !value.startsWith("\\\\") && win32.basename(value).toLowerCase() === "pwsh.exe";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
