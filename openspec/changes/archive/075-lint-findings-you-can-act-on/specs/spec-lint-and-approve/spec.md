# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Lint finding fields
<!-- source: src/core/spec/lint-findings.ts, src/core/spec/linter.ts, tests/lint-findings.test.ts -->
Every lint finding SHALL carry `severity` (`error` or `warning`; OpenSpec
`WARNING` and `INFO` are warnings), `file`, `requirement`, `section`, and
`message`, which keeps today's text. `LintResult` SHALL add `findings`, the
change's own, and `repository`; `errors` and `warnings` SHALL hold the messages
of the change's own findings.

#### Scenario: Task finding
- **WHEN** task 1's verify chains commands
- **THEN** the finding has severity `error`, file `openspec/changes/<id>/tasks/1.md`, and null requirement and section

### Requirement: Lint finding file
<!-- source: src/core/spec/linter.ts, src/core/spec/openspec-issues.ts, tests/lint-findings.test.ts -->
A finding's `file` SHALL be the repository-relative path it concerns: the task
file, `proposal.md`, or delta file; the missing `tasks` directory; or
`package.json` for validator findings. An OpenSpec change issue SHALL name the
delta file its `path` names, else that change's `proposal.md`; a living spec
issue its `spec.md`; output without items the linted `proposal.md`.

#### Scenario: Delta issue
- **WHEN** OpenSpec reports an issue at path `cap/spec.md` of the linted change
- **THEN** the finding's file is `openspec/changes/<id>/specs/cap/spec.md`

### Requirement: Lint finding requirement and section
<!-- source: src/core/spec/openspec-issues.ts, src/core/spec/linter.ts, tests/lint-findings.test.ts -->
A finding's `requirement` SHALL name the requirement it concerns: for an
OpenSpec `requirements[<index>]` path, the one at that zero-based position; for
a change issue starting `ADDED "<name>"` or the same with `MODIFIED`,
`REMOVED`, or `RENAMED`, that name. `section` SHALL be `Purpose` for an
`overview` path and `Surface` for the missing surface section. Both SHALL be
null otherwise.

#### Scenario: Living spec requirement
- **WHEN** OpenSpec reports a long-requirement issue at `requirements[1]` of living spec `cap`
- **THEN** the finding has severity `warning`, file `openspec/specs/cap/spec.md`, and the name of `cap`'s second requirement

### Requirement: Repository lint findings
<!-- source: src/core/spec/openspec-issues.ts, src/core/spec/linter.ts, src/cli/lint.ts, tests/lint-findings.test.ts, tests/lint-output.test.ts -->
An OpenSpec issue about a living spec or another change SHALL be a repository
finding, which SHALL NOT affect `valid`, `osq lint`'s exit code, or `osq
approve`. Issues about the linted change, OpenSpec output naming no item, and
every osq and validator check SHALL be the change's own.

#### Scenario: Long living requirement
- **WHEN** a living spec has a requirement longer than 500 characters and a clean change is linted
- **THEN** the warning is a repository finding, the change is valid, and `osq lint` exits 0

#### Scenario: Another change's error
- **WHEN** OpenSpec reports an error about another active change
- **THEN** it is a repository finding and the linted change stays valid

### Requirement: Chained verify refusal
<!-- source: src/core/spec/linter.ts, tests/lint-findings.test.ts -->
Lint SHALL refuse a task verify that chains commands with `&&`, `;`, or `|` with
the error `Task in <n>.md verify chains commands ("<verify>"); move the chain
into a package script and name that script, for example pnpm run <script>`.

#### Scenario: Chained verify
- **WHEN** task 1's verify is `pnpm a && pnpm b`
- **THEN** lint fails with the chained verify error and its package-script advice

### Requirement: Unsupported OpenSpec advice
<!-- source: src/core/spec/openspec-issues.ts, tests/lint-findings.test.ts -->
An OpenSpec finding whose message suggests `skip_specs: true` SHALL end with
` [unsupported by osq: osq does not honor skip_specs; add a delta spec under
specs/<capability>/spec.md]`.

#### Scenario: Change without deltas
- **WHEN** a change without a delta spec is linted
- **THEN** OpenSpec's no-deltas error ends with the unsupported-by-osq note

### Requirement: Merged living spec validation
<!-- source: src/core/spec/merged-spec-check.ts, src/core/spec/linter.ts, tests/lint-findings.test.ts -->
Lint SHALL write the text `mergeDelta` returns for every delta that merges to
`openspec/specs/<capability>/spec.md` in a temporary folder, run `openspec
validate --specs --strict --json --no-interactive` there once with
`OPENSPEC_TELEMETRY=0` and the configured verify timeout, and remove the
folder. It SHALL skip this when no delta merges or the validator binary is
unavailable.

#### Scenario: No delta merges
- **WHEN** every delta of a change fails to merge
- **THEN** lint reports the merge errors and runs no merged spec validation

### Requirement: Merged living spec findings
<!-- source: src/core/spec/merged-spec-check.ts, tests/lint-findings.test.ts -->
Each merged spec issue SHALL be a finding of the change with file the delta
file, the requirement resolved against the merged text, and message `openspec:
<capability> after archive: <message>`. An issue the living spec already has,
with the same message on the same requirement name or section, SHALL be left
out.

#### Scenario: Brief Purpose
- **WHEN** a delta creates capability `newcap` with `## Purpose` shorter than 50 characters
- **THEN** lint warns `openspec: newcap after archive: Purpose section is too brief (less than 50 characters)` with file `openspec/changes/<id>/specs/newcap/spec.md`

