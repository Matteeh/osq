## MODIFIED Requirements

### Requirement: Lint command
`osq-feature-lint` SHALL expose one public item, `LintFeature`, a unit
struct that implements core's `Feature` and derives `Clone`, `Copy`,
`Debug` and `Default`. Its `name()` is `lint`, and its `commands()` is one
command with the name `lint`, the summary `validate a change's delta specs
and the Rust link gates` and the usage `[--json] [--repository] [ids...]`.
The crate depends on `osq-core`, `osq-kernel-config`, `osq-kernel-specs`,
`osq-kernel-linter`, `osq-kernel-storage`, `osq-kernel-loop`,
`osq-kernel-vcs`, `serde_json` and `yaml-rust2`, and on no feature crate.

#### Scenario: Lint feature commands
- **WHEN** a test reads `LintFeature`'s name and commands
- **THEN** the name is `lint`, and the commands are exactly one, with the name `lint`, the summary `validate a change's delta specs and the Rust link gates` and the usage `[--json] [--repository] [ids...]`

### Requirement: Lint arguments
`LintFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `lint`. For `lint`, the arguments
`--json` and `--repository` are flags in any position, set however often
they are given, and every other argument is a change id, in the order
given. An argument that starts with `--` and is neither flag SHALL give
`FeatureError::usage("lint", "unknown flag <argument>")` before `lint`
reads any file. With no id, `lint` checks every active change rust-storage's
`list_changes` gives for the root, in that order; with no active change it
checks none and returns empty text, or the JSON document "Lint JSON" names.
Every other failure of `lint` SHALL be `FeatureError::failed` with the
command `lint` and the message the other lint requirements name.

#### Scenario: Lint argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `lint` with args `--yaml` | `Usage` error displayed `usage of lint: unknown flag --yaml` |
| `lint` with args `1`, `--json`, `--fix` | `Usage` error displayed `usage of lint: unknown flag --fix` |
| `approve` with args `1` | `UnknownCommand` error displayed `unknown command: approve` |

#### Scenario: Lint with no change
- **WHEN** `lint` runs with the row's args on a new scratch root that holds no `openspec/` folder
- **THEN** it returns an output with empty text and the code 0:

| Args |
|---|
| none |
| `--repository` |

### Requirement: Lint lookup
`lint` SHALL find the change of each id it is given, in order, among the
active entries rust-storage's `list_changes` gives for the root, in that
order, as TypeScript's `findSpecFolder` matches a folder name: the query is
trimmed, and a folder matches when its name equals the trimmed query or
starts with it followed by `-`, or does so for the query's leading digits,
when it has any, written as a number with at least three digits. The first
match is the change. The first id with no match fails `lint` with
`Spec "<query>" not found in <changes>`, `<changes>` being the root joined
with `openspec/changes` and written by `Path::display`, and `lint` then
checks no change and reads no spec.

#### Scenario: Lint finds no change
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "<query>" not found in <changes>`, where `<query>` is the row's query as given:

| Query |
|---|
| `9` |
| `0` |
| `clean` |
| `x1` |

#### Scenario: Lint stops at a missing id
- **WHEN** `lint` runs with the args `1`, `9` on the lint fixture project
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "9" not found in <changes>` and no other text

### Requirement: Lint findings
After the lookups, `lint` SHALL load the config with rust-config
`load_config(root)`, then check each change it found, in order, at
`<root>/openspec/changes/<folder>`, in this order:

1. the proposal rules "Lint proposal rules" names;
2. the task rules "Lint task rules" names, with the entry rule "Lint entry
   paths" names in the place that requirement gives it;
3. the banned word rule "Lint banned words" names;
4. rust-specs `validate_change` with the change folder and the root joined
   with `openspec/specs`, and, only when that gives no finding,
   `validate_merged_change` with the same folders;
5. rust-linter `change_link_gates` with the root, `decisions`,
   `openspec`, the group `rust` and the change `openspec/changes/<folder>`.

A finding is an error or a warning. Spec findings, merge refusals and link
gate findings are errors. Each finding is written as one line, in the
order the checks give them: `<folder>: <file>:<line>: <message>` for a
`SpecFinding`, `<folder>: <file>: <refusal>` for a
`MergeChangeError::Merge`, the `MergeError`'s display being the refusal,
`<folder>: ` followed by the `Finding`'s display for a link gate finding,
and, as TypeScript's `formatFinding` writes one, `<folder>: <severity>
<file>: <message>` for a proposal, task, entry or banned word finding,
with ` (<section>)` before the colon when the finding names a section,
the severity being `error` or `warning`. A file the specs kernel names
under the root is written relative to the root.

Each checked change gives a block of lines. A change with no error gives
each warning's line, in order, then `<folder>: valid`. A change with an
error gives `<folder>: 1 finding`, or `<folder>: <n> findings` for any
other count, `<n>` counting every finding, errors and warnings, then each
finding's line. The lines of `lint` are the blocks of every checked
change, in order, then the repository lines "Lint repository findings"
names. When no checked change has an error, `lint` SHALL return the output
made of each line followed by a newline. Otherwise it SHALL fail with the
lines joined by newlines as the message. `lint` writes no file.

Every scenario of this capability, except those of "Lint repository
findings" and "Lint JSON", compares a result with each line that starts
with `repository: ` removed.

#### Scenario: Lint fixture changes
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`, a copy of `openspec/changes/275-rust-lint-command/fixture/lint-project/` in which each change's `proposal.md` declares `verify: cargo test -p delta` and a `## Surface` section and each change holds a `tasks/1.md`, as `openspec/changes/306-rust-lint-task-rules/fixture/lint-project/` gives them
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes, and the fixture's files are unchanged:

