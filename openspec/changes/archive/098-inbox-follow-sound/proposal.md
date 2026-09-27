---
title: osq inbox --follow plays a sound when new work appears
depends_on: ["097"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - web-inspection
---
## Goal

A reviewer leaves `osq inbox --follow` running on their own machine. It
prints what `osq inbox` prints, then re-derives the items whenever a change
tree changes, and every `inbox.pollSeconds` as a safety net, and prints each
item that appears or goes away. When new items appear, a short sound plays,
at most once per `inbox.soundWindowSeconds` and never during
`inbox.quietHours`. The sound is a small WAV file osq
ships, played through the first system player found, with the terminal bell
as the fallback, also when the configured file is missing. The watcher
never makes a sound.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The config block goes
through `defineConfig` and `loadConfig`. The shipped sound is checked
against the script that generates it and against the package's `files`. The
player goes through `createInboxSound` with an injected spawn, `PATH`,
platform, and bell, so no test makes a sound. The follow loop goes through
`inboxDispatchCommand` with `follow: true`, a fake file watcher, an
immediate scheduler, a manual poll timer, a recording sound, and an abort
signal, over temporary
projects that `readDispatchItems` reads for real.

## Non-goals

- Cards, keys, and running actions. Those come with the queue item
  `inbox-cards`.
- The wait log. That is `inbox-wait-log`.
- A sound from the watcher, `osq watch`, bare `osq`, or `osq serve`.
- Seeing every change the moment it happens. A new worktree, a stacked
  cut, or a commit changes no watched path, so `--follow` sees them at the
  next poll, up to `inbox.pollSeconds` later. Watching git's own
  directories instead is left for a later change.
- A new runtime dependency. The players are system binaries osq spawns,
  and the file watcher is chokidar through `createInvalidationHub`.
- `--follow` with `--json`. The command refuses that pair.

## Surface

- Added: `osq inbox --follow` (flag). It prints `osq inbox`'s text, then `Waiting for new items (Ctrl-C to stop).`, then one `<HH:MM> + <kind> <id> <title>[ task <n>: <task title>] (<reason>)` line per item that appears and one `<HH:MM> - ...` line per item that goes away, until interrupted
- Added: `osq inbox: inbox.sound: <path> does not exist; using the bell` warning on stderr (command output)
- Added: `osq inbox --follow --json` refusal, `osq inbox: --follow prints text; drop --json`, exit code 1 (command output)
- Added: `inbox.sound`, default `default`: `default`, `bell`, `off`, or a sound file path relative to the project root (config key)
- Added: `inbox.quietHours`, default `null`: `HH:MM-HH:MM` in local time (config key)
- Added: `inbox.soundWindowSeconds`, default 5 (config key)
- Added: `inbox.eventDebounceMs`, default 200 (config key)
- Added: `inbox.pollSeconds`, default 30 (config key)
- Added: `sounds/inbox.wav` in the published package, and `scripts/make-inbox-sound.mjs` that generates it (file location)

## Decisions

- ADR 001: the `inbox` block loads through `loadConfig` and `defineConfig`, as every config block does.
- ADR 004: unchanged; `--follow` runs no validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

Change 097 added `osq inbox` in `src/cli/inbox-dispatch.ts`. It derives
items with `readDispatchItems` and orders them with `orderDispatchItems`,
and `formatDispatchText` in `src/core/status/dispatch-text.ts` prints them.
An item's identity for `--follow` is its kind, change folder, and task
number. An item that goes away and comes back, such as a task that dies
again after a retry, counts as new.

`createInvalidationHub` in `src/core/web/web-events.ts` already watches
every change tree, worktrees included, and batches events after a debounce.
It takes injectable `watch` and `schedule` seams that tests use in
`tests/serve-sse.test.ts`. `treeWatchPaths` in `src/core/web/web-trees.ts`
gives the paths it watches. The trees can change while `--follow` runs,
when an approval adds a worktree, so the loop compares the watched paths
after each derivation and opens a new hub when they differ, then derives
once more to cover events lost between the two hubs. With `vcs.enabled`,
`osq approve` leaves the checkout untouched and the watcher cuts stacked
branches outside it, so no watched path changes when a worktree appears.
The poll every `inbox.pollSeconds` is what finds it. It also finds a land
item that goes away when its archive is committed with `vcs.enabled` off.

The `serve` block in `src/core/foundation/config-serve.ts` is the model for
the `inbox` block: its own file, a validator, defaults, and a partial user
block.

The sound file ships in a new top-level `sounds/` directory, so
`package.json`'s `files` gains `sounds` and `tests/package-hygiene.test.ts`
allows the path. Measured in a scratch worktree, that is the only
preexisting test the change breaks.

## Contract

### Requirement: Bare inbox and osq inbox unchanged
Bare `osq`, `osq --json`, `osq inbox`, and `osq inbox --json` SHALL print
exactly what they printed before this change.

#### Scenario: Existing inbox suites
- **WHEN** the existing inbox and inbox dispatch tests run
- **THEN** every one passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Inbox configuration" and "Inbox follow flag".
- `specs/status-inspection/spec.md`: adds "Inbox sound", "Inbox sound file", and "Dispatch follow".

Four tasks, and no two share a file. Task 1 adds the `inbox` config block,
task 2 the sound file, its script, and packaging, task 3 the player, and
task 4 the follow loop, the flag, and README.md.
