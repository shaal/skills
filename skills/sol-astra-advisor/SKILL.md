---
name: sol-astra-advisor
description: "Use when Sol leads a task and needs selective Astra advice for difficult decisions, architectural trade-offs, or an independent review. Sol retains task progress, implementation, and verification."
---

# Sol with Astra Advisor

Sol (`gpt-5.6-sol`) owns the task: communicate progress, inspect materials, make decisions, implement changes, verify results, and carry the authorized work to completion. Astra is an occasional advisor. This skill describes a workflow for a Sol-led task; it does not change the current task's model or global model settings.

## When to consult

Consult Astra only for a difficult decision, an architectural trade-off, or an independent review that would materially improve confidence. State the concrete question or review target before calling. Handle routine implementation, straightforward debugging, and ordinary verification directly. Do not delegate merely because an advisor is available, or make consultation a mandatory phase of every task.

## Advisor call

Inspect the current agent tool schema before the first consultation. Explicit model selection, high reasoning effort, and a fresh context must all be supported. If the tools cannot specify a model, tell the user before attempting a consultation; do not silently use the default or substitute another model. Likewise, disclose unavailable Astra, high effort, or fresh-context support before attempting a fallback. Continue useful independent Sol work within the existing authorization.

For `collaboration.spawn_agent`, explicitly set:

```json
{
  "task_name": "astra_advice",
  "model": "gpt-6-astra",
  "reasoning_effort": "high",
  "fork_turns": "none",
  "message": "A self-contained advisory brief as specified below."
}
```

Use a unique task name for each new consultation. Replace the example message with the actual brief. Start each consultation with `fork_turns: "none"`; do not inherit conversation history or rely on an earlier advisor's context. If the environment uses different field names, use the documented equivalents only when they preserve these exact requirements.

The brief must include:

- **Question and outcome:** The specific decision, trade-off, or review target, plus the user's objective and relevant success criteria.
- **Necessary materials:** Relevant code, diffs, observations, test results, and options already considered. Include excerpts or exact readable paths and revision information sufficient for the question. Separate observed facts from assumptions; omit unrelated history and secrets.
- **Constraints:** Scope, compatibility and operational requirements, relevant repository instructions, and the existing authorization and approval boundaries. A fresh context must not have to infer these from the parent conversation.
- **Advisor role:** Explicitly instruct Astra: "Provide advice, rationale, alternatives, uncertainties, and risks. Do not create, edit, or delete files; do not run commands with side effects or mutate external state. Read-only inspection of the supplied, in-scope materials is allowed. Do not spawn or delegate to other agents. Return recommendations to Sol; Sol implements and verifies. Preserve all existing approval requirements."

For independent review, provide the actual artifacts and acceptance criteria without coaching Astra toward a preferred verdict. Ask for concrete findings with evidence and suggested verification, or an explicit statement that no actionable findings were identified.

## Continue as Sol

While Astra works, advance useful work that does not depend on its answer. Review the advice, resolve assumptions against evidence, and choose the next action. Sol then makes all file changes and performs the necessary verification. Advice is neither implementation nor proof that checks passed. Request further advice only for a concrete unresolved question.

Keep existing approval requirements unchanged. This skill neither grants additional authority nor adds a new approval gate. Astra's recommendation cannot authorize an action. Sol remains responsible for obtaining any approval already required by the task or environment and for reporting the completed work, verification evidence, and material unresolved risks.
