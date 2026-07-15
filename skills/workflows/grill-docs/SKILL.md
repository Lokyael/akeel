---
name: grill-docs
description: Doc-grounded grilling session that creates ADRs and glossary entries as decisions crystallize. Use when the plan relies on external libraries or APIs, and every challenge must cite real documentation. For documentation-free grilling, use grill-plan.
disable-model-invocation: true
---

Run a `/skill:grill-plan` session, using the `/skill:domain-modeling` skill to capture decisions as ADRs and glossary entries in real time.

When the plan relies on specific libraries or external APIs:
1. List every external library, API, and framework relied upon.
2. Fetch the actual documentation for each.
3. Challenge each plan assumption against the real docs: correct signature? right version? any deprecations?
4. Report confirmed ✓, corrected ✗ (with the real behavior), and uncertain → prototype.
5. Update the plan for each confirmed discrepancy.
