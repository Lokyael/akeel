---
name: doc-sync
description: After code changes, verify all project docs for stale info — outdated counts, broken references, mismatched architecture. Use after implementing features or refactoring, before declaring completion.
---

# Documentation Synchronization

After every non-trivial code change, documentation drifts. This skill stops that.

## When to Apply

Activate automatically after:
- Feature implementation (new capabilities, new modules)
- Refactoring (architecture changes, file renames)
- Adding/removing rules, tests, or configurations
- Any change that alters what README/USAGE/ADRs describe

## The 3-Step Check

### Step 1: Identify Affected Docs

Scan the project root for documentation markers. Common files:

| File | Contains | Stale When |
|------|----------|------------|
| Actual doc files in project | Features, counts, architecture, guides, conventions | Code changes that alter what the docs describe |

### Step 2: Verify Each Against Code

For each identified doc, verify:

1. **Counts**: "66 rules" → count actual entries in source. Remove hardcoded counts that rot.
2. **Architecture**: diagrams and pipelines match actual code flow
3. **Commands**: all listed commands still exist
4. **References**: cross-references to other docs/files resolve
5. **Examples**: code examples still work with current API

### Step 3: Fix or Flag

- Fix stale information immediately
- Prefer removing stale counts over hardcoding new ones
- Flag issues you can't fix: "The ADR references module X, removed in commit Y"

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
- Every architecture diagram reflects current code
- Every cross-reference resolves
- No reference to deleted files, modules, or features
