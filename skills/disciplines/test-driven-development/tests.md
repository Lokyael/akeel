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

## Why Order Matters

Tests written after code pass immediately. Passing immediately proves nothing:
- Might test wrong thing
- Might test implementation, not behavior
- Might miss edge cases you forgot
- You never saw it catch the bug

Test-first forces you to see the test fail, proving it actually tests something.
