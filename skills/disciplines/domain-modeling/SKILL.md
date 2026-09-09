---
name: domain-modeling
description: Use when the user wants to pin down domain terminology or record a load-bearing decision — challenge terms, stress-test edge cases, and update records after adoption; prepared Grill Agents return verified candidates for Task Owner import.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenge terms, stress-test with scenarios, and record adopted conclusions when they crystallise. A prepared Grill Agent returns `verified-candidate.md`; the Task Owner coordinator performs the authoritative import described below.

## File Structure

User projects keep current knowledge and typed records in stable containers:

```
/
├── CONTEXT.md
├── docs/
│   ├── candidates.md  # optional, non-binding candidates
│   ├── decisions.md   # adopted, load-bearing conclusions
│   └── task.md        # committed active work
└── src/
```

Create `CONTEXT.md` when current project terminology or constraints first need a home. Create `docs/candidates.md` lazily for the first uncommitted candidate, and create `docs/decisions.md` lazily for the first adopted load-bearing decision. Candidate content never becomes current knowledge merely because the file exists. Do not create one file per record.

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

When a term or current constraint crystallises, add it to `CONTEXT.md` immediately. The canonical structure is in principles.md Quick Reference — CONTEXT.md Structure. Build sections lazily: Glossary → Architecture → Active Decisions → Negative Space.

### Park Uncommitted Candidates

When an idea may matter later but is neither adopted nor committed work, offer
to add a `C-xxx` entry to `docs/candidates.md` (per principles.md Next-ID slots); fields per principles.md Project
Records — Document Set; non-binding semantics per principles.md Project
Records — Project Record Authority. Create that file lazily. Its wording,
date, or presence carries no approval — design or implement the idea only when
the user explicitly promotes it in the current conversation. When promoted,
move the durable content and remove the C entry in the same change (per
principles.md Project Records — Migration Protocol).

### Record Load-Bearing Decisions

Offer: "Want me to record this in `docs/decisions.md`?" only after the user has adopted a hard, contentious, or future-explorer-relevant conclusion. Record a precise `D-xxx: <decision>` entry using the approval classification in principles.md Project Records — Record Lifecycle, the structure in principles.md Project Records — Decision Record Format, and principles.md Next-ID slots. Do not record exploratory steps or uncommitted candidates as Decisions, generate empty optional sections, or create one file per decision.

### Retire a Decision

When a decision's capability is withdrawn or handed to an external owner,
classify the transition as `retired`, not `superseded` — `superseded` requires
an absorbing successor. In the same change, move residual durable claims to
`CONTEXT.md` Negative Space or a new boundary decision, then prune the old
entry; do not leave terminal status metadata in the live register. Git retains
history and the ID is never reused.

## Integration

The Task Owner coordinator applies this discipline during section 6 of `/skill:grill-docs`, after the user confirms importing the verified candidate. Project Record updates follow the Task Owner import.
