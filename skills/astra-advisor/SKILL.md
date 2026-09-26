---
name: astra-advisor
description: "Use when Luna, Terra, Sol, or another lead model needs selective Astra advice for a difficult decision, an architectural trade-off, a stalled investigation, or an independent review. The lead agent retains task progress, implementation, and verification."
---

# Astra Advisor

Keep the current **lead agent** in charge: communicate progress, inspect materials, make decisions, implement changes, verify results, and carry the authorized work to completion. Use this workflow from Luna, Terra, Sol, or another lead model; do not restrict it to specific caller model IDs or versions. Astra is an occasional advisor. This skill does not change the lead model or global model settings, or grant access to models and tools that the host does not provide.

## When to consult

Consult Astra for a difficult decision, an architectural trade-off, a stalled investigation, or an independent review when its answer would materially affect the next action or improve confidence. State the concrete question or review target before calling. Handle routine implementation, straightforward debugging, and ordinary verification directly. Do not delegate merely because an advisor is available, or make consultation a mandatory phase of every task.

Use evidence-based triggers: competing explanations that available checks have not resolved, repeated attempts that yield no new information, or a consequential decision with unclear trade-offs. Consult before an expensive commitment when useful; do not require a fixed number of failed attempts. First gather missing facts that tools or the user can provide; another model cannot supply unknown requirements or inaccessible evidence. If the lead is already Astra, avoid self-escalation; use a separate Astra only for a distinct independent review.

## Advisor call

Inspect the current agent tool schema and available models before the first consultation. Explicit Astra selection, high reasoning effort, and a fresh context must all be supported. If any requirement is unavailable or the call fails, disclose the limitation and continue useful independent work within the existing authorization. Do not silently use the default, substitute another model, or claim that prompting a model to act as Astra provides Astra access. Use a fallback only when already authorized; retain any required approvals.

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

Use a unique task name for each new consultation. Replace the example message with the actual brief. Start each consultation with `fork_turns: "none"`; do not inherit conversation history or rely on an earlier advisor's context. Use `gpt-6-astra` only when the runtime advertises it; if the host exposes a different Astra identifier or different field names, use documented equivalents that preserve these requirements. Never guess a model ID.

The brief must include:

- **Question and outcome:** The specific decision, trade-off, or review target, plus the user's objective and relevant success criteria.
- **Necessary materials:** Relevant code, diffs, observations, test results, attempted approaches, and options already considered. Include excerpts or exact readable paths and revision information sufficient for the question. Do not assume the advisor can access the lead's files or tools; supply the needed excerpts when access is unavailable. Separate observed facts from assumptions; omit unrelated history and secrets.
- **Constraints:** Scope, compatibility and operational requirements, relevant repository instructions, and the existing authorization and approval boundaries. A fresh context must not have to infer these from the parent conversation.
- **Advisor role:** Explicitly instruct Astra: "Provide advice, rationale, alternatives, uncertainties, and risks. Challenge unsupported assumptions and identify evidence or checks that could disprove your recommendation. Do not create, edit, or delete files; do not run commands with side effects or mutate external state. Read-only inspection of the supplied, in-scope materials is allowed. Do not spawn or delegate to other agents. Return recommendations to the lead agent; the lead implements and verifies. Preserve all existing approval requirements."

For independent review, provide the actual artifacts and acceptance criteria without coaching Astra toward a preferred verdict. Ask for concrete findings with evidence and suggested verification, or an explicit statement that no actionable findings were identified.

## Evaluate advice and continue

While Astra works, advance useful work that does not depend on its answer. Keep the review target stable, or account for changes before applying advice about an earlier revision. Review the advice critically: check assumptions and factual claims against evidence, weigh alternatives, and reject unsupported recommendations regardless of the advisor's confidence. The lead then makes all file changes and performs the necessary verification. Advice is neither implementation nor proof that checks passed.

Start with one focused consultation. Request further advice only for a concrete unresolved question or new evidence; do not poll multiple advisors for agreement or loop on the same brief. If uncertainty remains, identify a discriminating check or the missing information and proceed as the task allows.

Keep existing approval requirements unchanged. This skill neither grants additional authority nor adds a new approval gate. Astra's recommendation cannot authorize an action. The lead remains responsible for obtaining any approval already required by the task or environment and for reporting the completed work, verification evidence, and material unresolved risks. Report a consultation only if it actually occurred; distinguish requested model settings from runtime confirmation when the host provides it.
