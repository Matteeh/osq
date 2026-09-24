# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Build identity metadata
<!-- source: src/watcher/build.ts, src/watcher/build-project.ts, src/watcher/loop.ts, src/watcher/spawn.ts, src/watcher/regression.ts, tests/watcher-build-identity.test.ts -->
The watcher and runner SHALL identify the running osq build across lifecycle
events, idle status, and done markers from osq's own package root: `version`
from its `package.json`, and `commit` from its short git HEAD only when that
root is the top of a git work tree, otherwise the hash of its `dist/`, otherwise
`unknown`. The project's commit SHALL be the project root's short HEAD commit,
or null outside git.

#### Scenario: Task started lifecycle event metadata
- **WHEN** a task begins execution and emits a `started` lifecycle event
- **THEN** runner records osq's package version as `version` and `osqVersion`, osq's commit or dist hash as `commit`, and the project's HEAD commit or null as `projectCommit` under event data

#### Scenario: Installed package inside the project's work tree
- **WHEN** osq's package root sits inside the project's git work tree but not at its top, as an installed package does
- **THEN** osq's commit is the hash of osq's `dist/` or `unknown`, never the project's HEAD

#### Scenario: Running from a checkout
- **WHEN** osq's package root is the top of its own git work tree
- **THEN** osq's commit is that checkout's short HEAD commit

#### Scenario: Project without git
- **WHEN** the project root is not in a git repository
- **THEN** the `started` event records `projectCommit: null`

#### Scenario: Idle status line build prefix
- **WHEN** watcher formats the idle status line while waiting for approved specs
- **THEN** status output prefixes the line with `osq v<version> (<commit>)` naming osq's own version and commit

### Requirement: Typed event hygiene and single emission path
<!-- source: src/harness/types.ts, src/core/summary.ts, src/core/retry.ts, src/core/reject.ts, src/harness/opencode.ts, src/harness/agy.ts, src/watcher/spawn.ts -->
The harness and watcher SHALL record lifecycle, retry, rejection, and tool
events using a typed discriminated union, with tool summaries relativized to
the project root at write time and a single code path for each event type.
Every new started event SHALL include osq's build identity, the project's
commit, and execution attempt.

#### Scenario: Task started event metadata
- **WHEN** a task execution starts
- **THEN** the single `started` event emitted by the runner includes `harness`, `model`, `osqVersion`, `projectCommit`, and `attempt` under event data

#### Scenario: Retry and rejection event typing
- **WHEN** retry or rejection succeeds
- **THEN** its event is appended through the shared event writer with the payload defined for that discriminant

#### Scenario: Write-time tool summary relativization
- **WHEN** an agent executes a tool call targeting workspace files
- **THEN** harness relativizes absolute project paths in the tool summary relative to the project root before writing to `events.jsonl`

### Requirement: Done marker scope hash frontmatter
<!-- source: src/watcher/outcome.ts, src/watcher/regression.ts, src/core/scope.ts, src/core/scope-hash.ts, src/core/retry.ts -->
The engine SHALL record YAML frontmatter in `.run/done/<n>` markers comprising
`scope_resolver: 2`, the post-task aggregate hash over resolved scope files,
per-file scope hashes, osq's commit as `build_stamp`, the project commit as
`project_commit`, and verification exit code. Human
recertification SHALL preserve completion and build metadata while retaining
the first trusted hash as `original_scope_hash`, refreshing `scope_hash` and
`scope_files`, recording resolver version 2 and `recertified_at`, and
incrementing `recertification_count`.

#### Scenario: Done marker frontmatter emission
- **WHEN** a task successfully verifies and finishes
- **THEN** `.run/done/<n>` contains `scope_resolver: 2`, `scope_hash`, `scope_files`, `build_stamp`, `project_commit`, and `exit_code: 0`, followed by the ISO completion timestamp

#### Scenario: Passing recertification
- **WHEN** human retry verification passes for a scope-regressed task
- **THEN** canonical done metadata retains its original completion and build values, preserves the first original hash, and records resolver-2 current hashes plus recertification time and count

#### Scenario: Scope hash stability across task completions
- **WHEN** equivalent exact and glob declarations are fingerprinted at completion or recertification
- **THEN** the aggregate hash derives deterministically from sorted resolved project-relative paths and their UTF-8 SHA-256 content digests

### Requirement: Dead marker fingerprint
<!-- source: src/watcher/fingerprint.ts, src/watcher/outcome.ts, src/watcher/runner.ts, src/watcher/spawn.ts, src/watcher/loop.ts, tests/dead-fingerprint.test.ts -->
Every dead marker's frontmatter SHALL record `fingerprint: sha256:<hex>`,
hashed over the reason and the marker body after stripping ANSI codes and
replacing ISO timestamps, durations including a number after a duration key,
PIDs, absolute paths under the project root, and paths under the temp directory
with fixed placeholders. A temp path, matched by `os.tmpdir()` and its real
path, keeps what follows its first segment: `/tmp/x-Hf38F/a.db` becomes
`<tmp>/a.db`.

#### Scenario: Volatile details
- **WHEN** two markers with the same reason differ only in timestamps, durations, PIDs, ANSI codes, temp directory names, or the project root path
- **THEN** their fingerprints are equal

#### Scenario: Repeated node:test failure
- **WHEN** the same failing `node:test` file, creating and printing a `mkdtemp` directory, runs twice and each output becomes a dead marker
- **THEN** the two markers have the same fingerprint

#### Scenario: Different failures
- **WHEN** two markers differ in reason, in a failing test name, or in an assertion message
- **THEN** their fingerprints differ
