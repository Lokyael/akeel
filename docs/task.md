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

## T-0168: 待创建
