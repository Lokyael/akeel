---
name: bug-investigation
description: Investigate a bug by exploring the codebase to find root cause, then write a bug file with reproduction steps, evidence, and hypotheses. Use when the user reports a bug, something is broken but root cause is unknown, or to start the debugging workflow.
---

# Investigate Bug

End-to-end bug investigation. Produces a bug file that captures everything needed to fix it.

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

### 5. Write the Bug File

Save to `specs/bugs/BUG-<YYYY-MM-DD>-<slug>.md`:

```markdown
# [Bug Title]

**Status:** investigating
**Severity:** critical | high | medium | low
**Reported:** YYYY-MM-DD

## Description

[What happens and what should happen]

## Reproduction

1. [Step]
2. [Step]
3. [Observed vs Expected]

## Environment

- OS: ...
- Version: ...
- Branch: ...

## Evidence

[Logs, stack traces, screenshots]

## Investigation

### Recent Changes
[Commits that may be related]

### Affected Code
[Files and functions involved]

### Hypotheses
1. [Hypothesis] — falsification test: [test]
2. [Hypothesis] — falsification test: [test]

## Root Cause

[To be filled by diagnose-root]

## Fix

[To be filled by fix-bug]
```

### 6. Handoff

After writing the bug file: hand off to `systematic-debugging` for root cause analysis.
