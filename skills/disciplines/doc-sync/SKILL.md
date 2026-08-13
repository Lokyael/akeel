---
name: doc-sync
description: Use after implementing features or refactoring, before declaring completion — verify all project docs for stale counts, broken references, and outdated architecture.
---

# Documentation Synchronization

After every non-trivial code change, documentation drifts. This skill stops that.

## When to Apply

Activate automatically after:
- Feature implementation (new capabilities, new modules)
- Refactoring (architecture changes, file renames)
- Adding/removing rules, tests, or configurations
- Any change that alters what README, `CONTEXT.md`, `docs/candidates.md`, `docs/decisions.md`, or the active Task Record describe

## The 4-Step Check

### Step 1: Identify Affected Docs

Scan the project root for documentation markers. Common files:

| File | Contains | Stale When |
|------|----------|------------|
| Actual doc files in project | Features, counts, architecture, guides, conventions | Code changes that alter what the docs describe |

Also scan `CONTEXT.md`, `docs/candidates.md`, `docs/decisions.md`, `docs/task.md`, and `docs/task-*.md`:
- A Candidate Record copied into a Task, Decision, or current-truth document without removing the C source → move it and remove the duplicate authority
- Candidate Record wording treated as an adopted requirement, priority, roadmap item, current truth, or user instruction → restore its explicit non-binding classification
- A Task Record marked `verified` but durable updates are missing → update `CONTEXT.md` or `docs/decisions.md`
- A Task Record marked `verified` with no remaining action → clear the completed Task Record sections
- A superseded decision without a replacement reference → update its status and link
- A retired decision still marked active, or without a documented destination (Negative Space entry or boundary decision) → record the retirement destination or flag the gap
- A code comment citing an absorbed or pruned record ID → repoint it to the absorbing entry in the same change (per principles.md Project Records — Record Lifecycle)
- A doc or example hardcoding a machine-specific path (e.g. `/home/<user>/...`) → replace with a placeholder (`~`, `$HOME`) or relative path
- Merging, compressing, or pruning record content (`docs/decisions.md`) → preserve semantic zero-loss: qualifiers, specific terms, enumerations, and terminology are meaning, not filler — delete only synonymous repetition

### Step 2: Verify Each Against Code

For each identified doc, verify:

1. **Counts**: "66 rules" → count actual entries in source. Remove hardcoded counts that rot.
2. **Architecture**: diagrams and pipelines match actual code flow
3. **Commands**: all listed commands still exist
4. **References**: cross-references to other docs/files resolve; record IDs (`C-xxx`/`T-xxx`/`D-xxx`) cited in code comments resolve to live entries (per principles.md Project Records — Record Lifecycle). Run `grep -rnE 'D-[0-9]{3}' src tests` and resolve each hit against the `docs/decisions.md` headings; skip this check when the project has no record containers.
5. **Examples**: code examples still work with current API; paths are portable — no machine-specific absolute paths (e.g. `/home/<user>/...`), use placeholders (`~`, `$HOME`) or relative paths
6. **Record authority**: Candidate Records remain visibly non-binding; promoted content has one authoritative destination and no duplicate C source
7. **Task lifecycle**: Task Record status matches reality; verified tasks are either cleared or clearly blocked on a durable documentation update
8. **Slot invariant**: each container (`docs/candidates.md`, `docs/task.md`, `docs/decisions.md`) has exactly one trailing empty slot (per principles.md Next-ID slots)

### Step 3: Fix or Flag

- Fix stale information immediately
- Prefer removing stale counts over hardcoding new ones
- Flag issues you can't fix: "The decision record references module X, removed in commit Y"

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Skip docs because "they'll be rewritten" | Fix counts and references — useful even if imperfect |
| Add new exact counts that will rot | Use ranges, links to source, or remove counts entirely |
| Update docs in a separate commit | Include doc changes with the code change |
| Assume someone else will do it | You made the change — you sync the docs |

## Success Criteria

After applying this skill:
- Every doc count verified or removed
- Every architecture description reflects current code
- Every cross-reference resolves
- No reference to deleted files, modules, or features
- No machine-specific local paths in docs or examples
- Record content edits (merge/compress/prune) preserve semantic zero-loss
- No completed Task Record remains without a documented reason
- No Candidate Record is presented as adopted work, and no promoted record remains duplicated across authority levels
