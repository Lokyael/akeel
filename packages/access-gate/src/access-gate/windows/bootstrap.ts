import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
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
const ACCESS_GATE_ENTRY_PATH = fileURLToPath(new URL("../index.ts", import.meta.url));

export const WINDOWS_DIRECT_SURFACES = Object.freeze(["read", "write", "edit", "grep", "find", "ls"] as const);

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

export const WINDOWS_RUNTIME_PREFIX = [
  "$ErrorActionPreference = 'Stop'",
  "if ([Environment]::ProcessPath -ne $env:AKEEL_VERIFIED_PWSH) { throw 'PowerShell executable identity changed' }",
  "if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -ne 7 -or $PSVersionTable.PSVersion.Minor -lt 4) { throw 'Unsupported PowerShell runtime' }",
  "if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'Unsupported PowerShell language mode' }",
  "$utf8NoBom = [System.Text.UTF8Encoding]::new($false)",
  "$PSNativeCommandArgumentPassing = 'Standard'",
  "[Console]::InputEncoding = $utf8NoBom",
  "[Console]::OutputEncoding = $utf8NoBom",
  "$OutputEncoding = $utf8NoBom",
  "$PSDefaultParameterValues['*:Encoding'] = 'utf8NoBOM'",
  "if ($PSNativeCommandArgumentPassing -ne 'Standard' -or $OutputEncoding.CodePage -ne 65001 -or [Console]::InputEncoding.CodePage -ne 65001 -or [Console]::OutputEncoding.CodePage -ne 65001 -or $utf8NoBom.GetPreamble().Length -ne 0 -or $PSDefaultParameterValues['*:Encoding'] -ne 'utf8NoBOM') { throw 'Unsupported PowerShell runtime configuration' }",
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
  readonly ownerEntryPath?: string;
  readonly onInitializationError?: (message: string) => void;
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
  cwd = workspaceIdentity,
  lifecycleGeneration = 1,
): PowerShellExecutionTicket {
  return issuePowerShellExecutionTicket({
    toolCallId,
    command,
    cwd,
    workspaceIdentity,
    lifecycleGeneration,
  });
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
  lifecycleGenerationForTool: () => number,
): ToolDefinition<typeof windowsPowerShellParameters, WindowsPowerShellToolDetails> {
  return {
    name: "powershell",
    label: "powershell",
    description: "Execute PowerShell commands through the native Windows AKeel executor.",
    promptSnippet: "Execute PowerShell commands",
    promptGuidelines: ["The Windows profile accepts only commands with an AKeel execution ticket."],
    parameters: windowsPowerShellParameters,
    execute: async (toolCallId, params, signal, onUpdate, _context) => {
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
        lifecycleGeneration: lifecycleGenerationForTool(),
        timeoutMs: input.timeout,
        signal,
        onData: (chunk) => onUpdate?.({ content: [{ type: "text", text: chunk }], details: { exitCode: null, truncated: false } }),
      });
      return toPowerShellToolResult(result);
    },
  };
}

type WindowsToolSourceInfo = Readonly<{
  readonly path: string;
  readonly source: string;
  readonly scope: "user" | "project" | "temporary";
  readonly origin: "package" | "top-level";
  readonly baseDir?: string;
}>;

type WindowsToolMetadata = Readonly<{
  readonly name: string;
  readonly sourceInfo?: WindowsToolSourceInfo;
}>;

export function isOwnedWindowsPowerShellTool(
  tool: WindowsToolMetadata,
  ownerEntryPath = ACCESS_GATE_ENTRY_PATH,
): boolean {
  if (tool.name !== "powershell" || tool.sourceInfo === undefined ||
    !isSourceText(tool.sourceInfo.path) || !isSourceText(tool.sourceInfo.source) ||
    !["user", "project", "temporary"].includes(tool.sourceInfo.scope) ||
    !["package", "top-level"].includes(tool.sourceInfo.origin) ||
    !isSourceText(tool.sourceInfo.baseDir)) return false;
  const expected = normalizeToolSourcePath(ownerEntryPath);
  const base = normalizeToolSourcePath(tool.sourceInfo.baseDir);
  return normalizeToolSourcePath(tool.sourceInfo.path) === expected &&
    (expected === base || expected.startsWith(`${base.replace(/\/$/u, "")}/`));
}

