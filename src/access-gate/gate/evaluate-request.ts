import { decidePath, resolvePath } from "../path";
import type { ResolvedProfile } from "../profile/types";
import { isCompleteAccessRequest, type CommandAccessOperation, type CompleteAccessRequest, type PathAccessOperation } from "./access-request";
import { pathDecisionCode } from "./decision-code";
import type { GateRuntime } from "./types";
import type { GateDecision, GateEvidence, HardDenyCode } from "./decision-types";
import type { Effect } from "../command-semantics/types";

const EFFECT_POLICY_AXIS: Readonly<Record<Effect, "path" | "shell">> = {
  read: "path",
  search: "path",
  write: "path",
  delete: "path",
  permissionChange: "path",
  cwdChange: "path",
  execute: "shell",
  network: "shell",
};

export async function evaluateRequest(
  request: CompleteAccessRequest,
  profile: ResolvedProfile,
  _runtime: GateRuntime,
): Promise<GateDecision> {
  if (!isCompleteAccessRequest(request)) {
    return hardDeny("invalid-tool-input", [{ kind: "tool", subject: "request is not a compiler-issued CompleteAccessRequest" }]);
  }

  const asks: GateEvidence[] = [];
  let profileDeny: Extract<GateDecision, { disposition: "deny"; enforcement: "profile" }> | null = null;

  for (const operation of request.operations) {
    if (operation.kind === "command") {
      const shellOnlyEffect = operation.origin === "direct"
        ? operation.effects.find((effect) => EFFECT_POLICY_AXIS[effect] === "shell")
        : undefined;
      if (shellOnlyEffect) {
        return hardDeny("unknown-effect", [{ kind: "command", subject: `Direct tool cannot produce ${shellOnlyEffect}`, span: operation.span }]);
      }
      if (operation.commandClass === "dangerous") {
        return hardDeny("dangerous-command", [commandEvidence(operation)]);
      }
      if (operation.origin === "direct" || operation.executable === "cd") continue;
      const decision = profile.shellPolicy[operation.commandClass];
      const evidence = [commandEvidence(operation)];
      if (decision === "deny" && !profileDeny) {
        profileDeny = profileDenied("shell-policy-denied", evidence);
      } else if (decision === "ask") {
        asks.push(...evidence);
      }
      continue;
    }

    if (operation.kind !== "path") continue;
    if (operation.source === "redirection" && operation.input === "/dev/null") continue;
    for (const candidate of operation.cwdCandidates) {
      const resolved = resolvePath(candidate.cwd, request.projectRoot, request.stagingDir, operation.input);
      const decision = decidePath(resolved, profile, operation.operation);
      const evidence = [pathEvidence(operation, candidate.cwd)];
      if (decision.decision === "deny") {
        const code = pathDecisionCode(decision);
        if (decision.hard) return hardDeny(code === "path-denied" ? "path-unclassifiable" : code, evidence);
        if (code === "path-denied" && !profileDeny) profileDeny = profileDenied(code, evidence);
      } else if (decision.decision === "ask") {
        asks.push(...evidence);
      }
    }
  }

  if (profileDeny) return profileDeny;
  if (asks.length > 0) return approvalRequired(asks);
  return { disposition: "allow" };
}

function commandEvidence(operation: CommandAccessOperation): GateEvidence {
  return { kind: "command", subject: `${operation.commandClass} command: ${operation.executable ?? "?"}`, span: operation.span };
}

function pathEvidence(operation: PathAccessOperation, cwd: string): GateEvidence {
  return { kind: "path", subject: `${operation.operation} path: ${operation.input} @ ${cwd}`.slice(0, 1_024), span: operation.span };
}

function profileDenied(code: "path-denied" | "shell-policy-denied", evidence: readonly GateEvidence[]): Extract<GateDecision, { disposition: "deny"; enforcement: "profile" }> {
  return { disposition: "deny", code, enforcement: "profile", evidence, guidance: [] };
}

function hardDeny(code: HardDenyCode, evidence: readonly GateEvidence[]): Extract<GateDecision, { disposition: "deny"; enforcement: "hard" }> {
  return { disposition: "deny", code, enforcement: "hard", evidence, guidance: [] };
}

function approvalRequired(evidence: readonly GateEvidence[]): Extract<GateDecision, { disposition: "ask" }> {
  return {
    disposition: "ask",
    code: "approval-required",
    evidence,
    approval: {
      code: "approval-required",
      scope: "tool-call",
      evidence,
      options: ["Allow once", "Deny"],
    },
  };
}
