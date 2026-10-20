# Spec Delta: rust-specs

## ADDED Requirements

### Requirement: Delta merge
`merge_delta(base, capability, delta)` SHALL return the living spec text
that TypeScript's `mergeDelta` returns for the same base text, capability
and parsed delta, byte for byte, or the `MergeError` of "Merge refusals".
With no base, or a base that is only whitespace, it merges into
`# <capability> Specification`, a `## Purpose` line followed directly by
the delta's purpose or by `TBD - created by archiving change <capability>.
Update Purpose after archive.`, and an empty `## Requirements` section.
It splits the base at its first `## Requirements` heading outside code
fences into the text before it, the heading line, the text before the
first requirement header, the requirement blocks, and the text from the
next `##` heading on. It then applies the renames, the removals (only
when there is a base), the modifications and the additions, in that
order. A rename rewrites the block's first line to
`### Requirement: <to>`, a modification replaces the whole block, and an
ADDED block equal to an existing block after both are trimmed changes
nothing. The text is written back as the text before, the heading line,
the text before the first header when it is not blank, each surviving
block in its old place and each new block after them, joined by one
blank line, then the text after. Runs of blank lines outside fences
become one, and the text ends with one newline. A base with no
Requirements heading keeps all of its text as given, a leading BOM
included, followed by a new `## Requirements` heading.

`merge_living_spec(base, capability, delta)` SHALL return the same text,
or none when that text holds no requirement, as `mergeLivingSpec` does.
Neither function touches the disk.

#### Scenario: Merge cases
- **WHEN** each case folder below, under `crates/kernel/specs/tests/fixtures/merge/cases/`, is merged with the capability `cap`, its `base.md` as the base or none when the file is absent, and its `delta.md` parsed by `parse_delta`
- **THEN** `merge_delta` gives the text of the case's `merged.md`, and `merge_living_spec` gives the result as given:

| Case | `merge_living_spec` |
|---|---|
| `ops` | the text of `merged.md` |
| `new-purpose` | the text of `merged.md` |
| `new-no-purpose` | the text of `merged.md` |
| `new-removed-ignored` | the text of `merged.md` |
| `same-added` | the text of `merged.md` |
| `no-requirements-header` | the text of `merged.md` |
| `fence` | the text of `merged.md` |
| `emptied` | none |

### Requirement: Merge refusals
A delta that `merge_delta` cannot apply SHALL give a `MergeError`, whose
`capability()` is the capability merged and whose `requirement()` is the
requirement name the refusal names, or none for `InvalidRename`. Its
`Display` writes TypeScript's `DeltaMergeError` message for the same
refusal. The checks run in this order, and the first that fails is the
error:

- `InvalidRename { capability, line }`, for the delta's first invalid
  rename line: ``<capability> RENAMED failed - entry "<line>" is not in the expected form. Write each rename as "- FROM: `### Requirement: X`" followed by "- TO: `### Requirement: Y`".``
- `UnpairedRename { capability, side, requirement }`, for the first
  unpaired rename: ``<capability> RENAMED failed for header "### Requirement: <requirement>" - no matching <other side>``, where the other side is `TO` for an unpaired FROM and `FROM` for an unpaired TO.
- `DuplicateAdded { capability, requirement }`, for an ADDED name an
  earlier ADDED block has: ``<capability> ADDED failed for header "### Requirement: <requirement>" - duplicate requirement in ADDED``
- With no base, `ModifiedMissing` for the first MODIFIED name, then
  `RenameWithoutBase { capability, requirement }` for the first rename's
  FROM name: ``Cannot apply RENAMED: requirement "<requirement>" not found in base spec``
- For each rename, `RenameSourceMissing { capability, requirement }`
  when the spec has no FROM name: ``<capability> RENAMED failed for header "### Requirement: <requirement>" - source not found``,
  then `RenameTargetExists { capability, requirement }` when it already
  has the TO name: ``<capability> RENAMED failed for header "### Requirement: <requirement>" - target already exists``
- With a base, `RemovedMissing { capability, requirement }` for each
  REMOVED name the spec lacks: ``Cannot apply REMOVED: requirement "<requirement>" not found in base spec``
