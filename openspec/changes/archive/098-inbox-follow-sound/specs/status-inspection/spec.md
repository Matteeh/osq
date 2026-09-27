## ADDED Requirements

### Requirement: Inbox sound
<!-- source: src/core/status/inbox-sound.ts, tests/inbox-sound.test.ts -->
`createInboxSound(projectRoot, config, deps)` SHALL return an object with
`notify(now: Date): void`, which plays one sound for a batch of new inbox
items. `deps` SHALL hold `platform`, `path` (the `PATH` value), `spawn`,
`bell`, `warn`, and `exists`, each defaulting to the real one, so tests make no
sound. It SHALL resolve the sound from `config.inbox.sound`:

- `off`: `notify` does nothing.
- `bell`: `notify` calls `bell`, which writes `\u0007` to stdout by default.
- `default`: the file `sounds/inbox.wav` under the package root.
- any other value: that path resolved against the project root.

For a file that does not exist, it SHALL print
`osq inbox: inbox.sound: <path> does not exist; using the bell` to stderr
once, through `deps.warn`, and `notify` SHALL call `bell`. It SHALL pick the player once: on
`darwin`, `afplay`; on `linux`, the first of `pw-play`, `paplay`, and
`aplay`; each only when an executable file of that name is in a `PATH`
directory. With no player, `notify` SHALL call `bell`. With a player,
`notify` SHALL spawn it with the file as its one argument, ignore its
output, not wait for it, and call `bell` when the spawn emits an error.

`notify` SHALL do nothing when `now`, in local time, falls in
`inbox.quietHours`: from the start time, inclusive, to the end time,
exclusive, across midnight when the start is later than the end. It SHALL
do nothing when it played less than `inbox.soundWindowSeconds` before
`now`. Nothing under `src/watcher/` or `src/harness/` SHALL import this
module.

#### Scenario: Linux player order
- **WHEN** the platform is `linux` and `PATH` holds executable `paplay` and `aplay` but no `pw-play`
- **THEN** `notify` spawns `paplay` with the package's `sounds/inbox.wav`

#### Scenario: macOS player
- **WHEN** the platform is `darwin` and `PATH` holds executable `afplay`
- **THEN** `notify` spawns `afplay` with the sound file

#### Scenario: No player
- **WHEN** no player is in `PATH`
- **THEN** `notify` calls `bell` and spawns nothing

#### Scenario: Spawn error
- **WHEN** the spawned player emits an error
- **THEN** `bell` is called

#### Scenario: Bell and off
- **WHEN** `inbox.sound` is `bell`, and then `off`
- **THEN** `notify` calls `bell` without spawning, and then does nothing

#### Scenario: Own sound file
- **WHEN** `inbox.sound` is `sounds/ping.wav` and that file exists under the project root
- **THEN** `notify` spawns the player with that file's absolute path

#### Scenario: Missing sound file
- **WHEN** `inbox.sound` names a file that does not exist
- **THEN** `createInboxSound` warns `osq inbox: inbox.sound: <path> does not exist; using the bell` once, and `notify` calls `bell` without spawning

#### Scenario: Quiet hours across midnight
- **WHEN** `inbox.quietHours` is `22:00-07:00` and `notify` runs at 23:30, 06:59, and 07:00 local time
- **THEN** only the 07:00 call plays

#### Scenario: One sound per window
- **WHEN** `inbox.soundWindowSeconds` is 5 and `notify` runs at 0, 3, and 6 seconds
- **THEN** it plays at 0 and 6 seconds only

#### Scenario: Watcher stays silent
- **WHEN** every source file under `src/watcher/` and `src/harness/` is read
- **THEN** none imports `inbox-sound` or `dispatch-follow`

