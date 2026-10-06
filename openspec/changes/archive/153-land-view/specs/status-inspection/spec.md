## ADDED Requirements

### Requirement: Land view model
`readLandView(projectRoot, details, config)` in
`src/core/status/show-land-model.ts` SHALL return null unless
`details.location` is `archived`, and otherwise a `LandView` built only from
files and refs osq already writes. It SHALL write nothing.

`gates` SHALL list the gate runs of the archive: of the events in
`details.timeline` at or before the last `archived` event's timestamp, for
each numbered task stream in task order the last `verify_ran` event without a
`phase` (kind `task`), then the last `change` stream `verify_ran` whose
command is the proposal's `verify` (kind `verify`), then, when the proposal
declares `check:`, the last whose command is that check (kind `check`), then
the last `validator_ran` (kind `validator`). A gate SHALL carry its command
(`<harness>/<model>` for the validator), its outcome (`passed` for exit code
0, `failed` otherwise, and the validator's own outcome), its exit code, its
recorded `duration` in seconds, its timestamp, and for the validator the
number of findings. A change without an `archived` event SHALL have no gates.

`capabilities` SHALL be the `capabilities` of `readArchivedChange` for the
change. `disclosures` SHALL hold, from `readChangeDisclosures`, each task with
a `## Deviated` or `## Outside scope` section and those two texts. `halt`
SHALL be the change-level `.run/regressed/change.md` marker's `reason` and
body, null without one; `lastSync` and `lastSyncStop` SHALL be what
`readLastSync` reads, null when absent.

With git off, `landed`, `defaultBranch`, `mainCommits` and `diff` SHALL be
null. Otherwise `defaultBranch` SHALL be the port's default branch and
`landed` SHALL be true exactly when `readDependencyState` says `landed`.
`mainCommits` SHALL be `countCommits(osq/<folder>, <default branch>)` for a
change that has not landed and whose `osq/<folder>` branch exists, else null.
`diff` SHALL be `diffStat(<default branch>, osq/<folder>,
[<openspec root>])` when the branch exists, else null. No value SHALL be
estimated.

#### Scenario: Default branch moved after archive
- **WHEN** an archived change's `osq/` branch is two commits behind the default branch
- **THEN** `landed` is false and `mainCommits` is 2

#### Scenario: Landed change
- **WHEN** the default branch holds the change's archive folder
- **THEN** `landed` is true and `mainCommits` is null

#### Scenario: Gates at archive
- **WHEN** an archived change's task 1 stream holds a `pre_spawn` `verify_ran` and two later `verify_ran` events, and `change.jsonl` holds two `verify_ran` events of the proposal's verify, a `validator_ran` with one finding, `archived`, then a sync's `verify_ran`
- **THEN** `gates` holds task 1's last pre-archive run, the second proposal verify, and the validator with 1 finding, and no gate after `archived`

#### Scenario: Active change
- **WHEN** `readLandView` is given an active or rejected change
- **THEN** it returns null

#### Scenario: Git off
- **WHEN** the project has no git
- **THEN** `landed`, `defaultBranch`, `mainCommits` and `diff` are null and `gates`, `capabilities` and `disclosures` are still read

### Requirement: Land in show
For an archived change `SpecDetails` SHALL carry `land`, the `readLandView`
result, so `osq show --json` carries it before `digest`. `osq show` SHALL
print it after the change detail, rendered by
`src/core/status/show-land-lines.ts`, which reads no files:

- a blank line, then the headline: `Land: landed`; `Land: git is off`;
  `Land: not landed; <branch> has <n> new commits since archive, so osq land
  will sync and verify again`; `Land: not landed; <branch> has not moved since
  archive`; or `Land: not landed; branch osq/<folder> not found`, with
  `commit` for one commit
- `  Gates at archive:`, then one line per gate:
  `    <name>: <outcome> in <s>s (<command>)`, where `<name>` is `task <n>`,
  `verify`, `check` or `validator`, `<s>` is the duration rounded to whole
  seconds, a failed gate adds ` exit <code>` after its outcome, and the
  validator adds `, <n> findings`; or `  Gates at archive: none recorded`
- `  Diff: <files> files, +<added> -<removed>` when `diff` is set
- `  Spec changes:`, then `    <capability>: <a> added, <m> modified, <r>
  removed, <n> renamed` per capability, when there is any
- `  Disclosures: task <n> deviated, task <n> outside scope` naming each
  section present, when there is any
- `  Halted: <reason>: <first line of the message>` when `halt` is set, and
  `  Sync stopped: <reason>: <first line of the message>` when `lastSyncStop`
  is set

An active or rejected change SHALL have no `land` and print no `Land:` line.

#### Scenario: Show prints the land summary
- **WHEN** `osq show` runs on an archived change whose branch is 2 commits behind `main`
- **THEN** it prints `Land: not landed; main has 2 new commits since archive, so osq land will sync and verify again` and a `Gates at archive:` line

#### Scenario: Active change unchanged
- **WHEN** `osq show` runs on an active change
- **THEN** it prints no `Land:` line and `--json` has no `land` key
