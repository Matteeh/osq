---
title: osq sync refuses while the watcher runs
depends_on: []
verify: pnpm verify
features:
  reads: [watcher-and-harness, status-inspection, cli-foundation, spec-lint-and-approve]
---
## Goal

On 2026-10-23 a manual `osq sync 305` was between its merge and its commit
when the watcher checked 305's worktree, so the watcher halted a healthy
change with `worktree_dirty`. Instead of adding locks, `osq sync` fails fast:
while a watcher runs for the project, it refuses at once, writes nothing,
and says what to do. Since `sync-before-retry` (316) the watcher takes the
default branch itself before a retried attempt, so a manual sync is rarely
needed.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test and lint. That covers
`tests/vcs-sync-command.test.ts`, where "Watcher running" proves the
refusal with a live watcher record, with a live service record naming the
service's pid, and that a dead record or no record syncs as before; the
other sync scenarios still pass unchanged.

## Non-goals

- Locks on worktrees.
- The same refusal on other commands; add it to one only when it causes a halt.
- The Rust sync.

## Surface

- Changed: `osq sync <id>` refuses while a watcher runs for the project, with `a watcher runs for this project (pid <pid>); it syncs <folder> before the change's next attempt, or stop it and run osq sync <id> again`.

## Decisions

- ADR 003: the refusal comes before any git write, so a refused sync leaves the worktree as it was.
- ADR 021: autopilot never runs `osq sync`; the watcher syncs a change itself before a retried attempt and at land, so the refusal never stops autopilot.
- ADR 012: a watcher counts while its `~/.osq/watch` record names a live pid, read through `readWatchState` as `osq status` reads it.

## Assumptions

- The human runs `osq sync` with the main checkout as the project root, the folder the watcher's record is keyed by. A sync started from inside a worktree finds no record and is not refused.
- The check sits after the change lookup, so an unknown id still says `No change "<id>" runs in an osq worktree` while a watcher runs.

## Contract

### Requirement: Sync on request

See `specs/version-control/spec.md`: `syncChange` refuses while a live
watcher or service record exists for the project.

#### Scenario: Watcher running
- **WHEN** a watcher runs for the project and a human runs `osq sync <id>`
- **THEN** sync refuses, naming the pid, and the worktree is untouched

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: MODIFIED "Sync on request", adding the watcher refusal and the scenario "Watcher running". Task 1.
