# spec-lint-and-approve Specification

## Purpose

Governs the human gate: parsing change specifications, validating limits and OpenSpec conventions, computing deterministic SHA-256 folder hashes, and sealing approved changes.

## Requirements

### Requirement: Change folder structure and parsing
The system SHALL parse change proposals, delta specs, and task definitions.

#### Scenario: Proposal frontmatter extraction
- **WHEN** change folder contains `proposal.md` with YAML frontmatter
- **THEN** system extracts `title`, `depends_on`, and `features.reads`

#### Scenario: Task definition parsing
- **WHEN** task markdown under `tasks/<n>.md` is parsed
- **THEN** system extracts `title`, `verify`, `scope`, `entry`, `skills`, `verify_starts`, and `acceptance` criteria

#### Scenario: Task start state
- **WHEN** task frontmatter declares `verify_starts` as `green` or `any`
- **THEN** the parsed task carries that start state, and an absent or unrecognized value parses as `red`

### Requirement: Specification lint rules and limits
The linter SHALL validate authored change artifacts and configured limits while
treating root-level `plan-prompt.md` as transient local planning context. It
SHALL exclude that file from schema, artifact, and tree inputs exactly as it
excludes `.run/`, without weakening validation of any proposal, delta, task, or
other authored file.

#### Scenario: Enforcing limits
- **WHEN** a change folder is linted
- **THEN** declared scope-pattern, acceptance-line, contract-table, and other configured limits remain enforced while resolved overlap remains a warning

#### Scenario: Change contains a planning prompt
- **WHEN** an otherwise valid change is linted with any `plan-prompt.md` bytes
- **THEN** lint returns the same findings as it would if that transient file were absent

### Requirement: OpenSpec strict validation integration
The system SHALL execute OpenSpec CLI validation under strict mode during change
linting and SHALL attribute each issue to the item OpenSpec names, keeping its
`path`.

#### Scenario: Pinned validator execution
- **WHEN** `osq lint` or `osq approve` executes
- **THEN** system executes `openspec validate --changes --strict --json --no-interactive` and `openspec validate --specs --strict --json --no-interactive` with `OPENSPEC_TELEMETRY=0` and surfaces findings prefixed with `openspec:`

#### Scenario: Issue attribution
- **WHEN** OpenSpec reports an issue under an item with `id` and `type`
- **THEN** lint sets the finding's file, requirement, section, and severity from that item, the issue's `path`, and its `level`

### Requirement: Deterministic change folder hashing
The system SHALL compute deterministic SHA-256 hashes over change-folder files
while excluding `.run/`, `.git`, `.DS_Store`, and root-level
`plan-prompt.md`, and while normalizing task checklist state and line endings.
Approval, pre-spawn conflict checks, retry integrity, and archive tree
verification SHALL consume the same exclusion contract.

#### Scenario: Folder hash computation
- **WHEN** `hashChangeFolder` is invoked
- **THEN** covered files excluding `.run/`, `.git/`, `.DS_Store`, and root `plan-prompt.md` are sorted, normalized, and hashed with a `sha256:` prefix

#### Scenario: Transient prompt changes
- **WHEN** `plan-prompt.md` is added, edited, or removed after a change hash is computed
- **THEN** every integrity consumer observes the same unchanged hash

#### Scenario: Authored artifact changes
- **WHEN** any covered proposal, task, delta, or brief byte changes
- **THEN** the deterministic folder hash changes and existing integrity gates detect the drift

### Requirement: Human approval sealing
Before writing the approval seal and manifest, `osq approve` SHALL build and
print the approval digest and, under `--confirm`, obtain confirmation for any
flags. It SHALL then discover and append deduplicated local planning sessions
whose observed edits target the selected change. Reader absence, malformed
local data, and no matches SHALL not weaken lint or prevent approval. When no
reader matches, approval SHALL print one line stating that no planning record
was found.

#### Scenario: Sealing approved spec
- **WHEN** a user executes `osq approve <id>` on a change passing lint
- **THEN** the digest prints, observation runs, the manifest is built from recorded history, and the authored-content hash is written to `.run/approved`

#### Scenario: Approval observes matching planning
- **WHEN** a local supported-tool session edited the selected change in the observation window
- **THEN** its observed record is appended before the manifest is built and the approval seal covers only authored artifacts

#### Scenario: Approval observes no planning
- **WHEN** no supported local session matches the change and window
- **THEN** approval succeeds with null planner attribution and prints the one-line notice

#### Scenario: Declined confirmation
- **WHEN** confirmation is declined or refused
- **THEN** no planning record, manifest, or approval seal is written

