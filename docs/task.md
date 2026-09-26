# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0165: Align Pi development baseline and test skill discovery

- Kind: maintenance
- Status: in-progress
- Reversal surface: engineering

### Background & Goal

Align the repository's pinned Pi development dependencies with the latest published Pi release and add package-level integration evidence that Pi discovers Guidance skills from the distributed package.

### Requirements

- Update the root development pins for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to the latest published release verified for this task, and update the lockfile accordingly.
- Preserve package peer dependency ranges, Node engine requirements, runtime package manifests, and product behavior.
- Extend package archive validation to verify Pi discovers Guidance skills through the installed package's declared `pi.skills` resources, not by directly scanning source directories.
- Run package validation, the Pi host integration test, and the full repository test suite against the updated dependency baseline.

### Design

Keep production package peer dependencies open (`*`) because Pi supplies its core host packages at runtime. Pin the repository's dev/test host packages exactly to the selected published version so the integration suite has a reproducible, current baseline. Exercise skill resource resolution from the packed and installed Guidance package through Pi's package/resource loading APIs; do not substitute direct source-directory scans or a second full Agent runtime harness.

### Plan

1. Update the two root development dependency pins and lockfile to the selected release.
2. Add a falsifiable assertion to the installed-package archive validation that exercises Pi's `pi.skills` resolution and confirms Guidance skills are discovered.
3. Run focused Pi host/package validation and `npm test`; inspect the final diff for scope.

### Out of Scope

- **New host execution-surface policy, session-switch lifecycle changes, and prompt-injection redesign:** Deferred by the user; revisit only on explicit request.

## T-0168: Native Windows 11 maintenance profile

- Kind: maintenance
- Status: in-progress
- Reversal surface: user-boundary

### Background & Goal

Establish and maintain a first-class native Windows 11 profile without weakening or conditionally rewriting the existing Linux profile. The Windows profile uses Windows Terminal and PowerShell 7 throughout its supported human and model execution path. This record is the temporary authority for the transition and remains active until implementation, verification, user documentation, and durable architecture records are complete.

The current production Access Gate remains Linux-only. This Task defines the approved Windows destination and the gates that must pass before AKeel may claim Windows support.

### Requirements

- Support native Windows 11 as an independent platform profile; the supported profile runs directly on Windows 11 and does not route through a compatibility environment.
- Use Windows Terminal as the supported terminal and PowerShell 7 (`pwsh.exe`) as the only model-facing Shell on Windows. The Shell constraint applies to Pi's host execution surface; PowerShell-launched external executables and helpers remain governed by Access Gate command/effect/path evidence.
- Require UTF-8 without BOM for Windows source, fixtures, generated text, PowerShell file output, and captured text artifacts. Prefer the modern cross-platform contract; legacy Windows PowerShell or old-tool compatibility is not a reason to add a BOM. PowerShell file operations and tests must select `utf8NoBOM` explicitly.
- Configure Pi's Windows model tool set explicitly around Direct tools and `powershell`; do not activate or document a Windows model `bash` tool and do not configure Pi `shellPath`. Pi `!` / `!!`, RPC `bash`, low-level SDK Bash calls, and third-party Bash backends are not part of the normal AKeel Windows workflow or its support claim; no additional host interception is required unless real usage demonstrates that configuration isolation is insufficient.
- Require PowerShell 7 to be present and positively identified. Pi's fallback to Windows PowerShell does not satisfy the AKeel Windows profile.
- Preserve Linux Bash behavior and evidence independently. Windows support must not broaden the Linux parser, merge path dialects, or make Linux behavior conditional on Windows compatibility.
- Share platform-neutral authorization policy, verdicts, effects, display contracts, and package capabilities where their semantics are genuinely common; keep path evidence, Shell compilation, filesystem control, process lifecycle, and platform tests separate.
- Keep each platform's physical checkout, dependency installation, Pi agent directory, session directory, policy file, credentials, temporary resources, caches, and generated artifacts independent. Source changes cross platforms through Git history, not shared runtime state.
- Do not claim Windows support until native Windows CI and the acceptance gates below pass against the packaged extensions.

