---
name: fix-validation
description: 'Use after fixing a bug or implementing a feature, before code-review — prove the fix works with fresh evidence: re-run failing test, full suite, check regressions.'
---

# Validate Fix

> **HARD GATE** — No fix is "done" until proven with fresh evidence.

## Process

### 1. Re-run the Failing Test

Run the exact test that was failing before the fix:

```bash
npm test path/to/failing-test.test.ts
```

Expected: PASS. If it fails, the fix is incomplete. Return to debugging.

### 2. Run the Full Test Suite

The fix might have broken something else:

```bash
npm test
```

Expected: All tests pass. If any fail, fix the regression before proceeding.

### 3. Run Build and Lint

```bash
npm run build   # or appropriate build command
npm run lint    # or appropriate lint command
```

Expected: Exit 0 for both. No new warnings.

### 4. Manual Verification (if applicable)

If the fix touches UI or behaviour visible to a human, verify manually:
- Does the original bug no longer reproduce?
- Does the new behaviour match the Task Record requirements?
- Are edge cases handled correctly?

### 5. Git Status Check

```bash
git status --short
git diff --stat
```

Confirm: only the files you intended to change are modified. No stray files.

## Verification Checklist

- [ ] Original failing test passes
- [ ] Full test suite passes (0 failures)
- [ ] Build succeeds (exit 0)
- [ ] Lint clean (0 errors)
- [ ] No unintended files changed
- [ ] Bug no longer reproduces manually (if applicable)

## If Validation Fails

| Symptom | Action |
|---------|--------|
| Original test still fails | Fix is incomplete — return to debugging |
| Other tests fail | Fix introduced a regression — fix regression |
| Build fails | Fix broke compilation — restore build |
| Lint fails | Fix introduced style violations — fix style |
| Bug still reproduces | Fix didn't address root cause — return to systematic-debugging |

## Handoff

After all checks pass: ready for `code-review`.
