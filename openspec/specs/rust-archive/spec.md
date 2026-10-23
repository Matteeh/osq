# rust-archive Specification

## Purpose
The archive feature applies an approved change's deltas to the living specs and moves the change to the archive. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/archive/** -->
The rust-archive capability SHALL own the `osq-feature-archive` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Archive crate ownership
- **WHEN** file ownership is resolved for the archive feature
- **THEN** system maps `crates/features/archive/**` to rust-archive

### Requirement: Archive feature
`osq-feature-archive` SHALL expose one public item, the unit struct
`ArchiveFeature`, which implements rust-core's `Feature` and holds no
state, as ADR 028 says. Its `name` SHALL be `archive`, and its `commands`
SHALL be exactly one `Command` named `archive`, with the summary
`apply a done change's deltas to the living specs and move it to the archive`
and the usage `<change>`.

#### Scenario: Archive feature commands
- **WHEN** a test reads `ArchiveFeature`'s name and commands
- **THEN** the name is `archive`, and the commands are one command with the name `archive`, the summary `apply a done change's deltas to the living specs and move it to the archive` and the usage `<change>`

### Requirement: Archive arguments
`ArchiveFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `archive`, and
`FeatureError::usage("archive", "expected one change, got <n> arguments")`
for an `archive` invocation whose argument count `n` is not one. Every
other failure of `archive` SHALL be `FeatureError::failed` with the command
`archive` and the message the other archive requirements name.

#### Scenario: Archive argument errors
- **WHEN** a test runs the invocation in the row on a fresh scratch copy of `tests/fixtures/project`
- **THEN** it gives the row's error, displayed as the row says, and the copy's files and folders are the fixture's, byte for byte:

| Invocation | Error |
|---|---|
| `archive` with no args | `Usage` error displayed `usage of archive: expected one change, got 0 arguments` |
| `archive` with args `007`, `008` | `Usage` error displayed `usage of archive: expected one change, got 2 arguments` |
| `land` with args `007` | `UnknownCommand` error displayed `unknown command: land` |

### Requirement: Change lookup
`archive` SHALL first read the root's config with rust-config
`load_config`, failing with the config error's display. The one argument of
`archive` SHALL name the change: the first active change folder whose
folder name equals the argument or whose leading digits equal it. With
`vcs.enabled` off, the folders are rust-storage `list_changes` of the root,
in its order, so only folders directly under `<root>/openspec/changes/`.
With it on, they are rust-storage `list_tree_changes` of rust-storage
`change_trees` of the root, in its order, with one candidate per entry of
rust-vcs `worktree_list` of a `GitVcs` at the root with the config's
`timeouts`, and no stacked folders; a git error fails with its display.
With no such folder, `archive` SHALL fail with `no active change <argument>`.

The change sits in the tree whose root its path starts with. That tree's
root is the `<root>` every other archive requirement names: the merge, the
living files, the record's paths, the move and the output use it.

#### Scenario: Change named by id or folder
- **WHEN** a test runs `archive` with the argument in the row, each on its own fresh scratch copy of `tests/fixtures/project`
- **THEN** it gives the row's result; a row that fails leaves the copy's files and folders the fixture's, byte for byte, and a row that gives an `Output` leaves no `openspec/specs/beta`:

| Argument | Result |
|---|---|
| `007` | an `Output` |
| `007-sample` | an `Output` |
| `008` | `Failed` error displayed `archive failed: no active change 008` |
| `007-other` | `Failed` error displayed `archive failed: no active change 007-other` |

### Requirement: Archive gates
Before it writes anything, `archive` SHALL turn `Change::draft` of the
`read_change` snapshot's id and task ids into a `Change<Approved>` with
`approve`, given `Seal::parse` of `.run/approved` and `change_folder_seal`,
then into a `Change<Archived>` with `archive` and the snapshot's state, and
require every task's `.run/done/<n>` marker. It SHALL fail with
`<folder> is not approved`, `<folder> changed since it was approved` on
`SealMismatch`, or `<folder> is not done`.

#### Scenario: Change that is not done
- **WHEN** a test makes the row's edit to the `007-sample` change of a fresh scratch copy of `tests/fixtures/project` and runs `archive` with the argument `007`
- **THEN** it gives the row's `Failed` error, and every other file and folder of the copy is the fixture's, byte for byte:

| Edit | Error displayed |
|---|---|
| remove `.run/done/2` | `archive failed: 007-sample is not done` |
| remove `.run/events/2.jsonl` | `archive failed: 007-sample is not done` |
| remove `.run/approved` | `archive failed: 007-sample is not approved` |
| write `approved` to `.run/approved` | `archive failed: 007-sample is not approved` |
| append the line `More.` to `proposal.md` | `archive failed: 007-sample changed since it was approved` |

### Requirement: Archive merge
`archive` SHALL merge every delta spec with rust-specs `merge_change` into
`<root>/openspec/specs` before it writes anything, and write nothing when
the merge fails, where TypeScript's `applyOpenSpecDeltas` writes the deltas
before the failing one. A `MergeChangeError::Merge` SHALL fail with its
`MergeError`'s text, the message of TypeScript's `DeltaMergeError`; any
other `MergeChangeError` or `StorageError` with its `Display` text.

#### Scenario: Delta that does not apply
- **WHEN** a test replaces `specs/gamma/spec.md` of the `007-sample` change of a fresh scratch copy of `tests/fixtures/project` with a delta whose only section is `## MODIFIED Requirements`, holding `### Requirement: Gamma missing`, the line `The system SHALL not exist.` and one scenario, reseals the change by writing its rust-storage `change_folder_seal` text to `.run/approved`, and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error displayed `archive failed: Cannot apply MODIFIED: requirement "Gamma missing" not found in base spec`, and every file and folder of the copy but those two, `openspec/specs/alpha/spec.md` and `openspec/specs/beta` included, is the fixture's, byte for byte

