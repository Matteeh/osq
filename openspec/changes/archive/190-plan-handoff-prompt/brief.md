---
queue_item: plan-handoff-prompt
queue_hash: sha256:cff8eff2ff4e5b6dce284fe35b3c29e643ecbb3d85beb51d3eacacde19dd127b
planner: null
date: 2026-10-13
---

### Goal

After `osq plan --next` or `osq plan <id>`, the human copies one block that osq printed and pastes it into a new agent session. Nothing is typed by hand before each plan.

### Context

As of 2026-10-13:

- The default handoff, `writePromptHandoff` in `src/cli/plan.ts`, writes `plan-prompt.md` and prints one line: `<folder>: ask your planning tool to plan change <folder> — next: <next step>`.
- Before every plan the human types the same preamble into a new Claude Code session ("you are the planner in this osq driven development project, read PLANNER.md to get started, here is the new spec:") and pastes that line after it. The planner then has to find `plan-prompt.md` by itself.
- `osq init` installs `.claude/commands/osq-plan.md`, so `/osq-plan <id>` already loads the right instructions in Claude Code. The handoff line does not mention it.
- The server UI sketch (Notion, "Server UI screens", screen 10 "New brief → hand off") wants the same text behind a copy button.

### Requirements

- The handoff prints a short paste-ready block, set apart from the other output, that tells any agent it is the planner for this osq project, names the change folder and its `plan-prompt.md`, and says to follow that file exactly. Pasting the block alone is enough to start planning.
- When the project has the managed Claude Code command, the handoff also prints `/osq-plan <id>` as the shortest option.
- The block is the same for `osq plan --next` and `osq plan <id>`, including for a change that needs steering, and a forwarded `osq plan` from a remote CLI prints the same block.
- The block comes from one function the server and dashboard can call too, so a later copy button gives the same text.
- `--print` and `--session` behave as today.

### Non-goals

- Copying to the system clipboard.
- Starting an agent from osq.

### Notes for planning

- Tests that pin today's one-line handoff need updating; measure them in a scratch worktree first.
