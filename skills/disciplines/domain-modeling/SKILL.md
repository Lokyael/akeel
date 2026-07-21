---
name: domain-modeling
description: Use when the user wants to pin down domain terminology or record a load-bearing decision — challenge terms against the glossary, stress-test edge cases, and update CONTEXT.md and docs/decisions.md inline.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, stress-testing with scenarios, and writing the glossary and decisions down the moment they crystallise.

## File Structure

User projects keep current knowledge and decisions in two stable files:

```
/
├── CONTEXT.md
├── docs/
│   └── decisions.md
└── src/
```

Create `CONTEXT.md` when current project terminology or constraints first need a home, and create `docs/decisions.md` lazily when the first load-bearing decision is needed. Do not create one file per decision.

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

When a term or current constraint crystallises, add it to `CONTEXT.md` immediately. The canonical structure is in principles.md Quick Reference — User-Project CONTEXT.md Structure. Build sections lazily: Glossary → Architecture → Security Boundaries → Active Decisions → Negative Space.

### Record Load-Bearing Decisions

Offer: "Want me to record this in `docs/decisions.md`?" for hard, contentious, or future-explorer-relevant decisions. Append a precise `D-xxx: <decision>` entry with the decision, reasons, rejected alternatives, consequences, and genuine Out of Scope items. Do not record exploratory steps or create a separate file.

## Integration

This skill is invoked automatically when running `/skill:grill-docs`. It builds the domain model as decisions emerge from the grilling session.
