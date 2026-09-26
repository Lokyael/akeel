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
  readonly workspaceIdentity: string;
  readonly command: string;
}> & { consumed: boolean };

type IssueInput = Readonly<{
  readonly toolCallId: string;
  readonly command: string;
  readonly workspaceIdentity: string;
}>;

type ConsumeInput = Readonly<{
  readonly toolCallId: string;
  readonly command: string;
  readonly cwd: string;
}>;

export function issuePowerShellExecutionTicket(input: IssueInput): PowerShellExecutionTicket {
  if (!isNonEmptyText(input.toolCallId) || !isNonEmptyText(input.command) || !isNonEmptyText(input.workspaceIdentity)) {
    throw new TypeError("PowerShell execution ticket fields must be non-empty");
  }
  const ticket = Object.freeze({}) as PowerShellExecutionTicket;
  ticketRecords.set(ticket, {
    toolCallId: input.toolCallId,
    commandDigest: commandDigest(input.command),
    workspaceIdentity: input.workspaceIdentity,
    command: input.command,
    consumed: false,
  });
  return ticket;
}

export function consumePowerShellExecutionTicket(
  ticket: PowerShellExecutionTicket,
  input: ConsumeInput,
): Readonly<{ readonly toolCallId: string; readonly command: string }> | undefined {
  if (!isRecord(ticket) || !isNonEmptyText(input.toolCallId) || !isNonEmptyText(input.command) || !isNonEmptyText(input.cwd)) return undefined;
  const record = ticketRecords.get(ticket);
  if (record === undefined || record.consumed) return undefined;
  if (record.toolCallId !== input.toolCallId || record.commandDigest !== commandDigest(input.command) || record.workspaceIdentity !== input.cwd) return undefined;
  record.consumed = true;
  return Object.freeze({ toolCallId: record.toolCallId, command: record.command });
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\u0000");
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}