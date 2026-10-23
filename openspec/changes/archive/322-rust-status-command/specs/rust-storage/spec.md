## ADDED Requirements

### Requirement: Watch state records
`read_watch_state(project_root: &Path, home: &Path) -> WatchState` in
`osq-kernel-storage` SHALL read, as TypeScript's `readWatchState` does,
`service.json` and `watcher.json` in `watch_state_dir(project_root, home)`,
and whether `watch.log` exists there. `WatchState`, `ServiceRecord`,
`WatcherRecord` and `WatcherMode` SHALL be public, exported from the crate
root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`. `WatchState` holds
`service: Option<ServiceRecord>`, `watcher: Option<WatcherRecord>`,
`log: PathBuf`, the folder's `watch.log` whether or not it exists, and
`log_exists: bool`. `ServiceRecord` holds `pid: u64`, `started_at: String`
and `log: String`. `WatcherRecord` holds `pid: u64`, `mode: WatcherMode`
(`Background` or `Terminal`, read from `background` and `terminal`),
`version: String`, `commit: String`, `started_at: String` and
`waiting: Option<String>`.

A record SHALL be `None` when its file is missing or cannot be read, when it
does not parse as a JSON object, when a field TypeScript's
`isServiceRecord` or `isWatcherRecord` checks is missing or of another type
(`waiting` may be a string or `null`, and `pid` must be a whole number that
fits `u64`), or when its `pid` names no live process: a pid of 0, or one
with no `/proc/<pid>` folder.

#### Scenario: Watch records
- **WHEN** `read_watch_state` reads a scratch project and a scratch home whose `watch_state_dir` folder holds the row's files, where `<live>` is the test process's own pid and `<dead>` is 2147483646
- **THEN** it returns the row's service and watcher, a `log` that is `watch.log` in that folder, and the row's `log_exists`:

| Files | Service | Watcher | `log_exists` |
|---|---|---|---|
| none | none | none | false |
| `watcher.json` `{"pid":<live>,"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}` | none | pid `<live>`, `Terminal`, `0.3.0`, `abc1234`, `s`, no waiting | false |
| `service.json` `{"pid":<live>,"startedAt":"s","log":"l"}`, `watcher.json` `{"pid":<live>,"mode":"background","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":"w"}`, `watch.log` | pid `<live>`, `s`, `l` | pid `<live>`, `Background`, waiting `w` | true |
| `watcher.json` `{"pid":<dead>,"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}` | none | none | false |
| `watcher.json` `{"pid":<live>,"mode":"daemon","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}` | none | none | false |
| `watcher.json` `{"pid":<live>,"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s"}` | none | none | false |
| `service.json` `{"pid":"<live>","startedAt":"s","log":"l"}` | none | none | false |
| `service.json` `not json` | none | none | false |

### Requirement: Validator failing record
`validator_failing(snapshots: &[ChangeSnapshot]) -> Option<ValidatorFailing>`
in `osq-kernel-storage` SHALL pick, as TypeScript's `readValidatorFailing`
does, the failing validator run of the archived changes. Its runs are every
`validator_ran` event of the snapshots whose location is archived, from
their event facts, whose outcome is not `not_run`, in snapshot order and
event order, then sorted stably by timestamp, a timestamp that does not
read as one counting as 0. When the last run's outcome is `failed`,
`timed_out` or `unreadable`, it returns that run's change folder, its
outcome, the number of runs from the end in a row whose outcome is one of
those three, and its error: the first line of its output that is not blank,
trimmed, or the outcome's text when there is none. Otherwise it returns
`None`. `ValidatorFailing` SHALL be public, exported from the crate root,
derive `Debug`, `Clone`, `PartialEq` and `Eq`, and hold `change: String`,
`outcome: ValidatorOutcome`, `runs: usize` and `error: String`.

#### Scenario: Validator failing runs
- **WHEN** `validator_failing` reads the snapshots of a scratch project whose only changes are the archived changes `201-v` and `202-w`, whose change streams hold the row's `validator_ran` events, given as outcome, timestamp and output
- **THEN** it returns the row's record:

| `201-v` runs | `202-w` runs | Record |
|---|---|---|
| `failed` at `2026-10-01T10:00:00.000Z` with `boom` | none | `201-v`, `failed`, 1, `boom` |
| `failed` at `2026-10-03T10:00:00.000Z` with no output | `unreadable` at `2026-10-02T10:00:00.000Z` with `x` | `201-v`, `failed`, 2, `failed` |
| `timed_out` at `2026-10-01T10:00:00.000Z` with `slow` | `validated` at `2026-10-02T10:00:00.000Z` | none |
| `validated` at `2026-10-01T10:00:00.000Z` | `failed` at `2026-10-02T10:00:00.000Z` with the output `\n  late  \nmore`, then `not_run` at `2026-10-03T10:00:00.000Z` | `202-w`, `failed`, 1, `late` |
| none | none | none |