### Requirement: Living spec writes
After the merge, `archive` SHALL write each `MergedSpec`'s text to
`<root>/openspec/specs/<capability>/spec.md`, creating its folder, or, for
one with no text, remove that `spec.md`, the folder's `osq.yml` and then the
folder when empty, as `applyOpenSpecDeltas` does. Then it writes the
sidecars. A failed write SHALL fail with `cannot write <path>: <error>`:
the living file's path relative to `<root>` with `/`, even when its folder
could not be created, and the `std::io::Error`'s text.

#### Scenario: Living specs after an archive
- **WHEN** a test runs `archive` with the argument `007` on a fresh scratch copy of `tests/fixtures/project`
- **THEN** it gives an `Output`, and the copy's living specs are as the row says:

| Path under `openspec/specs/` | After the archive |
|---|---|
| `alpha/spec.md` | holds `### Requirement: Alpha one`, `The system SHALL do alpha one, twice.`, `### Requirement: Alpha second` and `### Requirement: Alpha three`, and not `### Requirement: Alpha two` |
| `alpha/osq.yml` | `group: core` and a newline |
| `beta` | absent |
| `gamma/spec.md` | holds `### Requirement: Gamma one` |
| `gamma/osq.yml` | `group: rust` and a newline |
| `epsilon/spec.md` | the fixture's, byte for byte |
| `epsilon/osq.yml` | `group: rust`, `tags:` and `  - moved`, each followed by a newline |

#### Scenario: Living spec write failure
- **WHEN** a test replaces `openspec/specs/gamma` of a fresh scratch copy of `tests/fixtures/project` with a file holding `x`, and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error whose display starts with `archive failed: cannot write openspec/specs/gamma/spec.md: `, `openspec/specs/gamma` is still the file holding `x`, and the copy still has the folder `openspec/changes/007-sample`

### Requirement: Archive sidecars
After the specs, `archive` SHALL write sidecars as `applyArchiveSidecars`
does. For each `creates` entry with a group, in order, it writes
`group: <group>` and a newline to `<name>/osq.yml` when `<name>/spec.md` is
a file and that `osq.yml` does not exist. An entry is a string, with no
group, or a mapping of string `name` and `group`, both `js_trim`med; any
other entry or a non-list gives none. Then each `osq.yml` under the
change's `specs/<folder>/` is copied to `<folder>/osq.yml`.

#### Scenario: Created sidecars
- **WHEN** a test replaces the `creates` block of the `007-sample` proposal's frontmatter in a fresh scratch copy of `tests/fixtures/project` with the row's YAML, reseals the change by writing its rust-storage `change_folder_seal` text to `.run/approved`, and runs `archive` with the argument `007`
- **THEN** it gives an `Output`, and the row's path under `openspec/specs/` is as the row says:

