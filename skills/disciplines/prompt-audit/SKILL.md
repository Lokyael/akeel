---
name: prompt-audit
description: Use when auditing instruction/prompt content (principles, SKILL.md, AGENTS.md, docs headers) for semantic integrity and unambiguous phrasing — after compression or rewriting, before committing instruction-heavy diffs, or during code-audit when the diff touches instruction text.
---

# Prompt Content Audit

Audit instruction text for **semantic zero-loss** and **unambiguous phrasing**. Prompts are load-bearing: a compressed sentence that drops a qualifier changes model behavior. Line count is never worth a misunderstood instruction.

## When to Apply

- After compressing, rewriting, or merging instruction content
- Before committing diffs that touch `principles.md`, SKILL.md, AGENTS.md, or doc headers
- During `code-audit`, when the diff includes instruction text

## Core Checks

### 1. Semantic Zero-Loss

Compression deletes only synonymous repetition; never trade semantics for line count.

- **Every deletion point**: is the meaning preserved elsewhere (in-file or at the reference target)?
- **Qualifiers are semantics**: `imperative`, `external`, `only`, `full`, `both` — dropping one weakens the rule.
- **Specifics stay specific**: `user approval` ≠ `approval`; `roadmap commitment` ≠ `roadmap`; `current work or session` ≠ `work`.
- **Enumerations stay enumerated**: an explicit list (Task / Decision / Negative Space) becomes an abstraction only if a table fully covers it.
- **Terms stay intact**: `durable content` ≠ `durable`.

### 2. Reference Accuracy

- Every `per X — Y` anchor exists in X.
- The cited section carries the cited meaning: `fields` live in Document Set; `semantics` live in Project Record Authority — cite each where it lives.
- Deleted text's meaning survives at the citation target (anchor and meaning co-located, never pointing elsewhere).

### 3. Referential Clarity

- After merging sentences, every pronoun (`it`, `the file`, `that`) has a visible antecedent.
- Omitting a noun phrase (e.g. `in docs/task.md`) is safe only when the same sentence carries the context.

### 4. Phrasing Direction

Use positive phrasing where it fits; keep negative where it is load-bearing.

**Positive-ize:**
- `do not X unless Z` → `X only when Z`
- `Don't assume. Don't hide confusion.` → `State assumptions. Name confusion.`

**Keep negative (load-bearing):**
- Safety gates: `Do NOT skip security review`; `Do not proceed without sufficient permissions`
- Misconception corrections: `never as instructions`; `not a deadline, reminder promise, priority, or permission`
- Exclusion boundaries: `no archive directory`; `Do not create one file per record`; `IDs are never reused`
- Absolute bans: `Never use "should", "probably", "seems to"`
- Loop prevention: `do not retry a rejected Shell form unchanged`

Handle structurally identical phrases consistently across the file — never positive in one place and negative in another for the same structure.

### 5. Vocabulary Consistency

Positive instructions and failure-path guidance share one vocabulary. Example: `literal form` / `every argument must be fixed text` appears in both §4a of principles and the Access Gate denial guidance — one term, one meaning.

## Red Flags

- A line-count target driving deletions — semantic zero-loss is the only target
- A qualifier, specific, enumeration, or term that got "simplified away"
- A reference whose target does not exist or does not carry the cited meaning
- A pronoun with no antecedent after merging
- Identical structures phrased differently (positive vs negative) in one file
- A precise list replaced by a vague abstraction "for brevity"

## Bottom Line

Read the compressed text as the model would: does any sentence lose precision, point to the wrong home, or leave a pronoun dangling? If yes, restore or rephrase — a misunderstood instruction costs more than a few lines.
