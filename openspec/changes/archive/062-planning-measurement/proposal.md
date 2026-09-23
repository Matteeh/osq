---
title: Planning measurement
depends_on: ["061"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - metrics-and-reporting
    - cli-foundation
    - web-inspection
---
## Goal

osq records the planning each change actually cost, whether the plan came from
`osq plan` or from a long session in the user's own agent. Every planning turn
is attributed to at most one change, token usage is captured per turn, and
`osq report` shows planning next to execution, so the economics of splitting
planner and executor can be checked from osq's own data.

Planning is observed at `osq approve` time. `approveSpec` in
`src/core/spec/approve.ts` asks the local session readers
(`src/harness/claude/claude-usage.ts`, `src/harness/codex/codex-observe-usage.ts`,
`src/harness/opencode/opencode-observe-usage.ts`) for sessions that edited the
change folder, `findPlanningSessions` in `src/core/report/planning-observed.ts`
matches them, and `appendObservedSessions` writes `plan_started` and
`plan_exited` to `.run/plan.jsonl`. Today each match is a whole session. Changes
047, 048 and 049 were planned in one Claude Code session; all three recorded
that session from its start, so planning time was counted up to three times, and
every usage field is null.

Facts this change relies on, checked on this machine:

- Claude Code 2.1.280 (session `c4a1d29f`): 404 assistant records carry only
  173 distinct `message.id` values, up to six records each. Every record of one
  message repeats the same `message.usage`: `input_tokens`, `output_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`, and
  `output_tokens_details.thinking_tokens`. Records carry `version`,
  `sessionId`, `cwd`, `timestamp`, and `message.model`. The session has no
  `cost-state` record, which is why today's reader returns null usage.
- Codex 0.154.0-alpha.6.2: each model response is followed by an `event_msg`
  whose payload `type` is `token_count`, with `info.last_token_usage` holding
  that response's `input_tokens`, `cached_input_tokens`,
  `cache_write_input_tokens`, `output_tokens`, and `reasoning_output_tokens`.
  `input_tokens` includes the cached input. A `token_usage_record` duplicates
  each one. This version edits files through a custom tool named `exec`, not
  `apply_patch`; successful edits appear as `event_msg` payloads of type
  `patch_apply_end` with `success: true` and the edited absolute paths as the
  keys of `changes`. `session_meta` carries `cli_version`.
- OpenCode 1.18.31: the tables are `session`, `message`, and `part`, joined on
  `message.session_id`, `part.session_id`, and `part.message_id`. Today's
  observation query joins on `part.sessionID`, which fails with "no such
  column", so OpenCode planning is never observed. Assistant `message.data`
  carries `modelID`, `tokens` (`input`, `output`, `reasoning`,
  `cache.read`, `cache.write`), and `cost`; `session.version` holds the OpenCode
  version.
- `measures` events already carry `proposalWords`, `taskWords`, and
  `changedLines`.
- The dashboard and the text report count a session that reported tokens but
  no cost as reported, so its missing cost renders as a dollar zero.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. Offline tests drive the three
readers over content-free fixture transcripts shaped like the records above,
each fixture naming the harness version it came from, and drive approval with
injected readers. They prove that one session planning three changes in turn
yields three non-overlapping slices bounded by the approvals, that a message
split across several records counts once, that a transcript without
`cost-state` still yields tokens, that two changes planned in parallel in one
session attribute every turn exactly once, that a gap longer than the idle gap
is left out of active minutes, that an unparseable transcript yields null usage
while approval succeeds, and that the report and dashboard render missing cost
as `not reported`. No test needs a network, a TTY, a real transcript, or a real
model.

## Non-goals

- Retaining transcript content. Readers extract timestamps, token counts,
  models, versions, and edited paths only.
- Estimating tokens no harness reported.
- Rewriting archived `.run/plan.jsonl` records, or backfilling 047 to 049. A
  later change may add an explicit rescan that writes outside the archive.
- Requiring `osq plan`, or changing how planning sessions start or how owned
  sessions are recorded.
- Pricing executor tokens.

## Surface

- Added: `planning.idleGapMinutes` (config key, default 10)
- Added: `planning.prices` (config key: per-model USD per million `input`, `output`, `cacheRead`, `cacheWrite` tokens)
- Added: `plan_exited.data.slice` (event field: `start`, `end`, `approvedAt`, `lastEditAt`, `turns`, `activeMinutes`, `tokens`, `costSource`)
- Added: `planning.byChange` and `planning.comparison` (`osq report --json` fields)
- Added: `Planning by change:` and `Planning vs execution:` sections in `osq report`
- Changed: observed `plan_started` and `plan_exited` timestamps and `wallSeconds` now bound the change's slice, not the whole session
- Changed: planning cost reads `not reported` in the report and dashboard when no session reported a cost, even if sessions reported tokens

## Contract

### Requirement: Per-turn planning readers
Each reader SHALL return, per native session, the harness version when known,
a whole-session reported cost when one exists, and one turn per model response
with its timestamp, model, independently nullable input, output, cache-read,
cache-write, and reasoning tokens, cost, and successfully edited paths. Input
SHALL exclude cached input. A session whose records cannot be parsed SHALL
yield null usage without failing approval.

#### Scenario: Message split across records
- **WHEN** one Claude message id appears in three records with the same usage
- **THEN** the reader returns one turn with that usage once

### Requirement: Planning turn attribution
A turn that edited a change folder SHALL belong to that change. Other turns
SHALL belong to the change whose folder is edited next within the same segment,
where segments are bounded by the approvals of changes the session edited, or
else to the change whose approval closes the segment. A change SHALL record only
the turns it owns, so no turn is attributed to more than one change.

#### Scenario: Sequential planning
- **WHEN** one session plans three changes and each is approved before the next is edited
- **THEN** the three recorded slices do not overlap and each ends at its change's approval

#### Scenario: Parallel planning
- **WHEN** one session interleaves edits to two changes before approving either
- **THEN** each turn is recorded in exactly one of the two changes

### Requirement: Planning report
`osq report` SHALL show, per change, planning sessions, tokens by kind, active
minutes, cost, spec words, changed lines, spec words per changed line, and
minutes from the last planning edit to approval, and SHALL compare planning and
executor tokens and cost in totals. An unknown cost SHALL read `not reported`.

#### Scenario: Tokens without cost
- **WHEN** planning sessions reported tokens but no cost
- **THEN** planning cost reads `not reported` in the report and on the dashboard

## Human steps

- Approve 062 only after 061 has archived; both change report files.
- Review the proposal, delta specs, and task bodies, then run
  `osq approve 062` yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Per-turn planning readers";
  modifies "Approval-time local planning observation" and "Mixed-source
  planning lifecycle records".
- `specs/metrics-and-reporting/spec.md`: adds "Planning turn attribution";
  modifies "Planning metrics report" and "Unreported cost labelling".
- `specs/cli-foundation/spec.md`: adds "Planning measurement configuration".
- `specs/web-inspection/spec.md`: modifies "Unreported web cost".

Task 1 splits `tests/planning-observed.test.ts` into topic files without
changing any assertion, so tasks 3 to 6 each own one of them. No file is shared
between tasks.
