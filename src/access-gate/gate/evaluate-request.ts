import { decidePath, resolvePath } from "../path";
import type { ResolvedProfile } from "../profile/types";
import { isCompleteAccessRequest, type CommandAccessOperation, type CompleteAccessRequest, type PathAccessOperation } from "./access-request";
import { pathDecisionCode } from "./decision-code";
import type { GateRuntime } from "./types";
import type { GateDecision, GateEvidence, HardDenyCode } from "./decision-types";
import { DecisionBuilder } from "./decision-builder";
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
    return DecisionBuilder.hard("invalid-tool-input", "request is not a compiler-issued CompleteAccessRequest");
  }

  const asks: GateEvidence[] = [];
  let profileDeny: GateDecision | null = null;

  for (const operation of request.operations) {
    if (operation.kind === "command") {
      const shellOnlyEffect = operation.origin === "direct"
        ? operation.effects.find((effect) => EFFECT_POLICY_AXIS[effect] === "shell")
        : undefined;
      if (shellOnlyEffect) {
        return DecisionBuilder.hard("unknown-effect", `Direct tool cannot produce ${shellOnlyEffect}`, operation.span);
      }
      if (operation.commandClass === "dangerous") {
        return DecisionBuilder.hard("dangerous-command", `${operation.commandClass} command: ${operation.executable ?? "?"}`, operation.span);
      }
      // Direct tools bypass Shell policy — their effects are checked by the
      // EFFECT_POLICY_AXIS (shell-only effects like execute/network are hard-denied
      // for Direct tools above).  cd is a Shell-only builtin whose list path
      // operation is handled by the path loop below.
      if (operation.origin === "direct" || operation.executable === "cd") continue;
      const decision = profile.shellPolicy[operation.commandClass];
      const evidence = [commandEvidence(operation)];
      if (decision === "deny" && !profileDeny) {
        profileDeny = DecisionBuilder.profile("shell-policy-denied", evidence[0]!.subject);
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
        if (decision.hard) return DecisionBuilder.hard(code === "path-denied" ? "path-unclassifiable" : code, evidence[0]!.subject, evidence[0]!.span);
        if (code === "path-denied" && !profileDeny) profileDeny = DecisionBuilder.profile(code, evidence[0]!.subject);
      } else if (decision.decision === "ask") {
        asks.push(...evidence);
      }
    }
  }

  if (profileDeny) return profileDeny;
  if (asks.length > 0) return DecisionBuilder.approval(asks);
  return { disposition: "allow" };
}


function commandEvidence(operation: CommandAccessOperation): GateEvidence {
  return { kind: "command", subject: `${operation.commandClass} command: ${operation.executable ?? "?"}`, span: operation.span };
}

function pathEvidence(operation: PathAccessOperation, cwd: string): GateEvidence {
  return { kind: "path", subject: `${operation.operation} path: ${operation.input} @ ${cwd}`.slice(0, 1_024), span: operation.span };
}
