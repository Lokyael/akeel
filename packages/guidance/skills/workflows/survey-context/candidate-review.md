# Candidate Review Boundary

Read this file only when creating, revising, merging, splitting, or explicitly reviewing Candidate Records. Candidate authority, lifecycle, and migration remain defined by principles.md Project Records; this companion only decides record granularity and preserves meaning during review.

## Boundary Test

Do not merge records because they share a theme, actor, subsystem, or possible implementation. Thematic similarity alone is navigation evidence, not a shared Candidate boundary.

Treat content as one Candidate only when it has:

1. the same unresolved question;
2. the same objective revisit evidence — wording need not be identical, but one trigger must make the whole record worth reconsidering;
3. one promotion boundary — its content would be promoted, investigated, designed, implemented, and verified together;
4. one authority role — it is an uncommitted possibility rather than current truth, historical comparison, or index material with no candidate choice;
5. one coherent operating shape — it does not require mutually exclusive modes, separate safety boundaries, or independent lifecycles.

Split a record when any material part can be independently promoted, implemented, or verified, when its revisit evidence can activate without the rest, or when merging would create multiple modes, safety boundaries, or lifecycles, or would cross authority roles. Thematic similarity alone never overrides these signals.

## Classification Before Reshaping

Classify each part before deciding its destination:

- Current truth belongs in `CONTEXT.md`, not in a Candidate merely because it may change later.
- An adopted load-bearing conclusion belongs in a Decision.
- Committed investigation, design, or implementation belongs in a Task.
- A historical comparison or index belongs in a Candidate only when it supports a real uncommitted choice about whether to conduct that review; Git remains the history authority.
- Material with no uncommitted choice and no concrete revisit evidence does not become a Project Record.

An investigation inventory is one Candidate when the unresolved choice is whether to conduct one bounded investigation and its checklist items are evidence to inspect, not independently proposed features. Keep each unreviewed checkpoint local: current implementation, a live Decision, or a related Candidate is evidence, not proof that the inventory reviewed or disposed that checkpoint. Do not split such a checklist into a backlog merely because its items could lead to different findings.

### Candidate abstraction and cleanup

Apply the general **Coherent Changes** principle in `principles.md` while reshaping Candidate Records. Classify Candidate content by its role, not by where it came from. Keep the uncommitted question or direction, the subject and scope needed to understand it, why it is not adopted, evidence for revisiting it, and boundaries that affect its disposition. In a historical-comparison or exploration Candidate, the behavior being compared or the subject being explored remains when removing it would change the review scope.

Remove content that only narrates the source or proposes a solution: implementation-ready interfaces, modules, schemas, configuration or transport choices, algorithms, procedures, process chronology, rejected design detail, and alternatives that no longer affect the unresolved choice. Committed investigation, design, and implementation belong in a Task. Retain a detail only when removing it would hide a non-obvious safety boundary, a direction-changing alternative, a scope distinction, or a failure condition; state it briefly as a constraint or representative counterexample, not as a design. Zero-loss preserves Candidate-defining meaning, not every source detail or solution form. Temporary `verified-candidate` artifacts may still carry result-necessary design and evidence for Task Owner review.

## Review Outcomes

For each record or separable part, recommend exactly one current disposition:

- **keep** — one coherent Candidate already owns it;
- **revise** — the boundary is sound but terminology, evidence, or scope is stale;
- **merge** — every boundary-test dimension is shared and one record can own the complete meaning;
- **split** — triggers, promotion boundaries, modes, safety boundaries, authorities, or lifecycles differ;
- **promote or dismiss** — only as an explicit user choice per principles.md Project Records.

Related records may cross-reference one another, but a reference does not replace execution-critical constraints, safety qualifiers, or the local question that makes the record independently reviewable.

## Zero-Loss Reshaping

Before merging, splitting, compressing, or pruning, build a source-to-destination semantic map. Preserve every distinct:

- unresolved question and alternative disposition;
- Why Not Now reason and objective revisit evidence;
- actor, authority, trigger, sequence, and completion condition;
- safety boundary, prohibition, fallback, residual risk, and out-of-scope statement;
- named term, enumeration, example that distinguishes a category, and reference carrying part of the meaning.

Delete only synonymous repetition or content whose removal the user explicitly approved. Existing implementation is not a deletion reason by itself. After editing, verify every source item has an identifiable destination and report any unresolved semantic conflict instead of choosing silently.
