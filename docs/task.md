# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0165: Align Pi development baseline and assess skill-loader coverage

- Kind: maintenance
- Status: in-progress
- Reversal surface: engineering

### Background & Goal

Align the repository's pinned Pi development dependencies with the latest published Pi release and add package-level integration evidence that Pi discovers Guidance skills from the distributed package.

### Requirements

- Update the root development pins for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to the latest published release verified for this task, and update the lockfile accordingly.
- Preserve package peer dependency ranges, Node engine requirements, runtime package manifests, and product behavior.
- Extend package archive validation to verify Pi discovers Guidance skills through the installed package's declared `pi.skills` resources, not by directly scanning source directories.
- Preserve package peer dependency ranges, Node engine requirements, runtime package manifests, and product behavior.
- Run package validation, the Pi host integration test, and the full repository test suite against the updated dependency baseline.

### Design

Keep production package peer dependencies open (`*`) because Pi supplies its core host packages at runtime. Pin the repository's dev/test host packages exactly to the selected published version so the integration suite has a reproducible, current baseline. Exercise skill resource resolution from the packed and installed Guidance package through Pi's package/resource loading APIs; do not substitute direct source-directory scans or a second full Agent runtime harness.

### Plan

1. Update the two root development dependency pins and lockfile to the selected release.
2. Add a falsifiable assertion to the installed-package archive validation that exercises Pi's `pi.skills` resolution and confirms Guidance skills are discovered.
3. Run focused Pi host/package validation and `npm test`; inspect the final diff for scope.

### Out of Scope

- **New host execution-surface policy, session-switch lifecycle changes, and prompt-injection redesign:** Deferred by the user; revisit only on explicit request.

## T-0166: Align Access Gate messaging, capability search scope, and Shell flow seam

- Kind: bug
- Status: in-progress
- Reversal surface: engineering

### Background & Goal

Bring three reviewed Access Gate boundaries back to their existing authoritative contracts: off mode must accurately describe the mandatory host-surface boundary that remains active, Capability Domain implicit Direct admission must stay limited to targeted read/list operations, and production Shell control-flow evaluation must not be shadowed by a test-only duplicate state machine.

### Requirements

- Keep off-mode enforcement unchanged while making the TUI confirmation and completion notification state that ordinary operation/path admission is disabled and unsupported host surfaces remain blocked.
- Limit Capability Domain implicit Direct admission and allowed-root exemption to `read` and non-recursive `list`; Direct `search` must remain governed by normal path scope and its own policy mode while credential, blocked-descendant, and anti-tamper boundaries retain precedence.
- Remove the test-only Shell reachability/CWD tracer, give flow transition semantics one implementation owner used by production compilation, and verify branching CWD behavior through the Canonical compilation facade.
- Preserve all other policy, Shell language, lifecycle, package, and host behavior, and pass focused plus full repository validation.

### Design

Keep host-only wording in `runtime/pi-composition.ts` and test it through the registered `/policy` command. In authorization, distinguish capability membership from the narrower Direct read/list exemption so mutations still hard-deny while search uses ordinary allowed-root and operation-policy evaluation. Keep `parseShellFlow` as the production parser, move the minimal next-command transition helper under that owner, remove test-only reachability/tracing APIs, and migrate their behavioral assertions to `compileManagedCall` rather than introducing a callback traversal framework.

### Plan

1. Add a failing Pi composition test for truthful off-mode confirmation/notification wording, then update the two messages.
2. Add failing GateSession authorization tests for capability search scope and policy behavior, then narrow the exemption without weakening mandatory boundaries.
3. Add failing Canonical compilation assertions for branching CWD candidates, centralize next-command transition ownership, and remove the test-only tracer tests and APIs.
4. Synchronize durable documentation if needed, run focused tests, TypeScript checking, and the full repository suite, then review the final surface.

### Out of Scope

- **Off-mode enforcement redesign:** D-097 already owns the surviving mandatory host boundary; this task changes only inaccurate human-facing wording. Revisit only if the user changes off-mode semantics.
- **Shell capability-read policy changes:** Existing bounded Shell reads remain unchanged; this task only corrects the unapproved Direct `search` exemption. Revisit through D-090 if Shell capability semantics need revision.
- **New generic flow framework:** A callback-based traversal abstraction would add interface cost without a second production consumer. Revisit only if another production stage needs the same state walk.

## T-0167: 待创建