| `creates` YAML | Path | After the archive |
|---|---|---|
| `creates:` then `  - name: gamma` and `    group: rust` | `gamma/osq.yml` | `group: rust` and a newline |
| `creates:` then `  - name: " gamma "` and `    group: " rust "` | `gamma/osq.yml` | `group: rust` and a newline |
| `creates:` then `  - gamma` | `gamma/osq.yml` | absent |
| `creates:` then `  - name: gamma` | `gamma/osq.yml` | absent |
| `creates:` then `  - gamma` and `  - name: gamma` and `    group: rust` | `gamma/osq.yml` | `group: rust` and a newline |
| `creates:` then `  - 7` and `  - name: gamma` and `    group: rust` | `gamma/osq.yml` | absent |
| `creates: gamma` | `gamma/osq.yml` | absent |
| no `creates` key | `gamma/osq.yml` | absent |
| `creates:` then `  - name: alpha` and `    group: rust` | `alpha/osq.yml` | `group: core` and a newline |
| `creates:` then `  - name: beta` and `    group: rust` | `beta` | absent |
| `creates:` then `  - name: zeta` and `    group: rust` | `zeta` | absent |

### Requirement: Archive move
After the sidecars, `archive` SHALL remove the change's `plan-prompt.md`,
create `<root>/openspec/changes/archive/`, and rename the change folder to
`<folder>` there, or to the first free one of `<folder>-1`, `<folder>-2`
and so on, as `relocateArchivedSpec` does. Its `Output` text SHALL be the
archived folder's path relative to `<root>` with `/` separators. It SHALL
NOT append an `archived` event.

#### Scenario: Archived folder
- **WHEN** a test runs `archive` with the argument `007` on a fresh scratch copy of `tests/fixtures/project`
- **THEN** the output text is `openspec/changes/archive/007-sample`, the copy has no `openspec/changes/007-sample`, and the archived folder holds no `plan-prompt.md` and no `.run/events/change.jsonl`

#### Scenario: Archive name taken
- **WHEN** a test creates the empty folders in the row under `openspec/changes/archive/` of a fresh scratch copy of `tests/fixtures/project` and runs `archive` with the argument `007`
- **THEN** the output text is the row's, and that folder holds `proposal.md`:

| Existing folders | Output text |
|---|---|
| none | `openspec/changes/archive/007-sample` |
| `007-sample` | `openspec/changes/archive/007-sample-1` |
| `007-sample` and `007-sample-1` | `openspec/changes/archive/007-sample-2` |

### Requirement: Archive task checkboxes
After the move, `archive` SHALL tick only the archived folder's root
`tasks.md`, and only the checkboxes the rust-storage `change_folder_seal`
clears, as TypeScript's archiver does: where a line starts with any spaces
and tabs, a `-`, one or more spaces or tabs and `[ ]`, that space becomes
`x`. A line starts at the text's start and after each LF, CR, U+2028 and
U+2029, as JavaScript's multiline `^`. A `*` bullet, a `tasks.md` in any
subfolder and every other file SHALL keep their bytes. A root `tasks.md`
whose text does not change, or that does not exist, is not written. So
`change_folder_seal` of the archived folder SHALL equal the seal in its
`.run/approved`.

#### Scenario: Ticked task lines
- **WHEN** a test runs `archive` with the argument `007` on a fresh scratch copy of `tests/fixtures/project`
- **THEN** the archived `tasks.md` holds each row's line after the archive, and `notes/tasks.md` and `notes/todo.md` are as their rows say:

| Line before | Line after |
|---|---|
| `- [ ] 1. When alpha changes, alpha does it twice` | `- [x] 1. When alpha changes, alpha does it twice` |
| `  - [ ] an indented item` | `  - [x] an indented item` |
| `* [ ] a star item` | `* [ ] a star item` |
| `-`, a tab, `[ ] a tab after the dash` | `-`, a tab, `[x] a tab after the dash` |
| `- [x] an item already ticked` | `- [x] an item already ticked` |
| `- [ ]no space after the box` | `- [x]no space after the box` |
| `not a list [ ] item` | `not a list [ ] item` |
| `-[ ] no space after the dash` | `-[ ] no space after the dash` |
| `notes/tasks.md`: `- [ ] a nested tasks file keeps its bytes` | `- [ ] a nested tasks file keeps its bytes` |
| `notes/todo.md`: `- [ ] a file not named tasks.md keeps its box` | `- [ ] a file not named tasks.md keeps its box` |

#### Scenario: Line starts
- **WHEN** a test writes the row's text, with no newline at the end, as the `007-sample` change's `tasks.md` in a fresh scratch copy of `tests/fixtures/project`, reseals the change by writing its rust-storage `change_folder_seal` text to `.run/approved`, and runs `archive` with the argument `007`
- **THEN** the archived `tasks.md` holds the row's text after:

