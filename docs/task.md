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

Establish and maintain a first-class native Windows 11 profile without weakening or conditionally rewriting the existing Linux profile. The Windows profile uses Windows Terminal and PowerShell Core `>=7.4 <8` throughout its supported human and model execution path. This record is the temporary authority for the transition and remains active until implementation, verification, user documentation, and durable architecture records are complete.

The current production Access Gate remains Linux-only. This Task defines the approved Windows destination and the gates that must pass before AKeel may claim Windows support.

### Requirements

- Support native Windows 11 as an independent platform profile; the supported profile runs directly on Windows 11 and does not route through a compatibility environment.
- Use Windows Terminal as the supported terminal and PowerShell Core `>=7.4 <8` (`pwsh.exe`) as the only model-facing Shell on Windows. The Shell constraint applies to Pi's host execution surface; PowerShell-launched external executables and helpers remain governed by Access Gate command/effect/path evidence.
- Require UTF-8 without BOM for Windows source, fixtures, generated text, PowerShell file output, and captured text artifacts. Prefer the modern cross-platform contract; legacy Windows PowerShell or old-tool compatibility is not a reason to add a BOM. PowerShell file operations and tests must select `utf8NoBOM` explicitly.
- Configure Pi's Windows model tool set explicitly around Direct tools and `powershell`; do not activate or document a Windows model `bash` tool and do not configure Pi `shellPath`. Pi `!` / `!!`, RPC `bash`, low-level SDK Bash calls, and third-party Bash backends are not part of the normal AKeel Windows workflow or its support claim; no additional host interception is required unless real usage demonstrates that configuration isolation is insufficient.
- Require PowerShell 7.4 or newer within major version 7 to be present and positively identified. Pi's fallback to Windows PowerShell does not satisfy the AKeel Windows profile; the selected executable is frozen for the session and shared by the syntax/evidence host and model-command executor.
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

The Windows composition does not trust settings alone as enforcement. It registers an AKeel-owned `powershell` replacement, verifies the final tool source and active set at session start, removes model `bash`, and keeps `bash` blocked even when Access Gate is off. The final Direct list remains subject to native path-contract verification for every tool. Git maintenance uses native `git.exe`; the exact Windows Git distribution is an environment choice, provided the required repository, worktree, credential, and package flows pass.

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

#### Platform runtime and composition

Select one platform composition exactly once when the extension runtime loads. The common authorization core does not inspect `process.platform`, parse native path strings, or call platform filesystem APIs. Linux and Windows each own host adaptation, native path evidence, Shell syntax, executable identity, runtime roots, filesystem control, and process lifecycle; they share only sealed Canonical/Admission facades, command classes, effects, policy modes, verdicts, and display contracts.

Introduce a first-party support package with no `pi.extensions` surface:

```text
packages/platform-runtime/
  src/contracts/       # platform-tagged path, private-filesystem, process and runtime-root ports
  src/linux/           # current Linux pathname, UID/GID/mode and lifecycle behavior
  src/windows/         # bounded client and protocol for the Windows host service
  native/windows/      # managed Win32 evidence assembly and reproducible build inputs
```

The three user-installable capability packages remain Guidance, Access Gate, and Context Pruner. `akeel-platform-runtime` is an internal runtime dependency used by Guidance and Access Gate so Windows evidence and controlled-resource semantics have one implementation instead of cross-package copies.

#### Windows initialization and model Shell ownership

The Windows composition registers an AKeel-owned `powershell` tool with the same name as Pi's built-in and owns its execution. At `session_start` it resolves only `pwsh.exe`, runs a positive handshake, and freezes a `VerifiedPowerShellExecutable` after confirming PowerShell Core `>=7.4 <8`, executable identity, FullLanguage mode, and the supported argument-passing capability. It then verifies through Pi tool source metadata that the final `powershell` definition is AKeel-owned, removes model `bash`, activates the verified PowerShell tool, and verifies each admitted Direct tool remains the expected Pi built-in. A missing/mismatched tool or executable leaves the Windows profile uninitialized and all governed surfaces fail closed; `bash` remains blocked even when Access Gate is off.

