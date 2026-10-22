## REMOVED Requirements

### Requirement: Lint feature

## ADDED Requirements

### Requirement: Lint command
`osq-feature-lint` SHALL expose one public item, `LintFeature`, a unit
struct that implements core's `Feature` and derives `Clone`, `Copy`,
`Debug` and `Default`. Its `name()` is `lint`, and its `commands()` is one
command with the name `lint`, the summary `validate a change's delta specs
and the Rust link gates` and the usage `<id>`. The crate depends on
`osq-core`, `osq-kernel-specs`, `osq-kernel-linter` and
`osq-kernel-storage`, and on no feature crate.

#### Scenario: Lint feature commands
- **WHEN** a test reads `LintFeature`'s name and commands
- **THEN** the name is `lint`, and the commands are exactly one, with the name `lint`, the summary `validate a change's delta specs and the Rust link gates` and the usage `<id>`

### Requirement: Lint arguments
`LintFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `lint`, and
`FeatureError::usage("lint", "expected one change id, got <n>")` for a
`lint` invocation with `n` arguments when `n` is not 1, before it reads
any file. Every other failure of `lint` SHALL be `FeatureError::failed`
with the command `lint` and the message the other lint requirements name.

#### Scenario: Lint argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `lint` with no args | `Usage` error displayed `usage of lint: expected one change id, got 0` |
| `lint` with args `1`, `2` | `Usage` error displayed `usage of lint: expected one change id, got 2` |
| `approve` with args `1` | `UnknownCommand` error displayed `unknown command: approve` |

### Requirement: Lint lookup
`lint` SHALL find its change among the active entries rust-storage's
`list_changes` gives for the root, in that order, as TypeScript's
`findSpecFolder` matches a folder name: the query is trimmed, and a folder
matches when its name equals the trimmed query or starts with it followed
by `-`, or does so for the query's leading digits, when it has any, written
as a number with at least three digits. The first match is the change.
With no match, `lint` fails with `Spec "<query>" not found in <changes>`,
`<changes>` being the root joined with `openspec/changes` and written by
`Path::display`, and reads no spec.

#### Scenario: Lint finds no change
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "<query>" not found in <changes>`, where `<query>` is the row's query as given:

| Query |
|---|
| `9` |
| `0` |
| `clean` |
| `x1` |

### Requirement: Lint findings
`lint` SHALL check the change it found, at `<root>/openspec/changes/<folder>`,
in this order:

1. rust-specs `validate_change` with the change folder and the root joined
   with `openspec/specs`, and, only when that gives no finding,
   `validate_merged_change` with the same folders;
2. rust-linter `change_link_gates` with the root, `decisions`,
   `openspec`, the group `rust` and the change `openspec/changes/<folder>`.

Every finding blocks. Each one is written as one line, in the order the
checks give them: `<folder>: <file>:<line>: <message>` for a `SpecFinding`,
`<folder>: <file>: <refusal>` for a `MergeChangeError::Merge`, the
`MergeError`'s display being the refusal, and `<folder>: ` followed by
the `Finding`'s display for a link gate finding. A file the specs kernel
names under the root is written relative to the root.

With no finding, `lint` SHALL return the output `<folder>: valid` and a
newline. With findings, it SHALL fail with a message whose first line is
`<folder>: 1 finding`, or `<folder>: <n> findings` for any other count,
followed by a newline and each finding's line, joined by newlines. `lint`
writes no file.

#### Scenario: Lint fixture changes
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`, a copy of `openspec/changes/275-rust-lint-command/fixture/lint-project/`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes, and the fixture's files are unchanged:

| Query | Result |
|---|---|
| `1` | output `001-clean: valid\n` |
| `002` | message ``002-bad-delta: 2 findings\n002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:12: the delta names `Ghost`, which the living spec has no requirement for\n002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:21: the delta names `Phantom`, which the living spec has no requirement for`` |
| `003-dangling-tag` | message `003-dangling-tag: 1 finding\n003-dangling-tag: crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist` |
| `4` | message `004-merge-conflict: 1 finding\n004-merge-conflict: openspec/changes/004-merge-conflict/specs/delta/spec.md: delta ADDED failed for header "### Requirement: Adds numbers" - already exists` |
| `005-no-delta` | message `005-no-delta: 2 findings\n005-no-delta: openspec/changes/005-no-delta/proposal.md:1: the change holds no delta spec\n005-no-delta: crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist` |

### Requirement: Lint errors
When a check cannot run, `lint` SHALL fail with the display of the error
the check gives and no finding line: a `SpecsError` from
`validate_change`, a `MergeChangeError::Read` from
`validate_merged_change`, or a `GraphError` from `change_link_gates`.

#### Scenario: Lint check errors
- **WHEN** `lint` runs with the query `1` on a scratch root whose one active change folder `001-a` holds `proposal.md` and the row's files
- **THEN** it gives a `Failed` error for the command `lint` whose message starts with the row's text, `<root>` being the scratch root written by `Path::display`:

| Files | Message starts with |
|---|---|
| `specs/alpha/spec.md` holding the bytes `0xff 0xfe` | `<root>/openspec/changes/001-a/specs/alpha/spec.md: ` |
| `specs/alpha/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha runs\nThe system SHALL run alpha.\n\n#### Scenario: Alpha runs\n- **WHEN** alpha starts\n- **THEN** alpha runs\n`, with the root's `Cargo.toml` holding `[package]\nname = "one"\n` | `<root>/Cargo.toml: ` |
