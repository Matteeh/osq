# rust-approve Specification

## Purpose
The approve feature: a human seals a change folder after its gates pass, and only approve, after the hash check, makes an approved change. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/approve/** -->
The rust-approve capability SHALL own the `osq-feature-approve` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Approve crate ownership
- **WHEN** file ownership is resolved for the approve feature
- **THEN** system maps `crates/features/approve/**` to rust-approve

### Requirement: Approve feature
`osq-feature-approve` SHALL expose one public item, the unit struct
`ApproveFeature`, which implements rust-core's `Feature`, holds no storage
connection, as ADR 028 says, and derives `Clone`, `Copy`, `Debug` and
`Default`. Its `name` SHALL be `approve`, and its `commands` SHALL be exactly
one `Command` named `approve`, with the summary
`lint, hash, and approve change folders` and the usage `<id>`.

#### Scenario: Approve feature commands
- **WHEN** a test reads `ApproveFeature`'s name and commands
- **THEN** the name is `approve`, and the commands are one command with the name `approve`, the summary `lint, hash, and approve change folders` and the usage `<id>`

### Requirement: Approve arguments
`ApproveFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `approve`, and
`FeatureError::usage("approve", "expected one change id, got <n>")` for an
`approve` invocation with `n` arguments when `n` is not 1, before it reads
any file. Every other failure of `approve` SHALL be `FeatureError::failed`
with the command `approve` and the message the other approve requirements
name.

#### Scenario: Approve argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `approve` with no args | `Usage` error displayed `usage of approve: expected one change id, got 0` |
| `approve` with args `1`, `2` | `Usage` error displayed `usage of approve: expected one change id, got 2` |
| `queue` with args `1` | `UnknownCommand` error displayed `unknown command: queue` |

### Requirement: Approve lookup
`approve` SHALL approve the first active change folder in rust-storage
`list_changes` order whose name matches the query as TypeScript's
`matchesFolder` in `src/core/status/change-locations.ts` matches it: with
`trimmed` the query without surrounding whitespace, and `padded` the value
of `trimmed`'s leading ASCII digits padded with zeros to three digits when
`trimmed` starts with one, or else `trimmed`, a folder matches when its name
equals `trimmed` or `padded`, or starts with `trimmed` followed by `-` or
`padded` followed by `-`. With no match, `approve` SHALL fail with
`Spec "<query>" not found in <changes>`, where `<query>` is the argument as
given and `<changes>` is the root joined with `openspec/changes`, shown with
`display()`. Archived and rejected folders never match.

#### Scenario: Approved folder for a query
- **WHEN** `approve` runs with the row's query on a root whose active change folders are `001-alpha`, `012-beta`, `012-beta-two` and `x-y`, and whose archived folder is `003-gamma`, each a valid change folder
- **THEN** it approves the row's folder, writing its `.run/approved`, and no other folder gains one, or it gives the row's `Failed` error, where `<changes>` is the root joined with `openspec/changes`:

| Query | Result |
|---|---|
| `1` | `001-alpha` |
| `001` | `001-alpha` |
| `  1  ` | `001-alpha` |
| `001-alpha` | `001-alpha` |
| `12` | `012-beta` |
| `012-beta-two` | `012-beta` |
| `x` | `x-y` |
| `x-y` | `x-y` |
| `3` | `Spec "3" not found in <changes>` |
| `alpha` | `Spec "alpha" not found in <changes>` |

### Requirement: Steering refusal
Before it validates or writes anything, `approve` SHALL read the change with
rust-storage `read_change`, failing with the `StorageError`'s display when
it cannot, and SHALL refuse an approved change, one whose snapshot is
`approved`, that has a steering trigger, as TypeScript's `deriveSteering` in
`src/core/status/steering.ts` gives them from the same marker facts:

- The change's trigger comes from `change_regressed`: the reason
  `sync_conflict` gives `change conflict (sync_conflict)`,
  `requirement_changed` gives `change requirement_changed (requirement_changed)`,
  and `verify_red`, `verify_path_missing` and `sync_verify_red` give
  `change regression (<reason>)`; any other reason gives none.
- Then each task in task order: a regressed marker gives
  `task <n> regression (<reason>)`, except one with the reason
  `scope_regression` whose `verification_passed` is true, which gives none;
  otherwise a done task gives none; otherwise a dead marker with the reason
  `blocked` or `entry_missing` gives `task <n> blocked (<reason>)`, one
  whose `stuck` is true gives `task <n> stuck (<reason>)`, and any other
  gives none.

The refusal SHALL be
`Change <folder> needs steering: <triggers joined by ", ">. Rust approve does not retire steering triggers yet.`
and SHALL write nothing. An unapproved change has no steering trigger.

#### Scenario: Steering triggers
- **WHEN** `approve` runs with the query `1` on a root whose one active change folder `001-a` is a valid change folder holding `tasks/1.md` and `tasks/2.md`, with the row's files under `.run/`, each marker's frontmatter written as the row gives it
- **THEN** it gives the row's `Failed` message and `.run/approved` keeps its bytes, or, where the row says approved, it gives an `Output` and `.run/approved` holds the folder's seal:

| Files under `.run/` | Result |
|---|---|
| `approved`, `regressed/change.md` with `reason: sync_conflict` | `Change 001-a needs steering: change conflict (sync_conflict). Rust approve does not retire steering triggers yet.` |
| `approved`, `regressed/change.md` with `reason: requirement_changed` | `Change 001-a needs steering: change requirement_changed (requirement_changed). Rust approve does not retire steering triggers yet.` |
| `approved`, `regressed/change.md` with `reason: verify_path_missing` | `Change 001-a needs steering: change regression (verify_path_missing). Rust approve does not retire steering triggers yet.` |
| `approved`, `regressed/change.md` with `reason: worktree_dirty` | approved |
| `approved`, `regressed/1.md` with `reason: scope_regression` | `Change 001-a needs steering: task 1 regression (scope_regression). Rust approve does not retire steering triggers yet.` |
| `approved`, `regressed/1.md` with `reason: scope_regression` and `verification_passed: true` | approved |
| `approved`, `dead/1.md` with `reason: blocked` | `Change 001-a needs steering: task 1 blocked (blocked). Rust approve does not retire steering triggers yet.` |
| `approved`, `dead/1.md` with `reason: entry_missing` | `Change 001-a needs steering: task 1 blocked (entry_missing). Rust approve does not retire steering triggers yet.` |
| `approved`, `dead/1.md` with `reason: verify_red` and `stuck: true` | `Change 001-a needs steering: task 1 stuck (verify_red). Rust approve does not retire steering triggers yet.` |
| `approved`, `dead/1.md` with `reason: verify_red` | approved |
| `approved`, `done/1` and `dead/1.md` with `reason: blocked` | approved |
| `dead/1.md` with `reason: blocked`, no `approved` | approved |
| `approved`, `regressed/change.md` with `reason: verify_red`, `dead/2.md` with `reason: blocked` | `Change 001-a needs steering: change regression (verify_red), task 2 blocked (blocked). Rust approve does not retire steering triggers yet.` |

### Requirement: Approve validation
After the steering check, `approve` SHALL validate the change with
rust-specs `validate_change`, with the change folder and the root joined
with `openspec/specs`, and, only when that gives no finding,
`validate_merged_change` with the same folders. With any finding, or a
`MergeChangeError` from the merged validation, `approve` SHALL fail with
`Lint failed for spec "<folder>":` followed, for each finding in order, by
a newline and `  - <file>:<line>: <message>`, or, for a merge error, by a
newline and `  - ` and the error's display, and SHALL write nothing. A
`SpecsError` from `validate_change` SHALL fail with its display. This is
TypeScript's lint refusal in `approveSpec` over the checks the specs kernel
runs; the rest of `osq lint`'s rules are not run.

#### Scenario: Validation refusals
- **WHEN** `approve` runs with the query `1` on a root whose living spec `openspec/specs/alpha/spec.md` is a copy of `tests/fixtures/approve-repo/openspec/specs/alpha/spec.md`, and whose one active change folder `001-a` holds a `proposal.md` and the row's delta
- **THEN** it gives a `Failed` error for the command `approve` with the row's message, written with `\n` escapes, where `<d>` is the root joined with `openspec/changes/001-a`, and `001-a` gains no `.run/approved`:

| Delta | Message |
|---|---|
| none | `Lint failed for spec "001-a":\n  - <d>/proposal.md:1: the change holds no delta spec` |
| `specs/alpha/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha rests\nThe system rests alpha.\n\n#### Scenario: Alpha rests\n- **WHEN** alpha stops\n- **THEN** alpha rests\n` | ``Lint failed for spec "001-a":\n  - <d>/specs/alpha/spec.md:3: requirement `Alpha rests` states no SHALL or MUST`` |
| `specs/alpha/spec.md` holding `## MODIFIED Requirements\n\n### Requirement: Beta runs\nThe system SHALL run beta.\n\n#### Scenario: Beta runs\n- **WHEN** beta starts\n- **THEN** beta runs\n` | ``Lint failed for spec "001-a":\n  - <d>/specs/alpha/spec.md:3: the delta names `Beta runs`, which the living spec has no requirement for`` |
| `specs/alpha/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha runs\nThe system SHALL run alpha.\n\n#### Scenario: A\n- **WHEN** a\n- **THEN** a\n` | `Lint failed for spec "001-a":\n  - <d>/specs/alpha/spec.md: alpha ADDED failed for header "### Requirement: Alpha runs" - already exists` |

### Requirement: Approval marker
When every check passes, `approve` SHALL write `<seal>` and a newline to the
change folder's `.run/approved`, creating `.run/` when it is missing, where
`<seal>` is the seal rust-storage `change_folder_seal` gives for the folder,
as TypeScript's `approveInPlace` and `writeApprovalSeal` write it. It SHALL
write the marker whether or not the change was approved before, as
TypeScript does, and SHALL leave every other file in the change folder as
it is. A `StorageError` from the seal SHALL fail with its display. It SHALL
then return as its output `Approved <id> (<folder>)`, a newline,
`  Hash: <seal>` and a newline, where `<id>` is the folder's leading
digits, or its whole name when it has none.

#### Scenario: Approval markers
- **WHEN** `approve` runs with the query `1` on a root whose one active change folder `001-a` is a valid change folder, with the row's files
- **THEN** it gives the output `Approved 001 (001-a)\n  Hash: <seal>\n`, written with `\n` escapes, its `.run/approved` holds `<seal>` and a newline, where `<seal>` is the seal `change_folder_seal` gives for `001-a` after the run, and every other row file keeps its bytes:

| Files |
|---|
| none, and no `.run/` folder |
| `.run/approved` holding `sha256:` and 64 `0`, `.run/done/1` and `.run/events/1.jsonl` holding one `started` event |
| `.run/approved` holding the folder's current seal and a newline |
| `plan-prompt.md` and `notes/why.md` |

#### Scenario: Output for a folder without a number
- **WHEN** `approve` runs with the query `x-y` on a root whose one active change folder `x-y` is a valid change folder
- **THEN** the output is `Approved x-y (x-y)\n  Hash: <seal>\n`, written with `\n` escapes, where `<seal>` is the seal `change_folder_seal` gives for `x-y`

### Requirement: TypeScript approval parity
The `.run/approved` marker `approve` writes SHALL equal, byte for byte, the
one TypeScript's `approveSpec` writes under `DEFAULT_CONFIG` for the same
change folder, whose lint passes.

#### Scenario: Golden approvals
- **WHEN** `approve` runs with the query `1` and then with the query `002-gamma` on a fresh scratch copy of `tests/fixtures/approve-repo`, whose change `001-alpha-twice` modifies a requirement of the living `alpha` spec and holds a root `plan-prompt.md`, and whose change `002-gamma` adds the capability `gamma`, holds `notes/why.md` and an older `.run/approved`
- **THEN** each run gives an `Output`, and each folder's `.run/approved` equals `tests/fixtures/approve-markers/<folder>.approved`, which TypeScript wrote for the same fixture, byte for byte:

| Folder | Marker |
|---|---|
| `001-alpha-twice` | `sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1` |
| `002-gamma` | `sha256:49b75cb4fb4c7919d8d8cefc32d6741e12571819b450b5f5033840c8dce4f715` |
