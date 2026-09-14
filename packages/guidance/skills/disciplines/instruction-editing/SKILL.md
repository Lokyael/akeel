---
name: instruction-editing
description: Use when revising agent-facing prompts, skills, or operational instructions — preserve behavioral meaning while expressing the current contract with consistent terminology, cohesive structure, reliable references, and direct wording.
---

# Instruction Editing

Revise agent-facing instructions so the current behavioral contract becomes easier to follow while every approved obligation remains intact. Apply the method to prompts, skills, agent guidance, checklists, and operational procedures.

A requested change that alters the promised capability, authority, or safety boundary receives design approval before textual editing. This discipline implements the approved meaning.

## Process

### 1. Inventory Behavioral Meaning

Read the complete target and its governing sources. Build a compact semantic inventory:

- actor and authority;
- trigger and preconditions;
- required action and sequence;
- output and completion condition;
- qualifiers, enumerations, and named terms;
- approval gates, prohibitions, exclusions, and fallback behavior;
- references that carry part of the contract.

Treat imperative force and qualifiers such as `only`, `every`, `explicit`, `user approval`, and `durable content` as behavior. Preserve each item through an identifiable destination in the revised text.

### 2. Express the Current Contract

State the current actor, condition, action, and result directly. Give the current behavior a self-contained explanation, then attach compatibility, migration, or decision background when that context is necessary to use or understand the contract.

Use current authoritative sources to resolve stale or conflicting statements. Surface any unresolved conflict for user resolution.

### 3. Build Cohesive Structure

Organize one behavior around one visible owner and a natural condition–action–result sequence. Combine adjacent fragments that share a subject, phase, or outcome. Integrate new qualifiers into the sentence or paragraph they constrain so readers encounter the rule at its action point.

Use headings and lists when they expose real categories or ordered steps. Use prose when several short statements form one contract. Keep pronouns attached to a visible antecedent.

### 4. Normalize Terminology

Read the project glossary, public interfaces, adjacent instructions, and user-facing wording. Use one canonical term for each concept and preserve distinct terms for distinct concepts. Update all in-scope references together when an approved terminology change occurs.

Prefer concrete actors and artifacts over generic words such as “it”, “thing”, “data”, or “process” where those words could name several objects.

### 5. Choose the Wording Direction

Express required and permitted behavior with direct positive instructions when the meaning remains equivalent. Use explicit negative wording for safety gates, prohibited actions, exclusion boundaries, iron laws, cycle prevention, and likely misunderstandings. Keep the chosen direction consistent across comparable rules.

Place the decisive verb near the actor and condition. Use examples to clarify a boundary, with a small representative set for each category.

### 6. Validate References

For every reference:

1. Resolve the target and read the text that carries the cited meaning.
2. Confirm the target is available in the reader's actual loading or injection context.
3. Keep execution-critical steps and safety guards at their action point.
4. Provide a detectable failure or contextual fallback where reference resolution can fail.
5. Prefer a reference when its single-source value exceeds its wording and resolution cost.

Long operational detail belongs with the consumer that must execute it unless a reliable shared source is loaded and read as part of the workflow.

### 7. Verify Semantic Preservation

Map every item from the semantic inventory to the revised text. Confirm that:

- conditions, sequences, qualifiers, enumerations, approvals, and exclusions remain complete;
- terminology matches authoritative project language;
- each reference resolves and carries the intended meaning;
- related instructions read as one coherent contract;
- deliberate repetition remains at safety gates and action points where it prevents behavioral drift;
- synonymous repetition, self-evident inference, derived values, and surplus examples have been removed.

Report the edited paths, preserved obligations, terminology decisions, reference checks, and unresolved semantic questions. Use line count as an observation rather than an editing objective.
