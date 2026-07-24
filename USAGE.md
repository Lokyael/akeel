# Pi Keel — Usage

## Install

```bash
pi install git:github.com/Lokyael/pi-keel
```

The access gate starts automatically. Use `/profile status` to inspect the active Profile.

The Shell IR is intentionally a restricted command representation, not a full Bash grammar. It covers simple commands, known wrappers, control operators, redirections, and supported literal bodies; structured constructs such as `for`, `while`, `if`, and function definitions are not modeled as executable control flow. Dynamic tokens such as `$f`, command substitution, and unquoted globs are hard-denied. Use the direct `read`, `grep`, `find`, or `ls` tools for batch inspection instead of encoding the inspection as a Shell loop.

## Runtime Layout

```text
pi starts
  ├─ src/bootstrap/index.ts
  │   Injects engineering principles and evidence-first guidance.
  │
  ├─ src/access-gate/index.ts
  │   Loads Profiles, owns Session state, registers /profile, and intercepts tool calls.
  │
  ├─ src/access-gate/profile/
  │   Validates, composes, and loads Profile definitions.
  │
  ├─ src/access-gate/shell-parse/
  │   Tokenizer and restricted Shell parser producing a typed IR.
  │
  ├─ src/access-gate/command-semantics/
  │   Wrapper normalization, control-flow analysis, and adapter-based command classification.
  │
  ├─ src/access-gate/path/
  │   Resolves cwd/projectRoot/stagingDir and applies per-operation path decisions.
  │
  └─ skills/
      Provides foundations, disciplines, and workflows on demand.
```

## Profiles

The active Profile is the only access mode. A new Session starts from `defaultProfile` and does not inherit a temporary Profile from another Session.

Built-in Profiles:

Profile names are stored with a `keel-` prefix (`keel-read`, `keel-explore`, …) to avoid ambiguity with path operations and common words. The prefix is stripped for display. `/profile` accepts both forms: `/profile read` and `/profile keel-read` are equivalent.

| Profile | Description |
|---------|-------------|
| `read` | Inspect `projectRoot` only; no writes, no shell commands |
| `explore` | Inspect anywhere on the filesystem; no writes, no shell commands |
| `code` | Inspect `projectRoot`; write `src/`, `tests/`, `/tmp/pi-work/`; shell commands require approval |
| `plan` | Inspect anywhere; write `docs/`, `CONTEXT.md`, `/tmp/pi-work/`; shell commands require approval |
| `query` | Inspect anywhere; write all project files (each write asks); shell commands require approval |
| `develop` | Inspect anywhere; write all project files freely; scripts and build tools still require approval |
| `full` | Inspect anywhere; write all project files freely; scripts and build tools allowed without approval |

Commands:

```text
/profile                 # Open the Profile selector
/profile <name>          # Activate a Profile for this Session
/profile status          # Show the detailed resolved policy
```

The Footer wraps Pi's native `FooterComponent` when available and uses two lines. The active Profile name, for example `plan` or `query`, appears on the first line with the project location; the second line retains Pi's native token, context, cost, model, and extension-status details. Standalone tests use a local rendering fallback when the Pi host package is unavailable.

## Configuration

Global:

```text
~/.pi/agent/extensions/access-gate/profiles.json
```

Project:

```text
.pi/extensions/access-gate/profiles.json
```

The loading order is built-ins, global configuration, then project configuration. Project configuration is loaded only when Pi marks the project as trusted. A same-name Profile in a later layer replaces the earlier definition. Profiles compose with `extends`.

Example:

```json
{
  "defaultProfile": "develop-plan",
  "profiles": {
    "develop-plan": {
      "description": "Develop with plan document access.",
      "extends": ["keel-develop", "keel-plan"],
      "shellPolicy": {
        "inspect": "allow",
        "modify": "deny",
        "execute": "deny",
        "destroy": "deny",
        "unknown": "ask"
      }
    }
  }
}
```

`Decision` values are:

```text
allow    Execute without a prompt
ask      Show Allow once / Deny
 deny    Block without an approval prompt
```

`pathPolicy` makes decisions independently for `read`, `list`, `search`, and `write`. More-specific paths win. `blockedPaths` are global hard denials and cannot be relaxed.

Commands without a matching adapter use the Profile's `shellPolicy.unknown` decision. Commands that an adapter marks opaque because their effects cannot be safely classified are hard-denied.

## Enforcement

The decision order is:

```text
hard threat
→ unsafe Shell syntax
→ blocked path
→ command classification
→ path operation policy
→ Profile decision
→ one-time approval, when required
```

Hard denials include destroy commands (adapter class `destroy`), opaque command semantics, dynamic execution, prompt/data-exfiltration threat patterns, protected paths, and symlink escapes. pi-keel does not provide a container, VM, seccomp policy, network namespace, or other OS-level sandbox.

Approval is never remembered. Every `ask` decision offers only:

```text
Allow once
Deny
```

Headless modes fail closed when an approval would be required.

## Testing

```bash
npm test
npm run test:profile
npm run test:path
npm run test:gate
npm run test:shell-parse
npm run test:cmd-semantics
npm run test:index
npm run test:footer
```

## Recovery

Pi Keel does not create or manage snapshots and does not register a rollback command. Use version control, editor history, or pi's `/tree` session recovery.

## Common Workflows

### New Feature

```text
/skill:survey-context
/skill:brainstorm-design
/skill:plan-writing
/skill:implement-work
```

### Bug Fix

```text
/skill:bug-investigation
/skill:systematic-debugging
/skill:test-driven-development
/skill:fix-validation
```

### Code Review

```text
/skill:code-review
/skill:security-review
```
