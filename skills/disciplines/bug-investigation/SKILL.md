---
name: bug-investigation
description: Use when the user asks to investigate, track, or record a bug. Gather evidence, generate hypotheses, and produce a Task Record. For unreproducible bugs, invoke bug-diagnosis first.
---

# Investigate Bug

End-to-end bug investigation. Produces a bug Task Record that captures
everything needed to fix it.

## Process

### 1. Gather the Bug Report

Collect everything the user knows:
- What happened? (exact error message, wrong output, crash)
- What was expected?
- Steps to reproduce?
- When did it start? (recent changes?)
- Environment (OS, version, config)?

### 2. Check Recent Changes

```bash
git log --oneline -20
git log --since="7 days ago" --format="%h %s" --name-only
```

Look for changes that touch the area of the bug.

### 3. Reproduce the Bug

Create the smallest possible reproduction. Write it down as exact steps.

If the bug is intermittent, flaky, or hard to reproduce, invoke
`/skill:bug-diagnosis` to build a feedback loop, then return here.
If bug-diagnosis reports that loop construction failed, skip to Step 4
with the note that reproduction is unreliable.

If you can't reproduce and haven't invoked bug-diagnosis, document what
you tried — do not guess.

### 4. Gather Evidence

- Error logs, stack traces, screenshots
- Relevant code paths
- State of data before/after failure
- Working examples for comparison

For multi-component systems, also log what enters and exits each boundary (per `/skill:systematic-debugging` Phase 1).

### 5. Generate Hypotheses

If the bug area touches a library, framework, or dependency, check its
upstream first — known issues, fixed releases, or community workarounds
(per principles.md §5; use available web retrieval tools). Then
generate 3–5 ranked hypotheses about the likely area of the root cause.
If only one comes to mind, force at least one
alternative — the first plausible idea anchors.

For each hypothesis, use the format:
`[Hypothesis] — falsification test: [how to prove it wrong]`

Example:
`"Auth module returns null for expired tokens" — falsification test: call
/auth/verify with an unexpired token; if it still returns null, auth module
is not the cause.`

Show the ranked list to the user. They often know which to re-rank.

### 6. Record the Bug Task

Add a precise `T-xxx: <bug-topic>` section to `docs/task.md` (per principles.md Next-ID slots) — or the active
`docs/task-<topic>.md` file (consuming the T counter from `docs/task.md`):

```markdown
## T-001: [Bug Title]

**Kind:** bug
**Status:** draft
**Severity:** critical | high | medium | low
**Reported:** YYYY-MM-DD

### Description

[What happens and what should happen]

### Reproduction

1. [Step]
2. [Step]
3. [Observed vs Expected]

### Environment

- OS: ...
- Version: ...
- Branch: ...

### Evidence

[Logs, stack traces, screenshots]

### Investigation

#### Recent Changes
[Commits that may be related]

#### Affected Code
[Files and functions involved]

#### Hypotheses
1. [Hypothesis] — falsification test: [test]
2. [Hypothesis] — falsification test: [test]

### Root Cause

[To be filled by systematic-debugging]

### Fix

[To be filled by implement-work]
```

### 7. Handoff

After recording the Task Record, hand off to `/skill:systematic-debugging` for
root cause analysis.
