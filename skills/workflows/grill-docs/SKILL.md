---
name: grill-docs
description: Doc-grounded grilling session that updates the project context and decision register as decisions crystallize. Use when the plan relies on external libraries or APIs, and every challenge must cite real documentation. For documentation-free grilling, use grill-plan.
disable-model-invocation: true
---

Run a `/skill:grill-plan` session, using the `/skill:domain-modeling` skill to capture current terminology in `CONTEXT.md` and load-bearing decisions in `docs/decisions.md` in real time. Each decision entry includes genuine **Out of Scope** items when applicable (principles.md §7 format).

When the plan relies on specific libraries or external APIs:
1. List every external library, API, and framework relied upon.
2. Fetch the actual documentation for each.
3. Challenge each plan assumption against the real docs: correct signature? right version? any deprecations?
4. Report confirmed ✓, corrected ✗ (with the real behavior), and uncertain → prototype.
5. Update the plan for each confirmed discrepancy.
