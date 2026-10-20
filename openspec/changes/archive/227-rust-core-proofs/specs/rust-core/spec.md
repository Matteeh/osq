## MODIFIED Requirements

### Requirement: Change typestate
A change SHALL be a `Change<S>` whose state type `S` is `Draft`, `Approved` or
`Archived`, holding its id and its task ids. `Change::draft(id, tasks)` SHALL
be the only public constructor. `Change<Draft>::approve(recorded, computed)`
SHALL be the only way to get a `Change<Approved>`, and
`Change<Approved>::archive(&state)` the only way to get a `Change<Archived>`.
`approve` SHALL take `recorded` as a `Seal` and `computed` as a
`ComputedSeal`, which only `compute_seal` creates, so approving without
hashing does not compile. `next_task` and `archive` SHALL exist only on
`Change<Approved>`, so code that calls them on a draft, or builds an approved
or archived change by hand, does not compile.

- `approve` SHALL return the approved change holding the seal when `recorded`
  equals the computed seal, and `ApproveError::SealMismatch` with the
  recorded seal and the computed seal as a `Seal` otherwise.
- `next_task(&state)` SHALL return the lowest pending task id in `TaskId`
  order when `change_status(true, &state)` is `Pending`, and none otherwise.
- `archive(&state)` SHALL return the archived change when
  `change_status(true, &state)` is `Done`, and `ArchiveError::NotDone` with
  that status otherwise.
- `id` and `tasks` SHALL give back the id and the task ids the draft was
  built with, in every state.

#### Scenario: Approve checks the seal
- **WHEN** a draft change is approved with each recorded seal below, and as the computed seal `compute_seal` of the one entry `proposal.md`: `a\n`, which is `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd`
- **THEN** the result is as given:

| Recorded | Result |
|---|---|
| `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` | `Change<Approved>` holding that seal |
| `sha256:` followed by 64 `a` | `SealMismatch` with the recorded seal and `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` |

#### Scenario: Next task of an approved change
- **WHEN** the next task is asked of an approved change with tasks `10`, `2` and `1` in each state below
- **THEN** it is as given:

| Change record | Tasks | Next task |
|---|---|---|
| new | all `Pending` | `1` |
| new | `1` `Done`, `2` and `10` `Pending` | `2` |
| new | `1` `Running`, `2` and `10` `Pending` | none |
| new | `1` `Dead`, `2` and `10` `Pending` | none |
| new | all `Done` | none |
| regressed | all `Pending` | none |

#### Scenario: Archive needs a done change
- **WHEN** an approved change with tasks `1` and `2` is archived in each state below
- **THEN** the result is as given:

| Change record | Tasks | Result |
|---|---|---|
| new | both `Done` | `Change<Archived>` |
| new | `1` `Done`, `2` `Pending` | `NotDone` with `Pending` |
| regressed | both `Done` | `NotDone` with `Regressed` |

#### Scenario: Gates cannot be skipped
- **WHEN** code outside the crate builds a `Change<Approved>` or a `Change<Archived>` without `approve` or `archive`, calls `next_task` or `archive` on a `Change<Draft>`, passes a `Seal` as the computed seal of `approve`, builds a `ComputedSeal` by hand, builds a `ChangeState` by hand, or writes a `ChangeState`'s record or tasks
- **THEN** it does not compile

#### Scenario: A change keeps its id and tasks
- **WHEN** `Change::draft("204-rust-core", [1, 2])` is read as a draft, then approved with the seal `compute_seal` gives for its entries as both the recorded and the computed seal and read, then archived with both tasks `Done` and read
- **THEN** each time `id` is `204-rust-core` and `tasks` is `1`, `2`

### Requirement: Seal computation
`compute_seal` SHALL give, without IO, the seal that `hashChangeFolder`
gives for a folder holding exactly the given entries of relative path and
bytes, as a `ComputedSeal`. Content SHALL be decoded as JavaScript decodes UTF-8, with CRLF turned
into LF and, in `tasks.md` alone, checkboxes reset as `normalizeTasksMd` does.
Entries SHALL be ordered by path in UTF-16 code unit order. `compute_seal`
SHALL be the only way to get a `ComputedSeal`, whose `as_str` gives the
seal's text and whose `seal` gives it as a `Seal`.

#### Scenario: Seals of entries
- **WHEN** `compute_seal` runs on the entries of each row below, written as `path`: content
- **THEN** the seal is as given:

