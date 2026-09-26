# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0168: Unified native Windows and platform architecture

- Kind: refactor
- Status: in-progress
- Reversal surface: user-boundary

### Goal

Deliver native Windows 11 as a first-class profile while preserving Linux behavior. Both profiles share one authorization trust chain; native evidence and execution follow each platform's actual host contract. Windows is not released until packaged native acceptance passes.

### Requirements

- **R1 — Unified authorization:** Linux and Windows use one Host Composition → Gate Session → Canonical → Admission → Mandatory Boundary → Policy → Verdict chain. Common authorization code does not parse native paths, call native filesystems, or translate Shell languages.
- **R2 — Native profiles:** Linux retains Bash/POSIX/UID-mode semantics. Windows targets native Windows 11, local NTFS, Windows Terminal, and PowerShell Core `>=7.4 <8`; profiles, checkouts, Pi state, policies, credentials, caches and runtime resources remain isolated.
- **R3 — Truthful execution:** Direct tools remain Pi-native after authorization. Linux Bash remains Pi-native passthrough; Windows PowerShell is AKeel-owned and consumes a single-use binding for the approved call, command, cwd, workspace and lifecycle. Unsupported model Shells remain blocked, including Gate off.
- **R4 — Platform runtime boundary:** `akeel-platform-runtime` is the only implementation source for path/private-filesystem/process/runtime-root/atomic-publication evidence used by Access Gate and Guidance. It has no Pi resources or gallery identity, is not a shared singleton, and owns no Policy, GateSession, Artifact Exchange or Handoff lifecycle.
- **R5 — Sealed evidence:** platform domain, workspace, path proof, root references, process identity and execution bindings are runtime-authenticated, immutable and cross-domain fail-closed. Root Catalog relations replace native pathname comparison in common authorization.
- **R6 — Resource ownership:** Access Gate owns `sessions/session-*/` envelopes and staging; Guidance owns `runs/run-*/`. Platform runtime supplies primitives only. Linux keeps `/tmp/akeel`; Windows uses a verified local-NTFS user runtime root with protected SID/DACL evidence.
- **R7 — Windows evidence and language:** a bounded session host using the frozen `pwsh.exe` supplies official PowerShell AST and managed Win32 evidence without executing model commands. Windows v1 admits only proved fixed-literal forms and rejects unsupported path, provider, script, dynamic, pipeline, redirection and process-launch forms.
- **R8 — Context projection:** Context Pruner remains independent of platform-runtime and owns separate positive Bash/PowerShell test recognizers. Unproved, failed, cancelled, truncated or warning-bearing results remain unchanged.
- **R9 — Portability and locale:** tracked text is UTF-8 without BOM and LF; Windows paths, encoding, argument passing and diagnostics pass en-US and zh-CN automation. Terminal/IME behavior remains human release evidence.
- **R10 — Release truth:** hosted smoke is insufficient. Final packed capability installs, native path/ACL/process/Shell tests, Linux regressions and native Herdr workflow must pass before README or CONTEXT claims Windows support.

### Design

#### Composition and lifecycle

Platform selection occurs once at extension load without starting resources. Each consuming extension opens and disposes its own session-scoped platform authority; separate Pi package module roots never rely on shared object identity. Access Gate builds an `AccessPlatformSession`; Guidance independently acquires runtime-root and publication primitives.

```text
Pi Host → Unified Host Composition → Gate Session → Platform Profile
  → private Direct/Shell frontend → Canonical Facade → Admission
  → Mandatory Boundary → Policy Kernel → Authorization Verdict
  → platform-specific host realization
```

The common chain ends at the verdict. Host realization is intentionally asymmetric:

| Profile/surface | Realization |
|---|---|
| Linux Direct/Bash | Pi-native passthrough after authorization |
| Windows Direct | Pi-native passthrough after Windows evidence authorization |
| Windows PowerShell | AKeel replacement; sealed single-use execution binding and fresh verified `pwsh.exe` process |
| Unsupported model Shell | mandatory static block, including Gate off |

