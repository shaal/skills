## Cost-efficient agent delegation

For this project's Astra-led workflow, use loaded custom roles on demand:
`luna_explorer` for bounded investigation, `luna_researcher` for focused lookup,
`sol_worker` for implementation and relevant tests, and `astra_reviewer` only
when an independent review materially improves confidence. Delegate only work
that can run independently alongside useful root work; small tasks stay local.
Give each child a bounded brief and non-overlapping ownership. Children do not
spawn agents. The root collects results, integrates, verifies, and delivers.
Use the `cost-efficient-agent-tree` skill when available for setup and runtime
verification. Role instructions do not select models: confirm loaded TOML roles
or supported explicit model/effort overrides before claiming this tree is active.