| Query | Result |
|---|---|
| `1` | output `001-clean: valid\n` |
| `002` | message ``002-bad-delta: 2 findings\n002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:12: the delta names `Ghost`, which the living spec has no requirement for\n002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:21: the delta names `Phantom`, which the living spec has no requirement for`` |
| `003-dangling-tag` | message `003-dangling-tag: 1 finding\n003-dangling-tag: crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist` |
| `4` | message `004-merge-conflict: 1 finding\n004-merge-conflict: openspec/changes/004-merge-conflict/specs/delta/spec.md: delta ADDED failed for header "### Requirement: Adds numbers" - already exists` |
| `005-no-delta` | message `005-no-delta: 2 findings\n005-no-delta: openspec/changes/005-no-delta/proposal.md:1: the change holds no delta spec\n005-no-delta: crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist` |

#### Scenario: Lint several fixture changes
- **WHEN** `lint` runs with the row's args on the lint fixture project. `<g>` is ``openspec/changes/002-bad-delta/specs/delta/spec.md:12: the delta names `Ghost`, which the living spec has no requirement for``, `<p>` is ``openspec/changes/002-bad-delta/specs/delta/spec.md:21: the delta names `Phantom`, which the living spec has no requirement for``, `<n>` is `openspec/changes/005-no-delta/proposal.md:1: the change holds no delta spec`, `<d>` is `crates/delta/src/lib.rs:12: Implements: tag names requirement:delta/sums-lists, which does not exist`, and `<m>` is `openspec/changes/004-merge-conflict/specs/delta/spec.md: delta ADDED failed for header "### Requirement: Adds numbers" - already exists`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes, and the fixture's files are unchanged:

| Args | Result |
|---|---|
| `1`, `3` | message `001-clean: valid\n003-dangling-tag: 1 finding\n003-dangling-tag: <d>` |
| `5`, `1` | message `005-no-delta: 2 findings\n005-no-delta: <n>\n005-no-delta: <d>\n001-clean: valid` |
| `1`, `001-clean` | output `001-clean: valid\n001-clean: valid\n` |
| none | message `001-clean: valid\n002-bad-delta: 2 findings\n002-bad-delta: <g>\n002-bad-delta: <p>\n003-dangling-tag: 1 finding\n003-dangling-tag: <d>\n004-merge-conflict: 1 finding\n004-merge-conflict: <m>\n005-no-delta: 2 findings\n005-no-delta: <n>\n005-no-delta: <d>` |

## ADDED Requirements

### Requirement: Lint repository findings
After its own checks, each checked change SHALL gather its repository
findings, the findings about other changes and living specs that
TypeScript's OpenSpec run reports: for every other active change of
`list_changes`, in order, the findings of rust-specs `validate_change`
with that change's folder and the root joined with `openspec/specs`, then
the findings of rust-specs `validate_living_specs` with the root joined
with `openspec/specs`. The repository findings of a run are those of every
checked change, in order, keeping only the first of findings equal in
every field. Each is written as the line `repository: <file>:<line>:
<message>`, the file relative to the root as "Lint findings" writes it.
Repository findings never make a change invalid.

With `n` repository findings, `n` above 0, and no `--repository`, the
repository lines are TypeScript's `formatRepositoryCount` line,
`repository: 1 finding about other changes and living specs; osq lint
--repository lists them`, or `repository: <n> findings about other
changes and living specs; osq lint --repository lists them` for any other
count. With `--repository`, they are TypeScript's `REPOSITORY_HEADER`,
`repository: findings about other changes and living specs; they do not
affect the exit code`, then each repository finding's line. With no
repository finding there is no repository line. A `SpecsError` from either
function fails `lint` with its display, as "Lint errors" names.

#### Scenario: Repository lines on the fixture
- **WHEN** `lint` runs with the row's args on the lint fixture project. `<g>`, `<p>`, `<n>` and `<d>` are the lines "Lint several fixture changes" names, `<c>` is `repository: 3 findings about other changes and living specs; osq lint --repository lists them`, and `<h>` is `repository: findings about other changes and living specs; they do not affect the exit code`
- **THEN** it returns the row's output, or gives a `Failed` error for the command `lint` with the row's message, written with `\n` escapes, with no line removed:

