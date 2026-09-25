# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Dependency baseline
<!-- source: src/watcher/dependencies.ts, src/watcher/measures.ts, src/harness/types.ts, tests/denied-dependency.test.ts -->
When a task's resolved scope includes a path whose file name is
`package.json`, the `measures` start event of every attempt SHALL carry
`dependencies`, an object from each such repository-relative path to the
sorted distinct package names in its `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies`, empty for a missing or
unreadable file. Without such a path the field SHALL be absent. The watcher
SHALL never read a `package.json` outside the task's resolved scope for this.

#### Scenario: Scoped manifest
- **WHEN** a task's scope includes `package.json`, which depends on `chokidar` and dev-depends on `tsx`
- **THEN** its `measures` start event carries `dependencies: { "package.json": ["chokidar", "tsx"] }`

#### Scenario: Manifest outside scope
- **WHEN** a task's scope doesn't include `package.json`
- **THEN** its `measures` start event has no `dependencies` field and the file is not read

### Requirement: Dependencies added
<!-- source: src/watcher/dependencies.ts, src/watcher/task-verify.ts, src/harness/types.ts, tests/denied-dependency.test.ts -->
After the agent exits, after the blocked check and before the missing verify
path check, the watcher SHALL compare each path in the latest `measures` start
event's `dependencies` with the same file's current package names across the
four sections. When any name is new, it SHALL append one `dependencies_added`
event with `data.added`, the `{ file, name }` pairs sorted by file and then
name. A name moved between sections SHALL NOT count, and without a baseline
the comparison SHALL be skipped.

#### Scenario: Allowed addition
- **WHEN** the agent adds `zod` to a scoped `package.json` and no accepted ADR denies it
- **THEN** one `dependencies_added` event names `zod` and the file, and the task goes on to its verify

### Requirement: Denied dependency
<!-- source: src/watcher/dependencies.ts, src/watcher/task-verify.ts, src/watcher/failure-reason.ts, tests/denied-dependency.test.ts -->
When an added name is listed in `denies` of an accepted ADR, the task SHALL
die with reason `denied_dependency` after the `dependencies_added` event is
appended, and SHALL run neither verify. The dead marker body SHALL start
`The task added packages an accepted ADR denies:` and hold one line per denied
pair and ADR, `- <name> in <file>: ADR <number>: <rule>`. Packages denied only
by proposed or superseded ADRs SHALL NOT be enforced.

#### Scenario: Vue denied
- **WHEN** accepted ADR 007 denies `vue` and the agent adds `vue` to a scoped `package.json`
- **THEN** the task dies with `denied_dependency`, and the marker names `vue`, the file, ADR 007, and its rule

#### Scenario: Superseded denial
- **WHEN** only a superseded ADR denies `vue` and the agent adds it
- **THEN** the task doesn't die for it

## MODIFIED Requirements

### Requirement: Automatic retry
<!-- source: src/watcher/auto-retry.ts, src/watcher/loop.ts, src/core/lifecycle/retry.ts, tests/auto-retry.test.ts, tests/verify-path-missing.test.ts -->
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `verify_path_missing`, `denied_dependency`,
`no_result`, `crashed`, and `timeout`.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with exactly one `retry` event carrying `automatic: true`, and the watcher printed one automatic-retry line

#### Scenario: Missing verify path is retried
- **WHEN** a task dies with `verify_path_missing`
- **THEN** it is retried automatically once and the next attempt's prompt contains the missing path

#### Scenario: Denied dependency is retried
- **WHEN** a task dies with `denied_dependency` for `vue`
- **THEN** it is retried automatically once and the next attempt's prompt contains `vue`

#### Scenario: Ineligible reason
- **WHEN** a task dies with `spec_conflict`, `already_running`, or `verify_precondition`
- **THEN** it stays dead and no automatic `retry` event is appended

#### Scenario: Count exhausted
- **WHEN** a task that already had one automatic retry dies again with a new fingerprint and the count is 1
- **THEN** it stays dead until a human runs `osq retry`, after which it may be retried automatically once more

#### Scenario: Disabled
- **WHEN** `gates.autoRetries` is 0
- **THEN** no automatic retry happens, no task is marked stuck, and dead tasks behave as before

#### Scenario: Restart between death and retry
- **WHEN** the watcher stops after a death is recorded and before the retry, then starts again
- **THEN** the task is retried exactly once and runs once more

#### Scenario: Once mode
- **WHEN** `osq watch --once` performs an automatic retry
- **THEN** it continues and runs the retried task before exiting
