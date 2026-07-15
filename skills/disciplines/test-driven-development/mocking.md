# TDD — Mocking Guidelines

## When to Mock

Mock only I/O boundaries. The rule: mock things you don't own, don't mock things you do.

| Mock | Don't Mock |
|------|------------|
| Database connections | Domain objects |
| HTTP clients / fetch | Value objects |
| File system | Service classes |
| Third-party SDKs | Repository interfaces (use fakes) |
| Clock / Date | Business logic |

## When Not to Mock

If you're mocking internal classes, your tests are coupled to implementation. When you refactor, tests break even if behavior hasn't changed. This is the **implementation-coupled antipattern**.

**Bad:**
```typescript
const mockValidator = new MockEmailValidator();
mockValidator.validate.mockReturnValue(true);
const service = new UserService(mockValidator);
```

Every time you change `EmailValidator`, you change the mock. The test no longer tells you behavior works — it tells you the mock was set up correctly.

**Good (use the real thing):**
```typescript
const service = new UserService(new EmailValidator());
const result = service.create({ email: 'test@example.com' });
expect(result.ok).toBe(true);
```

**Good (fake for I/O):**
```typescript
const fakeDb = new InMemoryDatabase();
const service = new UserService(fakeDb);
```

## Mocking External APIs

For HTTP calls, use a test double that implements the same interface but runs in-memory:

```typescript
class FakePaymentGateway implements PaymentGateway {
  private charges: Charge[] = [];

  async charge(amount: number): Promise<Charge> {
    if (amount <= 0) throw new PaymentError('Invalid amount');
    const charge = { id: `ch_${this.charges.length}`, amount };
    this.charges.push(charge);
    return charge;
  }
}
```

## The Dependency Injection Rule

If you can't test without mocks, the code is too coupled. Use dependency injection to pass dependencies, don't import them globally:

```typescript
// Bad — can't test without mocking the module
import { database } from './db';
export function getUser(id: string) {
  return database.query('SELECT * FROM users WHERE id = ?', [id]);
}

// Good — inject the dependency
export function createGetUser(db: Database) {
  return (id: string) => db.query('SELECT * FROM users WHERE id = ?', [id]);
}
```
