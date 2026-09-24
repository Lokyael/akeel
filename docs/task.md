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

## T-0167: Separate live Git inspection from read-only child review

- Kind: bug
- Status: in-progress
- Reversal surface: engineering

### Background & Goal

Raw Git repository inspection is not uniformly read-only: `git status` may invoke a configured fsmonitor helper and refresh the index, while patch-producing `diff`/`log`/`show`/`rev-list` forms may invoke configured external diff or text-conversion helpers. Preserve created-agent repository awareness without granting read-only children an undeclared execution path by separating immutable Owner-captured Git state from live worktree inspection.

### Requirements

- Mark helper-sensitive live Git inspections as opaque so built-in `review`, `guided`, and `develop` apply deny, approval, and allow respectively; model `git status` as a potential repository metadata write while preserving mandatory path and helper boundaries.
- Keep bounded metadata-only Git queries that do not use the identified helper surfaces available through their existing inspect policy.
- Require read-only Herdr children to consume the exact Git status, diffs, untracked inventory, refs, and OIDs supplied in their immutable Owner packet instead of re-reading live Git state; keep modifying children in isolated worktrees under their effective policy.
- Preserve fixed Review Surface and staleness checks, update D-067 and user documentation to the corrected Git risk model, and pass focused plus full validation.

### Design

The Git analyzer retains the existing closed option contracts and path extraction, but adds an explicit helper-sensitive inspect set. Those commands remain inspect-class operations for user intent while carrying `opaque`; status also carries `write` because Git documents optional index refresh as a side effect. The Policy Kernel already combines command class, path effects, and opaque mode, so no new policy axis is introduced. Herdr and review instructions make the Owner packet the read-only child authority for Git state; they do not add a Git execution broker or teach the child a shell workaround.

### Plan

1. Add failing semantic and policy tests for helper-sensitive Git classification and preset behavior, then update the Git analyzer.
2. Update Herdr/review packet contracts and their structural tests so read-only children use captured Git state and do not execute live Git.
3. Revise D-067, README, and current architecture text to describe the corrected boundary without weakening existing hard-deny helper/transport rules.
4. Run focused Access Gate and skill validation, TypeScript checking, and the full repository suite; review and clear the Task with durable updates.

### Out of Scope

- **Dedicated live read-only Git broker:** This task uses immutable Owner packets for read-only children and existing opaque policy for live inspection. Revisit when a read-only child has a demonstrated need to refresh Git state after creation.
- **OS sandboxing or complete Git configuration isolation:** Access Gate still does not sandbox Git or eliminate filesystem TOCTOU. Revisit only with a separate execution-broker decision.
- **Child policy inheritance:** This task does not add delegated preset propagation or capability clamping. Revisit through the existing delegated-child policy boundary when that feature is explicitly adopted.

## T-0168: 待创建
