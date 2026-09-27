# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Stage 1 of `decisions/003-git-strategy.md` is complete: changes 087 to 096 landed with `vcs.enabled` off. `enable-vcs-for-osq` turns it on for this repository once the human decides to approve and land on `main`.

The inbox dispatcher is four items, in order: `inbox-dispatch-order`, `inbox-follow-sound`, `inbox-cards`, and `inbox-wait-log`. Together they grow `osq inbox` into a dispatcher that brings the work to the reviewer. The original single brief was split on 2026-09-27 because it would have been the largest change osq has run.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [inbox-dispatch-order] osq inbox orders what needs a human and shows the evidence

Depends on: nothing

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

## [inbox-follow-sound] osq inbox --follow plays a sound when new work appears

Depends on: inbox-dispatch-order

### Goal

A reviewer leaves `osq inbox --follow` running on their own machine. When an item appears that was not there before, a short sound plays. The watcher never makes a sound.

### Context

- `inbox-dispatch-order` added `osq inbox` and its items.
- `src/core/web/web-events.ts` already watches every change tree, worktrees included, for `osq serve`'s invalidation. chokidar is a runtime dependency.
- The watcher may run somewhere with no audio device. `osq inbox` runs on the host and only reads files.
- osq keeps its runtime dependencies to chokidar, yaml, commander, and jiti.

### Requirements

- `osq inbox --follow` re-derives the items whenever a change tree changes, prints each item that appears, and keeps running until interrupted. An empty inbox waits.
- A sound plays when an item appears that was not there before. Items that appear within a few seconds of each other (a config value) make one sound. Items present at start make no sound.
- `inbox.sound` in `osq.config.ts` is `default`, `bell`, `off`, or a path to a sound file. `default` plays a short sound file osq ships, through the first player found: `afplay` on macOS, then `pw-play`, `paplay`, or `aplay` on Linux. With no player, it rings the terminal bell.
- `inbox.quietHours`, such as `22:00-07:00` in local time, silences the sound. Items still appear.
- The watcher never plays a sound.

### Non-goals

- Cards and keys. Those come with `inbox-cards`.

### Notes for planning

- Test the sound through an injectable player, so no test makes noise.
- Generate the sound file with a script in the repository, so it is original, and keep it under a few kilobytes. Ship it in the package.

## [inbox-cards] osq inbox opens cards and the next item when one is done

Depends on: inbox-follow-sound

### Goal

On a terminal, `osq inbox` opens the first item as a card with a key for each action. When the action finishes and the item is gone, the next card opens at once. A reviewer does nothing but review.

### Context

- `inbox-dispatch-order` built each item's card data and commands. `inbox-follow-sound` added `--follow`, re-derivation on change, and the sound.
- `osq approve --confirm` already prompts through `node:readline/promises` and refuses without a terminal.

### Requirements

- With a TTY, `osq inbox` shows the first item's card and lists its actions, each with the key that runs it, plus one key that opens the full detail (`osq show`) and one that quits. Without a TTY, it prints as `inbox-dispatch-order` does.
- A key runs the existing command in-process, with its own output shown.
- When the item is gone after its action, the next item's card opens. When it is still there, the same card shows again.
- An empty inbox waits and opens the first item that arrives, with the sound.
- No sound plays while a card is open. A new item waits its turn.

### Non-goals

- New actions.
- Cards in the browser.

### Notes for planning

- Read keys through an injectable input stream, so tests drive the loop without a terminal.

## [inbox-wait-log] osq inbox records how long items waited and osq report shows it

Depends on: inbox-cards

### Goal

osq records how long each item waited for a human, so it shows whether reviews happen sooner without getting worse.

### Context

- `inbox-cards` opens cards. `osq inbox` runs on the reviewer's machine, and `~/.osq/` already holds derived per-user data such as `~/.osq/last-look/`.
- `src/core/report/report.ts` is allow-listed in the line budget, so new report sections go in their own module.

### Requirements

- While it runs, `osq inbox` appends to a log under `~/.osq/inbox/`, per project. For each item it records when the item appeared, when its card opened, and when it disappeared, and whether the watcher had anything runnable at each of those moments.
- An item that appeared while no inbox was running starts its waiting time when the inbox first sees it, and the log marks it that way.
- The order's age tiebreak uses the log's first-seen time when there is one.
- `osq report` shows, per kind and for a chosen period, the median and longest waiting time from appearing to disappearing, how long the watcher sat idle while the top item was a human's, and how many items were handled back to back in one session. For a period with no log, those numbers say not measured.

### Non-goals

- Streaks, and routing items to one reviewer in a team.

### Notes for planning

- Test the report from a fixture log.

## [enable-vcs-for-osq] Turn on version control for osq itself

Depends on: nothing

### Goal

osq's own changes run in worktrees on `osq/` branches from here on. This is the first change after stage 1, and the first real test of it.

### Context

- ADR 003 migration: every stage-1 change ran with the flag off; the flag turns on for the change after the stage.
- Approve refuses off the default branch without `--base-ok`, so approvals from here on happen on `main`.

### Requirements

- `osq.config.ts` sets `vcs.enabled: true`, `vcs.author`, and `vcs.prepare: 'pnpm install --frozen-lockfile'`.
- README.md documents the stage-1 flow: approve on the default branch, where the worktree is, not editing it while a task runs, and landing by hand with `osq message`.

### Non-goals

- Any code change.

### Notes for planning

- Ask the human which identity `vcs.author` should use.
- `osq doctor` should show no `vcs-prepare` warning afterwards.
