# TDD — Reference

## Good Tests

| Quality | Good | Bad |
|---------|------|-----|
| **Minimal** | One behavior. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear** | Name describes behavior. | `test('test1')` |
| **Shows intent** | Demonstrates desired API. | Obscures what code should do. |

### Example: Good

```typescript
test('retries failed operations 3 times before throwing', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
Clear name, tests real behavior, one thing.

### Example: Bad

```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```
Vague name, tests mock not code, tautological assertion.

## Falsifiability — Fail for the Right Reason

Before writing the test body, name the production change that would make it fail — a bug, not a decision. A test earns its place by catching a wrong branch, missing side effect, wrong argument, boundary case, or broken contract.

**Derive expectations independently.** Expected values come from an independent source — literals, hand-checked fixtures, table-driven `want` values. An expectation computed by the code under test passes no matter what that code does:

```typescript
// ❌ Mirror assertion — same builder computes both sides, always true
const expected = buildSearchQuery({ tag: 'urgent' });
expect(buildSearchQuery({ tag: 'urgent' })).toBe(expected);

// ✅ Hand-derived literal
expect(buildSearchQuery({ tag: 'urgent' })).toBe('tag:"urgent"');
```

**No change detectors.** Test the behavior that depends on a decision, never the decision itself: not `expect(MAX_RETRIES).toBe(5)`, but "a failing call is retried 5 times and the 6th attempt never happens."

**Behavior, not text.** Run scripts against controlled inputs and assert outputs, side effects, or exit codes; test agent-facing documents by the consuming agent's behavior — prose for humans earns no test.

**The mutation check.** Before finishing, mentally mutate the production code; each realistic mutation — wrong constant or argument, wrong branch, missing side effect, empty/default return, missing validation for zero, empty, nil, unauthorized, or malformed input — must fail at least one test. A mutation nothing catches marks the behavior as unprotected — or the test as tautological.

## Bug Fix Example

**Bug:** Empty email accepted by form.

**RED**
```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED:** `FAIL: expected 'Email required', got undefined`

**GREEN**
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' };
  }
  // ... rest of implementation
}
```

**Verify GREEN:** `PASS`