Gate off removes configurable admission but not profile bootstrap, tool ownership, executable/configuration or unsupported-Shell boundaries.

#### Platform runtime contracts

Factories receive session inputs at `session_start`; no zero-input profile may expose a prebuilt Root Catalog. Opaque values use runtime issuance/authenticity checks rather than TypeScript-only brands. Platform runtime computes bounded native evidence and relations for caller-labelled roots but does not know policy roles. Access Gate assigns access, staging, credential, capability, allowed and blocked meanings to sealed root references.

A Windows PowerShell execution binding captures the approved command and execution cwd; the executor never accepts replacements from the later request. Direct and Linux passthrough retain the documented post-decision/TOCTOU boundary rather than receiving a fictitious ticket guarantee.

#### Capability boundaries

Guidance uses platform runtime for controlled workflow roots and receipt-last atomic publication, while retaining run quota, capability, binding, receipt and cleanup ownership. Context Pruner consumes neither path evidence nor platform sessions: its closed recognizers select by tool surface and accept only independently proved test forms.

Detailed Windows path, DACL, encoding, locale and maintenance procedures remain in `docs/windows-maintenance.md`.

### Plan

#### Slice 1: Harden the fail-closed Windows bootstrap

**Goal:** make the temporary Windows host seam exact and diagnosable.
**Requirements covered:** R2, R3, R10
**Depends on:** none

**Acceptance Criteria:** exact Pi `SourceInfo` ownership works for local and packed installs; initialization failure exposes no unverified model tool; tickets bind approved cwd/lifecycle and reject missing, replayed or mutated input before spawn.

**Files and Seams:** `packages/access-gate/src/access-gate/windows/*`; `tests/access-gate/windows-bootstrap.test.ts`.
**Verification:** `npm run test:file -- tests/access-gate/windows-bootstrap.test.ts`

**Steps:** add real-host metadata fixtures first; replace path-pattern ownership and caller-supplied cwd; close lifecycle/failure races; retain ordinary-call blocking.

#### Slice 2: Prove the native bootstrap tracer

**Goal:** validate the packed Pi/PowerShell seam on native Windows 11.
**Requirements covered:** R2, R3, R9, R10
**Depends on:** Slice 1

**Acceptance Criteria:** packed ownership/active tools, no model Bash, frozen executable, runtime prefix, Unicode/space/empty/trailing-backslash argv, `git.exe`, `node.exe`, `npm.cmd`, ticket mutation and replay all pass on local NTFS.

**Files and Seams:** `scripts/windows-bootstrap-tracer.ts`; packed `akeel-access-gate`; `docs/windows-maintenance.md`.
**Verification:** native packed-install harness plus `npm run test:windows-tracer`

**Steps:** replace version-only vectors with argv evidence; run en-US smoke; return incompatibilities before relying on the seam.

#### Slice 3: Establish sealed platform-runtime foundations

**Goal:** publish minimal, runtime-authenticated platform ports without Pi resources.
**Requirements covered:** R4, R5, R6
**Depends on:** none

**Acceptance Criteria:** forged/cross-domain values fail; lifecycle inputs are explicit; package has no Pi manifest/gallery keyword; installed Access Gate and Guidance resolve a runtime value from packed archives.

**Files and Seams:** `packages/platform-runtime/`; capability manifests; `tests/platform-runtime/`; package archive validation.
**Verification:** `npm run test:file -- tests/platform-runtime/**/*.test.ts && npm run validate:package-archives`

**Steps:** replace draft structural DTOs with sealed issuance/projections; separate path, process, private-filesystem and publication ports; lock package boundaries.

#### Slice 4: Migrate Linux evidence and session resources

**Goal:** prove the new ports against existing Linux behavior before Windows authorization uses them.
**Requirements covered:** R1, R2, R5, R6
**Depends on:** Slice 3

