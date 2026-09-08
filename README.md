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

Omit `--global` to install into the current project. Installation copies skill instructions; model access and tool capabilities come from the agent running them.

## Available skills

| Skill | Purpose |
| --- | --- |
| [sol-astra-advisor](skills/sol-astra-advisor/SKILL.md) | Sol owns progress, implementation, and verification. Astra provides selective advice for difficult decisions, architectural trade-offs, or independent review. |

### Sol with Astra Advisor

Use `$sol-astra-advisor` in a task running on Sol. The skill requires the advisor call to explicitly specify `model: "gpt-6-astra"`, `reasoning_effort: "high"`, and `fork_turns: "none"`. Sol supplies the question, necessary materials, and constraints in a self-contained brief.

Astra provides recommendations, rationale, and risks without editing files, mutating external state, or spawning other agents. Sol continues implementation and verification. Existing approval requirements stay unchanged. If the required model selection or context controls are unavailable, the skill requires disclosure before attempting a consultation or fallback.

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
