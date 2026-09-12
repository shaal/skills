# Project setup

Use the project the user placed in scope. Read applicable instructions and inspect existing `.codex/config.toml`, `.codex/agents/`, and `AGENTS.md` before editing. Setup is only appropriate when requested; using the workflow on an ordinary task does not authorize changing persistent model defaults.

The current [official custom-agent format](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents) uses standalone TOML files with `name`, `description`, and `developer_instructions`. These templates target that format (checked 2026-09-12). Check the installed client's version and capabilities; older clients may use `[agents.<role>]` plus `config_file` instead. Do not mix schemas or assume parsing proves discovery. Use the client's documented format, or report the compatibility gap.

1. Merge [assets/project-config.toml](../assets/project-config.toml) into `.codex/config.toml` for the Astra root and a ceiling of three children. Keep root model keys outside TOML tables. Preserve unrelated settings, existing limits, and explicit user preferences; reconcile matching keys instead of appending duplicate tables. Do not change global config, permissions, credentials, or providers.
2. Copy the four files from [assets/agents/](../assets/agents/) into `.codex/agents/`, preserving their names and explicit model/effort pairs. Inspect collisions and merge deliberately. Keep custom names distinct from built-in `explorer` and `worker` roles.
3. Merge [assets/AGENTS.fragment.md](../assets/AGENTS.fragment.md) into project `AGENTS.md` once to retain assignment rules. Update the existing section on subsequent setup; preserve all unrelated instructions. The copied rules remain useful when the skill is not installed for another contributor.
4. Parse the TOML and inspect the diff for accidental setting changes. Check that the client/account exposes each requested model and effort. The skill does not supply model access, and no savings estimate is implied by this mapping.
5. Start a fresh session in the trusted project. Project config may be ignored in an untrusted project; do not silently alter its trust policy. Existing sessions do not become configured just because files were written. For CLI, an explicit root launch is `codex -m gpt-6-astra -c 'model_reasoning_effort="medium"'` from the project directory; it still needs loaded custom roles. In the app, select Astra and medium using supported session controls.
6. Follow [verification.md](verification.md) to confirm loaded roles and actual child execution. Report setup as saved but unverified if runtime evidence is unavailable.

If the user already uses Herdr, launch Codex in the same project and ensure that process loads the same configuration. Herdr is an optional session manager, not a requirement or an alternative model-selection mechanism. Do not install or reconfigure it for this skill unless requested.

The `agents/openai.yaml` inside the skill is discovery/UI metadata, not a custom-agent definition. Packaged `assets/agents/*.toml` remain inert until installed into the project's custom-agent directory.
