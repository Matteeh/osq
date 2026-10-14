## ADDED Requirements

### Requirement: Usage limit events
An adapter SHALL append one `usage_limit` event when its harness reports that
the account hit its usage limit. The event carries `resetsAt`, an ISO time, when
the harness gives the reset time, and `error`, the harness's message, when it
gives one. The adapters recognise these records:

- Claude Code: a `rate_limit_event` whose `rate_limit_info.status` is
  `rejected`. Its `rate_limit_info.resetsAt` is in epoch seconds.
- OpenCode: an `error` event whose `error.type` is `provider.quota`, with
  `error.message` as the error.
- Codex: a `turn.failed` whose error message contains `hit your usage limit`,
  with that message as the error. It stays a terminal failure.

Every other record SHALL add no `usage_limit` event. The Pi and Antigravity
adapters SHALL add none.

#### Scenario: Usage limit records
- **WHEN** each line below is replayed through its adapter's stdout translation for task 1
- **THEN** task 1's events gain what the row says:

| Adapter | Line | Event |
| --- | --- | --- |
| Claude | `{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1791990000,"rateLimitType":"five_hour"}}` | `usage_limit` with `resetsAt` `2026-10-14T15:00:00.000Z` and no `error` |
| Claude | `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}` | none |
| OpenCode | `{"type":"error","timestamp":1791980000000,"sessionID":"ses_1","error":{"type":"provider.quota","message":"Monthly quota exceeded"}}` | `usage_limit` with `error` `Monthly quota exceeded` and no `resetsAt` |
| OpenCode | `{"type":"error","timestamp":1791980000000,"sessionID":"ses_1","error":{"type":"provider.no-route","message":"No route"}}` | none |
| Codex | `{"type":"turn.failed","error":{"message":"You’ve hit your usage limit. Try again at 3:00 PM."}}` | `usage_limit` with `error` `You’ve hit your usage limit. Try again at 3:00 PM.` and no `resetsAt` |
| Codex | `{"type":"turn.failed","error":{"message":"stream disconnected"}}` | none |

#### Scenario: Codex limit still fails the turn
- **WHEN** Codex prints the usage-limit `turn.failed` line and exits zero
- **THEN** spawn returns a failed outcome carrying that message, as for any terminal turn failure

### Requirement: Usage pause marker
`src/core/run/usage-pause.ts` SHALL own `.run/paused.md` in a change folder
(`usagePausePath`). Its frontmatter SHALL hold `task`, `until` and `source`.
`task` is a task number. `until` is an ISO time. `source` is `harness` when the harness gave the reset time and `wait`
otherwise. Its body SHALL be the limit's error, or `usage limit reached`
without one. `writeUsagePause(folderPath, pause)` SHALL write the file.
`readUsagePause(folderPath)` SHALL return the pause, or null for a missing or
malformed file. `readActivePause(folderPath, now)` SHALL return it only while
its `until` is later than `now`.

`findUsageLimit(events)` SHALL return `{ resetsAt?, error? }` from the data of
the last `usage_limit` event among the given events, or undefined without
one. `pauseUntil(limit, now, waitSeconds)` SHALL return `until` and `source`.
When the limit's `resetsAt` is later than `now`, it returns that time with
source `harness`. Otherwise it returns `now` plus `waitSeconds` with source
`wait`. `formatPauseUntil(until)` SHALL render the time in UTC as
`YYYY-MM-DD HH:MM UTC`.

#### Scenario: Pause times
- **WHEN** `pauseUntil` runs at `2026-10-14T12:00:00.000Z` with `waitSeconds` 1800 for each limit below
- **THEN** it returns the row's `until` and `source`:

| `resetsAt` | `until` | `source` |
| --- | --- | --- |
| `2026-10-14T15:00:00.000Z` | `2026-10-14T15:00:00.000Z` | `harness` |
| none | `2026-10-14T12:30:00.000Z` | `wait` |
| `2026-10-14T11:00:00.000Z` | `2026-10-14T12:30:00.000Z` | `wait` |

