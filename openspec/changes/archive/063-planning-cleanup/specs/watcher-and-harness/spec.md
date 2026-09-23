# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Per-turn planning readers
<!-- source: src/harness/claude/claude-usage.ts, src/harness/claude/claude-turns.ts, src/harness/codex/codex-observe-usage.ts, src/harness/opencode/opencode-observe-usage.ts, src/harness/opencode/opencode-usage.ts, tests/planning-observed-claude.test.ts, tests/planning-observed-codex.test.ts, tests/planning-observed-opencode.test.ts, tests/planning-reader-shape.test.ts -->
Each planning reader SHALL return, per native session, the harness version
when known, a whole-session reported cost when the harness records one, and one
turn per model response, and SHALL NOT return session-level usage, edits, or
start and end times. A turn SHALL carry its timestamp, model, independently
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

#### Scenario: Session shape
- **WHEN** any reader returns a session
- **THEN** the session has `turns` and no `usage`, `edits`, `startedAt`, or `endedAt` key

### Requirement: Approval-time local planning observation
<!-- source: src/core/report/planning-observed.ts, src/core/report/planning-slice.ts, src/core/report/planning-slice-turns.ts, src/core/spec/approve.ts, src/harness/claude/claude-usage.ts, src/harness/codex/codex-observe-usage.ts, src/harness/opencode/opencode-observe-usage.ts, tests/planning-observed-match.test.ts, tests/planning-observed-approve.test.ts -->
`findPlanningSessions` SHALL ask every available Codex, OpenCode, and Claude
Code local reader for sessions with at least one turn edit whose normalized
target is within the selected change folder and whose turn timestamp is
inclusively between folder creation and observation time. Path matching SHALL
be segment-aware. A matched session SHALL be reduced to the turns the change
owns under planning turn attribution. Readers SHALL degrade missing stores and
malformed records to no match or null.

Readers SHALL inspect only metadata, usage, timestamps, tool names, versions,
and file-path arguments, SHALL never retain transcript content or send data off
the machine, and SHALL never estimate a missing value.

#### Scenario: Supported session edits the change
- **WHEN** one local session has an in-window edit under the change and another does not
- **THEN** discovery returns exactly the matching session, reduced to the turns the change owns

#### Scenario: Local artifacts are unavailable
- **WHEN** stores are absent, malformed, unreadable, or contain no qualifying edit
- **THEN** discovery returns no match without changing approval success

### Requirement: Golden event stream validation
<!-- source: tests/golden-events.test.ts, tests/fixtures/events/** -->
The test suite SHALL validate end-to-end task execution event streams against
checked-in golden fixtures for both verified and dead task outcomes. The
comparison SHALL mask `measures` repository counts (`repoLines` and
`repoFiles`), so the fixtures do not depend on the scaffolded project's size.

#### Scenario: Verified task golden events match
- **WHEN** runner executes a successful mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/verified.jsonl`

#### Scenario: Dead task golden events match
- **WHEN** runner executes a failing mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/dead.jsonl`

#### Scenario: Scaffolded project size changes
- **WHEN** the managed planner block or a template gains or loses lines
- **THEN** both golden fixtures still match without regeneration