**Acceptance Criteria:** Linux path traversal, Access Root, tilde, credential/capability boundaries, staging, retention and Gate off retain current meaning; common authorization stops consuming pathname strings.

**Files and Seams:** platform-runtime Linux adapters; Access Gate compilation/authorization/runtime; mirrored Linux contract tests.
**Verification:** `npm test`

**Steps:** migrate one vertical Direct/path slice; introduce Root Catalog relations; migrate Bash and session lifecycle; remove replaced POSIX access from common layers.

#### Slice 5: Install the unified Access Gate composition

**Goal:** remove the bootstrap/production split while preserving profile-specific realization.
**Requirements covered:** R1, R3, R5
**Depends on:** Slices 1, 4

**Acceptance Criteria:** both profiles enter one GateSession and authorization facades; Linux passthrough and Windows owned execution remain explicit capabilities; no common layer imports native adapters.

**Files and Seams:** Access Gate composition root, GateSession, Canonical/Admission/Authorization facades and dependency-boundary tests.
**Verification:** `npm test`

**Steps:** introduce session profile composition; make evidence acquisition async; switch Linux atomically; connect Windows only after its evidence slices are available.

#### Slice 6: Migrate Guidance runtime resources

**Goal:** make Artifact Exchange platform-neutral without moving its lifecycle into platform-runtime.
**Requirements covered:** R4, R6
**Depends on:** Slice 3

**Acceptance Criteria:** Guidance no longer constructs `/tmp/akeel/runs`; Linux behavior remains intact; role paths and atomic publication come from its own platform session; Handoff remains session-embedded.

**Files and Seams:** `packages/guidance/src/artifact-exchange/`; platform private-filesystem/publication ports; Guidance tests.
**Verification:** `npm run test:file -- "tests/guidance/**/*.test.ts"`

**Steps:** inject runtime-root and publication ports; migrate owner identity/path validation; preserve capability and receipt contracts.

#### Slice 7: Implement the Windows evidence host

**Goal:** issue bounded official-AST and Win32 evidence from the frozen PowerShell runtime.
**Requirements covered:** R2, R5, R7, R9
**Depends on:** Slices 2, 3

**Acceptance Criteria:** reproducible managed helper, versioned bounded JSONL, timeout/exit/malformed-response failure, process identity and idempotent disposal pass native tests; discovery alone starts no host.

**Files and Seams:** platform-runtime Windows client/protocol/native assets and native contract tests.
**Verification:** hosted smoke plus native Windows host suite

**Steps:** build deterministic helper; add protocol budgets; bind host executable identity; test lifecycle and cultures.

#### Slice 8: Implement Windows path, policy and runtime resources

**Goal:** support Direct admission and controlled resources on local NTFS.
**Requirements covered:** R1, R5, R6, R7, R9
**Depends on:** Slices 5, 6, 7

**Acceptance Criteria:** the closed path matrix, Root Catalog relations, credentials/capabilities, protected DACL, PID+creation locks, retention and receipt-last publication pass native tests.

**Files and Seams:** platform-runtime Windows path/filesystem/process adapters; Access Gate Direct/policy adapters; Guidance Windows publication tests.
**Verification:** native Windows path/ACL/runtime suites

**Steps:** implement path proof and missing-leaf/reparse evidence; compile policy roots; add resource and interference tests; connect Direct admission.

#### Slice 9: Integrate PowerShell Canonical and production execution

**Goal:** authorize and execute the proved PowerShell v1 subset through the common chain.
**Requirements covered:** R1, R3, R7
**Depends on:** Slices 5, 7, 8

**Acceptance Criteria:** official AST projection admits only fixed supported forms; negative grammar is stable; approved calls alone issue cwd-bound tickets; Gate off retains execution identity/configuration boundaries.

**Files and Seams:** Access Gate PowerShell frontend/program registry/execution bridge and Windows integration tests.
**Verification:** native PowerShell Canonical/executor suite

