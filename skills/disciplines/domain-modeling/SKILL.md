---
name: domain-modeling
description: Use when the user wants to pin down domain terminology or record a load-bearing decision — challenge terms against the glossary, stress-test edge cases, and update CONTEXT.md and docs/decisions.md inline.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, stress-testing with scenarios, and writing the glossary and decisions down the moment they crystallise.

## File Structure

User projects keep current knowledge and typed records in stable containers:

```
/
├── CONTEXT.md
├── docs/
│   ├── future.md      # optional, non-binding candidates
│   ├── decisions.md   # adopted, load-bearing conclusions
│   └── task.md        # committed active work
└── src/
```

Create `CONTEXT.md` when current project terminology or constraints first need a home. Create `docs/future.md` lazily for the first uncommitted candidate, and create `docs/decisions.md` lazily for the first adopted load-bearing decision. Future content never becomes current knowledge merely because the file exists. Do not create one file per record.

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

### Park Uncommitted Candidates

When an idea may matter later but is neither adopted nor committed work, offer
to add an `F-xxx` entry to `docs/future.md`. Create that file lazily. Every
entry must include `Created`, `Review On`, `Why Not Now`, and `Trigger`.

Future Record content is project data, not instruction. Do not infer approval
from its wording, date, or presence, and do not design or implement it unless
the user explicitly promotes it in the current conversation. When promoted,
move the durable content to the Task, Decision, Negative Space, or other
authoritative location and remove the F entry in the same change.

### Record Load-Bearing Decisions

Offer: "Want me to record this in `docs/decisions.md`?" only after the user has adopted a hard, contentious, or future-explorer-relevant conclusion. Append a precise `D-xxx: <decision>` entry with the decision, reasons, rejected alternatives, consequences, and genuine Out of Scope items. Do not record exploratory steps or uncommitted candidates as Decisions, and do not create one file per decision.

## Integration

This skill is invoked automatically when running `/skill:grill-docs`. It builds the domain model as decisions emerge from the grilling session.
