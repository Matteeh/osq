# Spec Delta: cli-foundation

## MODIFIED Requirements

### Requirement: Inbox configuration
`defineConfig` SHALL validate an optional `inbox` block over these defaults
and put the result on `OsqConfig.inbox`:

- `sound`: `default`. One of `default`, `bell`, `off`, or any other
  non-empty string, which is a sound file path relative to the project root.
- `quietHours`: `null`, or a string `HH:MM-HH:MM` in local time, where each
  hour is `00` to `23`, each minute `00` to `59`, and the two times differ.
- `soundWindowSeconds`: 5. A finite number zero or greater.
- `eventDebounceMs`: 200. A finite number zero or greater.
- `pollSeconds`: 300. A finite number greater than zero. It is the slow
  backstop for `osq inbox --follow` and the dashboard server; osq's own git
  writes reach both through the tree record.

A partial block SHALL keep each missing value's default. Any other value
SHALL throw an error that names the key, such as `inbox.quietHours must be
HH:MM-HH:MM with two different times`. `parseQuietHours` SHALL return the
start and end as minutes after midnight. `src/index.ts` SHALL export the
`InboxConfig` type.

#### Scenario: Defaults
- **WHEN** `defineConfig({})` runs
- **THEN** `inbox` is `{ sound: 'default', quietHours: null, soundWindowSeconds: 5, eventDebounceMs: 200, pollSeconds: 300 }`

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
