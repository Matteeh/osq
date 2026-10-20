## ADDED Requirements

### Requirement: ADR records
`read_decisions(project_root, decisions, openspec)` SHALL read the files
directly under `<project_root>/<decisions>` into a `DecisionRecords` of
`adrs`, `ignored` and `groups`, as TypeScript's `readDecisions` does, where
`decisions` and `openspec` are the folders, relative to the project root,
that `paths.decisions` and `paths.openspecRoot` name. A file is an ADR when
its name ends in `.md` and is not `README.md`, the name starts with a digit,
it reads as UTF-8 text, its frontmatter parses with `parse_frontmatter`, and
the frontmatter has a `status` key, whatever its value. Every other `.md`
file except `README.md` is ignored and listed in `ignored` by its path.
Folders, `README.md` and files whose name does not end in `.md` are left out
of both lists. Each `Adr` carries its `path` as `<decisions>/<file name>`
with forward slashes. ADRs are sorted by the numeric value of their number,
then by path; ignored paths are sorted. A missing decisions folder reads as
no ADRs, no ignored files and no groups.

#### Scenario: Records of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/` with the folders `decisions` and `openspec`
- **THEN** it returns these ADRs in this order, and the ignored paths `decisions/003-no-frontmatter.md` and `decisions/draft.md`:

| Path | Number | Title | Date | Status | Rule | Superseded by |
|---|---|---|---|---|---|---|
| `decisions/001-full.md` | `001` | `Full record` | `2026-01-02` | `accepted` | `Keep the full record.` | none |
| `decisions/002-superseded.md` | `002` | `Superseded record` | none | `superseded` | `Replaced by the full record.` | `1` |
| `decisions/2-short.md` | `2` | `Short` | none | `proposed` | empty | none |
| `decisions/04-malformed.md` | `04` | `Malformed lists` | none | `accepted` | empty | none |
| `decisions/005-bad-status.md` | `005` | `Bad status` | none | `5` | empty | none |
| `decisions/006-warnings.md` | `006` | `Warnings` | none | `proposed` | `Two\nlines` | none |
| `decisions/007-multiline.md` | `007` | `Multi-line rule` | none | `accepted` | `One\ntwo` | none |
| `decisions/008-long.md` | `008` | `Long rule` | none | `accepted` | `This rule runs on well past the sixty characters the test allows.` | none |
| `decisions/009-superseded-missing.md` | `009` | `Missing replacement` | none | `superseded` | `Superseded without a replacement.` | none |
| `decisions/010-superseded-unknown.md` | `010` | `Unknown replacement` | none | `superseded` | `Superseded by an ADR that does not exist.` | `099` |

#### Scenario: Missing decisions folder
- **WHEN** `read_decisions` reads a project root that has no decisions folder
- **THEN** it returns no ADRs, no ignored paths and no groups