Every governed PowerShell call is approved against the original model command and receives a single-use execution ticket bound to tool-call ID, command digest and workspace identity. The AKeel executor consumes that exact ticket before spawning the frozen executable. This prevents a post-decision input mutation from becoming the executed command. User/RPC Bash and arbitrary third-party backends remain outside the product workflow rather than being relabeled as governed PowerShell.

The executor prepends one fixed, trusted setup in the same fresh `pwsh.exe` process, before the already-compiled model command. The setup positively checks the version/profile and sets UTF-8 no BOM console/file defaults plus `$PSNativeCommandArgumentPassing = 'Standard'`; it re-reads those values and stops before the model command if any assertion fails. The model command cannot reset the setup because assignments, dynamic invocation and nested shells are outside the admitted subset.

#### Windows evidence host

A session-owned Windows host service supplies evidence without executing model commands:

```text
TypeScript WindowsHostClient
  └── bounded versioned JSONL over private stdio
       └── no-profile/non-interactive verified pwsh.exe host
            ├── System.Management.Automation.Language.Parser
            └── AKeel.Windows.Runtime.dll (AnyCPU Win32 P/Invoke)
```

The managed assembly provides handle-based path, volume, file-ID, reparse, owner/SID/DACL, process-start-time and atomic-filesystem operations that Node does not expose. The PowerShell host provides the official parser available in the required runtime. It returns only bounded protocol DTOs; arbitrary AST graphs, localized diagnostics and executable suggestions never cross the boundary. Request-size, response-size, time, queue and traversal budgets are fixed. Protocol mismatch, timeout, host exit or malformed evidence fails closed. The host starts from `session_start`, is reference-counted/idempotently disposed, and is never started by package discovery or archive validation alone.

Path and filesystem evidence acquisition becomes asynchronous. Authorization remains a synchronous pure projection after all evidence has been issued; preserving the current synchronous compiler is not a reason to use repeated `spawnSync` probes.

#### Opaque path proof and root catalog

Replace public canonical path strings with a sealed `PlatformPathProof`. It carries a platform-domain token, original literal for display, canonical display location, traversed object identities, optional terminal `(volume, file-id, link-count)` identity, canonical basename/components, path-risk flags and relations to a bounded session `RootCatalog`. It does not expose a cross-platform pathname comparer.

The catalog is compiled once after the platform starts and contains stable IDs for the access root, staging/runtime roots, credential roots, capability roots, and the union of every preset's allowed roots, blocked roots and blocked paths. One path resolution computes `equal`, `descendant`, `ancestor` and `traversed` relations to those IDs. Admission carries only the sealed proof and relation IDs; Mandatory Boundary and Policy perform set/relation operations and never rebuild a path from request text. Recursive blocked-descendant checks use the `ancestor` relation. A policy snapshot or persisted workspace identity from another platform domain is invalid.

The Windows v1 path behavior is closed:

| Input/evidence class | Windows v1 behavior |
|---|---|
| relative and drive-absolute filesystem paths | admit for evidence; resolve relative paths against fixed session cwd |
| `/` or `\\` separators | accept while preserving literal display and issuing one canonical identity |
| UNC, drive-relative, rooted-without-drive, device and namespace input | reject |
| ADS, reserved device names, control characters, trailing space/period | reject |
| local non-NTFS volume or case-sensitive NTFS directory | reject |
| symbolic link/junction with known supported tag | bounded traversal with lexical and final evidence |
| unknown reparse tag, loop or traversal-budget overflow | reject |
| 8.3 alias | admit only when final long-name and object evidence are complete |
| existing hard-linked file | record file identity and link count; any mutation of a multi-link file is hard-denied in v1 |
| missing leaf | prove the deepest existing ancestor and validate the remaining lexical components |
| long path | use internal namespace-safe evidence; each executing tool must still pass its own native long-path contract |

