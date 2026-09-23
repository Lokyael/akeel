# Tasks

> 活跃任务。验证完成后，提炼长期信息到 `docs/decisions.md` 或 `CONTEXT.md`，然后清空对应 Task Record 章节。

## T-0165: Align Pi development baseline and assess skill-loader coverage

- Kind: maintenance
- Status: in-progress
- Reversal surface: engineering

### Background & Goal

Align the repository's pinned Pi development dependencies with the latest published Pi release and determine whether the host integration tests meaningfully exercise Pi's native skill discovery and loading path.

### Requirements

- Update the root development pins for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` to the latest published release verified for this task, and update the lockfile accordingly.
- Preserve package peer dependency ranges, Node engine requirements, runtime package manifests, and product behavior.
- Inspect the existing host integration seams and Pi's skill resource-loading contract; report the concrete coverage gap and a suitable test design without implementing skill-loader test changes in this task.
- Run package validation, the Pi host integration test, and the full repository test suite against the updated dependency baseline.

### Design

Keep production package peer dependencies open (`*`) because Pi supplies its core host packages at runtime. Pin the repository's dev/test host packages exactly to the selected published version so the integration suite has a reproducible, current baseline. Assess skill loading through Pi's resource-loader/SDK path rather than inferring runtime discovery from manifest string checks.

### Plan

1. Verify the latest published Pi package versions and examine current skill-loader coverage; report the missing runtime assertion and proposed seam.
2. Update the two root development dependency pins and lockfile to the selected release.
3. Run focused Pi host/package validation and `npm test`; inspect the final diff for scope.

### Out of Scope

- **Skill-loader test implementation:** User requested assessment only; revisit after reviewing the proposed seam and test scope.
- **New host execution-surface policy, session-switch lifecycle changes, and prompt-injection redesign:** Deferred by the user; revisit only on explicit request.

## T-0166: 待创建