#### Scenario: Inherited warning
- **WHEN** a delta adds a requirement to a living spec that already has a long requirement
- **THEN** lint reports no after-archive finding for the long requirement

### Requirement: Lint output
<!-- source: src/cli/lint.ts, src/core/spec/lint-output.ts, tests/lint-output.test.ts -->
`osq lint` SHALL print each finding of a change as `<change>: <severity> <file>
(<requirement or section>): <message>`, leaving out the parenthesis when both
are null and preferring the requirement, at the logger's `error` level for
errors and `warn` level for warnings, and `<change>: valid` when the change is
valid.

#### Scenario: Error and warning
- **WHEN** a change has one error and one warning
- **THEN** the lines start `<change>: error ` and `<change>: warning ` and name the file

### Requirement: Repository lint output
<!-- source: src/cli/lint.ts, src/core/spec/lint-output.ts, tests/lint-output.test.ts -->
After every change, `osq lint` SHALL print the repository findings of all
linted changes once, without duplicates, under the line `repository: findings
about other changes and living specs; they do not affect the exit code`, each
as `repository: <severity> <file> (<requirement or section>): <message>`.

#### Scenario: Two changes share a repository finding
- **WHEN** `osq lint` lints two changes and OpenSpec reports one living spec warning
- **THEN** the warning prints once, under the repository group, after both changes

### Requirement: Lint JSON output
<!-- source: src/cli/lint.ts, src/cli/index.ts, src/core/spec/lint-output.ts, tests/lint-output.test.ts -->
`osq lint --json` SHALL write one JSON document to stdout, `{ "valid",
"changes": [{ "change", "valid", "findings" }], "repository" }`, where each
finding has `severity`, `file`, `requirement`, `section`, and `message`, and
SHALL print no text lines. The exit code SHALL match the text mode.

#### Scenario: JSON findings
- **WHEN** `osq lint --json` lints a change with one error and one warning
- **THEN** stdout parses as JSON whose change carries both findings with their fields

## MODIFIED Requirements

### Requirement: OpenSpec strict validation integration
<!-- source: tests/linter.test.ts, src/core/spec/openspec-issues.ts -->
The system SHALL execute OpenSpec CLI validation under strict mode during change
linting and SHALL attribute each issue to the item OpenSpec names, keeping its
`path`.

#### Scenario: Pinned validator execution
- **WHEN** `osq lint` or `osq approve` executes
- **THEN** system executes `openspec validate --changes --strict --json --no-interactive` and `openspec validate --specs --strict --json --no-interactive` with `OPENSPEC_TELEMETRY=0` and surfaces findings prefixed with `openspec:`

#### Scenario: Issue attribution
- **WHEN** OpenSpec reports an issue under an item with `id` and `type`
- **THEN** lint sets the finding's file, requirement, section, and severity from that item, the issue's `path`, and its `level`