Input namespace forms are rejected even though the private Windows host may use namespace-safe paths internally. Existing credential artifacts are matched by object identity as well as canonical location. The conservative multi-link mutation rule prevents an out-of-root hard link from becoming an anti-tamper bypass without enumerating an installed capability tree. The gate retains its documented TOCTOU limitation: evidence is authoritative for the decision snapshot but no file descriptor is passed to Pi's later Direct operation.

#### PowerShell Canonical lane

Use `System.Management.Automation.Language.Parser.ParseInput` in the evidence host and project its result to a bounded `PowerShellSyntaxIR`. The frontend accepts only AST node kinds whose full invocation, literal arguments, parameters, source extents and redirections are represented; it never executes command discovery or serializes arbitrary AST objects. TypeScript semantic analyzers consume this IR.

The initial admitted language is one simple command with fixed literal arguments. Double-quoted text is literal only when the AST reports no interpolation. The lane supports a small registry of module-qualified filesystem inspection cmdlets using `-LiteralPath`, plus verified external applications required for ordinary Git, Node, npm, package/build and final Herdr workflows. Cross-platform CLI analyzers consume a new platform-neutral `ProgramInvocation` only when the external CLI contract is genuinely shared; GNU utilities, Bash flow and `/dev/null` remain Linux-private, while cmdlets, providers, Windows shims and PowerShell language forms remain Windows-private.

Pipelines, redirections, compound statements, assignments, variables, wildcard paths, aliases, functions, providers, invocation operators, dot sourcing, script blocks, subexpressions, `.ps1`, unknown `.cmd`/`.bat`, `Start-Process`, nested shells and destructive cmdlets are v1 rejection cases. Their acceptance tests prove stable fail-closed behavior, not support. Exact known `.cmd` shims such as the verified npm entry may be admitted only after the `Standard` argument-passing tracer and full option contract pass. An exact unknown `.exe` may reach the existing `commands.opaque` axis, but opaque approval still provides no filesystem, network or descendant-process confinement.

#### Windows runtime resources

The runtime authority derives a platform root from local user state rather than `/tmp`; the Windows target is a verified local-NTFS `%LOCALAPPDATA%/AKeel/runtime` with separate `sessions/` and `runs/` ownership. It creates a protected DACL owned by the current user SID, grants only that SID and `SYSTEM` full control, disables inheritance, rejects a reparse root, and verifies the exact descriptor whenever an existing root is adopted. This closed template replaces generic attempts to interpret arbitrary safe DACLs.

Session locks store PID and process creation time, and liveness requires both to match so PID reuse cannot authorize retention. Access-denied/uncertain liveness is treated as live and retained. Artifact publication creates a no-clobber temporary file in the destination directory, writes UTF-8 no BOM, flushes it, performs same-volume no-replace/write-through rename, and publishes the receipt last with the same protocol. Sharing violations, antivirus/indexer interference and cleanup failures never produce success; exact residue is retained for bounded retry/retention. Session Handoff remains entirely in Pi entries, while persisted cwd/receipt values include the originating platform and are revalidated on resume.

Guidance consumes exact role paths returned by Artifact Exchange instead of spelling a physical runtime root. Skills do not mandate `xdg-open` or `Start-Process`; when no host viewer exists they report the returned path. Context Pruner uses separate Bash and PowerShell positive recognizers and only projects an independent supported test command/result whose runner evidence is complete.

#### Platform isolation, repository portability and locale

