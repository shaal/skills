# dsp: start Claude Code with Sonnet as the main model, Opus as the advisor,
# Haiku for subagents that set no model of their own, and no permission
# prompts. Arguments pass through, so `dsp --resume` and `dsp -c` work.
#
# Source this file from your shell startup file, such as ~/.zshrc or ~/.bashrc
# (on macOS, ~/.bash_profile). Tested with Claude Code 2.1.294.
alias dsp="CLAUDE_CODE_SUBAGENT_MODEL=haiku claude --dangerously-skip-permissions --model sonnet --advisor opus"