### Upstream Pi Baseline

The development baseline is Pi `0.87.1`. Pi currently documents native Windows operation, ships `powershell` as a first-class optional built-in tool and SDK surface, prefers `pwsh.exe` before Windows PowerShell, and allows `defaultTools` to replace the model-facing Bash tool with PowerShell. PowerShell became a built-in tool in Pi `0.84.3` and has since received the same session-environment, cwd, duration-rendering, and constrained-sampling integration as the built-in Bash tool.

Pi has no published Windows roadmap with milestones. Its current public behavior still requires users to opt into PowerShell, while the open Windows feedback thread and maintainer discussion continue evaluating a PowerShell-default or fully Bash-free native Windows experience without a committed switch date. AKeel therefore treats Pi's public `powershell` tool contract as available now and does not depend on an upstream default change.

A native AKeel configuration target is:

```json
{
  "defaultTools": ["read", "powershell", "edit", "write", "grep", "find", "ls"]
}
```

The final supported list remains subject to native path-contract verification for every Direct tool; the Shell boundary does not depend on Pi's default tool selection. Git maintenance uses native `git.exe`; the exact Windows Git distribution is an environment choice, provided Pi's model tool set remains PowerShell-only and the required repository, worktree, credential, and package flows pass.

### Current AKeel Gaps

- Host adaptation accepts only slash-rooted cwd values and classifies `powershell` as unsupported.
- Canonical path evidence implements Linux absolute paths, symlink traversal, slash-prefix scope comparisons, and `$HOME`-based tilde semantics only.
- Policy paths, Project Context, Gate Session, Artifact Exchange owners, and Continuation Capsules currently require slash-rooted absolute paths.
- Session and workflow resource control relies on POSIX ownership and mode-bit evidence such as `0700` / `0600`.
- Shell semantics, executable identity, redirection, device handling, destructive commands, and contract tests are Bash/GNU/Linux-specific.
- Context Pruner recognizes model `bash` calls only.
- Guidance still contains physical Linux temporary paths and Linux-only opener instructions.
- Current documentation and tests correctly describe and enforce the production Linux-only boundary; they must remain accurate until the Windows composition is complete.

### Design

#### Platform composition

Select one platform composition at extension initialization and inject its ports into the common authorization chain. The common core must not rediscover the host platform or interpret native path strings. The two compositions are:

| Profile | Managed Shell | Path evidence | Filesystem control |
|---|---|---|---|
| Linux | Bash | Linux pathname and symlink semantics | UID/GID and mode evidence |
| Windows 11 | PowerShell 7 | Windows pathname and reparse-point semantics | SID/owner/DACL evidence |

Direct and Shell compilation remain private semantic lanes and converge only after each platform has issued verified Canonical facts. Canonical path values carry their platform domain so a Windows path cannot enter a Linux comparer or vice versa.

#### Windows path evidence

The Windows filesystem baseline is local NTFS, rooted by a fully qualified native path. Other storage forms are not part of the initial verification scope. Windows evidence must explicitly classify and either prove or fail closed on:

- drive-absolute, UNC, namespace, device, drive-relative, and rooted-without-drive forms;
- case-insensitive identity and separator normalization without losing the original literal form used for display;
- reserved device names, alternate data streams, trailing spaces or periods, and per-drive current-directory behavior;
- symbolic links, junctions, and other reparse points, including bounded traversal and loop detection;
- short-name aliases, hard-link identity, and canonical root comparison where they can affect credential, capability, blocked-path, or anti-tamper boundaries;
- path-length behavior and errors from tools that do not participate in the long-path contract.

The initial implementation may reject path classes that do not yet have complete evidence. It must never translate foreign path syntax centrally and then reuse the result as Windows authorization evidence.

#### PowerShell compilation

Build a dedicated bounded PowerShell lane rather than translating Bash semantics. Start from a closed, testable subset and fail closed on unsupported language forms. The lane must distinguish native cmdlets, aliases, external executables, scripts, providers, redirections, pipelines, invocation operators, dot sourcing, script blocks, subexpressions, nested shell execution, dynamic command names, and process-launching forms before any of them can receive a less restrictive classification.