- Linux and Windows use separate checkout/index, dependencies, Pi directories, policies, credentials, runtime resources, caches and generated artifacts; only Git history crosses the boundary.
- Absolute policy strings are decoded asynchronously by the active path authority into platform-tagged root IDs. Templates may be shared; resolved snapshots may not.
- CI/cache identity includes OS, architecture, Node, PowerShell/host-runtime version and lockfile identity.
- Root `.gitattributes` fixes LF. A tracked-path validator reads the Git index, rejects invalid UTF-8 names, Windows-invalid components, conservative Unicode case-fold collisions, BOM and mixed/CR line endings; binary assets must remain explicitly classified.
- Source, fixture, generated text, PowerShell output and captured artifacts use UTF-8 no BOM. `Standard` is the only native argument-passing mode; `Windows` and `Legacy` do not form compatibility fallbacks.
- Automated culture tests cover English and Simplified Chinese process culture, encoding, paths/content and non-message-coupled diagnostics. Release evidence uses separate ephemeral native Windows 11 x64 environments for en-US and zh-CN. Windows Terminal rendering, IME, hardware cursor and shortcuts are human release checks, not headless CI claims.
- A hosted Windows runner is an early smoke/contract surface, not a substitute for the native Windows 11 release runners. Any English/Chinese behavioral incompatibility is returned to the user before changing the single product contract.

### Plan

1. **Fail-closed Windows bootstrap implementation** — implement the minimum product adaptation needed to make the host assumptions testable: one-time platform selection, an AKeel-owned same-name `powershell` replacement, final tool source/active-set inspection, exact PowerShell Core `>=7.4 <8` resolution and handshake, the single-use execution-ticket primitive, and a bounded executor seam. Until the later Canonical/Admission slices can issue production tickets, the replacement must reject ordinary model PowerShell calls; fixed tracer vectors may reach the executor only through the native contract-test harness and must not create a runtime test mode or policy bypass. This source and its platform-neutral tests may be authored outside Windows, but that does not satisfy the native gate.
2. **Native Windows bootstrap tracer acceptance** — in a separate native Windows 11 checkout, pack and install the bootstrap, then prove same-name replacement ownership, final tool metadata, exact executable identity, fixed setup verification, missing/replayed/mutated ticket rejection before spawn, no model `bash`, and `Standard` behavior for fixed `git.exe`, `node.exe`, `npm.cmd` and required-shim test vectors. This evidence validates the host seam, not general Windows support. Stop and return incompatible evidence to the user before broader platform migration.
3. **Platform runtime foundation** — add the non-Pi support package, contracts, reproducible managed helper, bounded Windows host protocol, Linux adapters and package/archive loading tests.
4. **Linux parity migration** — move current path, runtime-root, process and controlled-filesystem behavior behind the new contracts; make evidence acquisition async; introduce opaque path proof/root catalogs; retain all Linux/Bash behavior and full-suite meaning.
5. **Windows Direct and policy path admission** — implement the closed native-NTFS path matrix, policy root decode, case/reparse/file-ID evidence, three-domain credential/capability/workspace rules and Direct-tool source/path contracts.
6. **Windows runtime resources** — implement protected DACL roots, session lifecycle/retention, PID-start-time locks, atomic no-clobber publication, sharing/open-file failure behavior, platform-tagged Artifact Owner and Continuation Capsule identity.
7. **PowerShell Canonical and executor integration** — implement official-AST syntax projection, v1 rejection grammar, cmdlet/external registries, cross-platform `ProgramInvocation` and literal display/approval, then connect successful authorization to production ticket issuance and the already-proven executor. Do not remove the bootstrap guard merely because native tracer vectors passed.
8. **Repository, Context Pruner and Guidance portability** — add the tracked-file gate, PowerShell positive test projection, role-based runtime paths and platform-neutral viewer/Herdr instructions without weakening Prompt Surface rules.
9. **CI and locale gates** — split platform-neutral, Linux-contract and Windows-contract suites; run hosted smoke plus native Windows 11 en-US/zh-CN packaged acceptance; record terminal/IME checks separately and present any incompatible locale requirement to the user.
10. **Final workflow and release** — only after core gates stabilize, validate native Herdr reserve→packet→bind→PowerShell child→publish→collect and worktree cleanup, rerun packaged Linux/Windows suites, update user installation/policy/residual-risk documentation, complete durable records and clear this Task.

### Acceptance Gates

