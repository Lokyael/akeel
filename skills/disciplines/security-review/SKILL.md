---
name: security-review
description: Use when reviewing pending changes, before merge, during verify-work, or when the user says "security review" or "scan for vulns" — AI-powered 5-phase CWE-mapped security scan.
---

# Security Review

> **HARD GATE** — Requires git context (branch with merge-base or diff). Reports write only under `specs/security/`.

## 5-Phase Scan

| # | Phase | What |
|---|-------|------|
| 1 | **Scope Resolution** | Detect diff via `git diff --merge-base origin/HEAD`; resolve languages/frameworks |
| 2 | **Context Research** | Identify existing security patterns, sanitization, auth model in the codebase |
| 3 | **Vulnerability Assessment** | Trace user input → sink; check auth boundaries, crypto, deserialization, path ops |
| 4 | **False-Positive Filtering** | Cross-check each finding against exclusion rules; reject confidence < 8/10 |
| 5 | **Report Generation** | Structured markdown: file:line, severity, category, exploit scenario, fix |

## Categories Covered

SQLi (CWE-89), XSS (CWE-79), SSRF (CWE-918), command injection (CWE-78), auth bypass (CWE-287), unsafe deserialization (CWE-502), path traversal (CWE-22), IDOR (CWE-639), crypto flaws (CWE-327), secrets exposure (CWE-798), template injection (CWE-1336).

## SQL-Safety Doctrine

| SQL source | Attacker-reachable input? | Verdict |
|------------|---------------------------|---------|
| Hardcoded / compile-time constant | N/A | **Safe** — proven authorship |
| Developer-authored with bound parameters only | No dynamic fragments | **Safe** |
| String concatenation with user-controlled values | Yes | **Unsafe** — report as SQLi |
| ORM query builder with user input in WHERE/JOIN | Yes | **Unsafe** unless parameterized |
| Stored procedure with dynamic SQL inside | User input reaches EXEC | **Unsafe** |

**Provenance test:** If you cannot prove the query string was authored entirely by the developer (no attacker-reachable interpolation), treat as vulnerable.

## Report Format

Each finding: **`File:Line` — Severity — Category**
- Description: how the vulnerability manifests
- Exploit scenario: concrete attack path
- Recommendation: fix with code example (show the safe code, not just describe it)

## Integration Points

| Phase | Check |
|-------|-------|
| Before merge | Security review passes (no HIGH findings ≥ 8 confidence) |
| During verify-work | Phase 5 security gate |
| During code-review | "Diff scanned — no unaddressed HIGH findings" |

## Verify

```bash
test -d specs/security && echo "OK: specs/security/ exists" || mkdir -p specs/security
```
