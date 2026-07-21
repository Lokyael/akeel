---
name: code-review
description: 'Use when the user wants to review a branch, a PR, task-in-progress changes, or asks to "review since X" — two-axis parallel review: Standards (conventions?) and Requirements (expected behavior?).'
---

# Code Review

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Requirements** — does the code faithfully implement the originating issue, expected behavior, or Task Record?

Both axes run as **parallel analyses** so they don't pollute each other's context, then results are aggregated.

## Process

### 1. Pin the Fixed Point

Capture the diff: `git diff <fixed-point>...HEAD` (three-dot for merge-base).
Confirm the fixed point resolves and the diff is non-empty.

### 2. Identify the Task Record

Look for the originating Task Record:
1. Issue references in commit messages (`#123`, `Closes #45`)
2. A path the user passed as an argument
3. A matching Task Record in `docs/task.md` or `docs/task-<topic>.md`
4. If nothing is found, ask. If there is no Task Record, the Requirements axis reports "no requirements source available."

### 3. Identify Standards Sources

Anything documenting how code should be written: `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `CONVENTIONS.md`, etc.

On top of whatever the repo documents, apply the **smell baseline** — a fixed set of Fowler code smells (*Refactoring*, ch.3):

| Smell | What | Fix |
|-------|------|-----|
| **Mysterious Name** | Name doesn't reveal what it does | Rename |
| **Duplicated Code** | Same logic shape in multiple hunks | Extract shared shape |
| **Feature Envy** | Method reaches into another object's data more than its own | Move method |
| **Data Clumps** | Same fields keep travelling together | Bundle into one type |
| **Primitive Obsession** | Primitive standing in for domain concept | Create small type |
| **Speculative Generality** | Abstraction for needs the spec doesn't have | Delete, inline |
| **Message Chains** | Long `a.b().c().d()` navigation | Hide behind one method |
| **Middle Man** | Class/function that mostly delegates | Cut it, call directly |

**Rules:**
- The repo's documented standards override the baseline
- Each smell is a heuristic ("possible Feature Envy"), never a hard violation
- Skip anything tooling already enforces

### 4. Run Both Axes

**Standards review** — per file/hunk:
- (a) Every place the diff violates a documented standard — cite the standard
- (b) Any baseline smell spotted — name it and quote the hunk

**Requirements review** — against the Task Record:
- (a) Requirements asked for that are missing or partial
- (b) Behaviour in the diff that wasn't asked for (scope creep)
- (c) Requirements that look implemented but the implementation looks wrong — quote the Task Record line

### 5. Aggregate

Present under `## Standards` and `## Requirements` headings. Do **not** merge or rerank — the two axes are deliberately separate.

End with: total findings per axis, and the worst issue within each axis (if any).

## Why Two Axes

A change can pass one axis and fail the other:
- Code that follows every standard but implements the wrong thing → **Standards pass, Requirements fail**
- Code that does exactly what the issue asked but breaks conventions → **Requirements pass, Standards fail**

Reporting them separately stops one from masking the other.
