---
title: osq plan prints the prompt a human pastes into a planning agent as is
depends_on: []
verify: pnpm verify
features:
  reads:
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
    - web-inspection
---
## Goal

After `osq plan --next` or `osq plan <id>`, the human copies one block that osq
printed and pastes it into a new agent session. Nothing is typed by hand before
each plan. The block tells the agent it is the planner for this change and
points it at `plan-prompt.md`, which already holds the complete prompt. When
Claude Code's managed `/osq-plan` command can find the folder, osq also prints
that shorter option.

The handoff osq prints today stays as the first line, word for word: the remote
CLI and the MCP `plan` tool parse it. The block follows it:

```
/p/openspec/changes/190-plan-handoff-prompt: ask your planning tool to plan change 190-plan-handoff-prompt — next: unplanned — osq plan 190

Paste this into a new agent session to plan it:

You are the planner for osq change 190-plan-handoff-prompt.
Read /p/openspec/changes/190-plan-handoff-prompt/plan-prompt.md and follow it exactly; it is your complete prompt.

In Claude Code, /osq-plan 190 does the same.
```

One function, `formatPlanPasteBlock`, gives the block, so the later Change page
copy button (queue item `change-page-phone`) gives the same text.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/plan-paste-block.test.ts` proves the block and the local handoff in
every mode. `tests/remote-plan-handoff.test.ts` proves a remote CLI prints
the same block for its working copy.

## Non-goals

- Copying to the system clipboard.
- Starting an agent from osq.
- Changing the managed `/osq-plan` command so it can find a folder outside the
  changes folder. A steered change in its worktree and a remote working copy
  get the paste block only.
- Showing the block in the dashboard. `change-page-phone` does that.
- Changing `--print` or `--session`.

## Surface

- Changed: the default `osq plan <name>` and `osq plan --next` output gains the paste block after the handoff line, and `In Claude Code, /osq-plan <id> does the same.` when that command can find the folder.
- Changed: the MCP `plan` tool's text and a remote `osq plan`'s output gain the same block.

## Decisions

- ADR 001: unchanged; nothing here reads config.
- ADR 004: unchanged; the OpenSpec validator is not involved.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: unchanged; the validator does not read the handoff.
- ADR 012: unchanged; the watch service never plans.
- ADR 018: unchanged; the automatic planner builds its own prompt and never prints the handoff, so the paste block is for a human starting a planner.
- ADR 015: the MCP `plan` tool's text changes only because the command it calls prints more; no tool is added and none writes outside a change folder.

## Assumptions

- The handoff line stays exactly as today, because `src/cli/remote-plan.ts` finds it by its text and people may rely on it.
- The block names `plan-prompt.md` by its absolute path, so the agent finds it from any working directory.
- `/osq-plan <id>` is printed only when `.claude/commands/osq-plan.md` exists in the working directory and the folder sits directly in that directory's changes folder, because the command looks for the change only there.
- The managed command accepts the change's id, as `/osq-plan 190` does today.

## Contract

The requirements are in the delta. In short:

- "Plan paste block" (added) defines `formatPlanPasteBlock` and `formatPlanHandoff`.
- "Plan handoff with the paste block" (added) says the default handoff prints it, and when it prints the Claude Code line.
- "Interactive planning command", "Plan handoff next step", "Planning against a server" and "MCP planning tools" (modified) stop saying the handoff is one line, and the remote client rebuilds the block for its working copy.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Plan paste block" and "Plan handoff with the paste block"; modifies "Interactive planning command", "Plan handoff next step", "Planning against a server" and "MCP planning tools".

No file is shared between tasks. Task 2 reads `src/core/foundation/plan-handoff.ts`, which task 1 creates, and does not change it.
