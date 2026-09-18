---
name: doc-sync
description: Use after implementing features or refactoring, before declaring completion — verify all project docs for stale counts, broken references, and outdated architecture.
---

# Documentation Synchronization

After non-trivial code changes, synchronize documentation and Project Records within the same change set.

## When to Apply

Activate automatically after:
- Feature implementation (new capabilities, new modules);
- Refactoring (architecture changes, file renames);
- Adding or modifying rules, tests, or configurations;
- Any change altering behavior described by README, `CONTEXT.md`, `docs/candidates.md`, `docs/decisions.md`, or the active Task Record.

## Process

### Step 1: Identify Affected Docs

Scan the repository for documentation files whose content may be affected by the code change:
- Project guides, user docs, and README;
- Central project knowledge in `CONTEXT.md`;
- Authoritative record containers: `docs/candidates.md`, `docs/decisions.md`, `docs/task.md`, and any active `docs/task-*.md`.

### Step 2: Verify Each Against Code

For each identified doc, verify:

1. **Counts**: verify numeric statements against actual source counts. Prefer references or ranges over hardcoded counts that rot.
2. **Architecture**: diagrams and pipelines match actual code flow. Maintain standing structural topology and pipeline invariants per principles.md Quick Reference — CONTEXT.md Structure; do not append concrete CLI option lists, code identifiers, or skill workflows. If recent changes expand capability, summarize them into the architectural model instead of appending narrative changelogs.
3. **Commands**: all listed commands still exist and work as documented.
4. **References**: cross-references to other docs/files resolve; record IDs (`C-xxx`/`T-xxx`/`D-xxx`) cited in code comments resolve to live entries (per principles.md Project Records — Record Lifecycle). Run `grep -rnE 'D-[0-9]{3}' src tests` and resolve each hit against the `docs/decisions.md` headings; skip this check when the project has no record containers.
5. **Examples**: code examples work with current API; paths are portable — use relative paths or placeholders (`~`, `$HOME`) instead of machine-specific absolute paths.
6. **Record authority**: Candidate Records remain visibly non-binding; promoted content has one authoritative destination and no duplicate C source.
7. **Task lifecycle**: Task Record status matches reality; verified tasks are either cleared or clearly blocked on a durable documentation update.
8. **Slot invariant**: each container (`docs/candidates.md`, `docs/task.md`, `docs/decisions.md`) has exactly one trailing empty slot (per principles.md Next-ID slots).
9. **Decision format and lifecycle**: each present Decision follows principles.md Project Records — Decision Record Format; a superseded decision names its replacement and a retired decision names its destination (Negative Space or a boundary decision), then leaves the live register — otherwise complete the transition or flag the gap.
10. **Container slot check**: when the project uses standard `docs/candidates.md`, `docs/task.md`, or `docs/decisions.md` containers, call `akeel_validate_records` (or use Direct `find`/`grep` to locate the trailing `## X-0NN: 待创建` slot and Direct `read` only from that slot to end-of-file if the tool is unavailable) to verify slot placement, uniqueness, and prefix matching. If errors are reported (`ok: false`), fix the structural drift inline within the same change set; do not perform automated overwrites. Skip missing optional containers.
11. **Zero-loss editing**: merging, compressing, or pruning record content deletes only synonymous repetition — qualifiers, specific terms, enumerations, and terminology are meaning, not filler.

### Step 3: Update or Report

- Update stale documentation inline within the same commit.
- Flag unresolvable discrepancies with concrete evidence (for example, a Decision citing a removed module).

## Success Criteria

After applying this skill:
- Every doc count is verified or replaced with a stable reference;
- Architecture diagrams and flow descriptions reflect current code;
- All cross-references and cited record IDs resolve to live targets;
- Documentation contains no machine-specific local paths;
- Record edits preserve semantic zero-loss;
- Completed Task Records are cleared or have documented rationale;
- Candidate Records remain visibly non-binding, distinct from adopted work.
