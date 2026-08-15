import { decidePath, resolvePath, PATH_DENY_REASONS, type PathDenyReason, type PathDecision } from "../../path";
import type { ResolvedProfile } from "../../profile";
import { hasPlanBrand, ANALYSIS_LIMITS, type CommandAccessOperation, type CompleteAccessPlan, type PathAccessOperation } from "../plan";
import type { GateDecision, GateEvidence, HardDenyCode } from "../decision-types";
import { hardDeny, profileDeny, requireApproval } from "./decision-builder";
import type { Effect } from "../../command-semantics";

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

export function evaluateRequest(
  plan: CompleteAccessPlan,
  profile: ResolvedProfile,
): GateDecision {
  // D-046：品牌检查（O(1)）替代全量深验——plan 有效性已由 seal 边界验证，此处只验身份
  if (!hasPlanBrand(plan)) {
    return hardDeny("invalid-tool-input", "plan is not a compiler-issued CompleteAccessPlan");
  }

  const asks: GateEvidence[] = [];
  let profileDenial: GateDecision | null = null;

  for (const operation of plan.commands) {
    const shellOnlyEffect = operation.origin === "direct"
      ? operation.effects.find((effect) => EFFECT_POLICY_AXIS[effect] === "shell")
      : undefined;
    if (shellOnlyEffect) {
      return hardDeny("unknown-effect", `Direct tool cannot produce ${shellOnlyEffect}`, operation.span);
    }
    if (operation.commandClass === "destroy") {
      return hardDeny("destroy-command", `${operation.commandClass} command: ${operation.executable ?? "?"}`, operation.span);
    }
    // Direct tools bypass Shell policy — their effects are checked by the
    // EFFECT_POLICY_AXIS (shell-only effects like execute/network are hard-denied
    // for Direct tools above). cd is a Shell-only builtin whose list path
    // operation is handled by the path loop below.
    if (operation.origin === "direct" || operation.executable === "cd") continue;
    const decision = profile.shellPolicy[operation.commandClass];
    if (decision === "deny" && !profileDenial) {
      profileDenial = profileDeny("shell-policy-denied", commandEvidence(operation).subject);
    } else if (decision === "ask") {
      // ask 侧 subject 只含命令类别（"unknown command"），可执行名与参数由 literal form 提供，
      // 渲染器纯追加不做格式手术（D-023：不追加重复信息）。
      asks.push(commandEvidence(operation, true));
    }
  }

  for (const operation of plan.paths) {
    if (operation.source === "redirection" && operation.input === "/dev/null") continue;
    for (const candidate of operation.cwdCandidates) {
      const resolved = resolvePath(candidate.cwd, plan.projectRoot, plan.stagingDir, operation.input);
      const decision = decidePath(resolved, profile, operation.operation);
      const evidence = [pathEvidence(operation, candidate.cwd)];
      if (decision.decision === "deny") {
        const code = pathDecisionCode(decision);
        // 模型侧 deny 只携带操作类型分类，不含原始路径——模型已持有命令（toolCall 参数），
        // 不重复具体路径信息（D-023）。ask 侧（pathEvidence）保留完整路径供人类同意。
        const denySubject = `${operation.operation} path denied`;
        if (decision.hard) return hardDeny(code === "path-denied" ? "path-unclassifiable" : code, denySubject, evidence[0]!.span);
        if (code === "path-denied" && !profileDenial) profileDenial = profileDeny(code, denySubject);
      } else if (decision.decision === "ask") {
        asks.push(...evidence);
      }
    }
  }

  if (profileDenial) return profileDenial;
  if (asks.length > 0) return requireApproval(asks);
  return { disposition: "allow" };
}

// ── path decision → stable code ──
// reason → DecisionCode 的类型化映射：reason 常量改名在此编译期报错，消除字符串耦合
const PATH_REASON_CODES: Readonly<Record<PathDenyReason, HardDenyCode | "path-denied">> = {
  [PATH_DENY_REASONS.blocked]: "blocked-path",
  [PATH_DENY_REASONS.unclassifiable]: "path-unclassifiable",
  [PATH_DENY_REASONS.symlinkEscape]: "symlink-escape",
};

function pathDecisionCode(decision: Pick<PathDecision, "hard" | "reason">): HardDenyCode | "path-denied" {
  if (!decision.hard) return "path-denied";
  return PATH_REASON_CODES[decision.reason as PathDenyReason] ?? "path-denied";
}

// ── evidence helpers ──

function commandEvidence(operation: CommandAccessOperation, forAsk = false): GateEvidence {
  return {
    kind: "command",
    // ask 侧只含类别（literal form 提供完整命令与可执行名），渲染器纯追加；
    // deny 侧含可执行名（模型需要它做分类）。
    subject: forAsk
      ? `${operation.commandClass} command`
      : `${operation.commandClass} command: ${operation.executable ?? "?"}`,
    span: operation.span,
  };
}

function pathEvidence(operation: PathAccessOperation, cwd: string): GateEvidence {
  return { kind: "path", subject: `${operation.operation} path: ${operation.input} @ ${cwd}`.slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength), span: operation.span };
}