| Text before | Text after |
|---|---|
| `- [ ] a` CR LF `- [ ] b` | `- [x] a` CR LF `- [x] b` |
| `- [ ] a` CR `- [ ] b` | `- [x] a` CR `- [x] b` |
| `- [ ] a` U+2028 `- [ ] b` | `- [x] a` U+2028 `- [x] b` |
| `- [ ] a` U+2029 `- [ ] b` | `- [x] a` U+2029 `- [x] b` |
| `x - [ ] a` | `x - [ ] a` |

#### Scenario: Archived seal matches approval
- **WHEN** a test runs `archive` with the argument `007` on a fresh scratch copy of `tests/fixtures/project`, whose change's `.run/approved` holds `sha256:9e4011d19d8c95e04f274c6f9cbdbbea2ae81869c997edd3b30687be72ce2a37`
- **THEN** `change_folder_seal` of `openspec/changes/archive/007-sample` is that same text, and so is the archived `.run/approved`

#### Scenario: Missing root tasks file
- **WHEN** a test deletes the `007-sample` change's root `tasks.md` in a fresh scratch copy of `tests/fixtures/project`, reseals the change, and runs `archive` with the argument `007`
- **THEN** the archive succeeds, the archived folder has no root `tasks.md`, and `notes/tasks.md` is `- [ ] a nested tasks file keeps its bytes` followed by a newline

### Requirement: Archive parity
The files `archive` leaves under `<root>` SHALL be the files TypeScript's
`archiveSpecFolder` in `src/watcher/archiver.ts` leaves for the same
project, byte for byte, apart from the `archived` event that
`archiveSpecFolder` appends to `.run/events/change.jsonl`.

#### Scenario: Golden archive
- **WHEN** a test runs `archive` with the argument `007` on a fresh scratch copy of `tests/fixtures/project`
- **THEN** the copy's files, by path relative to it, are exactly the files of `tests/golden/project`, each byte for byte, and the copy has no `openspec/specs/beta` and no `openspec/changes/007-sample` folder

### Requirement: Archive record
Before the living spec writes, `archive` SHALL write the change's
`.run/archive-specs.json` as `applyArchiveSpecs` does: a JSON object mapping
`openspec/specs/<folder>/spec.md` and `.../osq.yml`, for each folder under
the change's `specs/`, to the file's text, or `null` when it cannot be read.
It SHALL remove the record before the move. When the record is already a
file, `archive` SHALL first fail with
`<folder> holds .run/archive-specs.json from a stopped archive`.

#### Scenario: Record left by a stopped archive
- **WHEN** a test writes `{}` to `.run/archive-specs.json` in the `007-sample` change of a fresh scratch copy of `tests/fixtures/project` and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error displayed `archive failed: 007-sample holds .run/archive-specs.json from a stopped archive`, and every other file of the copy is the fixture's, byte for byte

### Requirement: Archive put-back
When writing the record or a living file fails, `archive` SHALL read the
record back, write each recorded text to its path, creating its folder,
remove each path recorded as `null` and then its folder when empty, and
remove the record, ignoring errors while it does so, as
`restoreArchiveSpecs` does. It SHALL then fail with
`cannot write <path>: <error>`, with the record's path when the record
could not be written.

#### Scenario: Living file that cannot be written
- **WHEN** a test replaces the row's path in a fresh scratch copy of `tests/fixtures/project` as the row says, and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error whose display starts with `archive failed: cannot write `, the row's message path and `: `, the replaced path is still as the row made it, the change folder holds no `.run/archive-specs.json`, and every other file and folder of the copy is the fixture's, byte for byte, so `openspec/specs/alpha/spec.md`, `openspec/specs/beta/spec.md` and `openspec/specs/beta/osq.yml` are back and no `openspec/specs/gamma/spec.md` is left:

| Replaced path | Replaced with | Message path |
|---|---|---|
| `openspec/specs/gamma` | a file holding `x` | `openspec/specs/gamma/spec.md` |
| `openspec/specs/epsilon/osq.yml` | an empty folder | `openspec/specs/epsilon/osq.yml` |

#### Scenario: Record that cannot be written
- **WHEN** a test creates an empty folder `.run/archive-specs.json` in the `007-sample` change of a fresh scratch copy of `tests/fixtures/project` and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error whose display starts with `archive failed: cannot write openspec/changes/007-sample/.run/archive-specs.json: `, and every file of the copy is the fixture's, byte for byte, with that empty folder still there

