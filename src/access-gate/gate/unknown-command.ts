import type { GateResult, GateRuntime } from "./types";

function clean(value: string): string {
  return value.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

export async function askOnce(runtime: GateRuntime, title: string, detail: string): Promise<GateResult> {
  if (!runtime.hasUI || !runtime.select) {
    return { kind: "block", reason: "approval required but no interactive UI is available" };
  }
  const choice = await runtime.select(`${title}\n\n${clean(detail)}\n\nAllow this operation once?`, ["Allow once", "Deny"]);
  return choice === "Allow once"
    ? { kind: "allow" }
    : { kind: "block", reason: "user denied the operation" };
}

export function decisionBlock(reason: string): GateResult {
  return { kind: "block", reason };
}
