## ADDED Requirements

### Requirement: Inbox configuration
<!-- source: src/core/foundation/config-inbox.ts, src/core/foundation/config.ts, src/core/foundation/config-user.ts, src/index.ts, tests/config-inbox.test.ts -->
`defineConfig` SHALL validate an optional `inbox` block over these defaults
and put the result on `OsqConfig.inbox`:

- `sound`: `default`. One of `default`, `bell`, `off`, or any other
  non-empty string, which is a sound file path relative to the project root.
- `quietHours`: `null`, or a string `HH:MM-HH:MM` in local time, where each
  hour is `00` to `23`, each minute `00` to `59`, and the two times differ.
- `soundWindowSeconds`: 5. A finite number zero or greater.
- `eventDebounceMs`: 200. A finite number zero or greater.
- `pollSeconds`: 30. A finite number greater than zero.

A partial block SHALL keep each missing value's default. Any other value
SHALL throw an error that names the key, such as `inbox.quietHours must be
HH:MM-HH:MM with two different times`. `parseQuietHours` SHALL return the
start and end as minutes after midnight. `src/index.ts` SHALL export the
`InboxConfig` type.

#### Scenario: Defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `inbox` is `{ sound: 'default', quietHours: null, soundWindowSeconds: 5, eventDebounceMs: 200, pollSeconds: 30 }`

#### Scenario: Partial block
- **WHEN** `defineConfig({ inbox: { quietHours: '22:00-07:00' } })` runs
- **THEN** `inbox.quietHours` is `22:00-07:00` and the other four values are the defaults

#### Scenario: Invalid quiet hours
- **WHEN** `inbox.quietHours` is `25:00-07:00`, `22:00-22:00`, or `10pm-7am`
- **THEN** `defineConfig` throws an error naming `inbox.quietHours`

#### Scenario: Invalid poll interval
- **WHEN** `inbox.pollSeconds` is 0
- **THEN** `defineConfig` throws an error naming `inbox.pollSeconds`

#### Scenario: Invalid sound
- **WHEN** `inbox.sound` is an empty string or a number
- **THEN** `defineConfig` throws an error naming `inbox.sound`

#### Scenario: Loaded from the config file
- **WHEN** `osq.config.ts` sets `inbox: { sound: 'bell' }`
- **THEN** `loadConfig` returns `inbox.sound` as `bell`

### Requirement: Inbox follow flag
<!-- source: src/cli/inbox-dispatch.ts, src/core/status/dispatch-text.ts, README.md, tests/inbox-follow.test.ts -->
`osq inbox --follow` SHALL run the dispatch follow loop until interrupted,
with the inbox sound built from the config, and SHALL stop cleanly on
SIGINT. `inboxDispatchCommand` SHALL take `follow`, `signal`, `sound`,
`watch`, `schedule`, `every`, and `now` options so tests drive the loop
without a terminal, a real watcher, a real timer, or a real sound. With `--json`, `--follow` SHALL print
`osq inbox: --follow prints text; drop --json` to stderr and exit with
code 1. Without `--follow`, `osq inbox` and `osq inbox --json` SHALL print
what they printed before. `formatDispatchItemSummary` SHALL return
`<kind> <id> <title>[ task <n>: <task title>] (<reason>)`, the text that
follows the position on each line of `osq inbox`'s list.

README.md SHALL say, in the Human Attention Inbox section, what
`osq inbox --follow` prints, when it plays a sound, which players it tries,
and the five `inbox` config keys with their defaults. Its Commands list
SHALL include `osq inbox --follow`.

#### Scenario: Follow through the command
- **WHEN** `inboxDispatchCommand({ follow: true })` runs with a fake watcher, a recording sound, and a signal that aborts after one event
- **THEN** it prints `osq inbox`'s text, the waiting line, one line per new item, and resolves after the abort

#### Scenario: JSON refused
- **WHEN** `osq inbox --follow --json` runs
- **THEN** stderr holds `osq inbox: --follow prints text; drop --json` and the exit code is 1
