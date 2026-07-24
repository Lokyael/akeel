import { scanThreats } from "../security/threat-scan";
import { hardCommandRule } from "./hard-rules";
import { reject, type CompileResult } from "./access-request";

// Preflight check: stateless inspection run before shell compilation.
// Each check returns a string id on match, or null.  New checks can be
// added here and automatically participate in the compiler pipeline.

interface PreflightCheck {
  name: string;
  check: (command: string) => string | null;
  code: "threat" | "hard-command-rule";
}

const PREFLIGHT_CHECKS: readonly PreflightCheck[] = [
  { name: "threat", check: scanThreats, code: "threat" },
  { name: "hard-rule", check: hardCommandRule, code: "hard-command-rule" },
];

export function runPreflight(command: string): CompileResult | null {
  for (const check of PREFLIGHT_CHECKS) {
    const result = check.check(command);
    if (result) return reject(check.code, result);
  }
  return null;
}
