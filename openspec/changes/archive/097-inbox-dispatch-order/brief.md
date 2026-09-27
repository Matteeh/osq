---
queue_item: inbox-dispatch-order
queue_hash: sha256:233f208efe406ece3bd8b2fb562741a55a0964beb8d33768e9f66cd09088cf1e
planner: null
date: 2026-09-26
---

### Goal

A new `osq inbox` command lists the items that need a human, in the order a reviewer should take them, and prints the first one as a card with its question and evidence. `osq inbox --json` carries every item's card data. Bare `osq` stays the overview it is today.

### Context

- Bare `osq` and `osq --json` print the human attention inbox from change 037 (`src/core/status/inbox*.ts`). Its `needsYou` kinds are `planning`, `approval`, `task-dead`, `task-regressed`, `change-regressed`, `verification-pending`, and `verification-failed`, in numeric order. There is no `osq inbox` subcommand.
- `readNextStep` in `src/core/status/next-step.ts` already tells whether an unapproved change is ready for approval or still unplanned, and whether an approved change is dead, blocked, or running.
- `osq approve` and `osq show` print the approval digest: the goal, delta changes per capability, governing decisions, tasks with scope counts, and flags (`src/core/spec/digest*.ts`).
- Stage 1 of ADR 003 has landed. With `vcs.enabled`, a change archives on `osq/<folder>` and lands by hand. `readDependencyState` in `src/core/spec/stack-dependencies.ts` reads such a change as `archived` until the default branch holds its archive. `buildSquashMessage` and `osq message` (change 095) produce its squash message, and a dead task in a worktree leaves `.run/dead/<n>.patch`.
- With `vcs.enabled` off, archive moves the folder in the checkout, and whether it is committed can be read from the `Vcs` port's `status`.
- `src/cli/index.ts` is close to the 250-line budget, so new commands register from their own file.

### Requirements

- `osq inbox` derives its items from state every time, through the change locations module, and stores nothing. The kinds are:
  - **approval**: an unapproved change whose next step is `ready-for-approval`.
  - **halt**: a dead or regressed task, or a change-level regression, including worktree halts.
  - **land**: with `vcs.enabled`, a change archived on its `osq/` branch that the default branch does not hold. With the flag off, an archive folder that `Vcs` status reports as untracked or modified. Under `NoVcs`, there are no land items.
  - **verify**: an archived change whose next step is `verification-pending`.
- An item's weight is the number of changes that wait on it through `depends_on`, transitively, itself included.
- Order: when the watcher has nothing runnable (no active change's next step is `running`), items whose action would give it work come first (approval and halt). Then heavier items, then lower change id, then lower task number. The same state always gives the same order.
- Each item carries its kind, change, task when there is one, weight, a one-line reason for its place in the order, the commands osq already has for it, and its card data:
  - approval: the approval digest, as `osq show` builds it.
  - halt: the task, the dead reason, the attempt count, the end of the last verify output with paths relative to the project root, and the patch path when a worktree dead path left one.
  - land: the goal, each task's outcome, and, with `vcs.enabled`, the squash message `osq message` prints.
  - verify: the check command or the `osq verified` command, and the after-landing steps.
- `osq inbox` prints the ordered list, one line per item, then the first item's card. `osq inbox --json` prints every item with its card data. An empty inbox says so.
- Bare `osq` and `osq --json` are unchanged.

### Non-goals

- Keys, running actions from the card, `--follow`, sound, and the wait log. Those are the next three items.
- New actions.

### Notes for planning

- Put derivation, ordering, and each card kind in their own modules under `src/core/status/`.
- Reuse the digest builder, `readNextStep`, `readDependencyState`, and the squash message builder rather than re-deriving.
