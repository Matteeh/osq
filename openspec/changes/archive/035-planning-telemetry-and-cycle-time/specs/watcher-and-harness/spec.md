# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Observed-only interactive usage port
<!-- source: src/harness/types.ts, src/harness/agy.ts, src/harness/opencode*.ts, src/harness/codex*.ts, tests/plan-telemetry.test.ts -->
`HarnessAdapter` SHALL offer this optional post-session usage port:

```ts
readInteractiveUsage?(options: {
  cwd: string;
  startedAt: string;
  endedAt: string;
}): Promise<{
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  cost: number | null;
}>;
```

Missing readers, missing fields, malformed artifacts, read failures, and
ambiguous session matches SHALL yield null fields and SHALL NOT change the
planner process exit result.

OpenCode SHALL read the one local session database row created for the working
directory during the observed interval, using its stored input, output,
reasoning, cache-read, cache-write, and cost columns. Codex SHALL read the one
new rollout JSONL session whose `session_meta` matches the working directory and
use the last cumulative `token_usage_record.payload.thread_token_usage` values.
Codex cost SHALL remain null because its local rollout record does not carry
cost. AGY SHALL participate in the same generic lifecycle recording and return
all-null usage because no confirmed local AGY usage artifact is in scope.
Neither reader SHALL inspect or retain transcript content.

#### Scenario: Exact OpenCode usage
- **WHEN** exactly one matching OpenCode session row exposes usage and cost
- **THEN** the reader returns those stored values, with cached tokens equal to the harness's reported cache-read plus cache-write counters

#### Scenario: Exact Codex usage
- **WHEN** exactly one matching Codex rollout exposes cumulative thread usage
- **THEN** the reader returns its input, output, cached-input, and reasoning-output counters and a null cost

#### Scenario: AGY usage unavailable
- **WHEN** AGY completes an interactive planning session
- **THEN** its reader returns null for input, output, cached, reasoning, and cost while generic lifecycle timing remains recorded

#### Scenario: Usage unavailable or ambiguous
- **WHEN** no unique matching local artifact supplies a usage field
- **THEN** that field is null and osq performs no estimation or transcript parsing

### Requirement: Explicit archive timestamp
<!-- source: src/watcher/archiver.ts, src/harness/types.ts, tests/archiver.test.ts -->
After successful archive-time verification and relocation, the watcher SHALL
append one typed `archived` event to `.run/events/change.jsonl` in the archived
folder. The event timestamp is the authoritative archive time for cycle metrics
and SHALL NOT be emitted to any task event file.

#### Scenario: Successful archive
- **WHEN** a completed change is successfully moved into the archive
- **THEN** its change-level event stream contains one `archived` event timestamped after the move

#### Scenario: Blocked archive
- **WHEN** archive verification or relocation fails
- **THEN** no `archived` event is recorded

## MODIFIED Requirements

### Requirement: Run manifest at approval
<!-- source: src/core/approve.ts, src/core/manifest.ts, tests/manifest.test.ts -->
The approve command SHALL write `.run/manifest.json` containing content-addressed
hashes of `AGENTS.md`, `PLANNER.md`, the config file, and each capability spec
the change reads or writes; the osq version, harness, model, effort setting, and
timestamps for creation and approval; and `planningSessions`, the count of valid
`plan_started` records already present in `.run/plan.jsonl`. A missing or empty
planning log SHALL produce zero. Because the log lives below `.run/`, it SHALL
NOT affect approval hashing.

#### Scenario: Manifest written on approval
- **WHEN** `osq approve` seals a change
- **THEN** `.run/manifest.json` contains content hashes, execution identity, creation and approval timestamps, and the recorded planning-session count

#### Scenario: Approval after multiple planning sessions
- **WHEN** a change with new and resumed planning sessions is approved
- **THEN** the manifest counts every valid `plan_started` record while the approved content hash remains independent of the planning log

#### Scenario: Manifest hashes are content-addressed
- **WHEN** manifest input files are hashed
- **THEN** each hash is `sha256:<hex>`, computed from the UTF-8 content, or `null` when the file does not exist