### Requirement: Inbox sound file
<!-- source: sounds/inbox.wav, scripts/make-inbox-sound.mjs, tests/inbox-sound-file.test.ts -->
`scripts/make-inbox-sound.mjs [out]` SHALL write a short two-tone chime as a
mono 16-bit PCM WAV file, to `out` when given and to `sounds/inbox.wav`
otherwise, computing every sample itself so the sound is original. The same
script SHALL write the same bytes every time. `sounds/inbox.wav` SHALL be
that output, at most 4096 bytes. `package.json`'s `files` SHALL include
`sounds`, so the published package holds `sounds/inbox.wav`.

#### Scenario: Regenerated file matches
- **WHEN** the script writes to a temporary path
- **THEN** the bytes equal `sounds/inbox.wav`

#### Scenario: Small WAV
- **WHEN** `sounds/inbox.wav` is read
- **THEN** it starts with `RIFF` and `WAVE`, declares one channel and 16 bits per sample, and is at most 4096 bytes

#### Scenario: Shipped
- **WHEN** `package.json` is read
- **THEN** its `files` include `sounds`

### Requirement: Dispatch follow
<!-- source: src/core/status/dispatch-follow.ts, tests/inbox-follow.test.ts -->
`followDispatch(projectRoot, config, options)` SHALL print what
`formatDispatchText` prints for the current items, then
`Waiting for new items (Ctrl-C to stop).`, and then watch the change trees
through `createInvalidationHub`, with `inbox.eventDebounceMs` as its
debounce and the injectable `watch` and `schedule` from `options`. After
each batch, it SHALL derive the items again with `readDispatchItems` and
`orderDispatchItems` and print, in order, one line per item whose kind,
change folder, and task number were not among the previous derivation's
items: `<HH:MM> + ` in local time from `options.now`, then
`formatDispatchItemSummary`'s text. It SHALL then print one line per
previous item that is no longer there, `<HH:MM> - ` and the same text as
it was last derived. When at least one `+` line printed, it SHALL call
`options.sound.notify(now)` once; a `-` line alone SHALL make no sound. Items present at start SHALL
make no sound, and an item that went away and came back SHALL count as new.

It SHALL also derive every `inbox.pollSeconds`, through `options.every`,
a repeating timer seam that defaults to `setInterval` and returns a handle
with `cancel()`. Derivations SHALL run one at a time; a batch or poll that
arrives during one SHALL cause one more derivation after it. After each derivation, it SHALL read the
trees again through `options.trees`, which defaults to `changeTrees`, and
when their `treeWatchPaths` differ from the watched paths, it SHALL close the
hub, open a new one over the new trees, and derive once more. A derivation
that throws SHALL print `osq inbox: <message>` to stderr and keep
following. When `options.signal` aborts, it SHALL close the hub, cancel
the poll timer, and resolve. It SHALL write nothing to the project.

#### Scenario: New halt
- **WHEN** following starts with one approval item, then a task dies and the watcher fires
- **THEN** one `<HH:MM> + halt ...` line prints and `notify` is called once

#### Scenario: Start makes no sound
- **WHEN** following starts with two items and the watcher fires with no state change
- **THEN** no `+` line prints and `notify` is never called

#### Scenario: Item goes away
- **WHEN** following starts with a halt item, then its dead marker is removed and the watcher fires
- **THEN** one `<HH:MM> - halt ...` line prints and `notify` is never called

#### Scenario: Poll finds an item
- **WHEN** a task dies with no watcher event and the poll timer fires
- **THEN** its `+` line prints and `notify` is called once

#### Scenario: Two items in one batch
- **WHEN** two new items appear before one batch
- **THEN** two `+` lines print in dispatch order and `notify` is called once

#### Scenario: Item comes back
- **WHEN** a dead task's marker is removed, the watcher fires, then the marker returns and the watcher fires
- **THEN** the second derivation prints the halt item again and calls `notify`

#### Scenario: Empty inbox waits
- **WHEN** following starts on a project with no items
- **THEN** it prints `Nothing needs you.` and the waiting line, and keeps running until the signal aborts

#### Scenario: New tree
- **WHEN** `options.trees` returns a second tree after the first derivation
- **THEN** the loop opens a new watcher over the new paths, closes the old one, and derives once more
