# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Per-turn planning readers
<!-- source: src/harness/claude/claude-usage.ts, src/harness/claude/claude-turns.ts, src/harness/codex/codex-observe-usage.ts, src/harness/opencode/opencode-observe-usage.ts, src/harness/opencode/opencode-usage.ts, tests/planning-observed-claude.test.ts, tests/planning-observed-codex.test.ts, tests/planning-observed-opencode.test.ts -->
Each planning reader SHALL return, per native session, the harness version
when known, a whole-session reported cost when the harness records one, and one
turn per model response. A turn SHALL carry its timestamp, model, independently
nullable input, output, cache-read, cache-write, and reasoning tokens, a
nullable reported cost, and its successfully edited paths. Input SHALL exclude
cached input. A session whose records cannot be parsed SHALL yield null usage.

#### Scenario: Claude message split across records
- **WHEN** a Claude transcript holds three assistant records with one `message.id` and the same `message.usage`
- **THEN** the reader returns one turn with that usage counted once, timestamped at the earliest record

#### Scenario: Claude transcript without cost-state
- **WHEN** a Claude transcript has assistant usage and no `cost-state` record
- **THEN** its turns carry token usage and the session's whole-session cost is null

#### Scenario: Claude cost-state
- **WHEN** a Claude transcript has a `cost-state` record
- **THEN** its `totalCostUSD` becomes the whole-session cost and its counters are not used as turn usage

#### Scenario: Codex responses
- **WHEN** a Codex rollout holds `token_count` events with `last_token_usage` and duplicate `token_usage_record` lines
- **THEN** each `token_count` becomes one turn, duplicates add nothing, input excludes `cached_input_tokens`, and edits from successful `apply_patch` calls or `patch_apply_end` events attach to the turn that follows them

#### Scenario: OpenCode messages
- **WHEN** the OpenCode database holds assistant messages with tokens, cost, and completed write or edit parts
- **THEN** each assistant message becomes one turn with its tokens, reported cost, and edited paths, read through `message.session_id` and `part.message_id`

#### Scenario: Unparseable session
- **WHEN** a transcript's records carry malformed usage or no parseable usage at all
- **THEN** the affected turns carry null usage and approval still succeeds

## MODIFIED Requirements

### Requirement: Approval-time local planning observation
<!-- source: src/core/report/planning-observed.ts, src/core/report/planning-slice.ts, src/core/spec/approve.ts, src/harness/claude/claude-usage.ts, src/harness/codex/codex-observe-usage.ts, src/harness/opencode/opencode-observe-usage.ts, tests/planning-observed-match.test.ts, tests/planning-observed-approve.test.ts -->
`findPlanningSessions` SHALL ask every available Codex, OpenCode, and Claude
Code local reader for sessions with at least one edit whose normalized target
is within the selected change folder and whose timestamp is inclusively between
folder creation and observation time. Path matching SHALL be segment-aware. A
matched session SHALL be reduced to the turns the change owns under planning
turn attribution. Readers SHALL degrade missing stores and malformed records to
no match or null.

Readers SHALL inspect only metadata, usage, timestamps, tool names, versions,
and file-path arguments, SHALL never retain transcript content or send data off
the machine, and SHALL never estimate a missing value. A reader that reports
edits without turns SHALL be treated as one turn per edit with null usage.

#### Scenario: Supported session edits the change
- **WHEN** one local session has an in-window edit under the change and another does not
- **THEN** discovery returns exactly the matching session, reduced to the turns the change owns

#### Scenario: Local artifacts are unavailable
- **WHEN** stores are absent, malformed, unreadable, or contain no qualifying edit
- **THEN** discovery returns no match without changing approval success

### Requirement: Mixed-source planning lifecycle records
<!-- source: src/core/report/planning-observed.ts, src/core/report/planning-records.ts, tests/planning-observed-approve.test.ts, tests/planning-observed-records.test.ts -->
Observed matches SHALL be appended to `.run/plan.jsonl` as correlated
`PlanRecord` pairs carrying `source: observed`; owned records carry `source:
owned` and legacy records without source read as owned. An observed session
SHALL be appended once per change. Its `plan_started` and `plan_exited`
timestamps SHALL be the first and last owned turn, `wallSeconds` their span,
and `usage` the owned turns' sums. `plan_exited.data.slice` SHALL record the
slice bounds, approval time, last edit time, turn count, active minutes, tokens
by kind, and cost source.

#### Scenario: First approval observes a session
- **WHEN** discovery returns a native session not present in the planning log
- **THEN** one correlated observed pair is appended with its stable identity, slice bounds, and slice fields

#### Scenario: Reapproval observes the same session
- **WHEN** the same native session is returned again
- **THEN** the append-only log remains byte-identical and planning session count is unchanged

#### Scenario: Legacy exit record
- **WHEN** a `plan_exited` record has no `slice` field
- **THEN** it parses as before and its slice reads as absent