#### Scenario: Active pause
- **WHEN** `writeUsagePause` writes task `2`, until `2026-10-14T15:00:00.000Z`, source `harness` and error `Monthly quota exceeded`
- **THEN** `readUsagePause` returns those values, `readActivePause` returns the pause at `2026-10-14T14:59:00.000Z` and null at `2026-10-14T15:00:00.000Z`, and `formatPauseUntil` renders `2026-10-14 15:00 UTC`

#### Scenario: Unreadable marker
- **WHEN** `.run/paused.md` is missing, or its `until` is not a time
- **THEN** `readUsagePause` and `readActivePause` return null

#### Scenario: Last limit wins
- **WHEN** `findUsageLimit` reads a `text` event, a `usage_limit` event with error `first`, and a `usage_limit` event with `resetsAt` `2026-10-14T15:00:00.000Z`
- **THEN** it returns `{ resetsAt: "2026-10-14T15:00:00.000Z" }`

### Requirement: Usage limit pause
A task attempt's events are those after its last `started` event. When the
agent of an attempt exits, whatever its exit code, and those events hold a
`usage_limit` event, the watcher SHALL pause instead of judging the attempt.
It SHALL do four things:

- Write `.run/paused.md` for the task, with the `until` and `source` that
  `pauseUntil` gives for `findUsageLimit` of those events,
  `gates.usageLimitWaitSeconds` and the current time.
- Append one `paused` event to the task's stream, carrying `task`, `until` and
  `source`, plus `error` when the limit carried one.
- Log `task <n> of <id> paused until <time> (usage limit)`, with `<time>` from
  `formatPauseUntil`.
- In a worktree, discard what the agent changed outside the change folder.

It SHALL write no dead marker, no `dead` event and no `retry` event, run no
verify, and make no commit. The task SHALL stay pending, so its next `started`
event carries the same `attempt`.

#### Scenario: Limit with a reset time
- **WHEN** the agent of task 1 appends a `usage_limit` event with `resetsAt` one hour from now and exits 1
- **THEN** `.run/paused.md` holds task `1`, that `until` and source `harness`; the stream holds one `paused` event with them; and there is no `.run/dead/1.md`, `dead` event or `retry` event

#### Scenario: Limit without a reset time
- **WHEN** with `gates.usageLimitWaitSeconds` 600, the agent of task 1 appends a `usage_limit` event without `resetsAt` and exits 0 without a result file
- **THEN** `.run/paused.md` holds source `wait` and an `until` 600 seconds after the pause, and the task does not die with `no_result`

#### Scenario: Limit from an earlier attempt
- **WHEN** task 1's stream holds a `usage_limit` event before its last `started` event, and the agent of that last attempt exits 1 without one
- **THEN** the task dies with `crashed` and no `.run/paused.md` is written

### Requirement: Usage limit wait across changes
Each cycle, the watcher SHALL remove the `.run/paused.md` of every active
change whose `until` has passed. Before it starts a task or the automatic
planner on any change, it SHALL check again whether any active change holds a
pause whose `until` is later than now. While one does, it SHALL start neither,
on every change. A pause SHALL NOT halt, kill or retry anything, and the
reaper, the automatic-retry step and archiving SHALL run as usual. Once the
pause has passed, the paused task SHALL run as its change's next pending task,
with the attempt it had.

#### Scenario: Another change waits
- **WHEN** change 001 holds a pause until one hour from now, and change 002 has an approved pending task
- **THEN** a watcher cycle spawns nothing and writes no marker or event in change 002

#### Scenario: Task runs after the reset
- **WHEN** task 1 of change 001 paused on its first attempt, and its pause's `until` has passed
- **THEN** the next cycle removes `.run/paused.md` and spawns task 1, and its new `started` event has `attempt` 1
