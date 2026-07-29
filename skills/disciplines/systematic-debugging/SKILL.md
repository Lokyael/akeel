---
name: systematic-debugging
description: Use when performing root cause analysis of any technical issue. 4-phase from evidence to fix. Works standalone, or after bug-investigation. If the bug is intermittent, flaky, or cannot be reproduced, use bug-diagnosis first.
---

# Systematic Debugging

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## Before You Start

If a bug-investigation Task Record exists, start from its evidence and
hypotheses. Otherwise, gather evidence from scratch.

## When to Use

Use for ANY technical issue: test failures, bugs, unexpected behavior,
performance problems, build failures, integration issues.

**Use ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work

## The Four Phases

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully** — Don't skip. They often contain the exact solution.
2. **Reproduce Consistently** — Can you trigger it reliably? What are exact steps?
   If the bug is intermittent or flaky, pause and invoke `/skill:bug-diagnosis`
   to build a feedback loop first, then return here.
3. **Check Recent Changes** — Git diff, recent commits, new dependencies, config changes.
4. **Gather Evidence in Multi-Component Systems** — For each boundary, log what enters and exits.
5. **Trace Data Flow** — Where does the bad value originate? Keep tracing up to the source.

### Phase 2: Pattern Analysis

Find the pattern before fixing:

1. **Find Working Examples** — Locate similar working code in same codebase.
2. **Compare Against References** — Read reference implementation completely. Don't skim.
3. **Identify Differences** — List every difference, however small. Don't assume "that can't matter."
4. **Understand Dependencies** — What other components does this need? What assumptions?

### Phase 3: Hypothesis and Testing

Scientific method:

1. **Select or Form Hypothesis:**
   - If a Task Record exists with ranked hypotheses: select the most promising
     one. Restate it as a testable prediction: "If [hypothesis] is correct, then
     [specific change] will [observable effect]."
   - If no Task Record exists: form a single hypothesis based on available
     evidence. Before settling, ask: is this the only plausible explanation?
     If yes, force at least one alternative. The first idea anchors.
2. **Test Minimally** — Smallest possible change to test hypothesis. One variable
   at a time. Prefer debugger/REPL over logs. Tag any debug log with a unique
   prefix like `[DEBUG-a4f2]` for cleanup later.
3. **Verify Before Continuing** — Did it work? Yes → Phase 4. No → Form NEW hypothesis.
4. **When You Don't Know** — Say "I don't understand X." Don't pretend.

### Phase 4: Implementation

Fix the root cause, not the symptom.

**Before writing the fix, verify:** can you write a failing test for this bug?
If no testable seam exists after trying at least 2 approaches, stop. That IS
the finding — the architecture prevents locking down this bug. Hand off to
`/skill:improve-architecture`.

If a seam exists:

1. **Create Failing Test** — Simplest reproduction. Automated if possible.
2. **Implement Single Fix** — Address root cause. ONE change. No "while I'm here."
3. **Verify Fix** — Test passes? No other tests broken? If yes, continue to step 4.
   Do NOT declare done yet.
4. **Clean Up:**
   - Remove all `[DEBUG-...]` instrumentation (`grep` the prefix to confirm zero matches)
   - Delete throwaway prototypes and harnesses
   - For full verification: `/skill:fix-validation`
   - For broader cleanup: `/skill:code-cleanup`
5. **Post-Mortem** — Ask: what would have prevented this bug? If the answer is
   architectural, hand off to `/skill:improve-architecture`.
6. **If Fix Doesn't Work** — STOP. Count: How many fixes tried?
   - If < 3: Return to Phase 1 with new information.
   - **If ≥ 3: STOP and question the architecture.** Is this pattern fundamentally
     sound? Discuss with your human partner before attempting more fixes.
     This is NOT a failed hypothesis — this is a wrong architecture.

## Red Flags — STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "One more fix attempt" (when already tried 2+)
- Each fix reveals new problem in different place

**ALL mean: STOP. Return to Phase 1.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. |
| "Emergency, no time for process" | Systematic is FASTER than guess-and-check thrashing. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| 1. Root Cause | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare | Identify differences |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new hypothesis |
| 4. Implementation | Create test, fix, verify, clean up, post-mortem | Bug resolved, tests pass, cleanup done |