- For each MODIFIED block, `ModifiedMissing { capability, requirement }`
  when the spec lacks its name: ``Cannot apply MODIFIED: requirement "<requirement>" not found in base spec``,
  then `ScenariosDropped { capability, requirement, scenarios }` when the
  current block holds a scenario name more times than the new block, the
  missing names in the current block's order: ``<capability> MODIFIED failed for header "### Requirement: <requirement>" - current spec contains scenario(s) not present in the modified block: "<a>", "<b>". Refresh the change spec before archiving to avoid dropping scenarios.``
  A scenario name is read from each `####` line outside fences, without
  the `####`, a closing hash run and a leading `Scenario:` in any case.
- For each ADDED block, `AddedExists { capability, requirement }` when
  the spec has a different block of that name: ``<capability> ADDED failed for header "### Requirement: <requirement>" - already exists``,
  then `AddedNearMiss { capability, requirement }` when a name differs
  from it only in letter case and whitespace runs: ``<capability> ADDED failed for header "### Requirement: <requirement>" - a requirement differing only in case or spacing already exists``

`MergeError` derives `Debug`, `Clone`, `PartialEq`, `Eq` and
`serde::Serialize`, and implements `std::error::Error`.

#### Scenario: Refusal cases
- **WHEN** each case folder below, under `crates/kernel/specs/tests/fixtures/merge/cases/`, is merged as "Merge cases" says
- **THEN** `merge_delta` and `merge_living_spec` give the error as given, for the capability `cap`, and its `Display` equals the text of the case's `error.txt`:

| Case | Error | Requirement |
|---|---|---|
| `invalid-rename` | `InvalidRename` with the line `- FROM: A` | none |
| `unpaired-from` | `UnpairedRename`, side FROM | `A` |
| `unpaired-to` | `UnpairedRename`, side TO | `A2` |
| `duplicate-added` | `DuplicateAdded` | `N` |
| `modified-without-base` | `ModifiedMissing` | `A` |
| `rename-without-base` | `RenameWithoutBase` | `A` |
| `rename-source-missing` | `RenameSourceMissing` | `Z` |
| `rename-target-exists` | `RenameTargetExists` | `Two words` |
| `removed-missing` | `RemovedMissing` | `Z` |
| `modified-missing` | `ModifiedMissing` | `Z` |
| `scenarios-dropped` | `ScenariosDropped` with the scenarios `S1`, `S2` | `Two words` |
| `added-exists` | `AddedExists` | `A` |
| `added-near-miss` | `AddedNearMiss` | `two  Words` |

### Requirement: Change merge
`merge_change(change_dir, specs_dir)` SHALL merge each delta spec of a
change as TypeScript's `applyOpenSpecDeltas` does, and write nothing. It
reads the `spec.md` of each folder directly under `change_dir/specs`,
folders in byte order of their names, skipping a folder without a
`spec.md` file, and merges it with `merge_living_spec` into the living
spec at `specs_dir/<folder>/spec.md`, or none when that is not a file. It
returns one `MergedSpec { capability, delta, text }` per delta spec, in
that order: the folder name, the delta's joined path, and the merged text
or none for a capability the change empties. A change with no `specs`
folder gives none. A delta or living spec that cannot be read or is not
UTF-8 is `MergeChangeError::Read` holding the `SpecsError` read error
naming its path, and the first delta that cannot be applied is
`MergeChangeError::Merge { path, error }`, with the delta's path and the
`MergeError`.

#### Scenario: Change merges
- **WHEN** each change below, under `crates/kernel/specs/tests/fixtures/merge/validate/changes/`, is merged against `crates/kernel/specs/tests/fixtures/merge/validate/specs/`
- **THEN** the result is as given, and each text equals `merge_living_spec` of the same living spec and delta:

| Change | Result |
|---|---|
| `clean` | `alpha` with a text |
| `emptied` | `beta` with none |
| `fresh` | `gamma` with a text starting `# gamma Specification\n\n## Purpose\nGamma for the merged validation fixture.\n` |
| `refused` | a merge error naming `specs/alpha/spec.md` under the change, with `ModifiedMissing` for `alpha` and `Missing` |

#### Scenario: Change merge edges
- **WHEN** each change below, written under a temporary folder, is merged against `crates/kernel/specs/tests/fixtures/merge/validate/specs/`
- **THEN** the result is as given:

| Change | Result |
|---|---|
| a change with no `specs` folder | no merged spec |
| a change whose only delta folder `alpha` holds no `spec.md` | no merged spec |
| a change whose `specs/alpha/spec.md` holds the bytes `0xff 0xfe` | a read error naming that `spec.md` |

