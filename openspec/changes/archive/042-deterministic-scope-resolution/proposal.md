---
title: Deterministic scope resolution
depends_on: ["041"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
    - spec-lint-and-approve
    - watcher-and-harness
---
## Goal

Give every tree-aware scope consumer one deterministic resolver so exact paths
and glob patterns produce the same file set for hashing, regression auditing,
linting, attribution, and measurement. Version the resulting completion and
measurement records so existing active work is recertified once and historical
size evidence is not mixed across resolver generations.

## Verify

`pnpm verify`

The suite includes fixtures proving that files added, modified, and deleted
under a glob produce scope-hash mismatches with the correct differing paths; a
missing exact path remains represented as null; unmatched globs contribute no
paths; existing test-scope compliance outcomes remain unchanged; overlapping
resolved task scopes produce a non-failing warning naming both tasks and the
file; legacy active done markers require one idempotent recertification wave;
and resolver-2 size evidence is reported separately from legacy measurements.

## Non-goals

- Changing scope syntax or adding negative patterns.
- Changing which edits constitute a scope-compliance violation.
- Changing the configured scope-pattern limit.
- Automatically accepting or retrying a recertification.
- Rewriting or auditing markers inside archived changes.
- Adding a glob dependency.

## Contract

### Requirement: Deterministic scope resolution

The core SHALL provide one scope resolver for every consumer that interprets
task scope against the project tree. It SHALL support the established exact
path, `*`, `**`, `?`, and trailing-directory syntax without another glob
implementation under `src/`.

Resolved files SHALL be deduplicated and returned as sorted project-relative
POSIX paths. An exact path that does not exist SHALL remain represented with a
null value. A glob with no matching files SHALL contribute no entries. The same
project tree and scope declarations SHALL always produce the same result.

#### Scenario: Exact and glob entries overlap
- **WHEN** an exact scope entry and one or more glob entries resolve to the same file
- **THEN** the resolver returns that project-relative POSIX file once in deterministic order

#### Scenario: Scope entries have no file
- **WHEN** an exact entry is missing and a glob has no matches
- **THEN** the exact path remains present with null while the unmatched glob contributes nothing

### Requirement: Unified scope hashing and attribution

Scope hashing, regression comparison, and recorded-edit attribution SHALL use
the shared resolver. Aggregate hashes SHALL be derived from the sorted resolved
path and content-hash entries.

Comparison SHALL use the union of recorded and current resolved paths so files
newly matching a glob are reported as added, changed matching files as
modified, and files that no longer exist or match as deleted. Attribution SHALL
compare normalized paths and completion hashes from the same resolved file set.

#### Scenario: Glob contents change after completion
- **WHEN** matching files are added, modified, and deleted between two scope hashes
- **THEN** the aggregate hash changes and regression output classifies every differing path correctly

#### Scenario: Scope declaration order changes
- **WHEN** equivalent exact and glob entries are supplied in another order
- **THEN** resolved paths, per-file hashes, and aggregate hash remain identical

### Requirement: Resolver-versioned completion records

Every newly written or successfully recertified automated done marker SHALL
contain `scope_resolver: 2`.

The scope-recertification audit SHALL treat an otherwise valid automated marker
without `scope_resolver: 2` as stale on first sight, even if its legacy aggregate
hash happens to equal the current hash. It SHALL use the established detection
verification and regression workflow, making repeated cycles idempotent through
the active regression marker. Successful retry SHALL refresh the marker with
resolver-2 hashes and version metadata.

Archived markers SHALL remain untouched. Consumer documentation SHALL contain
one upgrade note explaining the active-change recertification wave.

#### Scenario: Active legacy completion is first audited
- **WHEN** an active automated done marker lacks resolver version 2
- **THEN** its verification runs and one scope-regression record requires explicit human recertification

#### Scenario: Legacy completion is recertified
- **WHEN** the human retries that regression and verification passes
- **THEN** the canonical done marker records resolver version 2 and subsequent audits do not flag the version again

### Requirement: Resolver-backed lint behavior

The existing test-modification compliance check SHALL use the shared resolver
while preserving its current outcomes, including allowing an exact missing test
path and rejecting an existing matched test without `tests.modify: true`.

For each change, lint SHALL compare the resolved existing files of its tasks.
When two tasks resolve to the same file, it SHALL emit a deterministic warning
naming both task numbers and the project-relative POSIX file. The warning SHALL
not make lint fail.

#### Scenario: Existing compliance fixtures
- **WHEN** the established exact, glob, existing-test, and new-test fixtures are linted
- **THEN** their valid or invalid results remain unchanged

#### Scenario: Two tasks overlap
- **WHEN** two task scopes resolve to the same existing file
- **THEN** lint succeeds if no error exists and includes an overlap warning naming both tasks and that file

### Requirement: Resolver-versioned task measures

Start and end measures SHALL use the shared resolver for scope-derived hashes,
file counts, line counts, changed paths, and import fan-in. `scopeFiles` SHALL
count resolved existing files rather than declarations or unmatched patterns,
and measures SHALL identify resolver version 2.

Scope-file size reporting SHALL keep legacy and resolver-2 measurements in
separate series. Text and stable JSON SHALL identify the earliest change
containing a resolver-2 start measure, and no scope-file bucket or largest-task
comparison SHALL combine legacy and resolver-2 counts.

#### Scenario: Glob scope is measured
- **WHEN** one scope glob resolves to several existing files
- **THEN** `scopeFiles` records the number of resolved files and the measure identifies resolver version 2

#### Scenario: Reporting crosses the resolver upgrade
- **WHEN** history contains legacy and resolver-2 measures
- **THEN** the report marks the first resolver-2 change and does not aggregate both generations into one scope-file size series

## Task boundary note

Task 1 owns the resolver, hash projection, and linter compliance cut-over.
Task 3 intentionally extends `src/core/linter.ts` after task 1 to add overlap
warnings. Task 4 intentionally extends `src/harness/types.ts` after task 2 to
version measures after task 2 versions regression events. These are the only
source files shared by tasks. Tasks 2 through 4 consume the resolver exports
without extending `src/core/scope.ts` or `src/core/scope-hash.ts`.

## Human steps

- Let change 041 finish and archive before approving or executing this change.
- After reviewing these task bodies and deltas, run `pnpm osq approve 042` yourself. Neither planner nor executor approves the change.
- After upgrading, review resolver-upgrade regression records for active changes and use `osq retry <id> <task>` to recertify each one explicitly.

## Delta

- `specs/watcher-and-harness/spec.md`: deterministic resolution, glob-aware hashing and attribution, resolver-versioned done markers and recertification audit, and resolved-file measures.
- `specs/spec-lint-and-approve/spec.md`: unchanged test-scope compliance through the shared resolver and non-failing cross-task overlap warnings.
- `specs/metrics-and-reporting/spec.md`: resolver-versioned measures and separate legacy/resolver-2 scope-size series.
- `specs/cli-foundation/spec.md`: one consumer upgrade note for active legacy done markers.
