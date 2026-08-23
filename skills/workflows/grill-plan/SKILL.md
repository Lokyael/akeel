---
name: grill-plan
description: Use when the user wants to stress-test their thinking, says "grill me", or uses any 'grill' trigger phrases — relentlessly interview them about every aspect of a plan, decision, or idea until every branch of the decision tree is resolved. For the doc-grounded variant, use grill-docs.
---

# Grill Plan

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Present each question as one distinct block — question first, then a horizontal rule (`---`), then your recommended answer. The rule keeps the question and the recommendation from blurring together and separates consecutive question blocks:

```
❓ **Q** - **<question title>**: <question body, including any choices>

---

➡️ **My recommendation**: <recommended answer>
```

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a *fact* can be found by exploring the environment (filesystem, tools, etc.), look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not act on it until I confirm we have reached a shared understanding.