| Args | Result |
|---|---|
| `1` | output `001-clean: valid\n<c>\n` |
| `1`, `--repository` | output `001-clean: valid\n<h>\nrepository: <g>\nrepository: <p>\nrepository: <n>\n` |
| `--repository`, `--repository`, `1` | output `001-clean: valid\n<h>\nrepository: <g>\nrepository: <p>\nrepository: <n>\n` |
| `2` | message `002-bad-delta: 2 findings\n002-bad-delta: <g>\n002-bad-delta: <p>\nrepository: 1 finding about other changes and living specs; osq lint --repository lists them` |
| `--repository`, `5` | message `005-no-delta: 2 findings\n005-no-delta: <n>\n005-no-delta: <d>\n<h>\nrepository: <g>\nrepository: <p>` |
| `1`, `5` | message `001-clean: valid\n005-no-delta: 2 findings\n005-no-delta: <n>\n005-no-delta: <d>\n<c>` |

#### Scenario: Repository living spec findings
- **WHEN** `lint` runs with the row's args on a new scratch copy of the lint fixture project whose `openspec/specs/delta/spec.md` has `\n### Requirement: Halves numbers\nThe system SHALL halve a number.\n` appended, so that its line 23 opens a requirement with no scenario. `<g>`, `<p>` and `<n>` are the lines "Lint several fixture changes" names and `<h>` the header "Repository lines on the fixture" names
- **THEN** it returns the row's output, written with `\n` escapes, with no line removed:

| Args | Result |
|---|---|
| `1` | output `001-clean: valid\nrepository: 4 findings about other changes and living specs; osq lint --repository lists them\n` |
| `1`, `--repository` | output ``001-clean: valid\n<h>\nrepository: <g>\nrepository: <p>\nrepository: <n>\nrepository: openspec/specs/delta/spec.md:23: requirement `Halves numbers` has no scenario\n`` |

#### Scenario: Repository check error
- **WHEN** `lint` runs with the query `1` on a new scratch copy of the lint fixture project that also holds `openspec/changes/006-unreadable/proposal.md` holding `---\ntitle: Unreadable\n---\n` and `openspec/changes/006-unreadable/specs/delta/spec.md` holding the bytes `0xff 0xfe`
- **THEN** it gives a `Failed` error for the command `lint` whose message starts with `<root>/openspec/changes/006-unreadable/specs/delta/spec.md: `, `<root>` being the scratch root written by `Path::display`

### Requirement: Lint JSON
With `--json`, `lint` SHALL return, in place of its lines, the document
TypeScript's `buildLintJson` builds, written on one line as
`JSON.stringify` writes it, followed by a newline:
`{"valid":<valid>,"changes":[<change>,...],"repository":[<finding>,...]}`,
each change being `{"change":"<folder>","valid":<valid>,"findings":[<finding>,...]}`
and each finding
`{"severity":"<severity>","file":"<file>","requirement":<requirement>,"section":<section>,"message":"<message>"}`,
with the keys in that order, `null` for a missing requirement or section,
and strings escaped as `serde_json` writes a string. A change is valid
when it has no error, and the document when every checked change is.
`changes` holds every checked change in order with its findings in the
order "Lint findings" gives them, and `repository` holds the run's
repository findings, with or without `--repository`. The fields of a
finding come from its source:

| Source | `severity` | `file` | `requirement` | `section` |
|---|---|---|---|---|
| proposal, task, entry or banned word finding | its severity | its file | `null` | its section |
| `SpecFinding` | `error` | `<file>:<line>`, the file relative to the root | its requirement | `null` |
| merge refusal | `error` | the file, relative to the root | `null` | `null` |
| link gate finding | `error` | the `Finding`'s location, or its node when it has none, as its display writes them | `null` | `null` |

The `message` is the finding's message, the refusal, or the `Finding`'s
message. A valid document SHALL be returned as `Output::text`, and an
invalid one as `Output::with_code` with the code 1, so the document is on
stdout either way. A failure before the document, such as an unknown
flag, a missing id or a check that cannot run, is the `FeatureError` the
other lint requirements name.

#### Scenario: Lint JSON documents
- **WHEN** `lint` runs with the row's args on the row's root. The fixture is the lint fixture project, the empty root a new scratch root that holds no `openspec/` folder, and the rules copy a new scratch copy of the lint fixture project with the files of the last row of "Banned word warnings" written over it
- **THEN** it returns an output whose text is the bytes of the row's golden under `crates/features/lint/tests/golden/`, copies of the files of the same names under `openspec/changes/334-rust-lint-json-repository/golden/`, which `print-lint-goldens.mjs.txt` there printed with TypeScript's `buildLintJson`, and whose code is the row's code:

| Args | Root | Golden | Code |
|---|---|---|---|
| `--json`, `1` | fixture | `json-clean.json` | 0 |
| `--json`, `3` | fixture | `json-dangling.json` | 1 |
| `4`, `--json` | fixture | `json-merge.json` | 1 |
| `--json`, `--repository`, `2` | fixture | `json-bad-delta.json` | 1 |
| `--json`, `1`, `5` | fixture | `json-several.json` | 1 |
| `--json`, `1` | rules copy | `json-rules.json` | 1 |
| `--json` | empty root | `json-empty.json` | 0 |

#### Scenario: Lint JSON failures
- **WHEN** `lint` runs with the args `--json`, `9` on the lint fixture project
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "9" not found in <changes>`
