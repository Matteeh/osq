## MODIFIED Requirements

### Requirement: Run refusals
Before it writes anything, `run` SHALL load `osq.toml`, then find the first
active change matching the id as rust-approve "Approve lookup" does, and
refuse with `FeatureError::failed("run", ..)` and the text "Run refusal
texts" gives: a config error, no matching change, no `tasks/<task>.md`, an
executor harness other than `pi`, and a root outside git. For a change in
an osq worktree it then runs "Commit catch-up" and "Worktree checks".
It then refuses, with the texts "Run refusal texts" gives, a task holding
`.run/done/<task>`, `.run/dead/<task>.md` or `.run/regressed/<task>.md`,
and a lock another run holds. When rust-core `parse_change_id` refuses the
id, the no-matching-change refusal SHALL have the `ChangeIdError`'s
display as its text.

#### Scenario: Run refusal texts
- **WHEN** `run` runs with the arguments `1`, `1` on a copy of the run fixture made as "Run outcomes" says, changed as the row says
- **THEN** it fails with the row's text after `run failed: `, and the change folder's files and the git status are as they were before the run:

| Change | Text |
|---|---|
| `osq.toml` holds `[vcs]` with `enabled = "yes"` | `vcs.enabled must be a boolean` |
| arguments `9`, `1` | `Spec "9" not found in <root>/openspec/changes` |
| arguments `1`, `7` | `Task 7 not found in 001-a` |
| `osq.toml` names the executor harness `claude` | `Rust run supports only the pi harness, not claude` |
| `.git` removed | `Rust run needs a git repository at <root>` |
| `.run/done/1` exists | `Task 1 of 001-a is done; nothing to run` |
| `.run/dead/1.md` exists | `Task 1 of 001-a is dead; nothing to run` |
| `.run/regressed/1.md` exists | `Task 1 of 001-a is regressed; nothing to run` |
| `.run/running/1.pid` exists | `Task 1 of 001-a is already running` |

#### Scenario: Run refuses an id that is not a change id
- **WHEN** `run` runs with the row's arguments on a copy of the run fixture made as "Run outcomes" says
- **THEN** it fails with the row's text after `run failed: `, and the change folder's files and the git status are as they were before the run:

| Arguments | Text |
|---|---|
| `1]`, `1` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `001-a-x`, `1` | `Spec "001-a-x" not found in <root>/openspec/changes` |
