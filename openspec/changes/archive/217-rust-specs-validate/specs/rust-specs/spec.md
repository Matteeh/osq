# Spec Delta: rust-specs

## ADDED Requirements

### Requirement: Validation findings
Every finding the specs kernel's validation returns SHALL be a
`SpecFinding` with a `code`, the `file` it concerns, the 1-based `line` it
points at, the `requirement` name where one applies or none, a one-sentence
`message` that names the requirement or scenario where there is one, and a
`fix` for the human. Every finding blocks, so a finding has no severity. A
`FindingCode` serializes as its code, and its fix is the code's fixed text
below. Lines count from 1 in the text after the line ending rule of
"JavaScript text rules". A finding about a requirement or scenario points
at its header line, one about a REMOVED name or a rename at that entry's
line, one about a `##` heading at the heading, a duplicate or conflict at
the later of the two entries, and a finding about the whole file at line 1.
Each validation function returns its findings sorted by line, and findings
on one line in the order of the table below.

#### Scenario: Finding codes
- **WHEN** each finding code below is serialized and asked for its fix
- **THEN** the code and the fix are as given:

| Code | Fix |
|---|---|
| `missing-purpose` | Add a `## Purpose` section that says what the capability is for. |
| `missing-requirements` | Add a `## Requirements` section with at least one requirement. |
| `requirement-outside-section` | Move the requirement under `## Requirements`, or in a delta spec under an ADDED or MODIFIED section. |
| `delta-section-in-living-spec` | Move the requirements into `## Requirements` and remove the delta heading. |
| `duplicate-requirement` | Rename or remove one of the requirements, so each name is used once. |
| `requirement-without-shall` | State the requirement with SHALL or MUST outside code fences. |
| `requirement-without-scenario` | Add a `#### Scenario:` block with WHEN and THEN bullets. |
| `scenario-without-when` | Add a `- **WHEN**` bullet to the scenario. |
| `scenario-without-then` | Add a `- **THEN**` bullet to the scenario. |
| `duplicate-scenario` | Rename one of the scenarios, so each name is used once in the requirement. |
| `unknown-delta-section` | Use only `## Purpose` and the ADDED, MODIFIED, REMOVED and RENAMED Requirements sections. |
| `empty-delta-section` | Add requirements under the heading, or remove it. |
| `missing-delta-sections` | Add an ADDED, MODIFIED, REMOVED or RENAMED Requirements section. |
| `unpaired-rename` | Pair each `FROM:` line with a `TO:` line directly after it. |
| `invalid-rename` | Write each side as `- FROM:` or `- TO:` and a backticked requirement header. |
| `conflicting-delta` | Name the requirement in one operation only; after a rename, MODIFIED uses the new name. |
| `unknown-requirement` | Name a requirement the living spec has, or add a new one under ADDED. |
| `change-without-delta` | Add a delta spec at `specs/<capability>/spec.md`. |

### Requirement: Requirement validation
Each requirement of a living spec's Requirements section, and each ADDED or
MODIFIED requirement of a delta spec, SHALL be checked, as "Requirement
blocks" and "Scenario blocks" read it:

- `requirement-without-shall` when its body, without the lines the fence
  rule of "Living specs" puts inside a code fence and without the fence
  lines, holds neither `SHALL` nor `MUST` as a whole word: in that case,
  with no ASCII letter, digit or `_` directly before or after it;
- `requirement-without-scenario` when it has no scenario;
- `scenario-without-when` for each scenario with no WHEN bullet, and
  `scenario-without-then` for each with no THEN bullet;
- `duplicate-scenario` for each scenario whose name an earlier scenario of
  the same requirement has. The same name in two requirements is no
  finding.

Each of these findings carries the requirement's name.

#### Scenario: Requirement findings
- **WHEN** each living spec fixture below, under `crates/kernel/specs/tests/fixtures/validate/living/`, is validated as `validate_living_spec` says
- **THEN** its findings are as given, each with the requirement named:

