---
title: osq inbox orders what needs a human and shows the evidence
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - version-control
    - watcher-and-harness
---
## Goal

A reviewer runs `osq inbox` and sees the items that need a human, in the
order they should be taken, with the first one printed as a card that
holds its question and evidence. `osq inbox --json` carries every item's
card data. The order puts first what gives an idle watcher work, then what
holds up the most changes. Bare `osq` stays the overview it is today. This
is the first of four queue items that grow the inbox into a dispatcher.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests build temporary
projects and read them through the real entry points. Items and order go
through `readDispatchItems` and `orderDispatchItems`, cards through
`readDispatchCard`, and the command through `inboxDispatchCommand` and
`createProgram`. Land items are checked on temporary git repositories, both
with `vcs.enabled` and with it off.

## Non-goals

- Keys, running actions from a card, `--follow`, sound, and the wait log.
  Those are the queue items `inbox-follow-sound`, `inbox-cards`, and
  `inbox-wait-log`.
- New actions. Cards list commands osq already has.
- Running lint or the OpenSpec validator for an approval item. The approval
  digest is its evidence.
- Changing bare `osq` or `osq --json`.
- Deciding whether the watcher would retry a dead task automatically. That
  decision lives in `src/watcher/auto-retry.ts`, which core cannot import. A
  retried task loses its dead marker in the same cycle, so its item goes
  away.

## Surface

- Added: `osq inbox` (command). It prints the ordered items, then the first item's card
- Added: `osq inbox --json` (flag). It prints `{ watcherIdle, items }` with every item's card data
- Added: dispatch item kinds `approval`, `halt`, `land`, and `verify` (JSON values)
- Added: `limits.cardOutputLines`, default 20, the most marker lines a halt card shows (config key)

## Decisions

- ADR 001: `osq inbox` loads its config with `loadConfig`, as every command does.
- ADR 004: an approval item runs no validator; its card is the approval digest.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

Bare `osq` (change 037) projects `needsYou`, `running`, and `landed` in
numeric order from `getStatusOverview`, in `src/core/status/inbox*.ts`. The
new command reuses the same overview: its specs, their `nextSteps`, and
`pendingVerifications`. It leaves those modules alone. `projectNeedsYou`
shows how the overview maps to items.

Land items follow ADR 003's two modes. With `vcs.enabled`, a change
archives on `osq/<folder>` in its worktree. `readDependencyState` in
`src/core/spec/stack-dependencies.ts` reads it as `archived` until the
default branch holds its archive, and `buildSquashMessage` in
`src/core/run/squash-message.ts` builds the message `osq message` prints.
With the flag off, the archive is in the checkout, and the `Vcs` port's
`status` says whether it is committed.

`squash-message.ts` keeps a private copy of `matchesFolder`, because change
095 ran before 096 exported it from `change-locations.ts`. It also has a
private `outcomeLine`. Task 3 exports `outcomeLine` for the land card and
replaces the copy with the export.

`src/cli/index.ts` has 244 lines, so `osq inbox` registers from its own file,
as `osq message` does. New modules must find change folders through the
change locations module (`tests/change-locations-readers.test.ts`).

## Contract

### Requirement: Bare inbox unchanged
Bare `osq` and `osq --json` SHALL print exactly what they printed before
this change.

#### Scenario: Existing inbox suite
- **WHEN** the existing inbox tests run
- **THEN** every one passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: adds "Dispatch items", "Dispatch order", and "Dispatch cards".
- `specs/cli-foundation/spec.md`: adds "Inbox dispatch command".

Four tasks, and no two share a file. Task 1 derives the items, task 2
orders them, task 3 builds each card, and task 4 wires them into
`osq inbox` and README.md.
