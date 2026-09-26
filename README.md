# Shaal's skills

Reusable agent skills, installable with [the Skills CLI](https://github.com/vercel-labs/skills). Each skill lives in its own directory so the collection can grow without changing the installation source.

## Install on a new machine

Install Node.js and npm first. The tested Skills CLI version, `1.5.24`, requires Node.js `22.20.0` or newer.

Install every skill in this repository globally for Codex:

```sh
npx skills add shaal/skills --skill '*' --agent codex --global --yes
```

Re-run this command when new skills are added to the collection.

The `ship` and `ship-next` skills are written for Claude Code. Install them with the command in [Ship and ship-next](#ship-and-ship-next-claude-code).

To choose skills and agents interactively:

```sh
npx skills add shaal/skills
```

To list available skills or install just one:

```sh
npx skills add shaal/skills --list
npx skills add shaal/skills --skill astra-advisor --agent codex --global
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
| [astra-advisor](skills/astra-advisor/SKILL.md) | Luna, Terra, Sol, or another lead model owns the task. Astra provides selective advice for difficult decisions, stalled investigations, architectural trade-offs, or independent review. |
| [ship](skills/ship/SKILL.md) | Completes the next task from a doc or beads backlog, then gates the commit on a 4-axis confidence score (≥95, no axis below 15). |
| [ship-next](skills/ship-next/SKILL.md) | Unattended driver for `ship`: branches off the current branch, ships one task, then pushes, opens a PR, and squash-merges it. Designed to run in a loop. |
| [photoreal-demos](skills/photoreal-demos/SKILL.md) | Builds photoreal, interactive 3D web demos with three.js, Blender Cycles, or both (Blender bakes, three.js renders). Includes a GPU screenshot harness, a Blender 5.2 relight template, an HDR atlas encoder, a relighting viewer, and two complete example scenes. |

### Cost-efficient agent tree

Install with `npx skills add shaal/skills --skill cost-efficient-agent-tree --agent codex --global`, then ask:

```text
Use $cost-efficient-agent-tree to set up this project's custom agents.
```

The skill packages Astra medium as root, Luna max for exploration/research, Sol high for implementation, and optional Astra xhigh review. It merges project configuration and assignment rules, then guides fresh-session activation and model/effort verification. Installing the skill alone does not activate the roles. Once configured, invoke it for tasks that benefit from delegation; small tasks do not need the whole tree. Actual usage and savings depend on the work and account.

### Astra Advisor

Use `$astra-advisor` in a task running on Luna, Terra, Sol, or another lead model. The skill does not depend on a particular caller model ID or version. The lead supplies a focused question, necessary materials, and constraints in a self-contained brief. Consult when a difficult decision, stalled investigation, or independent review merits it; routine work does not need an advisor.

For the documented `collaboration.spawn_agent` interface, the advisor call explicitly specifies `model: "gpt-6-astra"`, `reasoning_effort: "high"`, and `fork_turns: "none"`. Other hosts must expose documented equivalents, including an available Astra model. Installing the skill alone does not provide model access or delegation capabilities. If the requirements are unavailable or a call fails, disclose the limitation and continue useful independent work; never silently substitute another model.

Astra provides recommendations, rationale, alternatives, and risks without editing files, mutating external state, or spawning other agents. The lead checks the advice against evidence, implements changes, and verifies results. Existing approval requirements stay unchanged. A separate opinion is useful evidence to assess, not proof of correctness.

**Renamed from `sol-astra-advisor`:** Install `astra-advisor` with the command above, update saved prompts to `$astra-advisor`, and remove the old installed skill through your skill manager after the new one is available. Existing installations are not automatically renamed. The old name and repository path are no longer provided as a second skill, to avoid duplicate discovery and diverging instructions.

### Ship and ship-next (Claude Code)

These two skills are written for Claude Code. Most people want both. Install them together:

```sh
npx skills add shaal/skills --skill ship --skill ship-next --agent claude-code --global
```

Pick by what you want to do:

| You want to… | Install | Then |
| --- | --- | --- |
| Finish one task and approve the commit yourself | `ship` | Type `/ship` or "ship the next task" |
| Ship one task with no human: PR opened and merged | `ship-next` | Type `/ship-next` |
| Work through the whole backlog in a loop | `ship-next` + the [shipyard](https://github.com/shaal/shipyard) CLI | Run `npx --allow-git=all github:shaal/shipyard`. Add a number, such as `5`, to stop after that many tasks. |
| Not sure yet | Both | Start with `/ship`. Move to `/ship-next` once you trust the gate. |

Both skills work in a git repository. They take the next task from a markdown checklist with `- [ ]` items, or from a beads backlog. For beads, they read `.beads/metadata.json` to pick the right CLI: a Dolt workspace uses [`bd`](https://github.com/steveyegge/beads), and a SQLite workspace uses [`br`](https://github.com/Dicklesworthstone/beads_rust). If `br` reports `SCHEMA_MISMATCH`, run `br doctor migrate-schema plan` yourself; the skills never migrate a workspace. If `ship` finds no task source, it asks you. `ship-next` has no one to ask, so it stops. `ship` commits locally and does not push. `ship-next` also needs:

1. An `origin` remote on GitHub and the `gh` CLI, logged in (`gh auth status`).
2. A clean working tree on a branch (not a detached HEAD) that can fast-forward from `origin`.
3. Permission to merge pull requests. It merges with `gh pr merge --admin` and does not wait for CI, so on a protected branch it needs admin rights.

`ship-next` works without `ship`, because it bundles a copy at `skills/ship-next/references/ship.md`. Without `ship`, you lose the mode that asks before each commit and the plain-language trigger ("ship the next task").

The shipyard CLI needs Node.js 18+ and `claude` on your `PATH`. It is not on npm yet, and npm 12+ blocks GitHub packages unless you pass `--allow-git=all`. Skip `shipyard init`. It writes its own copy of `ship` over `~/.claude/skills/ship`, and it adds `~/.claude/commands/ship-next.md`, a second `/ship-next` next to this skill. The loop runs `/ship-next`, and the skill from this repository provides it.

The source of truth for `ship` is [shipyard](https://github.com/shaal/shipyard). To refresh the copies here, run `npm run sync-skills -- <path-to-skills-checkout>` in a shipyard checkout, then open a PR here. Without a path, it uses `$SKILLS_REPO`, else a `skills` directory next to the shipyard checkout. It updates `skills/ship/` and `skills/ship-next/references/ship.md`. `npm run sync-skills:check` reports drift without writing.

### Photoreal demos

Install for Claude Code (or swap the agent for `codex`):

```sh
npx skills add shaal/skills --skill photoreal-demos --agent claude-code --global
```

Then ask for a scene, for example "build a photoreal interactive demo of a lighthouse in a storm", "make a relightable Blender product shot of a perfume bottle", or "make 6 demos, mixing three.js and Blender". The skill picks three.js for scenes that must move freely, Blender Cycles for light-heavy stills (remixed live by light group, time of day, camera view or focus), and a hybrid when both matter. It verifies each page in real Chrome on the GPU, then publishes it (as a Claude artifact when that tool exists, otherwise as a static folder).

Requirements:

1. Python 3.10+ with `playwright`, `numpy`, `opencv-python` and `pillow`, plus `python -m playwright install chromium`. Google Chrome is preferred for screenshots.
2. A GPU that Chrome's WebGL can use. The screenshot script reports the renderer, so you can confirm it is not a software fallback.
3. Blender 5.2 or newer, only for Blender and hybrid demos. The template picks Metal, OptiX, CUDA, HIP or oneAPI automatically.

[`skills/photoreal-demos/references/setup.md`](skills/photoreal-demos/references/setup.md) covers installation on macOS, Windows and Linux. For long batches, keep the machine awake on AC power. [`references/batch.md`](skills/photoreal-demos/references/batch.md) explains why.

## Add another skill

Create a directory under `skills/` with a unique lowercase, hyphenated name:

```text
skills/
  astra-advisor/
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
