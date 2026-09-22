# Shaal's skills

Reusable agent skills, installable with [the Skills CLI](https://github.com/vercel-labs/skills). Each skill lives in its own directory so the collection can grow without changing the installation source.

## Install on a new machine

Install Node.js and npm first. The tested Skills CLI version, `1.5.24`, requires Node.js `22.20.0` or newer.

Install every skill in this repository globally for Codex:

```sh
npx skills add shaal/skills --skill '*' --agent codex --global --yes
```

Re-run this command when new skills are added to the collection.

To choose skills and agents interactively:

```sh
npx skills add shaal/skills
```

To list available skills or install just one:

```sh
npx skills add shaal/skills --list
npx skills add shaal/skills --skill sol-astra-advisor --agent codex --global
```

## Codex statusline

The sanitized Codex footer profile is available at
[`codex/statusline.config.toml`](codex/statusline.config.toml). It contains
display preferences only; authentication, history, sessions, and machine
specific settings stay local.

To use it on a machine:

```sh
mkdir -p ~/.codex
ln -sfn "$PWD/codex/statusline.config.toml" \
  "$HOME/.codex/statusline.config.toml"
codex --profile statusline
```

Run those commands from the root of a checkout of this repository, or replace
`$PWD` with the checkout path.

Omit `--global` to install into the current project. Installation copies skill instructions; model access and tool capabilities come from the agent running them.

## Available skills

| Skill | Purpose |
| --- | --- |
| [cost-efficient-agent-tree](skills/cost-efficient-agent-tree/SKILL.md) | Astra orchestrates and verifies; Luna explores and researches; Sol implements; optional Astra independent review. Includes project role templates and runtime verification. |
| [sol-astra-advisor](skills/sol-astra-advisor/SKILL.md) | Sol owns progress, implementation, and verification. Astra provides selective advice for difficult decisions, architectural trade-offs, or independent review. |
| [ship](skills/ship/SKILL.md) | Completes the next task from a doc or beads backlog, then gates the commit on a 4-axis confidence score (≥95, no axis below 15). |
| [ship-next](skills/ship-next/SKILL.md) | Unattended driver for `ship`: branches off the current branch, ships one task, then pushes, opens a PR, and squash-merges it. Designed to run in a loop. |

### Cost-efficient agent tree

Install with `npx skills add shaal/skills --skill cost-efficient-agent-tree --agent codex --global`, then ask:

```text
Use $cost-efficient-agent-tree to set up this project's custom agents.
```

The skill packages Astra medium as root, Luna max for exploration/research, Sol high for implementation, and optional Astra xhigh review. It merges project configuration and assignment rules, then guides fresh-session activation and model/effort verification. Installing the skill alone does not activate the roles. Once configured, invoke it for tasks that benefit from delegation; small tasks do not need the whole tree. Actual usage and savings depend on the work and account.

### Sol with Astra Advisor

Use `$sol-astra-advisor` in a task running on Sol. The skill requires the advisor call to explicitly specify `model: "gpt-6-astra"`, `reasoning_effort: "high"`, and `fork_turns: "none"`. Sol supplies the question, necessary materials, and constraints in a self-contained brief.

Astra provides recommendations, rationale, and risks without editing files, mutating external state, or spawning other agents. Sol continues implementation and verification. Existing approval requirements stay unchanged. If the required model selection or context controls are unavailable, the skill requires disclosure before attempting a consultation or fallback.

### Ship and ship-next (Claude Code)

Install `ship-next` for unattended runs. It bundles a copy of `ship`, so it works on its own:

```sh
npx skills add shaal/skills --skill ship-next --agent claude-code --global
```

Add `ship` too if you also want the manual `/ship` command (it asks before each commit):

```sh
npx skills add shaal/skills --skill ship --skill ship-next --agent claude-code --global
```

`skills/ship-next/references/ship.md` is a copy of `skills/ship/SKILL.md` without its frontmatter. When `ship` changes, copy it again so both stay the same.

Use `/ship` to finish one task with a human approval before the commit. Use `/ship-next` for unattended runs: it needs `git` with an `origin` remote and an authenticated `gh` CLI, and it merges with `gh pr merge --admin`. To drain a whole backlog in a loop, use the [shipyard](https://github.com/shaal/shipyard) CLI (`npm install -g @shaal/shipyard`).

## Add another skill

Create a directory under `skills/` with a unique lowercase, hyphenated name:

```text
skills/
  sol-astra-advisor/
    SKILL.md
    agents/openai.yaml
  another-skill/
    SKILL.md
```

Every `SKILL.md` needs YAML frontmatter with `name` and `description`, followed by the instructions:

```markdown
---
name: another-skill
description: Describe what this skill does and when to use it.
---

# Another Skill

Task-specific instructions go here.
```

Keep the frontmatter name equal to the directory name. Put any required scripts, references, assets, or agent metadata inside that skill's directory, and use relative links so it works on other machines. Add an entry to the table above, then confirm discovery from the repository root:

```sh
npx skills add . --list
```

Once the new directory is pushed to `main`, the same repository installation commands discover it. No npm package publication is required.
