import { createHash } from "node:crypto";

const ticketRecords = new WeakMap<object, TicketRecord>();

export function commandDigest(command: string): string {
  return createHash("sha256").update(command, "utf8").digest("hex");
}

export type PowerShellExecutionTicket = object & {
  readonly __akeelPowerShellExecutionTicket: unique symbol;
};

type TicketRecord = Readonly<{
  readonly toolCallId: string;
  readonly commandDigest: string;
  readonly command: string;
  readonly cwd: string;
  readonly workspaceIdentity: string;
  readonly lifecycleGeneration: number;
}> & { consumed: boolean };

type IssueInput = Readonly<{
  readonly toolCallId: string;
  readonly command: string;
  readonly cwd: string;
  readonly workspaceIdentity: string;
  readonly lifecycleGeneration: number;
}>;

type ConsumeInput = Readonly<{
  readonly toolCallId: string;
  readonly command: string;
  readonly lifecycleGeneration: number;
}>;

export function issuePowerShellExecutionTicket(input: IssueInput): PowerShellExecutionTicket {
  if (!isNonEmptyText(input.toolCallId) || !isNonEmptyText(input.command) || !isNonEmptyText(input.cwd) ||
    !isNonEmptyText(input.workspaceIdentity) || !isLifecycleGeneration(input.lifecycleGeneration)) {
    throw new TypeError("PowerShell execution ticket fields must be valid");
  }
  const ticket = Object.freeze({}) as PowerShellExecutionTicket;
  ticketRecords.set(ticket, {
    toolCallId: input.toolCallId,
    commandDigest: commandDigest(input.command),
    command: input.command,
    cwd: input.cwd,
    workspaceIdentity: input.workspaceIdentity,
    lifecycleGeneration: input.lifecycleGeneration,
    consumed: false,
  });
  return ticket;
}

export function consumePowerShellExecutionTicket(
  ticket: PowerShellExecutionTicket,
  input: ConsumeInput,
): Readonly<{
  readonly toolCallId: string;
  readonly command: string;
  readonly cwd: string;
  readonly workspaceIdentity: string;
}> | undefined {
  if (!isRecord(ticket) || !isNonEmptyText(input.toolCallId) || !isNonEmptyText(input.command) ||
    !isLifecycleGeneration(input.lifecycleGeneration)) return undefined;
  const record = ticketRecords.get(ticket);
  if (record === undefined || record.consumed) return undefined;
  record.consumed = true;
  if (record.toolCallId !== input.toolCallId || record.commandDigest !== commandDigest(input.command) ||
    record.lifecycleGeneration !== input.lifecycleGeneration) return undefined;
  return Object.freeze({
    toolCallId: record.toolCallId,
    command: record.command,
    cwd: record.cwd,
    workspaceIdentity: record.workspaceIdentity,
  });
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\u0000");
}

function isLifecycleGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
