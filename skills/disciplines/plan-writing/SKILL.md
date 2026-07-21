---
name: plan-writing
description: Use when you have requirements for a multi-step task, before touching code — bite-sized tasks (2-5 min each), exact file paths, complete code in every step.
---

# Writing Plans

Write comprehensive implementation plans assuming the engineer has zero context and questionable taste. Document everything: which files to touch, code, testing, verification. DRY. YAGNI. TDD. Frequent commits.

**Save plans to:** Add a `Kind: feature|refactor|maintenance` Task Record to `docs/task.md`. Use `docs/task-<topic>.md` only for genuinely independent concurrent tasks.

## Plan Header

Every Task Record MUST include:

```markdown
## T-001: [Feature Name]

**Kind:** feature
**Status:** draft
**Goal:** [One sentence]

### Architecture

[2-3 sentences about approach]

### Out of Scope

(per principles.md §7 — what + why not now + revisit when. Omit if nothing.)
```

Status transitions and cleanup: per principles.md Quick Reference — Task Lifecycle.

## Global Constraints

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a reviewer's gate. Each task ends with an independently testable deliverable. Fold setup, configuration, and documentation steps into the task whose deliverable needs them.

## Bite-Sized Granularity

Each step is one action (2–5 minutes):
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement minimal code to pass" — step
- "Run tests and make sure they pass" — step
- "Commit" — step

## Task Template

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter/return types]

- [ ] **Step 1: Write the failing test**

```typescript
test('specific behavior', () => {
  const result = function(input);
  expect(result).toBe(expected);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/path/test.ts`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
function function(input: Input): Output {
  return expected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/path/test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.ts src/path/file.ts
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain actual content. These are **plan failures** — never write:
- "TBD", "TODO", "implement later"
- "Add appropriate error handling" (without actual code)
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — readers may see tasks out of order)
- Steps describing *what* to do without showing *how*

## Self-Review

After writing the plan:
1. **Requirement coverage**: Can you point to a task for every requirement? List gaps.
2. **Placeholder scan**: Search for red flags — any TBD/TODO/vague steps. Fix them.
3. **Interface consistency**: Do interfaces and signatures in later tasks match earlier definitions?

Fix issues inline. If a requirement has no task, add the task.

## Execution Handoff

After updating the Task Record: "Task recorded in `docs/task.md`. Ready to implement with `/skill:implement-work`."
