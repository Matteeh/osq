---
title: osq inbox records how long items waited and osq report shows it
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
    - web-inspection
---
## Goal

osq records how long each item in `osq inbox` waited for a human, so the
report shows whether reviews happen sooner without getting worse. While the
card session or `--follow` runs, it appends to a per-project log under
`~/.osq/inbox/`: when each item was first seen, when its card opened, when
it went away, and whether the watcher had anything runnable at each of
those moments. The dispatch order uses the log's first-seen time as its age
tiebreak, and `osq report` gains an `Inbox waiting` section for a chosen
period.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The log and its fold into
episodes are tested on temporary homes; the recorder writes real files under
a temporary home with a fixed clock. The session and follow loop record
through `runCardSession` and `followDispatch` with scripted keys, a fake
watcher, and a manual poll timer. The command writes the log under an
injected home, and the printed and JSON paths write nothing. The report
section is computed from a fixture log, and `osq report --json` carries it
only when a log exists, so every existing report test passes unchanged.

## Non-goals

- Streaks, and routing items to one reviewer in a team.
- Logging from the one-shot `osq inbox`, `osq inbox --json`, or bare `osq`.
  They stay read-only; they only read the log for the order.
- Priorities, pins, or snoozes. Age is a first step; a later brief decides
  how a reviewer says what goes first.
- Refreshing an open card's times. The session observes the items when it
  derives, after each key and while waiting, so a departure seen after a key
  is timed at that derivation.
- A period for the rest of `osq report`. `--since` and `--until` apply only
  to the new section.
- Pruning or rotating the log.

## Surface

- Added: `~/.osq/inbox/<sha256(realpath(root))>.jsonl`, the per-project wait log, with record types `start`, `seen`, `opened`, `gone`, `top`, and `stop` (file)
- Added: `osq report --since <date>` and `--until <date>` (flags)
- Added: `osq report` text section `Inbox waiting (<since> to <until>):` and JSON key `inboxWait` (report output)
- Changed: dispatch order, used by `osq inbox` in every mode, breaks ties by first-seen time before change id (command behaviour)
- Added: item reason `waiting since <YYYY-MM-DD HH:MM>` for an item with a first-seen time and no other reason (command output)

## Decisions

- ADR 001: unchanged; `osq inbox` and `osq report` use the config they already load.
- ADR 004: unchanged; nothing here runs the validator.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

`~/.osq/last-look/` already holds per-user derived data, keyed by a hash of
the project's real path through `resolveLastLookPath` in
`src/core/status/inbox-cursor.ts`. The wait log sits beside it and is keyed
the same way. It is the reviewer's own data, never written to the project.

The log is append-only and may be written by two inbox runs at once, say a
`--follow` in one terminal and a card session in another. Readers therefore
fold records into episodes: a `seen` opens an episode for an item's identity
(kind, change folder, task number) when none is open, and a `gone` closes
it; duplicates from a second run are ignored. An item already waiting when
an inbox starts, or one that went away while no inbox ran, is recorded at
that start and marked `unobserved`.

Only the card session and `--follow` record, through a recorder the command
creates. The core functions take the recorder as an optional port and record
nothing without one, so their existing tests are unaffected. Two command
tests run the session and `--follow` through `inboxDispatchCommand`; task 4
gives them a temporary home so the suite never writes to the real
`~/.osq/`.

`orderDispatchItems` has no age tiebreak today; change id stands in for
age. The first-seen map becomes an optional fourth argument, filled by
`readDispatch`, `readDispatchQueue`, `watchDispatch`, and the session from
the log under their `home`, which defaults to `os.homedir()`. Reading a
missing log changes nothing, so existing order tests pass unchanged. An item
with a first-seen time and no other reason says `waiting since <date time>`
instead of `in change order`, so the printed reason matches what decided
its place.

`src/core/report/report.ts` and `src/cli/report.ts` are on the line-budget
allow list and `getMetricsReport`, `formatMetricsReport`, and
`toStableMetrics` are grandfathered, so the new section lives in its own
module and is only wired through them. Like `traceability` and `mutation`,
the JSON key and the text section appear only when there is something to
show, here a wait log, which keeps every pinned report test unchanged.

`src/core/status/dispatch-session.ts` is at 238 lines; task 3 moves its
set-aside helper out to stay within 250. `tests/no-skipped-in-src.test.ts`
forbids the word "skipped" anywhere under `src/`.

## Contract

### Requirement: Existing inbox and report output unchanged without a log
With no wait log for the project, `osq inbox` in every mode, bare `osq`,
and `osq report` SHALL print exactly what they printed before this change.

#### Scenario: Existing suites
- **WHEN** the existing inbox, dispatch, and report tests run
- **THEN** every one passes, with only `tests/inbox-cards.test.ts` and `tests/inbox-follow.test.ts` changed to pass a temporary home

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: adds "Inbox wait log", "Inbox wait recorder", and "Wait recording"; modifies "Dispatch order", "Dispatch watch", and "Card session".
- `specs/cli-foundation/spec.md`: adds "Inbox wait log wiring".
- `specs/metrics-and-reporting/spec.md`: adds "Inbox waiting in report" and "Inbox waiting report output".

Six tasks, and no two share a file. Task 1 writes the log and the recorder,
task 2 orders by first-seen time and passes idle to the watch, task 3
records from the session and follow, task 4 wires the command, task 5
computes and formats the report section, and task 6 wires it into
`osq report` and README.md.
