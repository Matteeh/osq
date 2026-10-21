# Spec Delta: rust-storage

## ADDED Requirements

### Requirement: Marker facts
`read_change(entry)` SHALL also read what a change's `.run/` markers say,
as TypeScript's `readChangeFolder` and the inbox read them. Each `TaskFile`
SHALL hold `markers: TaskMarkers`, and the `ChangeSnapshot` SHALL hold
`change_regressed: Option<HaltMarker>`, read from
`.run/regressed/change.md`.

- `TaskMarkers` holds `dead: Option<HaltMarker>` from
  `.run/dead/<n>.md`, `regressed: Option<HaltMarker>` from
  `.run/regressed/<n>.md`, `lock: Option<RunningLock>` from
  `.run/running/<n>.pid`, and `blocked: Option<String>`, the `## Blocked`
  section `parse_result_sections` gives for `.run/results/<n>.md`, where
  `<n>` is the task id. A task with none of these files holds the
  `Default` markers: all four `None`.
- `HaltMarker` holds `reason: String`, `stuck: bool`,
  `verification_passed: bool` and `entries: Vec<String>`. A marker file
  that exists always gives a `HaltMarker`, even when it cannot be read or
  parsed. `reason` is the frontmatter's `reason` when it is a string, else
  empty text. `stuck` and `verification_passed` are true only when the
  frontmatter's `stuck` and `verification_passed` are the boolean `true`.
  `entries` holds, in order, the text after a leading `-` and whitespace on
  each line of the body after the frontmatter, trimmed, for every such line
  whose text is not empty.
- `RunningLock` holds `pid: u64` and `started_at_ms: i64`, read from a
  lock file holding a JSON object whose `pid` is a whole number of at least
  0 and whose `startedAt` is a whole number. Any other lock file, or one
  that cannot be read, gives `None`.
- Marker files whose name is not `<task id>.md` or `<task id>.pid`, such as
  `3.1.md` for an earlier attempt, belong to no task.

Frontmatter is split and parsed only through the specs kernel's
`parse_frontmatter`. Tests build each change folder below under
`CARGO_TARGET_TMPDIR`, since `.run/running/` and `*.pid` files are not
committed.

#### Scenario: Markers of a halted change
- **WHEN** `read_change` reads an active change folder `050-halted` with task files `1.md` to `5.md` and these files: `.run/dead/1.md` with frontmatter `reason: blocked` and body `Blocked.`; `.run/results/1.md` holding `## Blocked`, a blank line and `Need the key.`; `.run/dead/2.md` with frontmatter `reason: timeout`, `fingerprint: sha256:2` and `stuck: true`, and body lines `Timed out:`, `- a.rs`, `-   b.rs  `, `- ` and `c.rs`; `.run/regressed/3.md` with frontmatter `reason: scope_regression` and `verification_passed: true`; `.run/regressed/change.md` with frontmatter `reason: verify_red`; `.run/running/4.pid` holding `{"pid":4242,"startedAt":1760000000000}`; `.run/dead/5.md` holding only `crashed` with no frontmatter; and `.run/dead/3.1.md` with frontmatter `reason: crashed`
- **THEN** the snapshot's markers are:

| Marker | Value |
|---|---|
| task `1` dead | reason `blocked`, stuck false, verification passed false, entries none |
| task `1` blocked | `Need the key.` |
| task `2` dead | reason `timeout`, stuck true, verification passed false, entries `a.rs`, `b.rs` |
| task `3` regressed | reason `scope_regression`, stuck false, verification passed true, entries none |
| task `3` dead | `None` |
| task `4` lock | pid 4242, started at 1760000000000 |
| task `5` dead | reason empty, stuck false, verification passed false, entries none |
| task `5` lock | `None` |
| change regressed | reason `verify_red`, stuck false, verification passed false, entries none |

#### Scenario: Markers that do not read
- **WHEN** `read_change` reads an active change folder `051-odd` with task files `1.md` to `4.md` and these files: `.run/dead/1.md` with frontmatter `reason: 7` and `stuck: "yes"`; `.run/running/2.pid` holding `not json`; `.run/running/3.pid` holding `{"pid":"9","startedAt":1}`; and `.run/running/4.pid` holding `{"pid":9,"startedAt":1.5}`
- **THEN** task `1`'s dead marker has reason empty and stuck false, tasks `2`, `3` and `4` have no lock, task `1` has no lock and no blocked section, and the change has no regressed marker

### Requirement: Planning facts
`read_change(entry)` SHALL also say whether the folder holds a proposal and
a brief, and what its proposal's human steps ask before approval, as
TypeScript's next step reads them. The `ChangeSnapshot` SHALL hold
`proposal: bool`, whether `proposal.md` exists; `brief: bool`, whether
`brief.md` exists; and `before_approval: Option<String>`.

`before_approval` reads the proposal's body after its frontmatter, as
TypeScript's `parseHumanSteps` does. The `## Human steps` section is the
text after its heading line, matched in any case, up to the next line
starting `## ` or the end. Its lines from a `### Before approval` heading,
matched in any case, up to a `### After landing` heading form the part
before approval, and lines before the first of these headings belong to
neither part here. The part, trimmed, is `None` when it is empty or reads
`None` or `None.` in any case, and otherwise is that trimmed text.
`before_approval` is `None` without a proposal or a `## Human steps`
section.

#### Scenario: Planning facts of change folders
- **WHEN** `read_change` reads the active change folders below
- **THEN** each snapshot holds the row's facts:

| Folder | Files | proposal | brief | before_approval |
|---|---|---|---|---|
| `060-steps` | `proposal.md` whose body holds `## Human steps`, `### Before approval`, `- Set the key.`, `### After landing` and `None`; `brief.md` | true | true | `- Set the key.` |
| `061-none` | `proposal.md` whose body holds `## human steps`, `### before approval` and `None.` | true | false | `None` |
| `062-after` | `proposal.md` whose body holds `## Human steps`, `Tell the team.`, `### After landing` and `- Ship it.`, then `## Delta` and `### Before approval` and `- Not a step.` | true | false | `None` |
| `063-bare` | `brief.md` only | false | true | `None` |