### Requirement: ADR fields
Each `Adr` SHALL hold the fields of TypeScript's `Adr` under their Rust
names, plus `enforced_by`. `number` is the file name's leading digits as
written. `title` is the text of the first body line that is `#`, a space or
tab, and text, trimmed, with a leading run of digits, its `.` and the
whitespace after it removed. `date` is the first `YYYY-MM-DD` of ASCII
digits on the first body line that starts with `Date:`, and none when that
line holds none or there is no such line. `hash` is `sha256:` and the
lowercase hex SHA-256 of the file's bytes. `status` is the trimmed string,
an integer, real or boolean as its text, and empty for any other value.
`applies_to` is `AppliesTo::All` for exactly the string `all`, a
non-empty list of non-empty strings as `AppliesTo::Capabilities` of the
trimmed strings, and none otherwise. `rule` is the trimmed string, else
empty. `superseded_by` is a trimmed non-empty string or an integer as its
text, else none. `checks` and `denies`, when present, are lists of strings
that trim to text, each trimmed; a check path also has every `\` turned into
`/` and one leading `./` removed. `enforced_by`, which TypeScript does not
read, is a string that trims to text as a one-item list, or a list like
`denies`. A missing list field is empty. A present `checks`, `denies` or
`enforced_by` of any other shape reads as empty and adds its name to
`malformed`, in that order. `AppliesTo` serializes as the string `all` or as
the list of names.

#### Scenario: List fields of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** these ADRs have these list fields, and every other ADR of the fixture has none of them and nothing malformed:

| Path | Applies to | Checks | Denies | Enforced by | Malformed |
|---|---|---|---|---|---|
| `decisions/001-full.md` | `alpha`, `group:core` | `tests/a.test.ts`, `tests/b.rs` | `left-pad` | `validator` | none |
| `decisions/002-superseded.md` | all | none | none | none | none |
| `decisions/2-short.md` | `alpha`, `alpha`, `group:core` | none | none | none | none |
| `decisions/04-malformed.md` | none | none | none | none | `checks`, `denies`, `enforced_by` |
| `decisions/006-warnings.md` | `ghost`, `group:nobody`, `beta`, `group:core` | none | none | none | none |

#### Scenario: Hash of an ADR
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** the ADR `decisions/001-full.md` has the hash `sha256:7661094d657cbcecc6572e2c230a62c213ac34af1536cd58fb18af36c530bff5`

### Requirement: ADR groups
`read_decisions` SHALL read each capability's group into `groups`, as
TypeScript's `readCapabilityGroups` does: first every folder under
`<openspec>/specs` that holds both `osq.yml` and `spec.md`, in name order,
then, for a capability no living sidecar named, each
`specs/<capability>/osq.yml` of every folder under `<openspec>/changes`
whose name does not start with `_` or `.` and is not `archive` or
`rejected`, change folders and capabilities in name order. A sidecar that
`parse_sidecar` refuses gives no group. An ADR's `governs` SHALL be `all`
when `applies_to` is `all`, empty when it is none, and otherwise every
capability name it lists plus every capability whose group a
`group:<name>` entry names, without repeats, sorted.

#### Scenario: Groups of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** its groups are exactly these, so the living `delta` with a refused sidecar, the living `gamma` without a `spec.md`, the archived `omega` and the `_draft` change's `zeta` give none, and the change `010-new` does not replace the living `beta`:

| Capability | Group |
|---|---|
| `alpha` | `core` |
| `beta` | `edge` |
| `gamma` | `core` |

#### Scenario: Governed capabilities of the decisions fixture
- **WHEN** `read_decisions` reads `tests/fixtures/decisions/`
- **THEN** these ADRs govern these capabilities:

| Path | Governs |
|---|---|
| `decisions/001-full.md` | `alpha`, `gamma` |
| `decisions/002-superseded.md` | all |
| `decisions/2-short.md` | `alpha`, `gamma` |
| `decisions/04-malformed.md` | none |
| `decisions/005-bad-status.md` | `ghost` |
| `decisions/006-warnings.md` | `alpha`, `beta`, `gamma`, `ghost` |
| `decisions/008-long.md` | `beta` |

### Requirement: ADR validation
`validate_decisions(records, living, max_rule_length)` SHALL return a
`DecisionProblems` of `errors` and `warnings`, each a list of
`DecisionFinding` with a `code`, the `file` it concerns as the record's
path, a `message` and the code's `fix`. A finding displays as
`<file>: <message>`, which is the text TypeScript's `validateDecisions`
reports. For each ADR in order: an error for each `malformed` field; an
error when the status is not `proposed`, `accepted` or `superseded`, after
which the ADR is not checked further; for an accepted ADR, an error when
`applies_to` is none, and one when the rule is empty, else holds a line
break, else is longer than `max_rule_length` UTF-16 code units; for a
superseded ADR, an error when `superseded_by` is none, else when it names no
ADR number of the records by numeric value; then a warning for each
capability name in `applies_to` that `living` does not hold, and for each
`group:<name>` entry whose group no capability in `living` has in `groups`.
After the ADRs, a warning for each ignored path. TypeScript, which does not
read `enforced_by`, reports the same findings without the one for a
malformed `enforced_by`.

#### Scenario: Decision finding codes
- **WHEN** each decision finding code below is serialized and asked for its fix
- **THEN** the code, its message and its fix are as given:

| Code | Message | Fix |
|---|---|---|
| `malformed-list` | `<field> must be a list of non-empty strings`, or for `enforced_by` `enforced_by must be a non-empty string or a list of non-empty strings` | Write the field as a list of non-empty strings, or remove it. |
| `invalid-status` | `status must be proposed, accepted, or superseded` | Set status to proposed, accepted or superseded. |
| `missing-applies-to` | `accepted ADR needs applies_to, either "all" or capabilities` | Set applies_to to `all` or to a list of capability names. |
| `missing-rule` | `accepted ADR needs a one-line rule` | Add a one-line rule that says what a spec must do. |
| `multiline-rule` | `rule must be one line` | Write the rule on one line. |
| `long-rule` | `rule is longer than limits.maxRuleLength (<max>)` | Shorten the rule to the limit and keep the full wording in the body. |
| `missing-superseded-by` | `superseded ADR needs superseded_by naming its replacement` | Set superseded_by to the number of the ADR that replaces this one. |
| `unknown-superseded-by` | `superseded_by <number> names no existing ADR` | Name an existing ADR's number in superseded_by. |
| `unknown-capability` | `applies_to capability "<name>" has no living spec` | Name a living capability, or add its spec first. |
| `unknown-group` | `applies_to group "<name>" has no living capability` | Name a group that a living capability's `osq.yml` sets. |
| `ignored-file` | `no osq frontmatter, ignored` | Give the file a numbered name and frontmatter with a status, or move it out of the decisions folder. |

#### Scenario: Validation of the decisions fixture
- **WHEN** `validate_decisions` checks the records `read_decisions` reads from `tests/fixtures/decisions/`, with the living capabilities `alpha` and `beta` and a maximum rule length of 60
- **THEN** it returns these findings in this order, displayed:

| Kind | Finding |
|---|---|
| error | `decisions/04-malformed.md: checks must be a list of non-empty strings` |
| error | `decisions/04-malformed.md: denies must be a list of non-empty strings` |
| error | `decisions/04-malformed.md: enforced_by must be a non-empty string or a list of non-empty strings` |
| error | `decisions/04-malformed.md: accepted ADR needs applies_to, either "all" or capabilities` |
| error | `decisions/04-malformed.md: accepted ADR needs a one-line rule` |
| error | `decisions/005-bad-status.md: status must be proposed, accepted, or superseded` |
| error | `decisions/007-multiline.md: rule must be one line` |
| error | `decisions/008-long.md: rule is longer than limits.maxRuleLength (60)` |
| error | `decisions/009-superseded-missing.md: superseded ADR needs superseded_by naming its replacement` |
| error | `decisions/010-superseded-unknown.md: superseded_by 099 names no existing ADR` |
| warning | `decisions/006-warnings.md: applies_to capability "ghost" has no living spec` |
| warning | `decisions/006-warnings.md: applies_to group "nobody" has no living capability` |
| warning | `decisions/003-no-frontmatter.md: no osq frontmatter, ignored` |
| warning | `decisions/draft.md: no osq frontmatter, ignored` |

#### Scenario: Live decisions validate
- **WHEN** `read_decisions` reads this repository and `validate_decisions` checks the records with the capability folders under `openspec/specs/` as living and a maximum rule length of 160
- **THEN** every `.md` file in `decisions/` other than `README.md` reads as an ADR, and there are no errors

### Requirement: ADR parse parity
`read_decisions` SHALL give TypeScript's `readDecisions` result on frozen
copies of this repository's ADRs, compared with a golden printed once by
TypeScript and committed as `tests/golden/decisions.json`. The test never
runs `node` or `osq`. `tests/fixtures/repo_decisions/` holds byte-for-byte
copies of the 26 ADRs and the `README.md` in `decisions/` on 2026-10-20,
and `openspec/specs/<capability>/` with a copy of each living capability's
`osq.yml` and a one-line `spec.md`. The golden is one JSON object of
`adrs`, `ignored` and `groups`, each ADR under the Rust field names with
none as null and `enforced_by` as an empty list, which TypeScript does not
read and no ADR sets.

#### Scenario: Frozen decisions match TypeScript
- **WHEN** `read_decisions` reads `tests/fixtures/repo_decisions/` with the folders `decisions` and `openspec`, and the result is serialized to JSON
- **THEN** it equals `tests/golden/decisions.json`: 26 ADRs, no ignored paths, and the group of each of the 14 capabilities

## MODIFIED Requirements

### Requirement: Public API
The specs kernel SHALL expose its items only at its crate root. No module
of `crates/kernel/specs/src` is declared `pub mod`, and `src/lib.rs`
re-exports exactly the items in the table below, each used by another
crate or by the crate's own tests, or named in the signature of one that
is. Every public function and public method of the crate SHALL carry a doc
line `Implements: rust-specs/<requirement>`. A new public item is added by
a change that edits this table.

#### Scenario: Specs kernel exports from its root only
- **WHEN** the source files under `crates/kernel/specs/src` are read
- **THEN** no line declares `pub mod`, and the `pub use` items of `src/lib.rs` are exactly these, by module:

| Module | Items |
|---|---|
| `decisions` | `Adr`, `AppliesTo`, `DecisionCode`, `DecisionFinding`, `DecisionProblems`, `DecisionRecords`, `read_decisions`, `validate_decisions` |
| `document` | `ChecklistItem`, `Frontmatter`, `Proposal`, `Sidecar`, `SidecarError`, `SyntaxError`, `TaskFile`, `VerifyStarts`, `parse_frontmatter`, `parse_proposal`, `parse_sidecar`, `parse_task_file`, `parse_task_list` |
| `markdown` | `Delta`, `LivingSpec`, `Outcome`, `Rename`, `RenameSide`, `Requirement`, `Scenario`, `UnpairedRename`, `code_ownership`, `js_trim`, `normalize_requirement_name`, `parse_delta`, `parse_living_spec`, `parse_requirement`, `parse_scenario`, `section` |
| `merge` | `MergeChangeError`, `MergeError`, `MergedSpec`, `merge_change`, `merge_delta`, `merge_living_spec` |
| `owners` | `CapabilityOwnership`, `owner_capabilities`, `read_capability_ownership`, `scope_covers_path` |
| `read` | `SpecsError`, `read_delta`, `read_living_spec`, `read_proposal`, `read_sidecar`, `read_task_file`, `read_task_list` |
| `validate` | `FindingCode`, `SpecFinding`, `check_delta_targets`, `validate_change`, `validate_delta`, `validate_living_spec`, `validate_living_specs`, `validate_merged_change` |

#### Scenario: Specs kernel public functions are tagged
- **WHEN** each `pub fn` under `crates/kernel/specs/src` is read, methods included
- **THEN** the doc comment directly above it holds a line `Implements: rust-specs/<requirement>`, and the six methods name these requirements:

| Method | Implements |
|---|---|
| `DecisionCode::as_str` | `rust-specs/adr-validation` |
| `DecisionCode::fix` | `rust-specs/adr-validation` |
| `FindingCode::as_str` | `rust-specs/validation-findings` |
| `FindingCode::fix` | `rust-specs/validation-findings` |
| `MergeError::capability` | `rust-specs/merge-refusals` |
| `MergeError::requirement` | `rust-specs/merge-refusals` |