| File | Findings |
|---|---|
| `requirement-without-shall.md` | `requirement-without-shall` at line 8 for `Quiet` |
| `requirement-without-scenario.md` | `requirement-without-scenario` at line 8 for `Bare` |
| `scenario-without-when.md` | `scenario-without-when` at line 15 for `Partial` |
| `scenario-without-then.md` | `scenario-without-then` at line 11 for `Partial` |
| `duplicate-scenario.md` | `duplicate-scenario` at line 15 for `Repeats` |

#### Scenario: Whole-word keywords
- **WHEN** a requirement whose body is each text below is checked
- **THEN** it gives `requirement-without-shall` or not, as given:

| Body | Finding |
|---|---|
| `The system SHALL pass.` | none |
| `It MUST pass.` | none |
| `(SHALL)` | none |
| `The system shall pass.` | `requirement-without-shall` |
| `MUSTARD and SHALLOW` | `requirement-without-shall` |
| `A_SHALL and MUST2` | `requirement-without-shall` |
| `~~~\nThe system SHALL pass.\n~~~` | `requirement-without-shall` |

### Requirement: Living spec validation
`validate_living_spec(file, text)` SHALL return the findings of one living
spec, each with `file` as given, where `text` reads as "Living specs" says
and headings count only outside code fences:

- `missing-purpose` when its purpose is empty;
- `missing-requirements` when it has no requirement;
- `requirement-outside-section` for each requirement header outside the
  first `## Requirements` section, with that requirement's name;
- `delta-section-in-living-spec` for each `##` heading whose trimmed title,
  lowercased, is `added requirements`, `modified requirements`, `removed
  requirements` or `renamed requirements`;
- `duplicate-requirement` for each requirement whose name an earlier
  requirement of the Requirements section has, with that name;
- the findings of "Requirement validation" for each requirement of the
  Requirements section.

`validate_living_specs(specs_dir)` SHALL validate the `spec.md` of each
folder directly under `specs_dir`, folders in byte order of their names,
with `file` the joined path written by `Path::display`. A folder without
a `spec.md` file adds nothing, a missing `specs_dir` gives no finding, and
a `spec.md` that cannot be read or is not UTF-8 is a read error naming its
path.

#### Scenario: Living spec findings
- **WHEN** each living spec fixture below, under `crates/kernel/specs/tests/fixtures/validate/living/`, is validated
- **THEN** its findings are as given:

| File | Findings |
|---|---|
| `valid.md` | none |
| `missing-purpose.md` | `missing-purpose` at line 1 |
| `missing-requirements.md` | `missing-requirements` at line 1 |
| `requirement-outside-section.md` | `requirement-outside-section` at line 17 for `Stray` |
| `delta-section-in-living-spec.md` | `delta-section-in-living-spec` at line 15 |
| `duplicate-requirement.md` | `duplicate-requirement` at line 15 for `Twice` |

#### Scenario: Living specs folder
- **WHEN** `validate_living_specs` reads each folder below
- **THEN** the result is as given:

| Folder | Result |
|---|---|
| `crates/kernel/specs/tests/fixtures/validate/targets/specs/` | no finding |
| a folder that does not exist | no finding |
| a folder whose `alpha/spec.md` holds the bytes `0xff 0xfe` | a read error naming that `spec.md` |

### Requirement: Delta spec validation
`validate_delta(file, text)` SHALL return the findings of one delta spec
that need no living spec, each with `file` as given, where `text` reads as
"Delta specs" says and headings and requirement headers count only outside
code fences:

- `unknown-delta-section` for each `##` heading whose trimmed title,
  lowercased, is neither one of the four delta section titles nor
  `purpose`;
- `empty-delta-section` for each delta section heading whose section holds
  no requirement header and no line "Delta specs" reads as a removed name
  or a FROM, TO or invalid rename line;
- `missing-delta-sections` when the text has no delta section heading;
- `requirement-outside-section` for each requirement header outside an
  ADDED, MODIFIED or REMOVED section, text before the first `##` heading
  included, with that requirement's name;
- `unpaired-rename` for each unpaired rename side, at its line, with its
  name;
- `invalid-rename` for each invalid rename line, at its line;
- `duplicate-requirement` for each name an earlier entry of the same kind
  has, the kinds being ADDED, MODIFIED, REMOVED, RENAMED FROM and RENAMED
  TO, sections of one title counted together;