| Entries | Seal |
|---|---|
| none | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `proposal.md`: `a\n` | `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd` |
| `a.md`: `x\r\ny\r\n` | `sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241` |
| `a.md`: `x\ny\n` | `sha256:84e73026f37063934c900dfa2c1ecf3f8fdebffc3b1483d78a2275a21b248241` |
| `tasks.md`: `- [x] 1. a\n  - [X] 2. b\n` | `sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a` |
| `tasks.md`: `- [ ] 1. a\n  - [ ] 2. b\n` | `sha256:c66367cc16aa800f014845d20689fc87356ebee7053a9dfd46653693529a011a` |
| `notes/tasks.md`: `- [x] 1. a\n` | `sha256:fa65172b5ab5cee5da25838e4c968ded29d7a4837aa65283758225af2586088f` |
| `tasks.md`: U+00A0 then `- [x] a\n` | `sha256:ba2854b7aadd6685d64d1624f7b144e4b5e5d69e017060244b846491ef0b304b` |
| `tasks.md`: U+0085 then `- [x] a\n` | `sha256:52902fea6a1daefdb3316706390ca2fc5a816709f0eb28a514aacc0a31f007d0` |
| `b.bin`: the bytes `FF FE 41` | `sha256:f2859d36ed56daac01133dde3da6a05522a65da80d2fe1659fd1cf64716c8ac8` |

#### Scenario: JavaScript path order
- **WHEN** `compute_seal` runs on `a-｡.md` (U+FF61): `2\n` and `a-😀.md` (U+1F600): `1\n`, given in that order and again in the reverse order
- **THEN** both seals are `sha256:f47bbfc7ba5286ec24f4ddf82d9bf58771d785ef0b0806c45b8e4ca2ff469938`, the seal of UTF-16 order, and neither is `sha256:e5c08cd78230313694389dde3ad3ff879ccbdf90e1e3c5b738ea76dcf9328e79`, the seal of byte order

#### Scenario: Computed seal reads back
- **WHEN** `compute_seal` runs on the one entry `proposal.md`: `a\n`
- **THEN** its `as_str` is `sha256:0dde7716d600b92d32148bafc60a3111581ee9c4836ae6925c584dcaac2ab9bd`, and its `seal` equals `Seal::parse` of that text

### Requirement: Change fold
`apply_change(record, &event)` SHALL be a pure function that returns the next
`ChangeRecord` of a change stream: whether the change is regressed, the
archive path once archived, and the reason once rejected. A new record is not
regressed, archived or rejected. `apply(state, &stream, &event)` SHALL return
the next `ChangeState`, which holds the change record and one `TaskState` per
task id: a task stream's event goes to `apply_task` for that task, adding the
task as new when the state lacks it, a change stream's event goes to
`apply_change`, and a validator stream's event leaves the state unchanged. An
event type not in the table below leaves the change record unchanged.
A `ChangeState`'s fields SHALL be private: `record()` and `tasks()` read
them, and a state SHALL come only from `ChangeState::new` and `apply`.

| Event | Next record |
|---|---|
| `regressed` with `task` `change` | regressed |
| `retry` with `target` `change` | not regressed |
| `archived` | archived at `data.archivePath` |
| `rejected` | rejected with `data.reason` |

#### Scenario: Change transitions
- **WHEN** each event below is applied to a new change record
- **THEN** the record after it is as given:

| Event data | Record after |
|---|---|
| `regressed` `{"task":"change","reason":"land_conflict"}` | regressed |
| `archived` `{"archivePath":"openspec/changes/archive/204-rust-core"}` | archived at `openspec/changes/archive/204-rust-core` |
| `rejected` `{"reason":"wrong idea"}` | rejected with `wrong idea` |
| `synced` `{"defaultBranch":"main","commits":2,"duration":300}` | unchanged |
| `verify_ran` `{"command":"cargo test"}` | unchanged |

#### Scenario: Retry clears a change regression
- **WHEN** `retry` `{"target":"change","reason":"human","attempt":1}` is applied to a regressed change record
- **THEN** the record is not regressed

#### Scenario: Task regressions and retries leave the change record
- **WHEN** each event below is applied to the record before it
- **THEN** the record after it is as given:

| Record before | Event data | Record after |
|---|---|---|
| new | `regressed` `{"task":"1","reason":"scope_changed"}` | not regressed |
| regressed | `retry` `{"target":"1","reason":"human","attempt":2}` | regressed |

#### Scenario: Events reach their stream's state
- **WHEN** a change state with tasks `1` and `2` applies `started` `{"attempt":1}` from the task `2` stream, then `regressed` `{"task":"change"}` from the change stream, then `validator_ran` from the validator stream
- **THEN** task `1` is `Pending`, task `2` is `Running` with attempt 1, and the change record is regressed

#### Scenario: An unknown task stream adds its task
- **WHEN** a change state with task `1` applies `started` `{"attempt":1}` from the task `3` stream
- **THEN** the state holds tasks `1` and `3`, and task `3` is `Running` with attempt 1

#### Scenario: Folded state reads back
- **WHEN** `ChangeState::new([1])` applies `started` `{"attempt":1}` from the task `1` stream, then `archived` `{"archivePath":"openspec/changes/archive/204-rust-core"}` from the change stream
- **THEN** `tasks()` holds only task `1`, `Running` with attempt 1, and `record()` is archived at `openspec/changes/archive/204-rust-core`, not regressed and not rejected
