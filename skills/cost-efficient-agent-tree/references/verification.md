# Verify models and effort

Keep three claims separate: templates saved; roles discovered by the fresh client session; and model/effort recorded for actual turns. Config values prove intent only. A child's prose claiming to be Luna is not evidence.

Inspect the available role list or spawn schema in the fresh session. Confirm the root's actual model and effort through supported session metadata. Select the custom role using the exposed role parameter, or use explicit overrides with the instructions described in SKILL.md. Do not assume a task name selects a role.

Prefer verifying the first useful delegated task. If the user asks for full activation testing, run a minimal read-only task for each child, sequentially, and verify all four; do not modify the project just to test the worker. Otherwise avoid spawning unused roles solely to produce a complete-looking report.

Record the spawned child's session/thread ID. Use the client's session details, local app-server thread data, or the matching local session log. Inspect only that session's metadata; logs may contain private prompts and tool results. Storage and field names vary by version, so absence of a legacy JSONL log is not proof of failure. Do not dump session histories or attach them to a PR.

For a client with legacy JSONL rollouts, locate only the known child ID under its actual sessions directory (`${CODEX_HOME:-$HOME/.codex}/sessions` by default). A metadata-only inspection of the selected file can use:

```sh
jq -c 'select(.type == "turn_context") | .payload |
  {model, effort, reasoning_effort, model_reasoning_effort}' /absolute/path/to/child-rollout.jsonl
```

Match the relevant turn to the spawn result; inspect available metadata fields if this version uses a different structure. A null/missing effort is unknown, not confirmation of the requested value. Check for runtime fallback/errors and distinguish requested settings from any separately reported resolved settings. Do not infer backend routing beyond the evidence the client exposes.

Report only role, child ID when useful, observed model/effort, and status (`verified`, `mismatch`, or `unverified`). If any value differs, identify configuration precedence or unsupported settings, correct only in-scope configuration, and retry in a fresh session. Do not keep launching children when the same availability error repeats. Report which unused roles have only static validation.
