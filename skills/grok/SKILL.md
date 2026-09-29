---
name: grok
description: >-
  Consult Grok directly from the shell for a second opinion, an independent
  review, or an outside perspective, without asking the user to relay
  anything manually. Use when the user explicitly says "ask grok", "check
  with grok", "get a second opinion from grok", or "consult grok" — or when
  a confidence gate (e.g. the ship skill's Phase 2) stalls and an external
  perspective would help. Not for routine questions Claude can answer alone.
---

# Grok

Run Grok as a subprocess and read its answer directly — no manual copy-paste relay needed.

## Invocation

```bash
grok -p "self-contained question here"
```

`-p`/`--single` is single-turn: it prints the response to stdout and exits. Treat the Bash tool call like any other command output.

For a follow-up in the same Grok session (multi-turn):

```bash
grok -c -p "follow-up question, referencing the prior answer if needed"
```

`-c` continues the most recent Grok session **for the current working directory** — run follow-ups from the same `cwd` as the original call.

## Writing the prompt

Grok has no access to this conversation — it starts cold every time `-p` runs without `-c`. The prompt must be self-contained:

- State what you want judged (a design decision, a diagnosis, a piece of code) and paste the relevant excerpt or paths inline — Grok can't read files you haven't shown it unless it has shell/tool access in whatever mode it's invoked with; default to pasting content rather than assuming file access.
- Say what you've already concluded and why, so Grok can push back on the reasoning rather than re-deriving it from scratch.
- Ask a specific question ("is this the right approach and what would break it?") rather than an open "thoughts?" — sharper prompts get sharper answers.
- If you want an unbiased read, withhold your own conclusion and ask Grok to reach its own first; if you want a stress test, state your conclusion and ask it to find holes.

## Using the answer

Grok is one external opinion, not a tiebreaker to defer to automatically. Synthesize:

- Where it agrees with your own analysis, that's corroboration — say so briefly rather than re-explaining the whole argument.
- Where it disagrees, evaluate the specific reason before changing course. A disagreement without a concrete mechanism ("this could be slower" with nothing to back it) is weaker evidence than one that names a failure case.
- Report the disagreement to the user rather than silently picking a side, when the two views genuinely conflict and the stakes are real.

## Notes

- `grok --version` / `grok --help` if behavior seems off — flags evolve.
- This is a live model call: it costs time and (depending on the user's Grok plan) money. Don't invoke it for routine questions you can answer yourself.