- `conflicting-delta` for each pair of entries with the same name in ADDED
  and MODIFIED, ADDED and REMOVED, MODIFIED and REMOVED, a RENAMED FROM and
  MODIFIED, a RENAMED FROM and REMOVED, or a RENAMED TO and ADDED, at the
  later entry, with that name;
- the findings of "Requirement validation" for each ADDED and MODIFIED
  requirement.

#### Scenario: Delta spec findings
- **WHEN** each delta spec fixture below, under `crates/kernel/specs/tests/fixtures/validate/delta/`, is validated
- **THEN** its findings are as given:

| File | Findings |
|---|---|
| `valid.md` | none |
| `unknown-delta-section.md` | `unknown-delta-section` at line 12 |
| `empty-delta-section.md` | `empty-delta-section` at line 12 |
| `missing-delta-sections.md` | `missing-delta-sections` at line 1 |
| `unpaired-rename.md` | `unpaired-rename` at line 7 for `Orphan` |
| `invalid-rename.md` | `invalid-rename` at line 7 |
| `conflicting-delta.md` | `conflicting-delta` at line 14 for `Both` |
| `duplicate-requirement.md` | `duplicate-requirement` at line 14 for `Twice` |
| `requirement-outside-section.md` | `requirement-outside-section` at line 6 for `Stray` |
| `requirement-without-scenario.md` | `requirement-without-scenario` at line 5 for `Bare` |

### Requirement: Delta targets
`check_delta_targets(file, text, living)` SHALL return an
`unknown-requirement` finding, with `file` as given and the entry's name,
for each MODIFIED requirement, REMOVED name and RENAMED FROM name of the
delta spec `text` that `living`, a parsed living spec or none, has no
requirement for. A MODIFIED name that is the TO of one of the delta's
renames counts as known. With no living spec, no requirement is known.

`validate_change(change_dir, specs_dir)` SHALL validate each delta spec of
a change: the `spec.md` of each folder directly under `change_dir/specs`,
folders in byte order of their names, against the living spec at
`specs_dir/<folder>/spec.md`, or none when that is not a file. Each delta's
findings are those of `validate_delta` and `check_delta_targets`, sorted
together as "Validation findings" says, with `file` the delta's joined path
written by `Path::display`. A change with no delta spec gives one
`change-without-delta` finding for `change_dir/proposal.md` at line 1. A
delta or living spec that cannot be read or is not UTF-8 is a read error
naming its path.

#### Scenario: Change findings
- **WHEN** each change below, under `crates/kernel/specs/tests/fixtures/validate/targets/changes/`, is validated against `crates/kernel/specs/tests/fixtures/validate/targets/specs/`
- **THEN** its findings are as given, each file under the change folder:

| Change | Findings |
|---|---|
| `known` | none |
| `unknown` | `unknown-requirement` in `specs/alpha/spec.md` at line 5 for `Missing`, at line 14 for `Never there` and at line 18 for `Ghost`, then in `specs/beta/spec.md` at line 5 for `Kept` |
| `no-delta` | `change-without-delta` in `proposal.md` at line 1 |

#### Scenario: Unreadable delta
- **WHEN** a change whose `specs/alpha/spec.md` holds the bytes `0xff 0xfe` is validated
- **THEN** the result is a read error naming that `spec.md`

### Requirement: Validation corpus
The specs kernel's validation SHALL find nothing in this repository's
living specs and archived delta specs. The archived changes numbered 001
to 015, 018 and 019 predate delta specs and are the only archived changes
without one; the others numbered up to 216 each have at least one.

#### Scenario: Living specs validate
- **WHEN** `validate_living_specs` reads this repository's `openspec/specs/`
- **THEN** it gives no finding

#### Scenario: Archived deltas validate
- **WHEN** `validate_delta` checks every delta spec of the archived changes numbered 001 to 216 in `openspec/changes/archive/`
- **THEN** it gives no finding, and the changes in that range without a delta spec are exactly 001 to 015, 018 and 019