### Requirement: Merged spec validation
`validate_merged_change(change_dir, specs_dir)` SHALL validate the merged
result of a change, which replaces TypeScript's `merged-spec-check.ts`
and its Node `openspec` run. It runs `validate_living_spec` on each text
`merge_change` gives that is not none, and leaves out each finding the
living spec already has: one whose code and requirement equal those of a
finding `validate_living_spec` gives for the living spec at
`specs_dir/<capability>/spec.md`, two absent requirements counting as
equal. Each kept finding's `file` is the delta's path written by
`Path::display`, and its `line` is the line of the first requirement
header outside fences in the delta that names the finding's requirement,
or 1. Each delta's findings are sorted as "Validation findings" says,
deltas in `merge_change`'s order. It returns `merge_change`'s error when
there is one.

#### Scenario: Merged findings
- **WHEN** each change below, under `crates/kernel/specs/tests/fixtures/merge/validate/changes/`, is validated against `crates/kernel/specs/tests/fixtures/merge/validate/specs/`
- **THEN** its findings are as given, each file under the change folder:

| Change | Findings |
|---|---|
| `clean` | none |
| `added-flaw` | `requirement-without-scenario` in `specs/alpha/spec.md` at line 5 for `Bare` |
| `renamed` | `requirement-without-scenario` in `specs/alpha/spec.md` at line 1 for `Renamed` |
| `emptied` | none |
| `fresh` | none |
| `refused` | the merge error of "Change merges" |

### Requirement: Archive parity cases
The specs kernel's merge SHALL give, for each case of
`tests/fixtures/openspec-diff/`, the result TypeScript osq's archive
gives, compared with frozen copies under
`crates/kernel/specs/tests/fixtures/merge/openspec-diff/`. Each copy holds
the case's `case.json`, its `specs/` when it has one, the delta specs of
its changes under `changes/<change>/specs/`, and either `expected/`, the
living specs TypeScript's `applyOpenSpecDeltas` wrote, or `error.txt`,
the message of the `DeltaMergeError` it threw. The tests never run
`node`, `openspec` or `osq`.

#### Scenario: Differential cases
- **WHEN** each case below has its changes merged with `merge_change` in byte order of their folder names, starting from a copy of its `specs/` or from no living spec, and each merged text is written to that copy, or its folder removed when the text is none, before the next change
- **THEN** the result is as given:

| Case | Result |
|---|---|
| `added` | the copy equals `expected/`, file for file |
| `given-and` | the copy equals `expected/`, file for file |
| `modified` | the copy equals `expected/`, file for file |
| `new-capability` | the copy equals `expected/`, file for file |
| `removed` | the copy equals `expected/`, file for file |
| `renamed` | the copy equals `expected/`, file for file |
| `second-change` | the copy equals `expected/`, file for file |
| `bare-rename` | a merge error whose `Display` equals `error.txt` |
| `dropped-scenario` | a merge error whose `Display` equals `error.txt` |
| `duplicate-added` | a merge error whose `Display` equals `error.txt` |

### Requirement: Archive replay
Replaying this repository's archive with `merge_change` SHALL give its
living specs. The replay starts from no living spec and merges, in this
order: the archived change folders under `openspec/changes/archive/`
whose `.run/events/change.jsonl` holds no `archived` event with a string
`timestamp`, in byte order of their names; then the other archived
folders, by the `timestamp` of the last such event, then by name; then
each folder directly under `openspec/changes/` other than `archive` that
holds `.run/archive-specs.json`, in byte order of names, because archive
has applied its deltas for its change-level verify. Lines of the events
file that are not JSON objects are ignored. Every capability that has a
folder under `openspec/specs/` or a delta in a replayed change is
checked: one whose replay ends with none has no living `spec.md`, and
every other one's living `spec.md` equals its replay byte for byte. The
living specs of `cli-foundation`, `metrics-and-reporting`,
`spec-lint-and-approve`, `status-inspection`, `watcher-and-harness` and
`web-inspection` predate the merge's Purpose rule and keep one blank line
after `## Purpose`; each of them equals its replay only once the first
`## Purpose\n\n` is read as `## Purpose\n`, and differs before.

#### Scenario: Living specs replay
- **WHEN** the archive and the changes being archived in this repository are replayed
- **THEN** every checked capability matches its living spec, and the six capabilities named above are exactly those that need the Purpose blank line removed
