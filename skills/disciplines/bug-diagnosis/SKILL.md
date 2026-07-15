---
name: bug-diagnosis
description: Build a tight feedback loop for hard bugs and performance regressions before investigating. Use when the user says "diagnose", "debug this", or reports something broken/throwing/failing/slow. Distinct from systematic-debugging which focuses on root cause analysis; this skill focuses on constructing testable feedback loops for hard or intermittent bugs.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

## Phase 1 — Build a Feedback Loop

**This is the skill.** If you have a tight pass/fail signal for the bug — one that goes red on *this* bug — you will find the cause. Without one, staring at code won't save you.

### Ways to Construct One (try in order)

1. **Failing test** at whatever seam reaches the bug
2. **Curl / HTTP script** against a running dev server
3. **CLI invocation** with fixture input, diffing stdout against known-good snapshot
4. **Headless browser script** (Playwright/Puppeteer)
5. **Replay captured trace** — replay saved payload through code path in isolation
6. **Throwaway harness** — minimal subset of the system exercising the bug path
7. **Property/fuzz loop** — 1000 random inputs, look for failure mode
8. **Bisection harness** — automate `git bisect run`
9. **Differential loop** — same input through old vs new version, diff outputs

### Tighten the Loop

Once you have *a* loop, tighten it:
- Make it faster (cache setup, skip unrelated init)
- Make the signal sharper (assert on specific symptom, not "didn't crash")
- Make it deterministic (pin time, seed RNG, isolate filesystem)

### Non-Deterministic Bugs

Goal: higher reproduction rate. Loop 100×, parallelise, add stress, inject sleeps.
A 50%-flake bug is debuggable; 1% is not — keep raising the rate.

### When You Genuinely Cannot Build a Loop

Stop and say so. List what you tried. Ask for: (a) access to reproducing environment, (b) captured artifact, or (c) permission for temporary instrumentation. Do **not** hypothesise without a loop.

### Completion: A Tight Loop That Goes Red

Phase 1 is done when you can name **one command** that:
- Drives the actual bug code path and asserts the **user's exact symptom**
- Is deterministic (same verdict every run)
- Is fast (seconds, not minutes)
- Is agent-runnable (unattended)

## Phase 2 — Reproduce + Minimise

Run the loop. Watch it go red. Then minimise: shrink to the smallest scenario that still goes red. Cut inputs, callers, config one at a time.

Why: a minimal repro shrinks the hypothesis space and becomes the clean regression test.

## Phase 3 — Hypothesise

Generate **3–5 ranked hypotheses** before testing any. Single-hypothesis generation anchors on the first plausible idea.

Format: "If `<X>` is the cause, then `<changing Y>` will make the bug disappear / `<changing Z>` will make it worse."

Show the ranked list to the user. They often know which to re-rank.

## Phase 4 — Instrument

Each probe maps to a specific prediction from Phase 3. Change one variable at a time. Use debugger/REPL over logs. Tag every debug log with unique prefix `[DEBUG-a4f2]` for cleanup later.

## Phase 5 — Fix + Regression Test

Write the regression test **before the fix** — but only if there's a correct seam.

If no correct seam exists, **that itself is the finding.** Note it. The architecture is preventing the bug from being locked down.

## Phase 6 — Cleanup + Post-Mortem

- [ ] Original repro no longer reproduces
- [ ] Regression test passes
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway prototypes deleted
- [ ] Root cause stated in commit/PR message

**Then ask: what would have prevented this bug?** If architectural change, hand off to `/skill:improve-architecture`.
