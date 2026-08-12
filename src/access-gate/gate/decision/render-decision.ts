import { denyResponseKindFor, guidanceFor, guidanceText } from "../decision-code-catalog";
import { ANALYSIS_LIMITS, type CompileResult } from "../plan/request-builder";
import type { GateDecision, Guidance } from "../decision-types";
import type { GateResult } from "../host";
import type { SourceSpan } from "../../shell-parse";

const MAX_RENDERED_REASON = 2_048;
const MAX_EVIDENCE_ITEMS = 32;

const SHELL_FORM_DENY_BASE = "This Shell form cannot be approved as written.";
const SECURITY_BOUNDARY_DENY =
  "This operation is blocked by a non-overridable security boundary. Do not retry or bypass it.";

function renderGuidance(guidance: readonly Guidance[]): string {
  return guidance.map((item) => guidanceText(item.id)).join("; ");
}

export function renderCompilationFailure(result: Extract<CompileResult, { kind: "reject" }>): GateResult {
  const head = result.evidence[0];
  const subject = head ? head.subject.slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength) : "request denied";
  const guidance = result.category === "unsupported-form" ? guidanceFor(result.code) : [];
  let reason: string;

  if (result.category === "security-block") {
    reason = SECURITY_BOUNDARY_DENY;
  } else if (result.category === "unsupported-form") {
    reason = SHELL_FORM_DENY_BASE;
    if (guidance.length > 0) reason += " " + renderGuidance(guidance);
  } else {
    reason = "This request could not be analyzed in its current form.";
    if (guidance.length > 0) reason += " " + renderGuidance(guidance);
    else reason += " Fix the input and try again.";
  }

  if (subject !== "request denied") reason += " Affected operation: " + subject + ".";
  return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: result.code };
}

/**
 * 从原始命令文本中按 span 切片出命令的字面形式（literal form）。
 *
 * ask 渲染用它让审批人看到正在批准的完整命令（而不是只有可执行名）——
 * unknown 命令没有可提取的路径/效果语义，字面文本是门禁对其唯一诚实可知的信息。
 * 展示完整命令、不做脱敏：命令由模型提出，原文已作为 toolCall 参数存在于会话与
 * 模型上下文中，审批框（人类）展示它不构成新的暴露；而模型侧（block reason）
 * 不重复命令——模型已持有自己的 toolCall 参数。仅做长度截断保持审批框可读；
 * span 缺失/越界/为空时返回 null（不附加）。
 */
function literalForm(rawCommand: string | undefined, span: SourceSpan): string | null {
  if (!rawCommand) return null;
  const { start, end } = span;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end > rawCommand.length || start >= end) return null;
  const sliced = rawCommand.slice(start, end);
  if (sliced.length <= ANALYSIS_LIMITS.maxEvidenceSubjectLength) return sliced;
  // 超长命令显式标注截断，不静默丢信息（知情同意完整性）。
  return sliced.slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength) + "… (truncated)";
}

export function renderDecision(decision: GateDecision, rawCommand?: string): GateResult {
  if (decision.disposition === "allow") return { kind: "allow" };

  if (decision.disposition === "ask") {
    const items = decision.evidence.slice(0, MAX_EVIDENCE_ITEMS).map((e) => {
      const subject = e.subject.slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength);
      if (e.kind !== "command" || !e.span) return subject;
      const literal = literalForm(rawCommand, e.span);
      // ask 侧 command subject 已是类别-only（evaluate-request 按面构造），
      // 渲染器纯追加 literal form，不做格式手术。
      return literal ? `${subject} — literal form: ${literal}` : subject;
    });
    const reason = items.length < decision.evidence.length
      ? items.join("; ") + " and " + (decision.evidence.length - items.length) + " additional items"
      : items.join("; ");
    return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
  }

  const subject = decision.evidence[0] ? decision.evidence[0].subject.slice(0, ANALYSIS_LIMITS.maxEvidenceSubjectLength) : "request denied";
  const guidance = decision.guidance ?? guidanceFor(decision.code);
  let reason: string;

  if (decision.enforcement === "hard") {
    const responseKind = denyResponseKindFor(decision.code);
    if (responseKind === "security-boundary") {
      reason = SECURITY_BOUNDARY_DENY;
    } else if (responseKind === "shell-form") {
      reason = SHELL_FORM_DENY_BASE;
      if (guidance.length > 0) reason += " " + renderGuidance(guidance);
      else reason += " Use a literal command or a Direct tool instead.";
    } else {
      reason = "This request cannot be approved in its current form.";
      if (guidance.length > 0) reason += " " + renderGuidance(guidance);
      else reason += " Do not retry it unchanged; correct the request first.";
    }
  } else if (decision.enforcement === "profile") {
    reason = guidance.length > 0
      ? renderGuidance(guidance)
      : "This request is not allowed by the active Profile. Ask the user to update the Profile or approve the operation.";
  } else {
    reason = "The user denied this operation. It was not executed; wait for the user's next instruction.";
  }
  if (subject !== "request denied" && decision.enforcement !== "user") reason += " Affected operation: " + subject + ".";
  return { kind: "block", reason: reason.slice(0, MAX_RENDERED_REASON), code: decision.code };
}
