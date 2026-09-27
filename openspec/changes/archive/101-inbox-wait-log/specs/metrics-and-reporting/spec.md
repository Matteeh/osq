## ADDED Requirements

### Requirement: Inbox waiting in report
<!-- source: src/core/report/report-inbox-wait.ts, tests/report-inbox-wait.test.ts, fixture/report/inbox-wait.jsonl -->
`collectInboxWait(projectRoot, options)` SHALL read the wait log with
`readWaitLog(projectRoot, options.home)` and return null when there is no
log. Otherwise it SHALL fold the records with `waitEpisodes` and return, for
the period from `options.since` (inclusive) to `options.until` (exclusive),
each unbounded when null:

- `since` and `until`, as ISO strings or null.
- `kinds`, with an entry for each of `approval`, `halt`, `land`, and
  `verify`. It covers the episodes of that kind whose `gone` falls inside
  the period. `handled` SHALL count those whose `gone` is observed, and
  `medianSeconds` and `longestSeconds` SHALL be the median and the longest
  time from `seen` to `gone` over them, in whole seconds, the median of an
  even count being the mean of the middle two, rounded. Both SHALL be null
  when `handled` is 0. `startedUnseen` SHALL count the handled episodes
  whose `seen` is unobserved, and `endedUnseen` the episodes whose `gone` is
  unobserved, which stay out of the times.
- `idleSeconds`: the length of the union of every interval that starts at a
  `top` record with an item and `idle` true and ends at the next `top` or
  `stop` record of the same session, clipped to the period. An interval with
  no later `top` or `stop` in its session SHALL be left out. It SHALL be
  null when no `top` record falls inside the period.
- `sessions`, over the `start` records with mode `cards` inside the period:
  `count`; `handled`, the episodes whose `opened` session and observed
  `gone` session are the same one of them; and `medianHandled` and
  `mostHandled`, the median and most handled in one session. It SHALL be
  null when `count` is 0.

`formatInboxWait(report)` SHALL return, in order:

- `Inbox waiting (<since> to <until>):`, with `start` or `now` for an
  unbounded end and the date otherwise, as `YYYY-MM-DD` when it is midnight
  UTC and as the ISO string when it is not.
- One line per kind:
  `  <kind>: <handled> handled, median <wait>, longest <wait>`, followed by
  `, <n> first seen at inbox start` when `startedUnseen` is above 0, or
  `  <kind>: not measured` when `handled` is 0. Either SHALL end with
  `, <n> gone while no inbox ran` when `endedUnseen` is above 0.
- `  watcher idle on a human's item: <wait>`, or `not measured` in place of
  the wait.
- `  card sessions: <count>, <handled> handled, median <median> per session, most <most>`,
  or `  card sessions: not measured`.

A `<wait>` SHALL be `<s>s` under a minute, `<m>m <s>s` under an hour,
`<h>h <m>m` under a day, and `<d>d <h>h` otherwise.

#### Scenario: Fixture log
- **WHEN** the fixture log is placed under a temporary home for a project and `collectInboxWait` runs without bounds
- **THEN** each kind's `handled`, `medianSeconds`, `longestSeconds`, `startedUnseen`, and `endedUnseen`, `idleSeconds`, and `sessions` equal the values worked out by hand from the fixture

#### Scenario: Even median
- **WHEN** two approval episodes waited 60 and 181 seconds
- **THEN** `medianSeconds` is 121 and `longestSeconds` is 181

#### Scenario: Overlapping idle
- **WHEN** two sessions each hold an idle interval on a human's item, overlapping by 30 seconds, of 60 seconds each
- **THEN** `idleSeconds` is 90

#### Scenario: Period with nothing
- **WHEN** `since` is after every record in the fixture log
- **THEN** every kind's `handled` is 0, `idleSeconds` and `sessions` are null, and the text says `not measured` on each line

#### Scenario: No log
- **WHEN** the project has no wait log under the home
- **THEN** `collectInboxWait` returns null

### Requirement: Inbox waiting report output
<!-- source: src/core/report/report.ts, src/cli/report.ts, src/cli/index.ts, README.md, tests/report-inbox-wait-cli.test.ts -->
`getMetricsReport(projectRoot, config, options)` SHALL take `options` with
`home`, `since`, and `until`, defaulting to `os.homedir()` and no bounds,
and SHALL hold `collectInboxWait`'s result as `inboxWait` when it is not
null. The text SHALL print the `formatInboxWait` lines as its own section
after the `Mutation:` section's place, and the stable JSON SHALL hold
`inboxWait` with the fields `collectInboxWait` returns. With no wait log,
the JSON SHALL have no `inboxWait` key and the text no section, so the
report is unchanged.

`osq report` SHALL take `--since <date>` and `--until <date>`, read through
`parseReportPeriod(since, until)`, which reads each given value with
`Date.parse` and returns `{ since, until }` as dates or null. It SHALL throw
`--since is not a date: <value>` or `--until is not a date: <value>` for a
value `Date.parse` cannot read, and `--since must be before --until` when
both are given and `since` is not earlier. `reportCommand` SHALL call it
inside its existing error handling, so a bad value prints
`Report error: <message>` and exits 1. The flags SHALL affect only the
`Inbox waiting` section.

README.md SHALL say, in the Human Attention Inbox section, that the card
session and `osq inbox --follow` append to a per-project log under
`~/.osq/inbox/`: when each item was first seen, when its card opened, when
it went away, and whether the watcher had runnable work at each moment; that
an item already waiting when an inbox starts, or gone while none ran, is
marked; that the one-shot and `--json` output write nothing; and that the
order breaks ties by first-seen time. It SHALL say, in the Metrics &
Reporting section, what the `Inbox waiting` section shows and that
`--since` and `--until` choose its period.

#### Scenario: Section printed
- **WHEN** `reportCommand` runs with the fixture log under a temporary home
- **THEN** the text holds `Inbox waiting (start to now):`, and with `json` the output holds `inboxWait.kinds.approval.handled`

#### Scenario: Period passed through
- **WHEN** `reportCommand` runs with `since` after every record in the fixture log
- **THEN** the text holds `  approval: not measured`

#### Scenario: No log unchanged
- **WHEN** `reportCommand` runs with a temporary home and no wait log
- **THEN** the JSON has no `inboxWait` key and the text no `Inbox waiting` line

#### Scenario: Bad date
- **WHEN** `parseReportPeriod('yesterday', null)` runs
- **THEN** it throws `--since is not a date: yesterday`

#### Scenario: Registered
- **WHEN** `createProgram` builds the CLI
- **THEN** the `report` command has `--json`, `--since`, and `--until` options