function isSourceText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\u0000");
}

function normalizeToolSourcePath(value: string): string {
  if (/^[A-Za-z]:[\\/]/u.test(value)) return win32.normalize(value).replace(/\\/gu, "/").toLowerCase();
  return resolve(value);
}

export function installWindowsBootstrap(pi: ExtensionAPI, options: WindowsBootstrapOptions = {}): void {
  let executor: PowerShellExecutor | undefined;
  let initialized = false;
  let initializing: Promise<void> | undefined;
  let lifecycleGeneration = 0;
  const tickets = new Map<string, PowerShellExecutionTicket>();

  pi.registerTool(createWindowsPowerShellTool(
    () => executor,
    (toolCallId) => tickets.get(toolCallId),
    () => lifecycleGeneration,
  ));

  const initialize = async (): Promise<void> => {
    if (initializing !== undefined) return initializing;
    const generation = lifecycleGeneration;
    const work = (async () => {
      try {
        const candidateExecutable = await (options.resolvePowerShell ?? (() => discoverVerifiedPowerShell()))();
        if (generation !== lifecycleGeneration) return;
        const candidateExecutor = options.executor ?? createPowerShellExecutor(candidateExecutable, WINDOWS_RUNTIME_PREFIX);
        const tools = pi.getAllTools();
        const powershell = tools.find((tool) => tool.name === "powershell");
        const directToolsValid = WINDOWS_DIRECT_SURFACES.every((name) => {
          const tool = tools.find((candidate) => candidate.name === name);
          return tool?.sourceInfo.source === "builtin" && tool.sourceInfo.path === `<builtin:${name}>`;
        });
        if (!powershell || !isOwnedWindowsPowerShellTool(powershell, options.ownerEntryPath) || !directToolsValid) {
          throw new Error("Windows tool ownership or Direct tool source verification failed");
        }

        const expectedActiveTools = [...WINDOWS_DIRECT_SURFACES, "powershell"] as string[];
        pi.setActiveTools(expectedActiveTools);
        const finalActiveTools = new Set(pi.getActiveTools());
        if (finalActiveTools.size !== expectedActiveTools.length || expectedActiveTools.some((name) => !finalActiveTools.has(name))) {
          throw new Error("Windows active tool set verification failed");
        }
        if (generation !== lifecycleGeneration) return;
        executor = candidateExecutor;
        initialized = true;
      } catch (error) {
        if (generation !== lifecycleGeneration) return;
        executor = undefined;
        initialized = false;
        const message = error instanceof Error && error.message.length > 0
          ? error.message
          : "Windows bootstrap initialization failed";
        if (options.onInitializationError) options.onInitializationError(message);
        else console.error(`AKeel Windows bootstrap initialization failed: ${message}`);
      }
    })();
    let tracked: Promise<void>;
    tracked = work.finally(() => {
      if (initializing === tracked) initializing = undefined;
    });
    initializing = tracked;
    return tracked;
  };

  pi.on("session_start", () => {
    lifecycleGeneration++;
    // Invalidate the previous session before discovery starts. This matters
    // when Pi loads/reloads a session without delivering shutdown first: an
    // old executor or ticket must never remain usable during the new session.
    initializing = undefined;
    tickets.clear();
    executor = undefined;
    initialized = false;
    pi.setActiveTools([]);
    return initialize();
  });
  pi.on("session_shutdown", () => {
    lifecycleGeneration++;
    initializing = undefined;
    tickets.clear();
    executor = undefined;
    initialized = false;
  });
  pi.on("tool_call", (_event: ToolCallEvent): ToolCallEventResult => {
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
