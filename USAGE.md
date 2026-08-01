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

Profile names are stored with a `keel-` prefix to avoid ambiguity with path operations and common words. The prefix is stripped for display, and `/profile` accepts both the display and storage forms. Built-in definitions live in `src/access-gate/profile/builtins.json`; use `/profile status` to inspect the active resolved policy.

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

Profiles compose with `extends`. Built-ins load first, then the user global file replaces same-name definitions. Project repositories do not provide Profile configuration. If the global file is invalid, the Session reports the error and starts from the built-in `keel-read` Profile.

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
deny     Block without an approval prompt
```

`pathPolicy` makes decisions independently for `read`, `list`, `search`, and `write`. Rules use declaration-order, per-operation first-match semantics. `blockedPaths` are global hard denials and cannot be relaxed.

### Shell Command Overrides

Shell command aliases, new command definitions, and reclassification rules load only from the user global file:

```text
~/.pi/agent/command-overrides.yaml
```

Project repositories cannot provide command overrides. Direct tools are defined in source by `TOOL_SCHEMAS`; unknown Direct tool surfaces passthrough and are outside Access Gate enforcement.

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

### Bug Fix — Simple (clear reproduction)

```text
/skill:systematic-debugging
/skill:test-driven-development
/skill:fix-validation
```

### Bug Fix — Hard (intermittent or flaky)

```text
/skill:bug-diagnosis
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