### Requirement: Worktree archive
With `vcs.enabled` on and a change that sits in a tree naming its folder,
`archive` SHALL, after the move and the ticked task lines, commit the
archive in that tree as TypeScript's `commitWorktreeArchive` does. With a
`GitVcs` at the tree's root with the config's `timeouts`, it takes every
`path` and every `from` of rust-vcs `status` that equals, or lies under, the
change folder's old path, `openspec/changes/archive` or `openspec/specs`,
each relative to the tree's root with `/`, sorted and without repeats, and
commits them with rust-vcs `commit`, the author `vcs.author`, and the
message made of these lines, each followed by a newline:

- `osq: <id> archived`
- an empty line
- the change's rust-storage `read_change` `title`, or an empty line when it has none
- `archived to <archive path>`
- an empty line
- `Osq-Change: <folder>`

`<id>` is the folder's leading digits, or the whole folder name when it
has none, and `<archive path>` the archived folder's path relative to the
tree's root with `/`. The `Output` text SHALL then be
`<archive path> on osq/<folder>`.

When the commit fails, `archive` SHALL leave the archived folder and the
living specs as they are, record the failure in the archived folder as
TypeScript's `haltWorktreeChange` does for a `commit_failed` halt, and fail
with `osq could not commit the archive of <folder>: <error>`, `<error>`
being the `VcsError`'s display. The record's detail is git's output, the
`output` of `VcsError::Failed` or the display of any other `VcsError`, cut
as TypeScript's `tailVerifyOutput` cuts it with `limits.markerOutputLines`
and `limits.markerLineChars` from the config. `archive` SHALL write
`.run/regressed/change.md` holding `---\nreason: commit_failed\n---\n<detail>\n`,
creating its folder, then append to `.run/events/change.jsonl` one
`regressed` event with the data `task` `change`, `reason` `commit_failed`
and `output` the detail, through rust-core's `Envelope` and `event_line`,
with the current time in ISO 8601 UTC to the millisecond. Both stay
uncommitted. A record that cannot be written leaves the error as it is.

A change in the project root, with vcs on or off, SHALL be archived with
no git call after the lookup, and its `Output` text stays the archived
folder's path.

#### Scenario: Worktree archive equals TypeScript's
- **WHEN** a test builds the scratch repository `openspec/changes/295-rust-archive-worktree/golden/print-archive-worktree-goldens.mjs.txt` describes for the row's case, from `tests/fixtures/project`, and runs `archive` with the argument `007` on `<scratch>/repo`
- **THEN** it gives an `Output` with the row's text, and the row's tree gives, after `name: ` and the archived folder's name, the same `tip:`, `commit:` and `status:` lines as the row's golden in `tests/fixtures/worktree-golden/`, a copy of `openspec/changes/295-rust-archive-worktree/golden/`; for the `worktree` case, the files under the tree's `openspec/` are also exactly the files under `tests/golden/project/openspec/`, each byte for byte:

| Case | Tree | Output text | Golden |
|---|---|---|---|
| `worktree` | `<scratch>/trees/007-sample` on `osq/007-sample` | `openspec/changes/archive/007-sample on osq/007-sample` | `worktree-007.txt` |
| `taken` | `<scratch>/trees/007-sample` on `osq/007-sample` | `openspec/changes/archive/007-sample-1 on osq/007-sample` | `taken-007.txt` |
| `root` | `<scratch>/repo` on `main` | `openspec/changes/archive/007-sample` | `root-007.txt` |

#### Scenario: Worktree archive commit fails
- **WHEN** a test builds the scratch repository of the `hook-fails` case, whose `pre-commit` hook prints `refused by hook` and exits 1, and runs `archive` with the argument `007` on `<scratch>/repo`
- **THEN** it gives a `Failed` error whose display starts with `archive failed: osq could not commit the archive of 007-sample: ` and contains `refused by hook`, and `<scratch>/trees/007-sample` on `osq/007-sample` gives the same `name:`, `tree:`, `tip:`, `commit:` and `status:` lines as `archive-fails-007.txt` in `tests/fixtures/commit-failed-golden/`, a copy of `openspec/changes/310-rust-archive-commit-failed/golden/`, written as that folder's script writes them, each event's `timestamp` written `<timestamp>`

#### Scenario: Config that does not load
- **WHEN** a test writes `osq.toml` holding `[vcs]`, `enabled = true`, each followed by a newline, to a fresh scratch copy of `tests/fixtures/project`, and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error displayed `archive failed: ` followed by the display of the error rust-config `load_config` gives for that copy, and every other file and folder of the copy is the fixture's, byte for byte