Program analyzers may project the same platform-neutral command classes and effects already consumed by Policy, but only after the PowerShell lane has consumed the full relevant option and argument contract. Runtime opacity must remain explicit; approval does not create filesystem confinement.

#### Windows runtime resources

Derive staging and workflow roots from the native runtime environment rather than a fixed physical path. Controlled-directory proof uses Windows owner/SID/DACL and reparse-point evidence, not POSIX mode bits. Session locks, process liveness, no-clobber publication, rename/link behavior, cleanup, open-file failures, and crash retention require native Windows contract tests.

Session Handoff remains embedded in Pi session entries. Any persisted cwd or path-bearing receipt remains platform-tagged and valid only in its originating platform profile unless a future contract explicitly defines a portable representation.

#### Platform isolation

- Use separate physical checkouts on Linux and Windows; never run both platforms against one working tree or Git index.
- Install dependencies independently; never copy `node_modules` or generated executable shims between platforms.
- Keep `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, AKeel policy, credentials, package storage, temporary roots, and workflow runs platform-local.
- Keep absolute policy paths native to the platform that owns the policy file. Cross-machine synchronization may share templates but not resolved roots, credentials, sessions, or runtime artifacts.
- Parse policy paths with Windows-native path rules and preserve a canonical Windows identity. Drive-relative and device/stream forms require explicit handling before admission; path values remain platform-scoped and cannot be consumed by a Linux session.
- Include OS, architecture, runtime version, and lockfile identity in CI/cache boundaries.

#### Repository portability

Commit a root `.gitattributes` that normalizes repository text to LF in both worktrees and marks any future binary assets explicitly. Do not rely on a contributor's `core.autocrlf`; Windows maintenance uses LF working-tree text so source, Markdown, JSON, YAML and PowerShell fixtures produce no cross-platform line-ending diff. PowerShell-generated file tests must explicitly select UTF-8 no BOM rather than inherit locale or redirection defaults.

Add a repository portability validator that checks tracked paths for Windows case collisions and invalid Win32 names, and rejects mixed line endings or any BOM in tracked text. Symlinks and unusually long paths are validated when introduced rather than prohibited in advance. The pre-change source-tree probe was clean: 144 tracked paths, all LF, no BOM, no tracked symlink, no case-fold collision or invalid Windows path, and the longest tracked relative path was 104 UTF-16 code units; `.gitattributes` and the future validator become additional tracked inputs.

#### PowerShell configuration, locale, and encoding

The Windows profile supports English and Simplified Chinese Windows through one deterministic PowerShell 7 execution configuration. Pi starts the tool with `-NoProfile`, so AKeel must not rely on a user's profile. The Windows composition must inject a bounded runtime setup that selects UTF-8 for console input/output, `$OutputEncoding`, supported file-writing cmdlets, and `$PSNativeCommandArgumentPassing = 'Standard'`. Source, fixtures, generated text, and captured artifacts use UTF-8 without BOM. This is a required modern contract, not a legacy compatibility preference. The setup must be applied and positively verified for every managed invocation; documentation or a user profile alone is not activation.

Use current PowerShell 7 behavior rather than legacy Windows PowerShell compatibility. `Standard` is the only supported native argument-passing mode for the Windows profile; `Windows` and `Legacy` modes are outside the support contract. A native executable that requires a compatibility mode does not silently change the profile or pass the Windows gate. Any English/Chinese difference that would require incompatible product behavior, configuration, or guarantees must be reported to the user with evidence before the support boundary is decided.

The shared locale matrix covers PowerShell cmdlet and native-process stdout/stderr, explicit `utf8NoBOM` file encoding, LF/no-BOM enforcement, Chinese and ASCII paths/content, localized diagnostics without exact-message coupling, Windows Terminal CJK input/IME, package loading, session persistence, and Context Pruner behavior. Other locale environments are outside the current validation matrix.

### Plan

1. Align the current Decisions, CONTEXT, README, and external-source record with the approved Windows profile while preserving the current Linux-only runtime claim.
2. Make repository build, package validation, documentation validation, and platform-neutral tests pass on a native Windows runner without changing product behavior.
3. Extract explicit platform ports for path evidence, filesystem control, process/session lifecycle, home/runtime roots, and platform composition; retain the Linux implementation behind those ports.
4. Implement and contract-test Windows Direct path admission and capability/credential/anti-tamper boundaries.
5. Port Artifact Exchange, Continuation Capsule cwd validation, temporary resources, and retention to native Windows evidence.
6. Implement the bounded PowerShell 7 Canonical lane and host composition; keep unsupported forms fail-closed.
7. Add repository portability gates and the shared English/Simplified Chinese PowerShell configuration and locale matrix, then extend Context Pruner and applicable Guidance to the Windows tool/result and runtime-path contracts.
8. Present any evidence that English and Chinese require incompatible behavior to the user for an explicit support-boundary decision.
9. Run native Herdr workflow validation only in the final acceptance phase, then validate packaged extensions on native Windows 11 and Linux, update user-facing installation and policy documentation, and clear this Task after durable records are complete.

### Acceptance Gates

- A real Windows 11 CI runner installs the packed packages and passes the platform-neutral suite plus Windows-specific path, ACL, reparse-point, lifecycle, Direct, PowerShell, and host-composition tests.
- The Windows package profile starts with PowerShell 7 positively identified and exposes no model `bash` tool; ordinary AKeel workflows complete without Bash.
- Windows path-policy tests run on local NTFS and cover case aliases, reserved/device forms, alternate streams, junction/reparse traversal, blocked descendants, credentials, capability assets, temporary roots, long-path behavior, and paths containing spaces and non-ASCII text.
- PowerShell tests cover the admitted subset and hard or opaque boundaries for dynamic invocation, nested shells, scripts, providers, pipelines, redirection, process launch, and destructive forms.
- The Windows composition injects and positively verifies the bounded UTF-8 no-BOM and `Standard` native argument-passing setup for every managed PowerShell invocation; it does not depend on a user profile or persistent shell state.
- Runtime tests prove Windows controlled-directory ownership/ACL checks, no-clobber artifact publication, process-liveness handling, cleanup, retention, cancellation, and open-file failure behavior.
- Repository portability validation proves deterministic LF text, no case-fold collision, no invalid Windows tracked path, and no BOM or mixed EOL in tracked text; symlink and long-path cases are tested when present.
- The shared modern PowerShell 7 configuration passes on English and Simplified Chinese Windows for cmdlet/native-process UTF-8, explicit `utf8NoBOM` file encoding, LF/no-BOM enforcement, ASCII/Chinese paths and content, localized diagnostics, IME, package loading and test-result projection. Any incompatible requirement is held for the user's explicit decision rather than resolved by silently splitting support.
- Native Herdr reserve→packet→bind→child PowerShell session→publish→collect and worktree/cwd behavior are checked last and do not block earlier core platform slices.
- Linux tests remain unchanged in meaning and pass without importing Windows semantics into the Linux compilation lane.
- README and CONTEXT make no Windows support claim before all gates pass; after release they describe exactly the verified profile and residual risks.

### Durable Update Checklist

- [ ] Windows composition owns and injects the bounded PowerShell 7 runtime configuration: UTF-8 no BOM and `Standard` native argument passing.
- [ ] Native Windows tests positively verify the configuration on every managed invocation without relying on user profiles or persistent shell state.
- [ ] `docs/decisions.md` and `CONTEXT.md` contain only the verified Windows contract and its residual boundaries.
- [ ] README documents Windows installation and support only after all acceptance gates pass.
- [ ] Clear T-0168 in the same completion change after durable records and user documentation are synchronized.

### Scope Boundary

The Windows profile is native Windows 11 with Windows Terminal and PowerShell 7. No other Windows terminal or Shell profile is part of this Task. Platform-independent dependency and language-runtime choices remain governed by their existing repository contracts and are not duplicated here.

## T-0169: 待创建
