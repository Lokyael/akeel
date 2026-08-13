---
name: bug-diagnosis
description: Use when the user reports a bug that is intermittent, flaky, or environment-specific — no reliable reproduction exists. Build a tight feedback loop before any investigation. For investigation and tracking, use bug-investigation.
---

# Build a Feedback Loop for Hard Bugs

If you have a tight pass/fail signal for the bug — one that goes red on *this*
bug — you will find the cause. Without one, staring at code won't save you.

## Ways to Construct a Loop (try in order)

1. **Failing test** at whatever seam reaches the bug
2. **Curl / HTTP script** against a running dev server
3. **CLI invocation** with fixture input, diffing stdout against known-good snapshot
4. **Headless browser script** (Playwright/Puppeteer)
5. **Replay captured trace** — replay saved payload through code path in isolation
6. **Throwaway harness** — minimal subset of the system exercising the bug path
7. **Property/fuzz loop** — 1000 random inputs, look for failure mode
8. **Bisection harness** — automate `git bisect run`
9. **Differential loop** — same input through old vs new version, diff outputs

## Tighten the Loop

Once you have *a* loop, tighten it:
- Make it faster (cache setup, skip unrelated init)
- Make the signal sharper (assert on specific symptom, not "didn't crash")
- Make it deterministic (pin time, seed RNG, isolate filesystem)
- **Minimise the scenario** — shrink inputs, callers, and config to the smallest
  set that still triggers the bug. This is about removing noise (e.g., cut
  100-line fixture to 3-line payload), not about sharper assertions. A smaller
  scenario shrinks the hypothesis space.

## Non-Deterministic Bugs

Goal: higher reproduction rate. Loop 100×, parallelise, add stress, inject sleeps.
A 50%-flake bug is debuggable; 1% is not — keep raising the rate.

## When You Genuinely Cannot Build a Loop

Stop and say so. List what you tried. Ask for: (a) access to reproducing
environment, (b) captured artifact, or (c) permission for temporary
instrumentation. Do **not** hypothesise without a loop.

When returning to the calling skill, explicitly state: "Feedback loop
construction failed — options: (a) access to reproducing environment,
(b) captured trace/log, or (c) permission for temporary instrumentation.
Proceeding with available evidence only."

## Completion

A tight loop is one command that:
- Drives the actual bug code path and asserts the **user's exact symptom**
- Is deterministic (same verdict every run)
- Is fast (seconds, not minutes)
- Is agent-runnable (unattended)

When the loop is built, hand off to `/skill:bug-investigation` to document the
bug, or `/skill:systematic-debugging` for root cause analysis if the bug is
already well-understood.