### Requirement: Code ownership
<!-- source: src/core/spec/**, src/cli/lint.ts, src/cli/migrate.ts -->
The Spec Lint and Approve capability SHALL own specification parsing, linting,
approval sealing without failure-state transitions, hashing, dependency
existence validation, and migration logic.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for spec validation and parsing
- **THEN** system maps `src/core/spec/**`, `src/cli/lint.ts`, and `src/cli/migrate.ts` to `spec-lint-and-approve`

### Requirement: Capability code ownership parsing
The system SHALL parse `### Requirement: Code ownership` blocks by header name across living and delta specifications.

#### Scenario: Parsing ownership globs from header
- **WHEN** parser inspects any capability specification containing `### Requirement: Code ownership`
- **THEN** system extracts the declared glob list and associates it with the capability

### Requirement: Test modification declaration validation
The linter SHALL validate that tasks altering existing tests explicitly declare
`tests.modify: true`. It SHALL identify existing test files through the shared
deterministic scope resolver without maintaining another glob matcher or tree
walker. A test file is one that `isGatedTestPath` accepts, as
watcher-and-harness's "Test gate paths" says. The frozen test reach warning and
the approval digest's existing tests SHALL use the same function.

#### Scenario: Valid test modification declaration
- **WHEN** task frontmatter declares `tests.modify: true` as a boolean
- **THEN** linter accepts the declaration and permits exact or glob-resolved existing test paths in task scope

#### Scenario: Existing test lacks declaration
- **WHEN** an exact path or glob resolves to an existing test file and `tests.modify` is false
- **THEN** linter rejects the task and identifies the resolved test file

#### Scenario: New exact test path
- **WHEN** task scope names an exact test path that does not yet exist
- **THEN** lint does not treat that null resolver entry as modification of an existing test

#### Scenario: Invalid test modification type
- **WHEN** task frontmatter provides a non-boolean value for `tests.modify`
- **THEN** linter rejects the task with a schema validation error

#### Scenario: Named test outside tests
- **WHEN** a task's scope resolves to an existing `src/quote.test.ts` and `tests.modify` is false
- **THEN** linter raises no `tests.modify` finding for it

### Requirement: Architecture Decision Record 004: Pinned OpenSpec Validator
The project SHALL record and accept ADR 004 documenting the pinned `@fission-ai/openspec` dependency, exact version pin, validator execution semantics, and drift diagnostics.

#### Scenario: ADR 004 acceptance and indexing
- **WHEN** decisions in the repository are inspected
- **THEN** `decisions/004-pinned-openspec-validator.md` is present and indexed in `decisions/README.md` as accepted before approval

### Requirement: OpenSpec schema execution authority instructions
The OpenSpec schema template SHALL instruct agents that tasks are executed solely by `osq watch`, archiving is owned exclusively by `osq`, and task checkboxes are runner-written projections.

#### Scenario: Schema instructions enforce execution authority
- **WHEN** an agent reads schema instructions for tasks or apply actions
- **THEN** instructions explicitly prohibit direct task execution or `openspec archive`, delegating execution exclusively to `osq watch`

### Requirement: Proposal change-level verify command declaration
The linter and parser SHALL require that change proposals declare an executable change-level `verify` command in YAML frontmatter.

#### Scenario: Linter requires verify command on proposal
- **WHEN** `proposal.md` lacks a `verify` frontmatter field or provides an empty string
- **THEN** `osq lint` rejects the change folder with a validation error

#### Scenario: Linter accepts valid verify command
- **WHEN** `proposal.md` declares a non-empty `verify` string command in frontmatter
- **THEN** `osq lint` accepts the proposal structure

### Requirement: Pinned OpenSpec validator failure gating
The linter and approval engine SHALL require that `@fission-ai/openspec` is installed. A version equal to the pinned `1.13.1` SHALL pass. A different version inside the `peerDependencies` range declared in osq's `package.json` SHALL produce a warning citing ADR 005 and SHALL NOT fail. If the binary is missing or the version is outside that range, `osq lint` and `osq approve` SHALL fail with exit code 1, reporting an error citing ADR 004 and the install command `pnpm add -D @fission-ai/openspec@1.13.1`. Zero checks report skipped, and the word "skipped" SHALL NOT appear in `src/`.

#### Scenario: Missing validator binary causes lint and approval failure
- **WHEN** `node_modules/.bin/openspec` is missing or unavailable
- **THEN** `osq lint` and `osq approve` fail reporting an error citing ADR 004 and `pnpm add -D @fission-ai/openspec@1.13.1`

#### Scenario: Version drift causes lint and approval failure
- **WHEN** `openspec` reports a version outside the declared peer range
- **THEN** `osq lint` and `osq approve` fail reporting version drift citing ADR 004 and `pnpm add -D @fission-ai/openspec@1.13.1`

#### Scenario: Version inside the peer range warns
- **WHEN** `openspec` reports a version inside the declared peer range that differs from `1.13.1`
- **THEN** `osq lint` passes with a warning naming the version, the range, and ADR 005

#### Scenario: Zero checks report skipped and word absent from src
- **WHEN** validation and diagnostic checks execute across the project
- **THEN** no check reports a skipped status and `grep -ri "skipped" src/` finds zero matches

### Requirement: Proposal schema writes rejection
The parser and linter SHALL reject any change proposal declaring `features.writes` in YAML frontmatter. Capability writes SHALL be derived exclusively from the set of delta specification files under `specs/<capability>/spec.md`.

#### Scenario: Linter rejects proposal with features.writes
- **WHEN** `proposal.md` declares `features.writes` in YAML frontmatter
- **THEN** `osq lint` rejects the change folder with a validation error

#### Scenario: Delta specifications serve as sole writes declaration
- **WHEN** a change folder declares delta specification files under `specs/`
- **THEN** system derives written capabilities exclusively from the present delta files without frontmatter declaration

### Requirement: Prohibited control characters rejection
The linter and approval engine SHALL inspect all files in a change folder and reject any file containing prohibited ASCII control characters (0x00-0x1F and 0x7F) other than newline (`\n`, 0x0A) and tab (`\t`, 0x09).

#### Scenario: Control characters trigger lint and approval failure
- **WHEN** any file in a change folder contains prohibited control characters (e.g. `\x07` bell or `\x08` backspace)
- **THEN** `osq lint` and `osq approve` fail reporting an error identifying the file and character

#### Scenario: Allowed whitespace passes
- **WHEN** files contain only valid printable characters, newlines (`\n`), and tabs (`\t`)
- **THEN** control character validation passes

### Requirement: Fused acceptance lines rejection
The linter SHALL reject any task file where two or more acceptance checkbox checklist items appear on the same line.

#### Scenario: Fused acceptance lines trigger lint error
- **WHEN** a line in a task file contains more than one acceptance checkbox pattern (`[-*]\s*\[[ xX]\]`)
- **THEN** `osq lint` and `osq approve` reject the task file reporting fused acceptance lines

#### Scenario: Separate acceptance lines pass
- **WHEN** every acceptance checklist item appears on its own line
- **THEN** acceptance line structure validation passes

### Requirement: Task title phrasing permissiveness
The linter SHALL permit task titles containing " and " without emitting a warning.

#### Scenario: Task title containing and emits no warning
- **WHEN** a task declares a title containing " and "
- **THEN** `osq lint` produces zero warnings for the title

### Requirement: Instruction-shaped delta rejection in linter
The linter SHALL inspect delta specifications under `specs/` in change folders and reject any requirement whose name or heading is instruction-shaped (such as starting with "update" or "document").

#### Scenario: Linter rejects requirement starting with update or document
- **WHEN** a delta specification contains a requirement starting with "update" or "document" (case-insensitive)
- **THEN** `osq lint` and `osq approve` reject the change folder with a validation error

#### Scenario: Declarative capability deltas pass lint
- **WHEN** all delta specifications declare behavior using declarative requirements
- **THEN** instruction-shaped delta validation passes with zero errors

### Requirement: Retry approval integrity
The retry transition SHALL compare the current deterministic change-folder hash
with `.run/approved` before changing any marker or appending an event. A missing
or mismatched approval SHALL leave failure state intact and identify
`osq approve <id>` as the remediation. Approval SHALL update approval artifacts
without renaming an active dead or regressed marker that is not a steering
trigger; only retry may retire one. Approval of a change that needs steering
SHALL retire each trigger's marker, and it SHALL do so through the retry
transition after the new seal is written, as "Approval after steering" says.

#### Scenario: Retry matches approval
- **WHEN** an active failed change still matches its approved hash
- **THEN** retry may proceed without changing the approval marker

#### Scenario: Retry finds authored drift
- **WHEN** authored change-folder content no longer matches `.run/approved`
- **THEN** retry refuses before mutation and directs the user to approve the change again

#### Scenario: Reapproval retains active failure
- **WHEN** `osq approve` seals a change whose active dead marker has `reason: verify_red` without `stuck`, and whose `.run/regressed/change.md` has `reason: worktree_dirty`
- **THEN** approval leaves both markers active for an explicit retry or rejection decision

### Requirement: Rejected dependency existence
Dependency validation SHALL recognize a referenced change retained in the
canonical rejected directory as an existing historical change. Existence SHALL
NOT imply that the dependency landed.

#### Scenario: Linting a rejected dependency reference
- **WHEN** a proposal names a dependency whose folder exists only under `openspec/changes/rejected/`
- **THEN** lint does not report the dependency identifier as missing

### Requirement: Verify-command trust validation
The linter SHALL analyze the proposal verify command and every task verify
command without executing or shell-expanding them. The template sentinel
`node -e "process.exit(0)"` and normalized equivalents SHALL be errors. A
recognized package-script invocation naming no script in the project-root
`package.json` SHALL be an error. Any other command that names neither an
existing repository-relative path, a recognized package script, nor a missing
path the scope of its task or an earlier task covers SHALL emit a warning.

Sentinel normalization SHALL cover surrounding and repeated ASCII whitespace,
single or double quotes around `process.exit(0)`, `-e` and `--eval`, and an
optional semicolon inside the JavaScript expression. Package-script recognition
SHALL cover ordinary pnpm, npm, yarn, and bun direct or `run` forms. A missing
or malformed package manifest SHALL be handled deterministically without
executing the command.

#### Scenario: Placeholder verify is rejected
- **WHEN** a proposal or task verify is the template sentinel or a normalized equivalent
- **THEN** lint fails with an actionable diagnostic requiring real final-tree verification

#### Scenario: Referenced package script is missing
- **WHEN** a recognized package-manager command names a script absent from the root manifest
- **THEN** lint fails and identifies the missing script and artifact

#### Scenario: Verify target cannot be resolved
- **WHEN** a non-placeholder verify names no existing path, no recognized package script, and no path a task scope covers
- **THEN** lint emits an artifact-specific warning while preserving all independent lint errors

#### Scenario: Local verify target exists
- **WHEN** a verify names an existing repository file or directory or a present package script
- **THEN** trust validation emits no unresolved-target warning

#### Scenario: Verify names only its new test
- **WHEN** a task verify names only a test file that does not exist yet and the task's scope covers it
- **THEN** trust validation emits no unresolved-target warning

### Requirement: Resolved task scope overlap warning
The linter SHALL compare the existing files produced by the shared scope
resolver for every pair of tasks in one change. Every shared file SHALL emit a
deterministic warning naming both task numbers and the project-relative POSIX
path. Warnings SHALL NOT make an otherwise valid change fail.

Duplicate declarations within one task SHALL not warn. Missing exact paths and
unmatched globs SHALL not count as shared files. Pair and path ordering SHALL be
stable regardless of task directory or filesystem enumeration order.

#### Scenario: Two tasks resolve one file
- **WHEN** two task scopes resolve to the same existing file
- **THEN** lint warns with both task numbers and the file while remaining valid when no error exists

#### Scenario: Three tasks resolve one file
- **WHEN** three task scopes resolve to the same existing file
- **THEN** lint emits one warning for each deterministic task pair without a self-warning

#### Scenario: Declarations have no existing overlap
- **WHEN** repeated scope text names only missing exact paths or unmatched globs
- **THEN** lint emits no overlap warning

### Requirement: Harness event fixture scope warning
The linter SHALL use the shared deterministic scope resolution already computed
for each task to detect harness implementation scope without corresponding
event fixture coverage. When resolved scope contains any file below
`src/harness/` but contains no file below `tests/fixtures/events/`, lint SHALL
emit one deterministic non-failing warning for that task naming
`tests/fixtures/events/`.

The warning SHALL be absent when an exact fixture file, the fixture directory,
or a supported glob declaration resolves fixture content. It SHALL NOT add a
second scope matcher or make an otherwise valid change fail.

#### Scenario: Harness scope omits event fixtures
- **WHEN** a task resolves at least one `src/harness/` file and no `tests/fixtures/events/` file
- **THEN** lint remains valid and emits one warning naming the task and `tests/fixtures/events/`

#### Scenario: Harness scope includes event fixtures
- **WHEN** the same task's exact, directory, or glob scope resolves content under `tests/fixtures/events/`
- **THEN** lint emits no harness event fixture warning

### Requirement: OpenSpec merge parity
The delta merge SHALL produce byte-identical living specs to `openspec archive`
for every delta that `openspec archive` accepts, and SHALL refuse with
`DeltaMergeError` every delta it refuses: a MODIFIED block that leaves out a
scenario of the existing requirement, and an ADDED requirement whose name
already exists. RENAMED entries SHALL use the `### Requirement:` form, and the
merge SHALL refuse any other form rather than skip it. The merge SHALL keep
scenario text verbatim and SHALL keep base spec bytes it does not change.

#### Scenario: OpenSpec rename form
- **WHEN** a delta renames with ``- FROM: `### Requirement: A` `` and ``- TO: `### Requirement: B` ``
- **THEN** the merged spec carries requirement `B` in place of `A`

#### Scenario: Bare rename form
- **WHEN** a delta renames with ``- FROM: `A` ``
- **THEN** the merge raises `DeltaMergeError` naming the `### Requirement:` form, and `osq lint` reports it

#### Scenario: Dropped scenario or duplicate addition
- **WHEN** a MODIFIED block leaves out an existing scenario, or an ADDED requirement already exists
- **THEN** the merge raises `DeltaMergeError`, and `osq lint` reports it

#### Scenario: New capability purpose
- **WHEN** a delta creates a capability from its `## Purpose`
- **THEN** the purpose text follows the `## Purpose` heading on the next line, as `openspec archive` writes it

### Requirement: Differential archive test
A differential test SHALL copy each fixture case into two temporary repositories
that carry the scaffolded osq schema. It SHALL merge the case's changes with
`openspec archive --yes --json` in one and with `applyOpenSpecDeltas` in the
other, and SHALL assert byte-identical `openspec/specs` trees or matching
refusals. It SHALL run `openspec validate --strict` on every accepted fixture
change. It SHALL use `OSQ_OPENSPEC_BIN` when set and the local
`node_modules/.bin/openspec` otherwise, and every failure message SHALL name the
validator version.

#### Scenario: Fixture coverage
- **WHEN** the fixture cases are listed
- **THEN** they cover ADDED, MODIFIED, REMOVED, and RENAMED requirements, a new capability with `## Purpose`, a second change to a capability the first change created, GIVEN and AND scenario bullets, a dropped scenario, a duplicate ADDED name, and the bare RENAMED form

#### Scenario: Offline by default
- **WHEN** the test runs without `OSQ_OPENSPEC_BIN`
- **THEN** it invokes only the locally installed validator and needs no network

### Requirement: Scheduled upstream OpenSpec check
A scheduled GitHub Actions workflow SHALL install `@fission-ai/openspec@latest`
outside the lockfile, print its version, and run the differential test with
`OSQ_OPENSPEC_BIN` pointing at that installation. It SHALL also be runnable on
demand.

#### Scenario: Weekly run against the latest release
- **WHEN** the schedule fires or a maintainer dispatches the workflow
- **THEN** the differential test runs against the latest OpenSpec, and a failure names that version

### Requirement: Architecture Decision Record 005: OpenSpec validator peer range
The project SHALL record and accept ADR 005. It supersedes ADR 004's drift rule:
the exact pin stays for osq's own development and CI, doctor and lint warn on a
different version inside the `peerDependencies` range and fail outside it, and
the scheduled workflow signals when a pin bump needs its own ADR. It SHALL
record that archive folders keep osq's `<id>-<slug>` naming.

#### Scenario: ADR 005 acceptance and indexing
- **WHEN** decisions in the repository are inspected
- **THEN** `decisions/005-openspec-validator-peer-range.md` is present with status Accepted and indexed in `decisions/README.md`

### Requirement: Proposal surface declaration
`osq lint` and `osq approve` SHALL reject a `proposal.md` whose `## Surface`
section is missing or holds nothing but HTML comments and whitespace, with one
error that says to list the commands, flags, config keys, frontmatter fields,
document sections, dead reasons, and event types the change adds, changes, or
removes, or to write `None`. Any other text SHALL pass; lint SHALL NOT parse
or score the section. A legacy `spec.md` change document SHALL be exempt.

#### Scenario: Declared surface
- **WHEN** a proposal's `## Surface` section says `None` or lists added, changed, or removed names
- **THEN** lint reports no surface error

#### Scenario: Missing surface
- **WHEN** a proposal has no `## Surface` section
- **THEN** `osq lint` and `osq approve` fail with the surface error

#### Scenario: Comment-only surface
- **WHEN** a proposal's `## Surface` section holds only HTML comments
- **THEN** `osq lint` fails with the surface error

### Requirement: Living spec replay in landing order
The living-spec replay test SHALL rebuild each living capability spec by
merging archived deltas in landing order: archives without a change-level
`archived` event first, in folder-name order, then the rest by that event's
timestamp and folder name, read with `readLandedAt`. It SHALL then merge, in
folder-name order, each active change folder holding the record at
`archiveSpecsRecordPath`, whose deltas archive has already applied for the
change-level `verify`.

#### Scenario: Later number landed first
- **WHEN** a later-numbered change archived before an earlier-numbered one and both write the same capability
- **THEN** the replay merges the earlier-landed delta first and matches the living spec

#### Scenario: Archives before the event existed
- **WHEN** archives lack an `archived` event
- **THEN** the replay merges them first, in folder-name order

#### Scenario: Change being archived
- **WHEN** `openspec/changes/` holds `archive/`, an active `002-b` with the archive record, an active `001-a` with the record, and an active `003-c` without it
- **THEN** the replay picks up `001-a` then `002-b` after the archived folders, and leaves out `003-c`

### Requirement: Approval digest
`buildApprovalDigest` SHALL summarize a change from its authored files: the
first two sentences of the proposal's `## Goal`, one entry per task with its
title and the number of existing files in its resolved scope, and per delta
capability the requirement names added, modified, and removed, and whether the
change deliberately creates it. It SHALL list, as information and never as
flags, each task with `tests.modify: true` and the existing test files in its
resolved scope, and the `## Human steps` text. It SHALL reuse `resolveScope` and
`parseDelta` and add no parsing of its own.

#### Scenario: Digest content
- **WHEN** a change with two tasks and one delta is digested
- **THEN** the digest holds the goal's first two sentences, both task titles with their scope file counts, and the delta's requirement names by kind

#### Scenario: Test modification is information
- **WHEN** a task declares `tests.modify: true` with an existing test in scope
- **THEN** the digest lists that task and test and raises no flag for it

### Requirement: Approval flags
The digest SHALL raise `shared_file` for task pairs whose resolved scopes share
a path, `sensitive_path` for resolved scope paths that are package manifests,
lockfiles, CI workflows, `osq.config.*`, OpenSpec config, managed instruction
files, or env files, `verify_without_test` for a verify naming no test file or
runner, `removed_requirement` for removing deltas, `unknown_capability` for a
delta capability with no living spec that is not deliberately created, and
`verify_starts_conflict` for each verify start contradiction.

#### Scenario: Shared file
- **WHEN** tasks 1 and 2 both resolve `src/a.ts`
- **THEN** one `shared_file` flag labelled `shared files in tasks 1 and 2` names the file and says the watcher will halt for recertification when task 2 changes it

#### Scenario: Env file templates
- **WHEN** a scope resolves `.env.example`, `.env.sample`, or `.env.template`
- **THEN** no `sensitive_path` flag fires for that file, while `.env` and `.env.local` do fire

#### Scenario: Verify with a runner
- **WHEN** a verify is `pnpm verify` or `node --import tsx --test tests/a.test.ts`
- **THEN** no `verify_without_test` flag fires for it, while `npx tsc --noEmit` fires one

#### Scenario: Approval line
- **WHEN** two flags fire and approval proceeds
- **THEN** each flag prints on its own line after the digest and the approval line reads `Approved <id> (<folder>) with 2 flags: <label>, <label>`

#### Scenario: Verify start conflict
- **WHEN** a task declares `any` or `green` and its verify names a missing test inside its own scope
- **THEN** one `verify_starts_conflict` flag labelled `verify starts conflict in task <n>` names the path and the declared start, and the same task declaring `red` raises none

### Requirement: Approval confirmation
`osq approve --confirm` SHALL, when flags fire and a terminal is attached,
print each flag with its excerpt and ask for confirmation defaulting to no.
Without a terminal it SHALL refuse, naming the flags, instead of waiting. A
declined or refused approval SHALL exit 1 and write no approval, manifest, or
planning record. Without flags, `--confirm` SHALL approve without asking.

#### Scenario: Confirmed at the prompt
- **WHEN** flags fire, a terminal is attached, and the approver answers `y`
- **THEN** the change is approved and the manifest records the flags with mode `confirmed`

#### Scenario: Default answer
- **WHEN** flags fire, a terminal is attached, and the approver presses enter
- **THEN** approval is declined and nothing is written

#### Scenario: No terminal
- **WHEN** flags fire and no terminal is attached
- **THEN** the command exits 1 naming the flags without prompting and writes nothing

### Requirement: Verify start contradiction
A verify's named paths SHALL be its operands that are not options, absolute,
assignments, URLs, or a bare first token, and that contain a path separator. A
glob operand SHALL be present when it matches a file. For each missing named
path not covered by an earlier task's scope, lint SHALL warn when the task
declares `green` or `any` and its own scope covers the path, and SHALL warn when
no scope covers it.

#### Scenario: Task creates its own test but declares any
- **WHEN** a task declares `verify_starts: any` and its verify names an existing test and a missing test inside its own scope
- **THEN** lint warns naming the task, the path, and the declared start

#### Scenario: Declared red
- **WHEN** the same task declares `red`
- **THEN** lint emits no contradiction warning

#### Scenario: Earlier task creates the path
- **WHEN** a task's verify names a missing file that an earlier task's scope covers
- **THEN** lint emits neither warning, whatever the task declares

#### Scenario: No task can create the path
- **WHEN** a task's verify names a missing file outside every task's scope up to and including its own
- **THEN** lint warns that no task in the change can create it

#### Scenario: Operands that are not paths
- **WHEN** a verify has quoted operands, `--import tsx`, `KEY=value`, or a URL
- **THEN** none of them is a named path, and a glob operand matching no file counts as missing

### Requirement: Capability creation
A delta capability with no living spec SHALL count as deliberately created when
the proposal lists it in `creates`, or when its delta has a `## Purpose`
section and its name resembles no living capability. Any other delta
capability with no living spec SHALL raise one `unknown_capability` flag,
labelled `unknown capability <name> resembles <living>` when a resemblance
exists, naming the first resembling living capability in name order, and
otherwise `unknown capability <name> without a Purpose`.

#### Scenario: Deliberate creation
- **WHEN** a delta with `## Purpose` targets a new name that resembles no living capability
- **THEN** no `unknown_capability` flag fires and the formatted digest shows its heading as `<name> (new capability):`

#### Scenario: Missing Purpose
- **WHEN** a delta without `## Purpose` targets a capability with no living spec and a name resembling none
- **THEN** one `unknown_capability` flag labelled `unknown capability <name> without a Purpose` fires

#### Scenario: Resembling name
- **WHEN** a delta with `## Purpose` targets `watcher-harness` and `watcher-and-harness` has a living spec
- **THEN** one `unknown_capability` flag labelled `unknown capability watcher-harness resembles watcher-and-harness` fires

#### Scenario: Listed in creates
- **WHEN** the proposal lists `creates: [watcher-harness]`, its delta targets `watcher-harness`, and `watcher-and-harness` has a living spec
- **THEN** no `unknown_capability` flag fires and the formatted digest shows `watcher-harness (new capability):`

### Requirement: Capability name resemblance
A new capability name SHALL resemble a living capability name when the two are
equal once hyphens and underscores are removed, when the words of one, split on
hyphens and underscores, all appear among the words of the other, or when both
are at least five characters long and their edit distance is at most two.

#### Scenario: Word subset
- **WHEN** `watcher-harness` is compared with `watcher-and-harness`
- **THEN** they resemble each other

#### Scenario: Short dissimilar names
- **WHEN** `cli` is compared with `api`
- **THEN** they do not resemble each other

### Requirement: Rework declaration
A proposal MAY declare `fixes` in its frontmatter as a list of the change ids it
fixes. `parseSpecMd` SHALL expose them as `fixes`, normalized like
`depends_on`, and an absent or malformed value SHALL read as an empty list.
`osq lint` SHALL fail with `fixes names missing change: <id>` for each id that
names no active, archived, or rejected change. `fixes` SHALL NOT affect
dependency completion or execution order.

#### Scenario: Declared fix
- **WHEN** a proposal declares `fixes: ["1"]` and change 001 exists
- **THEN** `parseSpecMd` returns `fixes: ["001"]` and lint reports no `fixes` finding

#### Scenario: Missing fixed change
- **WHEN** a proposal declares `fixes: ["099"]` and no change 099 exists
- **THEN** lint fails with `fixes names missing change: 099`

### Requirement: Approval price gap notice
When the change being approved has planning sessions with recorded tokens whose
`plan_started` model has no `planning.prices` entry, `osq approve` SHALL print
one line per such model naming the exact key, such as
`planning.prices["claude-opus-5-5"]`, and saying its planning cost stays
unreported. The approval SHALL proceed unchanged.

#### Scenario: Unpriced planning model at approval
- **WHEN** a change with recorded planning tokens from `claude-opus-5-5` is approved and `planning.prices` has no entry for that model
- **THEN** approval succeeds and prints a line naming `planning.prices["claude-opus-5-5"]`

#### Scenario: Priced or unrecorded
- **WHEN** every model with recorded planning tokens has a price entry, or no session recorded tokens
- **THEN** approval prints no price line

### Requirement: Lint finding fields
Every lint finding SHALL carry `severity` (`error` or `warning`; OpenSpec
`WARNING` and `INFO` are warnings), `file`, `requirement`, `section`, and
`message`, which keeps today's text. `LintResult` SHALL add `findings`, the
change's own, and `repository`; `errors` and `warnings` SHALL hold the messages
of the change's own findings.

#### Scenario: Task finding
- **WHEN** task 1's verify chains commands
- **THEN** the finding has severity `error`, file `openspec/changes/<id>/tasks/1.md`, and null requirement and section

### Requirement: Lint finding file
A finding's `file` SHALL be the repository-relative path it concerns: the task
file, `proposal.md`, or delta file; the missing `tasks` directory; or
`package.json` for validator findings. An OpenSpec change issue SHALL name the
delta file its `path` names, else that change's `proposal.md`; a living spec
issue its `spec.md`; output without items the linted `proposal.md`.

#### Scenario: Delta issue
- **WHEN** OpenSpec reports an issue at path `cap/spec.md` of the linted change
- **THEN** the finding's file is `openspec/changes/<id>/specs/cap/spec.md`

### Requirement: Lint finding requirement and section
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
Lint SHALL refuse a task verify that chains commands with `&&`, `;`, or `|` with
the error `Task in <n>.md verify chains commands ("<verify>"); move the chain
into a package script and name that script, for example pnpm run <script>`.

#### Scenario: Chained verify
- **WHEN** task 1's verify is `pnpm a && pnpm b`
- **THEN** lint fails with the chained verify error and its package-script advice

### Requirement: Unsupported OpenSpec advice
An OpenSpec finding whose message suggests `skip_specs: true` SHALL end with
` [unsupported by osq: osq does not honor skip_specs; add a delta spec under
specs/<capability>/spec.md]`.

#### Scenario: Change without deltas
- **WHEN** a change without a delta spec is linted
- **THEN** OpenSpec's no-deltas error ends with the unsupported-by-osq note

### Requirement: Merged living spec validation
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
`osq lint` SHALL print each finding of a change as `<change>: <severity> <file>
(<requirement or section>): <message>`, leaving out the parenthesis when both
are null and preferring the requirement, at the logger's `error` level for
errors and `warn` level for warnings, and `<change>: valid` when the change is
valid.

#### Scenario: Error and warning
- **WHEN** a change has one error and one warning
- **THEN** the lines start `<change>: error ` and `<change>: warning ` and name the file

### Requirement: Repository lint output
After every change, `osq lint` SHALL print, at `info` level, `repository: <n>
findings about other changes and living specs; osq lint --repository lists
them`, counting unique repository findings, singular when `<n>` is 1. With
`--repository` it SHALL instead print each unique finding as `repository:
<severity> <file> (<requirement or section>): <message>`, under `repository:
findings about other changes and living specs; they do not affect the exit
code`. With none, it SHALL print neither.

#### Scenario: Two changes share a repository finding
- **WHEN** `osq lint --repository` lints two changes and OpenSpec reports one living spec warning
- **THEN** the warning prints once, under the repository group, after both changes

#### Scenario: Count in place of the list
- **WHEN** `osq lint 001` lints a valid change and OpenSpec reports warnings for two long requirements in living specs
- **THEN** the last line is `repository: 2 findings about other changes and living specs; osq lint --repository lists them`, no line starts `repository: warning `, and the exit code is 0

#### Scenario: One finding
- **WHEN** `osq lint 001` lints a valid change and OpenSpec reports one living spec warning
- **THEN** the last line is `repository: 1 finding about other changes and living specs; osq lint --repository lists them`

#### Scenario: No repository findings
- **WHEN** `osq lint 001` lints a change and there are no repository findings
- **THEN** no line starts `repository:`

#### Scenario: JSON keeps every finding
- **WHEN** `osq lint 001 --json` runs with two repository findings
- **THEN** the document's `repository` holds both findings, and stdout holds no text line

### Requirement: Lint JSON output
`osq lint --json` SHALL write one JSON document to stdout, `{ "valid",
"changes": [{ "change", "valid", "findings" }], "repository" }`, where each
finding has `severity`, `file`, `requirement`, `section`, and `message`, and
SHALL print no text lines. The exit code SHALL match the text mode.

#### Scenario: JSON findings
- **WHEN** `osq lint --json` lints a change with one error and one warning
- **THEN** stdout parses as JSON whose change carries both findings with their fields

### Requirement: Human steps sections
`parseHumanSteps(body)` SHALL split `## Human steps` into `beforeApproval` and
`afterLanding` by its `### Before approval` and `### After landing`
subsections, in any case. Text before the first subsection, or a section with
neither, SHALL be after landing. A part that is empty or `None` SHALL be empty.
`readCheckCommand` SHALL return the trimmed frontmatter `check`, else null.

#### Scenario: Section without subsections
- **WHEN** `## Human steps` holds one line and no subsection
- **THEN** that line is the after-landing text and before approval is empty

#### Scenario: None
- **WHEN** `## Human steps` reads `None`
- **THEN** both parts are empty

### Requirement: Digest steps before approval
`buildApprovalDigest` SHALL carry `beforeApproval`, the change's steps before
approval. When they are not empty, `formatApprovalDigest` SHALL print `Before
approval, do these first:` and each step line indented by two spaces, right
after the goal. The `Human steps:` block SHALL stay as it is.

#### Scenario: Steps before approval in the digest
- **WHEN** a change's `### Before approval` lists `Create the test database`
- **THEN** the digest prints `Before approval, do these first:` followed by `  Create the test database` before `Tasks:`

### Requirement: Import graph
`buildImportGraph(projectRoot, options)` SHALL read every JavaScript and
TypeScript file outside ignored folders and `options.skip`, follow relative
`import`, `export from`, dynamic `import()`, and `require()` specifiers, resolve
them as TypeScript does, and record each file's imports and importers. A
repository without such files SHALL give an empty graph.

#### Scenario: .js specifier for a .ts file
- **WHEN** `src/a.ts` imports `./b.js` and only `src/b.ts` exists
- **THEN** the graph records that `src/a.ts` imports `src/b.ts`

#### Scenario: Python-only repository
- **WHEN** a repository holds only `.py` files
- **THEN** the graph is empty and building it raises nothing

### Requirement: Import specifier resolution
A relative specifier SHALL resolve to the first existing file among the exact
path; for `.js`, `.jsx`, `.mjs`, or `.cjs`, the same stem with `.ts` or `.tsx`,
`.tsx`, `.mts`, or `.cts`; the path plus each script extension; and the path's
`index` file with each extension. Bare and aliased specifiers SHALL not
resolve.

#### Scenario: Directory import
- **WHEN** `src/a.ts` imports `./lib` and `src/lib/index.ts` exists
- **THEN** the graph records that `src/a.ts` imports `src/lib/index.ts`

### Requirement: Frozen test reach warning
Lint SHALL warn once per task whose existing scoped files are imported, within
`limits.importGraphDepth` levels, by preexisting files under `tests/` that no
task in the change may modify. The warning SHALL give their count and list up
to `limits.maxListedImporters` of them, nearest first, each with the scoped file
it reaches.

#### Scenario: Test two levels away
- **WHEN** `tests/a.test.ts` imports `src/b.ts`, which imports scoped `src/c.ts`
- **THEN** lint warns on that task's file naming `tests/a.test.ts (src/c.ts)`

#### Scenario: Test declared for modification
- **WHEN** a task declares `tests.modify: true` with `tests/a.test.ts` in scope
- **THEN** that test is left out and, with no other test, the warning goes away

### Requirement: Frozen test warning text
The warning SHALL read `Task <n> scope is imported by <count> preexisting tests
that no task may modify, <direct> directly: <test> (<file>), ... and <rest>
more. Add each test the task will change to its scope with tests.modify:
true`, leaving out `and <rest> more` when nothing is left.

#### Scenario: Short list
- **WHEN** one test imports a scoped file directly
- **THEN** the warning says `1 preexisting tests` and `1 directly` and has no `more`

### Requirement: Undeclared capability read warning
Lint SHALL warn once per capability whose Code ownership globs cover a file a
scoped file imports directly, when no owner of that file is in
`features.reads` or has a delta, and the file is in no task's scope. The
warning SHALL be on `proposal.md`, name the capability and the importing files,
and say to add it to `features.reads`.

#### Scenario: Undeclared read
- **WHEN** scoped `src/a.ts` imports `src/other/x.ts`, owned by `other`, which the proposal neither reads nor writes
- **THEN** lint warns naming `other` and `src/a.ts`, and listing `other` in `features.reads` clears it

### Requirement: Capability write without delta warning
Lint SHALL warn once per resolved scope path whose owning capabilities, by Code
ownership globs, include none with a delta in the change. The warning SHALL be
on the task file and read `<path> is owned by <capabilities>, which has no
delta in this change. Add a delta or move the file out of scope`. It SHALL need
no import graph.

#### Scenario: Write without delta
- **WHEN** a task scopes `src/other/x.ts`, owned only by `other`, and the change has no `specs/other/spec.md`
- **THEN** lint warns on that task's file naming `src/other/x.ts` and `other`

### Requirement: Verify without scope test warning
When every path a task's verify names under `tests/` exists and none imports,
at any depth, an existing JavaScript or TypeScript file in the task's scope,
lint SHALL warn on the task file: `Task <n> verify runs <tests> but none of
them imports a file in the task's scope`. A verify naming no such test SHALL not
warn.

#### Scenario: Verify tests something else
- **WHEN** task 1 scopes `src/a.ts` and its verify names only `tests/b.test.ts`, which imports nothing that reaches `src/a.ts`
- **THEN** lint warns naming `tests/b.test.ts`

### Requirement: Import graph built once per lint run
`lintCommand` SHALL build the import graph once and pass it to every
`lintChangeFolder` call through `LintOptions`; `lintChangeFolder` SHALL build
its own when none is passed. Every import-graph finding SHALL be a warning that
never affects validity. In a repository without JavaScript or TypeScript, only
the write warning can appear.

#### Scenario: Python-only repository
- **WHEN** a change in a Python-only repository is linted
- **THEN** it gets no frozen-test, read, or verify warning and no error

### Requirement: Decisions section lint
In a project whose decisions folder holds at least one ADR with osq
frontmatter, `osq lint` and `osq approve` SHALL reject a `proposal.md` whose
`## Decisions` section is missing or holds nothing but HTML comments and
whitespace, and SHALL reject one whose section doesn't name, as `ADR <n>`,
each accepted ADR whose `applies_to` lists a capability the change writes
through a delta. The error SHALL name the ADR and the capability. A line
beginning `Departs from ADR <n>:` names that ADR. Lint SHALL warn when the
section names an ADR number that doesn't exist or isn't accepted. A system-wide
ADR need not be named, and `None` SHALL pass when no capability-scoped ADR
governs the change. A legacy `spec.md` change document and a project without
an ADR carrying osq frontmatter SHALL be exempt.

#### Scenario: Governing ADR not named
- **WHEN** accepted ADR 009 applies to `ingress`, a change has a delta for `ingress`, and its Decisions section says `None`
- **THEN** lint fails naming ADR 009 and `ingress`

#### Scenario: Governing ADR named
- **WHEN** the same section says `ADR 009: the adapter is the only module that imports dockerode.`
- **THEN** lint reports no decisions error

#### Scenario: Missing section
- **WHEN** a project has an ADR with osq frontmatter and a proposal has no `## Decisions` section
- **THEN** lint fails with an error saying to add the section or write `None`

#### Scenario: Project without ADRs
- **WHEN** a project's decisions folder is missing or holds no ADR with osq frontmatter
- **THEN** a proposal without `## Decisions` gets no decisions finding

#### Scenario: Unknown ADR named
- **WHEN** the section names `ADR 042` and no ADR 042 exists
- **THEN** lint warns and the change stays valid

### Requirement: Project rules lint
In a project with an ADR carrying osq frontmatter, lint SHALL fail every
linted proposal while the AGENTS.md rules block doesn't match the accepted
system-wide ADRs, with an error saying to run `osq init`, and while there are
more accepted system-wide ADRs than `limits.maxProjectRules`, with an error
naming the limit.

#### Scenario: Stale block
- **WHEN** an accepted system-wide ADR is added and `osq init` has not run
- **THEN** `osq lint` fails the change with an error naming `osq init`, and passes after `osq init`

#### Scenario: Too many rules
- **WHEN** `limits.maxProjectRules` is 2 and three accepted ADRs apply to all
- **THEN** lint fails with an error naming the limit 2

### Requirement: Approval digest decisions
The approval digest SHALL carry `decisions`, each accepted ADR that governs the
change, in number order, with its number and rule. When the list isn't empty,
the formatted digest SHALL print `Decisions:` after the capabilities and one
line per ADR as `  ADR <number>: <rule>`. With no governing ADR the formatted
digest SHALL be unchanged.

#### Scenario: Governing decisions listed
- **WHEN** accepted ADR 007 applies to all and accepted ADR 009 applies to a capability the change writes
- **THEN** the digest prints `Decisions:`, then `  ADR 007: <rule>` and `  ADR 009: <rule>`

### Requirement: ADR departure flag
The digest SHALL raise one `adr_departure` flag for each line of the proposal's
`## Decisions` section that begins, after an optional `- ` list marker,
`Departs from ADR <n>:`. The flag's label SHALL be `departs from ADR <n>` and
its excerpt the line without the list marker. `adr_departure` flags SHALL come
after every other flag and be recorded in the manifest's `approvalFlags` like
the other flags.

#### Scenario: One departure
- **WHEN** the Decisions section holds `- Departs from ADR 007: the importer needs Vue for the legacy widget.`
- **THEN** exactly one `adr_departure` flag fires, labelled `departs from ADR 007`

### Requirement: ADR check modification flag
The digest SHALL raise one `adr_check_modified` flag for each task with
`tests.modify: true`, each accepted ADR, and each of that ADR's check files
that the task's resolved scope paths include. The label SHALL be
`task <n> may modify a check of ADR <number>` and the excerpt
`<file> enforces ADR <number>: <rule> Record it as Departs from ADR <number>: in ## Decisions.`
These flags SHALL come after the `adr_departure` flags, in task-number, ADR
number, and file order, and SHALL be recorded in the manifest's
`approvalFlags` like the other flags. A task without `tests.modify: true`
SHALL raise none.

#### Scenario: Authorized check edit
- **WHEN** accepted ADR 009 checks `tests/adapter-imports.test.ts` and task 2 declares `tests.modify: true` with that file in scope
- **THEN** one `adr_check_modified` flag labelled `task 2 may modify a check of ADR 009` names the file

#### Scenario: Frozen check stays frozen
- **WHEN** the same task lacks `tests.modify: true`
- **THEN** no `adr_check_modified` flag fires, and an edit to the file kills the task with `undeclared_test_change`

### Requirement: Scenario outcomes
`parseScenario` SHALL give every scenario `outcomes`, in order. Each outcome is
the text after a `- **THEN**` line, or after a `- **AND**` line that follows a
THEN with no WHEN between them. An AND line before any THEN belongs to the WHEN
and is not an outcome. A Markdown table directly under an outcome line, with
only blank lines between, SHALL become that outcome's `rows`. The table may be
indented. Its first row names the columns, and a row of dashes and colons is
skipped. Each later row becomes one object keyed by the trimmed header cells,
with trimmed string values, and a missing cell reads as the empty string. An
outcome without a table has no `rows`. `then` keeps only the THEN lines, as
before.

#### Scenario: AND lines and a table
- **WHEN** a scenario has `- **THEN** the unit price follows this table`, a table with columns quantity and unit price and two rows, then `- **AND** the total is not negative`
- **THEN** `outcomes` holds the THEN text with two rows keyed `quantity` and `unit price`, then the AND text without rows

#### Scenario: AND under WHEN
- **WHEN** a scenario has a WHEN, an AND, then a THEN
- **THEN** `outcomes` holds only the THEN text

### Requirement: Scenario tables accepted
`osq lint` SHALL accept a change whose delta puts a table directly under a THEN
or AND line, with no finding about the table. It SHALL also accept one whose
living spec does.

#### Scenario: Sample spec with its table
- **WHEN** a change's delta adds the pricing sample's "Volume pricing" requirement with its table
- **THEN** `osq lint` reports the change valid, and `openspec validate --strict` accepts the merged spec

### Requirement: Planned scenarios
A task file MAY hold a `## Scenarios` section with one bullet per scenario its
tests prove, written `- <capability>: <scenario name>`. Lint SHALL treat a
listed scenario as planned when the task's resolved scope holds at least one
test path, existing or not. A test path is one that `isTestPath` accepts, as
the traceability capability's "Test paths" says: under `tests/`, or with
`.test.` or `.spec.` in its file name. A planned scenario that no scenario
test file in any task's resolved scope names yet SHALL count as tested. It
SHALL also count as covering every function tagged with it in that task's
resolved scope. Once a scoped test names the scenario, only real
`scenario(...)` calls count.

#### Scenario: Planned before the test exists
- **WHEN** an opted-in change adds a scenario, and task 2 lists it under `## Scenarios` and scopes the not-yet-written `tests/pricing-bulk.test.ts`
- **THEN** lint reports no untested-scenario finding for it

### Requirement: Traceability links
For every capability `traceability.capabilities` opts in, lint SHALL read
scenarios from the effective spec: the living spec with this change's delta
applied through "Effective scenario lookup". It SHALL read tags and scenario
calls from the scenario index. `'all'` opts in every capability with a living
spec or a delta in the change. Each finding SHALL be a warning under
`mode: 'warn'` and an error under `mode: 'require'`, with these messages:

- `<capability>: no test names scenario "<name>"`, on the delta, for each
  scenario an ADDED requirement holds, or a MODIFIED requirement holds with a
  block that differs from the living spec's. It is raised unless a scenario
  test file in some task's resolved scope names the scenario, or the scenario
  is planned.
- `<fn>: names a scenario the <capability> spec doesn't have: "<name>"`, on the
  source file, for a `@scenario` tag in a resolved scope file.
- `<fn>: no test for "<name>" covers it`, on the source file, for a
  `@scenario` tag in a resolved scope file naming an existing scenario that no
  scenario test covering the function names, unless the scenario is planned.
- `<fn>: ADR <n> doesn't exist or isn't accepted` and
  `<fn>: ADR <n> doesn't apply to any capability it serves`, on the source
  file, for an `@adr` tag in a resolved scope file. The capabilities a function
  serves are those of its `@scenario` tags. Without any, they are the
  capabilities whose Code ownership covers its file. An ADR applies when it is
  accepted and its `applies_to` is `all` or names one of them. ADR numbers
  match as `sameAdrNumber` matches them.
- `<capability>: two scenarios named "<name>"`, on the delta, for an opted-in
  capability the change has a delta for.

A tag counts when it names an opted-in capability. An `@adr` tag counts when a
capability the function serves is opted in. Lint SHALL compute all of these in
one module call from `lintChangeFolder`, with the import graph it already has.
With no capability opted in, lint SHALL produce none of them.

#### Scenario: Tag covered by a helper test
- **WHEN** pricing is opted in and the sample's table test covers a new `tierPrice` helper instead of `quote`
- **THEN** lint reports `quote: no test for "Volume discount tiers" covers it` on `src/pricing/quote.ts`

#### Scenario: Not opted in
- **WHEN** the same project leaves pricing out of `traceability.capabilities`
- **THEN** lint reports none of these findings

#### Scenario: Require mode
- **WHEN** `traceability.mode` is `require` and an added pricing scenario is neither named by a scoped test nor planned
- **THEN** lint reports `pricing: no test names scenario "<name>"` as an error and the change is invalid

### Requirement: Unreadable traceability forms
When at least one capability is opted in, lint SHALL report every unreadable
tag and scenario call the index holds in a resolved scope file, as
`<file>:<line>: <reason>`, with the same severity as "Traceability links". An
unreadable call whose capability is a literal that isn't opted in SHALL be
skipped. Nothing tag-like in a scoped file is skipped silently.

#### Scenario: Non-literal scenario name
- **WHEN** pricing is opted in and a scoped test calls `scenario('pricing', NAME, { covers: quote }, ...)`
- **THEN** lint reports a finding naming the file, the line, and that the name isn't a literal

### Requirement: Scenario blast radius
For every capability, opted in or not, lint SHALL find each scenario the change
alters: one in a MODIFIED requirement whose block differs from the living
spec's, or one in a REMOVED requirement. For each such scenario that a scenario
test file anywhere in the repository names, lint SHALL warn
`Scenario "<name>" in <capability> changes; tests naming it: <file>, <file>`.
For each of those tests that no task holds in its resolved scope with
`tests.modify: true`, it SHALL report
`<file> names changed scenario "<name>" but no task scopes it with tests.modify: true`.
That is a warning, except an error under `mode: 'require'` for an opted-in
capability. With no scenario test file in the repository, lint SHALL produce
neither.

#### Scenario: Modified scenario with a frozen test
- **WHEN** a delta changes a THEN of "A percentage code comes off the tiered subtotal" and `tests/pricing-quote.test.ts` names it, but no task scopes that test
- **THEN** lint lists `tests/pricing-quote.test.ts` for the scenario and warns that no task scopes it with `tests.modify: true`

#### Scenario: Test scoped for modification
- **WHEN** task 1 scopes `tests/pricing-quote.test.ts` with `tests.modify: true`
- **THEN** lint lists the test and raises no `tests.modify` finding for it

### Requirement: Approval into a worktree
With `vcs.enabled` and `GitVcs` selected, `osq approve` SHALL lint, review,
and hash the change folder in the checkout, committed or not. It SHALL then
create branch `osq/<folder>` at HEAD's commit and add its worktree at the path
"Worktree location" gives. When `vcs.prepare` is set, it SHALL run that
command once in the worktree, bounded by `timeouts.verifyTimeoutSeconds`. It
SHALL copy the checkout's folder into the worktree, and in the worktree's copy
append observed planning records, write `.run/approved` with the checkout
copy's hash, `.run/base` with the commit the branch was cut from, and
`.run/approver` with `<user.name> <<user.email>>` from git config, and write
the manifest. It SHALL commit that folder in the worktree as the branch's
first commit, with subject `osq: <id> approved` and author `vcs.author`, and
print `  Worktree: <path>` and `  Branch: osq/<folder>`. After that commit it
SHALL remove the checkout's folder as "Checkout copy removed at approval"
says, and SHALL write nothing else to the checkout. A failing prepare SHALL
stop the approval with the command's output and the worktree and branch
names, and SHALL remove neither, nor the checkout's folder. With
`vcs.enabled` off or `NoVcs` selected, approval SHALL write in place as
before.

#### Scenario: Approve a draft
- **WHEN** a lint-clean uncommitted draft is approved with `vcs.enabled` on `main` of a temporary repository
- **THEN** branch `osq/<folder>` has one commit over HEAD, subject `osq: <id> approved`, author `vcs.author`, holding the folder with `.run/approved`, `.run/base`, and `.run/approver`, the checkout no longer holds `openspec/changes/<folder>`, and `git status` of the checkout lists nothing else that differs from before

#### Scenario: Prepare runs in the worktree
- **WHEN** `vcs.prepare` writes a file named `prepared` into its working directory
- **THEN** that file exists in the worktree, not in the checkout

#### Scenario: Prepare fails
- **WHEN** `vcs.prepare` exits 1 after printing `boom`
- **THEN** approve fails with a message containing `boom`, the branch and worktree remain, and the checkout still holds the folder

### Requirement: Approval refusals under version control
With `vcs.enabled` and `GitVcs` selected, approve SHALL refuse, after lint and
before the digest, writing nothing, when:

- HEAD is not on the default branch and `--base-ok` is not passed, with
  `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where a detached HEAD reads `a detached HEAD`;
- uncommitted changes in the checkout, by path or rename source, are covered
  by any task's `scope` and `--ignore-dirty` is not passed, with
  `uncommitted changes in task scope: <paths>; commit them or pass --ignore-dirty`,
  paths sorted and comma-separated;
- branch `osq/<folder>` already exists and "Rejected branch kept at approval"
  does not rename it, with `branch osq/<folder> already exists`.

A `depends_on` entry that is approved and has not landed is not a refusal;
"Stacked approval" says what approve does instead. A change that runs in a
worktree and needs steering is not a refusal either; "Approval after steering"
says what approve does instead, and none of these refusals applies to it.

#### Scenario: Off the default branch
- **WHEN** approve runs from branch `topic` with `vcs.enabled`
- **THEN** it fails with the default-branch message naming `topic` and `main`, and with `--base-ok` it succeeds

#### Scenario: Dirty scope
- **WHEN** a file matching a task's `scope` has uncommitted edits
- **THEN** approve fails naming that file, and with `--ignore-dirty` it succeeds

#### Scenario: Branch exists
- **WHEN** `osq/<folder>` already exists
- **THEN** approve fails with `branch osq/<folder> already exists` and creates no worktree

#### Scenario: Unlanded dependency
- **WHEN** the change depends on another change that is approved and still active
- **THEN** approve does not fail, creates no branch, and records a stacked approval naming the dependency's folder

#### Scenario: Running change that needs no steering
- **WHEN** a change runs in a worktree with a pending task and no trigger, and a human runs `osq approve <id>`
- **THEN** approve fails with `branch osq/<folder> already exists` and the worktree's HEAD is unchanged

### Requirement: Stack dependency state
With `vcs.enabled` and `GitVcs` selected, the state of a dependency folder
`<dep>` SHALL be read from git and files, never from a worktree, where
`<changes>` and `<archive>` are the project root tree's changes and archive
directories relative to the project root:

- `landed` when `pathExists(<default branch>, <archive>/<dep>)`;
- otherwise, when branch `osq/<dep>` exists: `archived` with the hash in
  `<archive>/<dep>/.run/approved` at `osq/<dep>` and the base `osq/<dep>`
  when that file exists there, else `approved` with the hash in
  `<changes>/<dep>/.run/approved` at `osq/<dep>` when that file exists
  there, else `unapproved`;
- otherwise `approved` with the hash in `<dep>`'s stacked approval's
  `.run/approved` when it exists;
- otherwise `approved` with the hash in the checkout's
  `<changes>/<dep>/.run/approved` or `<archive>/<dep>/.run/approved` when
  either exists;
- otherwise `unapproved`.

Hashes SHALL be trimmed. A `depends_on` entry SHALL resolve to a folder name
by matching the change folders `listChanges` returns in every location, as
`findChange` matches an active one, and an entry that matches no folder SHALL
be left out.

#### Scenario: Dependency running in a worktree
- **WHEN** `001-a` was approved into a worktree and has not archived
- **THEN** its state is `approved` with the hash in its worktree's `.run/approved`

#### Scenario: Dependency archived on its branch
- **WHEN** `osq/001-a`'s tip holds `<archive>/001-a/.run/approved` and the default branch has no `<archive>/001-a`
- **THEN** its state is `archived` with that hash and the base `osq/001-a`

#### Scenario: Dependency landed
- **WHEN** the default branch holds `<archive>/001-a`
- **THEN** its state is `landed`, whatever `osq/001-a` holds

#### Scenario: Dependency rejected on its branch
- **WHEN** `osq/001-a`'s tip holds `001-a` only under the rejected directory
- **THEN** its state is `unapproved`

#### Scenario: Dependency is a draft
- **WHEN** `001-a` exists only in the checkout without `.run/approved`
- **THEN** its state is `unapproved`

### Requirement: Stacked approval
With `vcs.enabled` and `GitVcs` selected, when "Stack dependency state"
reports any of the change's `depends_on` entries as `approved` or
`archived`, approve SHALL, after lint, the refusals, and the review, record a
stacked approval instead of creating a branch. It SHALL delete any stacked
approval of the folder, copy the checkout's folder to
`<changes>/<folder>` inside the stacked approval directory "Worktree
location" gives, and in that copy append observed planning records, write
`.run/approved` with the checkout copy's hash, the manifest, and
`.run/approver` as "Approval into a worktree" does, and write
`.run/stacked-on` with one `<dependency folder> <approved hash>` line per
such entry, in `depends_on` order. It SHALL create no branch, worktree, or
commit, SHALL then remove the checkout's folder as "Checkout copy removed at
approval" says, SHALL write nothing else to the checkout, and SHALL print
`  Waiting for: <folders>`, comma-separated, and `  Stacked: <path>`. When
no entry is `approved` or `archived`, approve SHALL approve into a worktree
as "Approval into a worktree" says and then delete any stacked approval of
the folder. When the change locations module finds the change in a stacked
tree, approve SHALL first restore it to the checkout as "Stacked draft
restore" says, then lint, review, hash, and approve that draft as above.
When that approval fails, approve SHALL remove the restored draft, so the
stacked approval stays the change's only copy, unchanged.

#### Scenario: Approve a dependent of a running change
- **WHEN** `001-a` was approved into a worktree and the lint-clean draft `002-b` with `depends_on: ["001"]` is approved
- **THEN** approve prints `  Waiting for: 001-a` and `  Stacked: ` with the stacked path, that path holds `002-b` with `.run/approved`, `.run/approver`, and `.run/stacked-on` reading `001-a <001-a's hash>`, no branch `osq/002-b` exists, and the checkout no longer holds `002-b`

#### Scenario: Dependency already landed
- **WHEN** the default branch holds `001-a`'s archive and `002-b` is approved
- **THEN** approve creates `osq/002-b` and its worktree as before and prints no `Waiting for` line

#### Scenario: Approve a stacked change again
- **WHEN** `002-b` is stacked, a task file in its stacked copy is edited, and `002-b` is approved again
- **THEN** the stacked approval's `.run/approved` holds the edited copy's new hash and the edited task file, and the checkout holds no `002-b`

#### Scenario: Approve again after the dependency is rejected
- **WHEN** `002-b` is stacked on `001-a`, `001-a` is rejected on its branch, and `002-b` is approved again
- **THEN** approve creates `osq/002-b` at HEAD with its worktree, the stacked approval directory of `002-b` no longer exists, the worktree's `002-b` has no `.run/stacked-on`, and the checkout holds no `002-b`

### Requirement: Capability creation declaration
A proposal MAY declare `creates` in its frontmatter: a list of the
capabilities the change creates, each a name or a `{ name, group }` mapping
with both values strings. `readCreates(data)` SHALL return the trimmed names
and, per name, the trimmed group or null for a bare name, an empty list when
`creates` is absent, and mark the value malformed when it is not a list of
such entries. `osq lint` SHALL fail a proposal's change with:

- `creates must be a list of capability names` for a malformed value.
- `creates names <name>, which already has a living spec` for a name with
  a living spec.
- `creates names <name>, but no delta under specs/<name>/spec.md adds a requirement`
  for a name whose delta is missing or has no ADDED requirement.

These checks SHALL apply in every project.

#### Scenario: Declared creation
- **WHEN** a proposal lists `creates: [gadgets]` and its `specs/gadgets/spec.md` adds a requirement with a `## Purpose`
- **THEN** lint reports no `creates` finding

#### Scenario: Already exists
- **WHEN** `creates` names `pricing` and `pricing` has a living spec
- **THEN** lint fails with `creates names pricing, which already has a living spec`

#### Scenario: No delta
- **WHEN** `creates` names `gadgets` and the change has no `specs/gadgets/spec.md`
- **THEN** lint fails with `creates names gadgets, but no delta under specs/gadgets/spec.md adds a requirement`

#### Scenario: Malformed
- **WHEN** `creates` is the string `gadgets`
- **THEN** lint fails with `creates must be a list of capability names`

#### Scenario: Validator accepts creates
- **WHEN** lint runs the pinned OpenSpec validator over a change whose proposal carries `creates:`
- **THEN** the validator reports no finding about the proposal's frontmatter

#### Scenario: Grouped entry
- **WHEN** a proposal lists `creates: [{ name: gadgets, group: inventory }]`
- **THEN** `readCreates` returns the name `gadgets` with group `inventory`, and an entry `{ name: gadgets }` without a group is malformed

### Requirement: Capability relations
When the project holds at least one living capability spec, `osq lint`
SHALL fail a proposal's change with:

- `proposal.md relates to no capability; write a delta under specs/<capability>/spec.md or name a capability in features.reads`
  when the change has no delta folder holding a `spec.md` and
  `features.reads` is empty.
- `features.reads names unknown capability <name>; did you mean <nearest>?`
  for each read that names no living capability and is not in `creates`.
- `specs/<name>/spec.md creates capability <name>, which creates does not list; did you mean <nearest>?`
  for each delta folder whose capability has no living spec and is not in
  `creates`.

`nearestCapability(name, living)` in `src/core/spec/digest-capability.ts`
SHALL return the living name with the smallest edit distance to `name`,
the first in name order on a tie, or null when there is none. The findings
SHALL leave out `; did you mean <nearest>?` when it is null. A project with
no living capability spec SHALL get none of these findings.

#### Scenario: No relation
- **WHEN** a project with a living `pricing` spec lints a change with no delta and `reads: []`
- **THEN** lint fails with the no-relation message naming both fixes

#### Scenario: Read only
- **WHEN** the change has no delta and `reads: [pricing]`
- **THEN** lint reports no relation finding

#### Scenario: Unknown read
- **WHEN** `reads` names `pricng`
- **THEN** lint fails with `features.reads names unknown capability pricng; did you mean pricing?`

#### Scenario: Read of a created capability
- **WHEN** `reads` names `gadgets` and `creates` lists `gadgets` with a delta adding a requirement
- **THEN** lint reports no unknown-read finding

#### Scenario: Silent creation
- **WHEN** the change has `specs/pricng/spec.md` with ADDED requirements and no `creates`
- **THEN** lint fails with `specs/pricng/spec.md creates capability pricng, which creates does not list; did you mean pricing?`

#### Scenario: No living specs
- **WHEN** a project with no living capability spec lints a change with no delta, `reads: [anything]`, and a delta for a new capability
- **THEN** lint reports none of these findings

### Requirement: One code ownership reader
`readCapabilityOwnership(projectRoot, openspecRoot)` SHALL be the one
function that reads capabilities' Code ownership globs, and the only code
under `src/` that calls `parseCodeOwnership`. Every reader of ownership,
such as impact lint, traceability lint, and the traceability report, SHALL
call `readCapabilityOwnership`.

#### Scenario: One caller
- **WHEN** every `.ts` file under `src/` is scanned
- **THEN** `parseCodeOwnership(` appears only in `src/core/spec/parser.ts`, where it is defined, and `src/core/spec/capability-impact.ts`

### Requirement: Capability sidecar
A capability MAY carry `osq.yml` beside its living spec, at
`<openspecRoot>/specs/<capability>/osq.yml`, and a change MAY carry a
replacement at `specs/<capability>/osq.yml` in its folder. A sidecar SHALL
be a YAML mapping with `group`, a non-empty string, and optionally `tags`, a
list of non-empty strings, and no other key. A capability's description
SHALL come from its spec's `## Purpose`, never from the sidecar.

`parseSidecar(content)` SHALL return the sidecar or the problems found, each
one of `not a YAML mapping`, `group must be a non-empty string`,
`tags must be a list of non-empty strings`, and `unknown key <key>`.
`formatSidecar(sidecar)` SHALL write `group: <group>` and, when there are
tags, `tags:` with one `  - <tag>` line each.

`osq lint` SHALL fail a change with `specs/<capability>/osq.yml: <problem>`
for each problem in a replacement sidecar it carries, and with
`specs/<capability>/osq.yml replaces the sidecar of <capability>, which has no living spec and is not created by this change`
when the capability neither has a living spec nor is in `creates`. A living
sidecar with a problem SHALL be a repository finding,
`<openspecRoot>/specs/<capability>/osq.yml: <problem>`, which does not
change the lint exit code. A missing sidecar SHALL produce no finding.

#### Scenario: Valid sidecar
- **WHEN** `parseSidecar` reads `group: inventory` and `tags: [costing]`
- **THEN** it returns group `inventory` and tags `costing`

#### Scenario: Unknown key
- **WHEN** a change carries `specs/pricing/osq.yml` holding `group: inventory` and `owner: me`
- **THEN** lint fails with `specs/pricing/osq.yml: unknown key owner`

#### Scenario: Missing group
- **WHEN** a change carries a replacement sidecar holding only `tags: [a]`
- **THEN** lint fails with `group must be a non-empty string` for that file

#### Scenario: Replacement for no capability
- **WHEN** a change carries `specs/ghost/osq.yml` and `ghost` has no living spec and is not in `creates`
- **THEN** lint fails with the no-living-spec message for `ghost`

#### Scenario: Broken living sidecar
- **WHEN** `openspec/specs/pricing/osq.yml` is not a YAML mapping and a change reads `pricing`
- **THEN** lint reports a repository finding for it and the change stays valid

#### Scenario: Missing sidecar is silent
- **WHEN** no capability has a sidecar and `capabilities.requireGroups` is unset
- **THEN** lint reports no sidecar finding

### Requirement: Grouped creation
With `capabilities.requireGroups` true, `osq lint` SHALL fail a proposal's
change with:

- `creates names <name> without a group; write creates: [{ name: <name>, group: <group> }]`
  for a bare name, or an entry whose group is `ungrouped`.
- `<capability> has no group; add specs/<capability>/osq.yml with a group to this change`
  for each capability the change writes a delta for that has a living spec
  whose sidecar is missing or has group `ungrouped`, unless the change
  carries a replacement sidecar for it with another group.

With `capabilities.requireGroups` false or unset, neither SHALL fire.

#### Scenario: Bare name when required
- **WHEN** `requireGroups` is true and `creates: [gadgets]`
- **THEN** lint fails with `creates names gadgets without a group; write creates: [{ name: gadgets, group: <group> }]`

#### Scenario: Grouped name when required
- **WHEN** `requireGroups` is true and `creates: [{ name: gadgets, group: inventory }]`
- **THEN** lint reports no group finding

#### Scenario: Written capability without a group
- **WHEN** `requireGroups` is true, a change writes a delta for `pricing`, and `pricing` has no sidecar
- **THEN** lint fails with `pricing has no group; add specs/pricing/osq.yml with a group to this change`

#### Scenario: Replacement supplies the group
- **WHEN** the same change carries `specs/pricing/osq.yml` with `group: inventory`
- **THEN** lint reports no group finding

#### Scenario: Not required
- **WHEN** `requireGroups` is unset and `creates: [gadgets]`
- **THEN** lint reports no group finding

### Requirement: Sidecar migration
`osq migrate sidecars` SHALL write `group: ungrouped` to
`<openspecRoot>/specs/<capability>/osq.yml` for every living capability
that has no sidecar, never overwrite an existing one, and print
`wrote <n> sidecar(s)` and one `  <capability>` line per sidecar written.
`osq migrate openspec` SHALL be unchanged, and an unknown target SHALL
still fail with `unsupported migrate target`.

#### Scenario: Scaffold
- **WHEN** a project has living `pricing` and `orders` specs and `orders` already has a sidecar
- **THEN** `osq migrate sidecars` writes only `pricing/osq.yml` with `group: ungrouped` and prints `wrote 1 sidecar(s)`

#### Scenario: Run twice
- **WHEN** it runs again
- **THEN** it writes nothing and prints `wrote 0 sidecar(s)`

### Requirement: Source comment warning
`osq lint` SHALL warn, and never fail, once for each ADDED or MODIFIED
requirement in a change's delta, other than `Code ownership`, that holds a
source comment: a line that is an HTML comment whose text starts with
`source:`. The warning SHALL name the capability and the requirement, and say
that only `Code ownership` keeps a source comment. `parseCodeOwnership` SHALL
keep reading the `Code ownership` source comment unchanged.

#### Scenario: Source comment outside Code ownership
- **WHEN** a delta's MODIFIED requirement `Totals` holds a source comment naming `src/totals.ts`
- **THEN** `osq lint` stays valid and emits one warning naming `Totals` and saying only `Code ownership` keeps a source comment

#### Scenario: Code ownership keeps its comment
- **WHEN** a delta's ADDED `Code ownership` requirement holds a source comment
- **THEN** `osq lint` emits no source comment warning

### Requirement: Rejected branch kept at approval
When branch `osq/<folder>` exists, its tip holds
`<changes>/rejected/<folder>/.run/rejected.md`, and no worktree has it
checked out, approve SHALL rename it to `osq/<folder>-rejected-<n>`, with the
lowest free `n` from 1, where the existing-branch refusal runs, then approve
as usual, stacked or not. `osq approve` SHALL print
`  Kept rejected branch: <new name>` after its `Hash:` line. Any other
existing branch SHALL still refuse.

#### Scenario: Rejected branch renamed
- **WHEN** `osq/001-a` exists, its tip commit holds `openspec/changes/rejected/001-a/.run/rejected.md`, and change 001 is approved again
- **THEN** the old tip is on `osq/001-a-rejected-1`, a new `osq/001-a` holds the approval commit, and the result's `keptBranch` is `osq/001-a-rejected-1`

#### Scenario: Rejected branch checked out
- **WHEN** that rejected `osq/001-a` is checked out in a worktree
- **THEN** approve fails with `branch osq/001-a already exists` and renames nothing

#### Scenario: Next free name
- **WHEN** `osq/001-a-rejected-1` already exists beside a rejected `osq/001-a`
- **THEN** approve renames `osq/001-a` to `osq/001-a-rejected-2`

### Requirement: Living requirement lookup
`src/core/spec/requirement-lookup.ts` SHALL read the living specs in the
directory `getSpecsDir` resolves. With no capability it SHALL return the sorted
names of the directories there that hold a `spec.md`; with a capability, that
spec's requirement names in `parseCapabilitySpec` order; with both, that
requirement's `raw` block, from its `### Requirement:` line through its last
scenario. A requirement name SHALL match only an equal name after
`normalizeRequirementName` trims both.

#### Scenario: Capabilities listed
- **WHEN** the lookup runs with no capability in a project whose specs directory holds `beta/spec.md`, `alpha/spec.md`, and an empty `gamma/` directory
- **THEN** it returns `alpha` and `beta`, in that order

#### Scenario: Requirement names listed
- **WHEN** the lookup runs for `alpha`, whose spec holds "Second rule" before "First rule"
- **THEN** it returns `Second rule` and `First rule`, in that order

#### Scenario: One requirement returned verbatim
- **WHEN** the lookup runs for `alpha` and `First rule`
- **THEN** it returns the block exactly as the living spec holds it, including every scenario, and no other requirement's text

### Requirement: Living requirement lookup errors
A capability that the lookup doesn't list SHALL fail with
`No living capability "<capability>". Capabilities: <names>`, naming every
capability comma-separated, and SHALL never read a path built from the unknown
name. A requirement that isn't in the capability's list SHALL fail with
`<capability> has no requirement "<requirement>". osq spec <capability> lists them.`

#### Scenario: Unknown capability
- **WHEN** the lookup runs for `../alpha`
- **THEN** it fails with `No living capability "../alpha". Capabilities: alpha, beta`

#### Scenario: Unknown requirement
- **WHEN** the lookup runs for `alpha` and `first rule`
- **THEN** it fails with `alpha has no requirement "first rule". osq spec alpha lists them.`

### Requirement: Checkout copy removed at approval
With `vcs.enabled` and `GitVcs` selected, once "Approval into a worktree" has
committed the change on its branch, or "Stacked approval" has written the
stacked approval, approve SHALL remove the change's folder from the
checkout's changes directory through `removeCheckoutDraft` in
`src/core/spec/checkout-draft.ts`, unless the checkout's HEAD holds that
folder, as `vcs.pathExists('HEAD', <folder path relative to the repository
root>)` reports.
A folder HEAD holds SHALL stay, because the land commit moves it into the
archive. When approval fails before that point, the checkout's folder SHALL
remain as it was. With `vcs.enabled` off or `NoVcs` selected, approval SHALL
remove nothing.

#### Scenario: Uncommitted draft removed
- **WHEN** an uncommitted draft is approved into a worktree
- **THEN** the checkout no longer holds its folder

#### Scenario: Committed draft stays
- **WHEN** the draft's folder is committed at the checkout's HEAD and the change is approved into a worktree
- **THEN** the checkout still holds the folder, and `git status` of the checkout lists nothing under it

#### Scenario: Failed approval keeps the draft
- **WHEN** approval refuses because HEAD is not on the default branch
- **THEN** the checkout still holds the folder unchanged

#### Scenario: Version control off
- **WHEN** `vcs.enabled` is off and a draft is approved
- **THEN** the folder stays in the checkout and holds `.run/approved`

### Requirement: Stacked draft restore
`restoreStackedDraft` in `src/core/spec/checkout-draft.ts` SHALL take the
project root, the config, and a change the change locations module found in
a stacked tree. It SHALL copy that change's folder to `<changes>/<folder>` in
the checkout's changes directory, replacing any folder there, and SHALL then
delete every entry of the copy's `.run/` except `manifest.json` and
`plan.jsonl`, so the copy reads as an unapproved draft. It SHALL leave the
stacked approval directory unchanged and SHALL return the copy's absolute
path.

#### Scenario: Restore a halted stacked change
- **WHEN** the stacked `002-b` holds `.run/approved`, `.run/approver`, `.run/stacked-on`, `.run/manifest.json`, `.run/plan.jsonl`, and a halt marker
- **THEN** `restoreStackedDraft` writes `openspec/changes/002-b` in the checkout with the same authored files and only `.run/manifest.json` and `.run/plan.jsonl`, and the stacked directory still holds every file it held

### Requirement: Change references across trees
`osq lint` SHALL treat a `depends_on` or `fixes` id as naming a change when
any folder `knownChangeFolders` returns starts with the id, zero-padded to
three digits, followed by `-`, or equals it. So a change running in a
worktree, a stacked change, and a change rejected on its `osq/` branch are
all found, though the checkout holds no copy of them.

#### Scenario: Depends on a running change
- **WHEN** `vcs.enabled` is on, `001-a` runs in its worktree and the checkout holds no `001-a`, and a draft declares `depends_on: ["001"]`
- **THEN** lint reports no `depends_on names missing change` finding

#### Scenario: Fixes a change rejected on its branch
- **WHEN** branch `osq/003-c` exists, no tree holds `003-c`, and a draft declares `fixes: ["3"]`
- **THEN** lint reports no `fixes names missing change` finding

#### Scenario: Still missing
- **WHEN** no tree and no branch holds change 099, and a draft declares `depends_on: ["099"]`
- **THEN** lint fails with `depends_on names missing change: 099`

### Requirement: Approval after steering
`osq approve <id>` SHALL look the change up with `findSteeringChange`, so an
archived change that needs steering is found in its worktree. When the change
is in an osq worktree and its derived state has `steering`, `osq approve`
SHALL approve the revised plan where the change runs, through
`approveSteeredChange` in `src/core/spec/approve-steer.ts`, instead of
"Approval into a worktree". It SHALL refuse, writing nothing, with
`<folder> has a task running; approve it after the task ends` while any task
of the change runs. When any trigger is a default-branch trigger, as
`isDefaultBranchTrigger` says, it SHALL then approve as "Approval after a
default-branch trigger" says. Otherwise it SHALL:

1. Lint and build the digest with the checkout as project root and the
   worktree's change folder, refusing on lint errors as any approval does.
2. Review the digest, append observed planning records to the worktree's
   folder, hash that folder, and write `.run/approved` and the manifest there
   with `writeApprovalSeal`.
3. Commit the change folder in the worktree with subject `osq: <id> approved`
   and author `vcs.author`, as the first approval did.
4. Retire each trigger, in the order `deriveSteering` returns them, through
   `retrySpec` for its target, so each marker is kept under its next attempt
   number exactly as `osq retry` keeps it.

It SHALL write nothing to the checkout and create no branch or worktree. Done
markers SHALL stay. `osq approve` SHALL print the approval lines, including
`  Worktree: <path>` and `  Branch: osq/<folder>`, and then
`  Continues from task <n>`, naming the first task that is not done after the
triggers are retired, when there is one. With `vcs.enabled` off or `NoVcs`
selected, a change that needs steering SHALL be approved in place as before,
and its triggers then retired the same way, with the same line.

#### Scenario: Blocked task approved again in its worktree
- **WHEN** task 1 of a two-task change in a worktree is done, task 2 died with `blocked`, `tasks/2.md` was edited in the worktree, and a human runs `osq approve <id>`
- **THEN** the worktree's HEAD is a new `osq: <id> approved` commit holding the edited `tasks/2.md`, `.run/approved` holds the edited folder's hash, `.run/dead/2.md` is now `.run/dead/2.1.md`, `.run/done/1` remains, the output says `Continues from task 2`, and the checkout holds no copy of the change

#### Scenario: The run continues
- **WHEN** that change is approved again and watcher cycles run
- **THEN** task 1 does not run again, task 2 runs and is verified, and the change archives in its worktree

#### Scenario: Change regression retired
- **WHEN** a change in a worktree has `.run/regressed/change.md` with `reason: verify_red` and every task done, and it is approved again after a new task 3 was added
- **THEN** the regression is kept as `.run/regressed/change.1.md` and the output says `Continues from task 3`

#### Scenario: Task running
- **WHEN** a change that needs steering has a live running marker for another task
- **THEN** approve fails with `has a task running` and writes nothing

#### Scenario: Version control off
- **WHEN** `vcs.enabled` is off and a change whose task 1 is stuck is approved again
- **THEN** the seal is rewritten in place and `.run/dead/1.md` is now `.run/dead/1.1.md`

### Requirement: Lint finds a change in any tree
`osq lint <id>` SHALL resolve each explicit id through `findSteeringChange`
first, so a change that runs in a worktree, waits in a stacked approval, or
archived in a worktree and needs steering is linted where it is, and SHALL
fall back to the checkout's changes directory as before when it finds none. It SHALL lint every folder with the directory it runs
in as project root, because the pinned OpenSpec validator is that
directory's. `osq lint` without ids SHALL lint the checkout's change folders as
before.

#### Scenario: Lint a change in its worktree
- **WHEN** a change has been approved into a worktree, removed from the checkout, and its task file in the worktree has a finding
- **THEN** `osq lint <id>` in the checkout reports that finding for the worktree's folder and exits 1

#### Scenario: Lint an archived change that needs steering
- **WHEN** an archived change's land recorded a `sync_conflict` stop, and its task file in the worktree's archive folder has a finding
- **THEN** `osq lint <id>` in the checkout reports that finding for that folder and exits 1

### Requirement: Approval after a default-branch trigger
`approveSteeredChange` SHALL approve a change whose triggers include a
default-branch trigger through `approveDefaultBranchSteering` in
`src/core/spec/approve-default-branch.ts`. After the running-task refusal, it
SHALL lint and review the digest with the checkout as project root and the
change folder where it is, refusing on lint errors as any approval does, so
the revised plan is judged against the checkout's living specs. It SHALL then
commit the change folder as it stands in the worktree, the planner's edits and
every marker included, with the message `osq: <id> replanned`, authored by
`vcs.author`, so the branch keeps the plan it is leaving. Then:

- **Restart**, when any trigger is `conflict`: it SHALL copy the change folder
  aside, remove the worktree, and rename `osq/<folder>` to the lowest free
  `osq/<folder>-restarted-<n>`, counting from 1. It SHALL create
  `osq/<folder>` at the default branch's tip, add the worktree at the same
  path, and run `vcs.prepare` there. It SHALL place the revised folder in the
  worktree's changes directory, with `.run/` holding only the old folder's
  `events/` and `plan.jsonl`, append observed planning records, write
  `.run/approved` and the manifest with `writeApprovalSeal`, write
  `.run/base` and `.run/approver` as "Approval into a worktree" writes them,
  and commit the folder with `osq: <id> approved`. Every task then runs again.
- **Merge**, otherwise: for an archived change it SHALL move the folder from
  the worktree's archive directory to its changes directory. It SHALL put the
  default branch's copy of every living spec in place in the worktree, as
  step 3 of "Default branch sync" does for an active change, write
  `.run/requirements-base` with the default branch's tip, append observed
  planning records, write the seal with `writeApprovalSeal`, and commit the
  folder and the living specs with `osq: <id> approved`. It SHALL then run
  `syncWithDefaultBranch` for the change with `skipVerify`. When that sync
  stops with `sync_conflict`, it SHALL restart as above instead. On any other
  stop it SHALL fail with the stop's message, and the change keeps its
  triggers until it is approved again. After the merge, it SHALL refresh with
  `refreshRecertifiedDoneMarker` every done task's marker whose scope hash
  differs on the merged tree, so the next scope audit does not count osq's own
  merge as a regression; the archive's re-run of every task verify still
  judges those tasks. It SHALL then retire each trigger through `retrySpec` as
  "Approval after steering" does. Done tasks stay done.

`osq approve` SHALL print the approval lines with `  Worktree: <path>` and
`  Branch: osq/<folder>`, then `  Restarted from <default branch>; kept the
old branch as osq/<folder>-restarted-<n>` after a restart or `  Merged
<default branch> into osq/<folder>` after a merge, then `  Continues from task
<n>`. It SHALL write nothing to the checkout and never write the default
branch.

#### Scenario: Conflict restarts the change
- **WHEN** an archived change's land recorded a `sync_conflict` stop on `src/one.txt`, a planner edited `tasks/1.md` in the worktree's archive folder, and a human runs `osq approve <id>`
- **THEN** `osq/<folder>-restarted-1` ends with `osq: <id> replanned`, `osq/<folder>` is the default branch's tip plus one `osq: <id> approved` commit holding the edited `tasks/1.md` in the changes directory with no done marker, `.run/base` holds the default branch's tip, and the output says `Continues from task 1`

#### Scenario: Restarted change lands
- **WHEN** that change is approved again and watcher cycles run until it archives, and a human runs `osq land <id>`
- **THEN** every task ran again, and the land succeeds

#### Scenario: Red verify reopens the change
- **WHEN** an archived two-task change's land recorded a `sync_verify_red` stop, a planner added task 3 in the worktree's archive folder, and a human runs `osq approve <id>`
- **THEN** the folder is in the worktree's changes directory, the branch holds `osq: <id> approved` and then `osq: <id> sync main`, `.run/done/1` and `.run/done/2` remain, the regression is kept as `.run/regressed/change.1.md`, and the output says `Merged main into osq/<folder>` and `Continues from task 3`

#### Scenario: Reopened change runs and archives
- **WHEN** that change is approved again and watcher cycles run
- **THEN** tasks 1 and 2 do not spawn, task 3 spawns and is verified, and the change archives in its worktree

#### Scenario: Changed requirement judged against the default branch
- **WHEN** an active change halted with `requirement_changed` on `orders: Order totals`, a planner rewrote that requirement's delta against the default branch's text, and a human runs `osq approve <id>`
- **THEN** `.run/requirements-base` holds the default branch's tip, the branch holds `osq: <id> sync main`, and a later sync does not stop on `Order totals`

#### Scenario: Merge that conflicts restarts
- **WHEN** a change halted with `requirement_changed`, and the default branch also changed a line the change changed
- **THEN** approval restarts the change and the output names `osq/<folder>-restarted-1`

### Requirement: Parsed proposals are shared and frozen
Parsing a change folder's `proposal.md`, or its `spec.md` fallback, SHALL
return a frozen result whose lists are frozen too, so no caller can change it.
Inside one `osq report` run, every caller SHALL get the same parsed proposal
from one read. A proposal that cannot be read SHALL fail with the file-system
error, inside a report run and outside one.

#### Scenario: A caller changes a parsed proposal
- **WHEN** code assigns to a parsed proposal or pushes to one of its lists
- **THEN** the assignment throws

#### Scenario: Proposal is a directory
- **WHEN** a change folder's `proposal.md` is a directory and `osq status` runs
- **THEN** it exits 1 and prints one line starting `Status error: EISDIR`

### Requirement: Requirement pins skip removed requirements
`tests/living-specs-pins.test.ts` SHALL hold the pinned requirement names per
living capability and SHALL fail with `<capability> is missing preserved
requirement "<name>"` for each pinned name missing from that capability's
living spec, unless a delta in that capability lists the name under
`## REMOVED Requirements` or as the `FROM` of a `## RENAMED Requirements`
pair. The deltas it reads SHALL be those of every folder under
`openspec/changes/archive/` and of every active change folder holding the
record at `archiveSpecsRecordPath`, parsed with `parseDelta`.

#### Scenario: Pinned requirement removed by a delta
- **WHEN** an archived change's `cli-foundation` delta removes a pinned `cli-foundation` requirement and the living spec no longer has it
- **THEN** the pin check passes

#### Scenario: Pinned requirement renamed by a change being archived
- **WHEN** an active change holding the archive record renames a pinned requirement away and the living spec has only the new name
- **THEN** the pin check passes

#### Scenario: Removed in another capability
- **WHEN** a delta removes a requirement of the same name from a different capability
- **THEN** the pin check still fails for the capability whose living spec lost it

#### Scenario: Pinned requirement lost by accident
- **WHEN** a pinned requirement is missing from its living spec and no delta removed or renamed it
- **THEN** the pin check fails naming the capability and the requirement