- Hosted Windows smoke passes, and separate ephemeral native Windows 11 x64 en-US and zh-CN release runners install the packed packages and pass the platform-neutral suite plus Windows-specific path, ACL, reparse-point, lifecycle, Direct, PowerShell and host-composition tests; a Windows Server hosted runner alone is not release evidence.
- During migration, the bootstrap replacement rejects ordinary model PowerShell execution until the complete Canonical/Admission path issues production tickets; native tracer vectors do not introduce a packaged runtime test mode or bypass.
- The Windows package profile starts with an AKeel-owned replacement tool backed by a positively identified PowerShell Core `>=7.4 <8`, verifies supported Direct tool sources, exposes no model `bash`, and ordinary AKeel workflows complete without Bash.
- Every governed PowerShell execution consumes a single-use ticket bound to the approved tool-call ID, command digest and workspace identity; a missing, replayed or post-decision-mutated ticket fails before spawn.
- Windows path-policy tests run on local NTFS and prove the closed v1 behavior matrix for relative/drive-absolute paths, rejected UNC/namespace/device/drive-relative/rooted-without-drive/ADS forms, case aliases, reserved names, case-sensitive directories, junction/reparse traversal, 8.3 aliases, hard-link mutation, missing leaves, blocked descendants, credentials, capability assets, runtime roots, long paths, spaces and non-ASCII text.
- PowerShell tests use the official parser projection and cover the admitted single-command literal subset plus stable rejection or opaque boundaries for aliases, assignments, variables, dynamic invocation, nested shells, scripts, providers, pipelines, redirection, process launch and destructive forms.
- The Windows composition and evidence host use the same frozen `pwsh.exe`; every model invocation injects and positively verifies the bounded UTF-8 no-BOM and `Standard` native argument-passing setup before the user command and does not depend on a user profile or persistent shell state.
- Runtime tests prove exact protected-DACL ownership, reparse-root rejection, PID-plus-start-time liveness, same-volume flush/no-replace publication with receipt-last recovery, cleanup, retention, cancellation, sharing violations and open-file failure behavior.
- Repository portability validation proves deterministic LF text, no case-fold collision, no invalid Windows tracked path, and no BOM or mixed EOL in tracked text; symlink and long-path cases are tested when present.
- The shared modern PowerShell Core `>=7.4 <8` configuration passes on native en-US and zh-CN Windows 11 for cmdlet/native-process UTF-8, explicit `utf8NoBOM` file encoding, LF/no-BOM enforcement, ASCII/Chinese paths and content, diagnostics without exact localized-message coupling, package loading and test-result projection. Windows Terminal/IME/font/cursor/shortcut behavior has separate human release evidence. Any incompatible product requirement is held for the user's explicit decision rather than resolved by silently splitting support.
- Native Herdr reserve→packet→bind→child PowerShell session→publish→collect and worktree/cwd behavior are checked last and do not block earlier core platform slices.
- Linux tests remain unchanged in meaning and pass without importing Windows semantics into the Linux compilation lane.
- README and CONTEXT make no Windows support claim before all gates pass; after release they describe exactly the verified profile and residual risks.

### Durable Update Checklist

- [ ] Windows composition owns the AKeel `powershell` replacement, frozen PowerShell Core identity, execution-ticket boundary and bounded UTF-8 no-BOM/`Standard` runtime configuration.
- [ ] Native Windows tests positively verify tool source, executable identity, ticket consumption and runtime configuration on every managed invocation without relying on user profiles or persistent shell state.
- [ ] The internal platform-runtime package, Windows host service, managed helper and package dependency/release mapping are documented and validated from packed installs.
- [ ] `docs/decisions.md` and `CONTEXT.md` contain only the verified Windows contract and its residual boundaries.
- [ ] README documents Windows installation and support only after all acceptance gates pass.
- [ ] Clear T-0168 in the same completion change after durable records and user documentation are synchronized.

### Scope Boundary

The Windows profile is native Windows 11 with Windows Terminal and PowerShell Core `>=7.4 <8`. No other Windows terminal or Shell profile is part of this Task. Platform-independent dependency and language-runtime choices remain governed by their existing repository contracts and are not duplicated here.

## T-0169: 待创建