**Steps:** project bounded syntax IR; add cmdlet/external analyzers; connect verdict/approval to ticket issuance; remove temporary ordinary-call bootstrap block only after end-to-end proof.

#### Slice 10: Complete projection, repository and guidance portability

**Goal:** remove unconditional Linux assumptions outside native adapters.
**Requirements covered:** R8, R9
**Depends on:** Slice 9

**Acceptance Criteria:** Context Pruner has independent closed Bash/PowerShell recognizers and no platform-runtime dependency; tracked-path/encoding validation and role-based Guidance pass on both platforms.

**Files and Seams:** Context Pruner; Guidance instructions; repository validator; package manifests and tests.
**Verification:** platform-neutral suite on Linux and Windows

**Steps:** add strict `npm.cmd` test forms; keep uncertain output unchanged; add index-driven portability checks; remove physical-path/viewer assumptions.

#### Slice 11: Release acceptance and durable synchronization

**Goal:** establish the Windows support claim from fresh packaged evidence.
**Requirements covered:** R9, R10
**Depends on:** Slices 1–10

**Acceptance Criteria:** Linux full suite, hosted smoke, ephemeral native Windows 11 x64 en-US/zh-CN packages, terminal/IME checks and final Herdr reserve→publish→collect/worktree flow pass; README, CONTEXT and Decisions state only verified behavior.

**Files and Seams:** CI/release harness, README, CONTEXT, Decisions and Task records.
**Verification:** complete packaged Linux/Windows release matrix

**Steps:** run core gates before Herdr; resolve incompatible locale evidence with the user; synchronize durable records and clear this Task atomically.

### Current Checkpoint

- Slice 1 source hardening is implemented: exact extension-path ownership, fail-closed active tools, bounded diagnostics, and call/command/cwd/workspace/lifecycle ticket binding have platform-neutral tests. Packed Pi metadata remains a native Slice 2 gate.
- The native tracer now carries Unicode, empty, spaced and trailing-backslash Node/npm argv plus Git path vectors; it has not run on native Windows.
- Slice 3 foundation is implemented: the support package exports sealed domain/workspace/root/path/object/process/runtime values, narrow lifecycle/evidence ports and explicit session factories; forgery, cross-domain, no-Pi-surface and packed dependency tests pass.
- Slice 4 Linux adapters implemented: Linux path session, process authority, runtime root authority, and private filesystem/publication authorities are verified in platform-runtime; Access Gate compilation retains path proofs, and authorization implements pure Root Catalog relations matching for credentials, capability boundaries, allowed/blocked roots, and recursive ancestor blocks.
- Slice 5 unified GateSession composition implemented: session start synchronizes with platform-runtime Linux path session, compiles a global RootCatalog, maps RootReferences into MandatoryBoundaries and policy snapshots, and verifies relations-based authorization end-to-end.
- Slice 6 Guidance runtime resources implemented: Artifact Exchange consumes platform-runtime primitives for controlled directories, atomic no-clobber publication, and platform runs roots rather than constructing /tmp paths locally.
- Slice 7 Windows evidence host client implemented: bounded versioned JSONL protocol, request/response budget guards, fail-closed timeout/exit/desync handling, and PowerShell host driver script are implemented and verified with mock process testing.
- Slice 10 portability gates implemented: Context Pruner independently recognizes closed Bash and PowerShell test commands without platform-runtime dependency; repository portability gate strictly enforces LF line endings, no UTF-8 BOM, no Windows illegal characters, and zero case-fold collisions across all 169 tracked files.
- No Windows support claim is active.

### Scope Boundary

No macOS/BSD, network filesystem, OS sandbox, fd passing, TOCTOU elimination, descendant-process/network confinement, legacy Windows PowerShell, arbitrary PowerShell grammar, shared runtime singleton, automatic workflow GC or new Policy schema.

## T-0169: 待创建
