---
name: cost-efficient-agent-tree
description: "Set up or use an Astra-led Codex agent tree with Luna exploration and research, Sol implementation, and optional Astra review. Use when the user requests this tree, its project-level role configuration, or cost-conscious delegation across these models."
---

# Cost-efficient agent tree

Astra owns planning, integration, verification, and delivery. Delegate bounded work on demand; small tasks stay with the root. This is a configurable allocation strategy, not a guarantee of lower cost or quota consumption.

| Role | Model | Reasoning effort | Work |
| --- | --- | --- | --- |
| Root | `gpt-6-astra` | `medium` | Orchestrate, integrate, verify |
| `luna_explorer` | `gpt-5.6-luna` | `max` | Bounded codebase investigation |
| `sol_worker` | `gpt-5.6-sol` | `high` | Implementation and relevant tests |
| `luna_researcher` | `gpt-5.6-luna` | `max` | Focused source lookup |
| `astra_reviewer` | `gpt-6-astra` | `xhigh` | Independent review only when needed |

## Configure once

For setup, missing roles, or a model mismatch, read [references/setup.md](references/setup.md). It maps the packaged templates to project configuration and explains fresh-session activation. Installing this skill or mentioning a model in instructions does not switch any running model.

For an ordinary task, inspect the available roles and spawn interface first. Use the configured roles if loaded. If the interface supports explicit model and effort overrides instead, use the mapping above and supply the corresponding template's role instructions in a self-contained brief. For `collaboration.spawn_agent`, use `model`, `reasoning_effort`, and `fork_turns: "none"`; do not invent a role-selection parameter. Read that tool's current schema before calling. A role name or task label alone is not model selection.

If the root is not Astra at medium, state that the requested root configuration is not active; use a supported switch or fresh session for the exact tree. Do not claim the skill switched it. If a requested child model, effort, or selection mechanism is unavailable, disclose the limitation and continue useful local work. Do not silently substitute or repeatedly retry an unavailable model. Preserve explicit user adjustments to the defaults.

## Assign useful work

Use subagents when a concrete, bounded subtask can run independently alongside useful root work. Do not spawn every role as a checklist, duplicate the root's investigation, or delegate a tiny sequential step whose handoff costs more than it saves.

- Send Luna explorer a specific code path, ownership question, or suspected failure to investigate. Request file and symbol evidence.
- Send Luna researcher a narrow question and source/version constraints. Request authoritative links, observed facts, and unresolved uncertainty.
- Send Sol worker an implementable slice with exclusive file ownership, acceptance criteria, and relevant checks. Keep overlapping writes sequential. The root retains cross-cutting decisions and integration.
- Use Astra reviewer only for substantial unresolved risk, conflicting evidence, or a difficult change where an independent opinion improves confidence. Supply artifacts and acceptance criteria without suggesting the desired verdict. Review is advisory; the root resolves findings.

Every brief includes the objective, relevant files or sources, current revision/state, constraints and authorization, boundaries on edits, expected deliverable, and a stopping condition. Prefer fresh, focused context where supported. Children must not spawn more agents, publish changes, or expand the task. Read-only roles must not edit files or mutate external systems; a sandbox setting alone does not enforce every tool's behavior.

The root advances independent work while children run, then collects every delegated result before relying on it. Request a compact return: conclusion or changes, file/source references, checks actually run and results, remaining uncertainty, and blockers. Follow up on the existing child for a missing detail; stop or close obsolete/completed children using supported controls. Avoid polling loops.

Inspect changes and evidence, resolve conflicts, and run integration checks proportional to risk. A child's summary is not proof that a check passed. Report the outcome and material limitations, including unavailable roles or model verification gaps. The tree does not expand the user's authorization to merge, deploy, or message others.

## Confirm actual execution

Read [references/verification.md](references/verification.md) when first activating the tree, diagnosing unexpected usage, or asked to confirm the models. Distinguish templates saved, roles loaded, and model/effort observed in session metadata. Never use an agent's self-description as runtime proof.
