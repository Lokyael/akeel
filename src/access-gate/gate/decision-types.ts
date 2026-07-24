import type { SourceSpan } from "../shell-parse/types";

export type DecisionCode =
  | "dynamic-shell"
  | "unsafe-syntax"
  | "threat"
  | "opaque-command"
  | "destroy-command"
  | "hard-command-rule"
  | "blocked-path"
  | "symlink-escape"
  | "path-unclassifiable"
  | "path-denied"
  | "shell-policy-denied"
  | "approval-required"
  | "user-denied"
  | "unknown-tool"
  | "invalid-tool-input"
  | "unsupported-redirection"
  | "uncertain-cwd"
  | "unknown-effect"
  | "resource-limit";

export type Enforcement = "hard" | "profile" | "user";

export type HardDenyCode = Exclude<DecisionCode, "path-denied" | "shell-policy-denied" | "approval-required" | "user-denied">;
export type ProfileDenyCode = "path-denied" | "shell-policy-denied";

export interface GateEvidence {
  readonly kind: "syntax" | "threat" | "command" | "tool" | "redirection" | "path" | "approval";
  readonly subject: string;
  readonly span?: SourceSpan;
}

export type GuidanceId =
  | "batch-inspection-tools"
  | "literal-command-or-direct-tool"
  | "split-supported-commands"
  | "profile-restriction";

export interface Guidance {
  readonly id: GuidanceId;
  readonly safety: "recheck";
}

export interface ApprovalRequest {
  readonly code: "approval-required";
  readonly scope: "tool-call";
  readonly evidence: readonly GateEvidence[];
  readonly options: readonly ["Allow once", "Deny"];
}

export type GateDecision =
  | { readonly disposition: "allow" }
  | {
      readonly disposition: "ask";
      readonly code: "approval-required";
      readonly evidence: readonly GateEvidence[];
      readonly approval: ApprovalRequest;
    }
  | {
      readonly disposition: "deny";
      readonly code: HardDenyCode;
      readonly enforcement: "hard";
      readonly evidence: readonly GateEvidence[];
      readonly guidance: readonly Guidance[];
    }
  | {
      readonly disposition: "deny";
      readonly code: ProfileDenyCode;
      readonly enforcement: "profile";
      readonly evidence: readonly GateEvidence[];
      readonly guidance: readonly Guidance[];
    }
  | {
      readonly disposition: "deny";
      readonly code: "user-denied";
      readonly enforcement: "user";
      readonly evidence: readonly GateEvidence[];
      readonly guidance: readonly Guidance[];
    };
