---
name: bug-investigation
description: Use when the user reports a bug, something is broken but root cause is unknown, or to start the debugging workflow — explore the codebase, then record a Task Record with reproduction steps, evidence, and hypotheses.
---

# Investigate Bug

End-to-end bug investigation. Produces a bug Task Record that captures everything needed to fix it.

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

Create the smallest possible reproduction. Write it down as exact steps. If you can't reproduce, document what you tried — do not guess.

### 4. Gather Evidence

- Error logs, stack traces, screenshots
- Relevant code paths
- State of data before/after failure
- Working examples for comparison

### 5. Record the Bug Task

Add a precise `T-xxx: <bug-topic>` section to `docs/task.md` or the active `docs/task-<topic>.md` file:

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

### 6. Handoff

After recording the Task Record, hand off to `systematic-debugging` for root cause analysis.
