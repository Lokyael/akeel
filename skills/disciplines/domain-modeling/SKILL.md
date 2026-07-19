---
name: domain-modeling
description: Use when the user wants to pin down domain terminology or record an architectural decision — challenge terms against glossary, stress-test with edge cases, update CONTEXT.md and ADRs inline.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, stress-testing with scenarios, and writing the glossary and decisions down the moment they crystallise.

## File Structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

Create files lazily — only when you have something to write. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the Session

### Challenge Against the Glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately: "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen Fuzzy Language

When the user uses vague or overloaded terms, propose a precise canonical term: "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss Concrete Scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about boundaries between concepts.

### Cross-Reference with Code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md Inline

When a term crystallises, add it to `CONTEXT.md` immediately. The canonical structure
is in principles.md Quick Reference — User-Project CONTEXT.md Structure.
Build sections lazily: Glossary → ADR Index → Negative Space.

### Create ADRs for Load-Bearing Decisions

Offer: "Want me to record this as an ADR?" for hard, contentious, or
future-explorer-relevant decisions. Every ADR must include an Out of Scope row
(principles.md §7 format). If nothing is excluded, omit the row.

## Integration

This skill is invoked automatically when running `/skill:grill-docs`. It builds the domain model as decisions emerge from the grilling session.
