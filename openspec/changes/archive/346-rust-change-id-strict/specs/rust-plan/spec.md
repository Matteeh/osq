## MODIFIED Requirements

### Requirement: Steering lookup
`plan <id>` SHALL read the root's config with rust-config `load_config` and
list the changes it may steer. With `vcs.enabled` off, they are rust-storage
`list_changes` of the root. With it on, they are rust-storage
`list_tree_changes` of rust-storage `change_trees` of the root, with one
candidate per entry of rust-vcs `worktree_list` of a `GitVcs` at the root
with the config's `timeouts`, and no stacked folders. A change is matched
when rust-core `parse_change_id` reads the id with `slug` false into an id
that names its folder, as rust-core "Change ids" says, and read with
rust-storage `read_change`. An id `parse_change_id` refuses matches no
change; for `plan <name> --brief <file>` it is then a name for a new
change and is not refused.

`plan <id>` SHALL steer the first active change that matches; else, with
vcs on, the first archived change that matches, sits in a tree that names
it, and has a trigger. Its steering triggers are those TypeScript's
`deriveSteering` gives, in its order: none unless `.run/approved` exists;
then the change trigger of `.run/regressed/change.md`, `conflict` for
`sync_conflict`, `requirement_changed` for `requirement_changed` and
`regression` for `verify_red`, `verify_path_missing` or `sync_verify_red`;
then each task file's trigger in task order, `regression` for a regressed
marker unless its reason is `scope_regression` and `verification_passed`
is `true`, else, for a task with no done marker, `blocked` for a dead marker
whose reason is `blocked` or `entry_missing` and `stuck` for one whose
`stuck` is `true`.

When no change matches, or the active change that matches sits in the root
and has no trigger, `plan` SHALL fail with
`No active change matching "<id>" needs steering; Rust osq plan <id> steers a change only.`
and write nothing, or, when `parse_change_id` refuses the id, with the
`ChangeIdError`'s display. When the active change that matches sits in a tree that
names it and has no trigger, `plan` SHALL fail with
`<folder> is approved and needs no steering; osq plan <id> reopens an approved change only when it needs steering`,
`<id>` being the folder's leading digits, and write nothing. When
`read_change` fails, `plan` SHALL fail with `Cannot read <folder>: <error>`,
and a config or git error SHALL fail `plan` with its display, each writing
nothing.

#### Scenario: Nothing to steer
- **WHEN** `plan` runs with the row's id on a copy of `crates/features/plan/tests/fixtures/steer-project/`
- **THEN** it gives a `Failed` error for the command `plan` with the row's message, and every file in the copy is unchanged:

| Id | Message |
|---|---|
| `8` | `No active change matching "8" needs steering; Rust osq plan 8 steers a change only.` |
| `009-unapproved` | `No active change matching "009-unapproved" needs steering; Rust osq plan 009-unapproved steers a change only.` |
| `99` | `No active change matching "99" needs steering; Rust osq plan 99 steers a change only.` |

#### Scenario: Steering refuses an id that is not a change id
- **WHEN** `plan` runs with the row's id on a copy of `crates/features/plan/tests/fixtures/steer-project/`
- **THEN** it gives a `Failed` error for the command `plan` with the row's message, and every file in the copy is unchanged:

| Id | Message |
|---|---|
| `8]` | `"8]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `009-unapproved-x` | `No active change matching "009-unapproved-x" needs steering; Rust osq plan 009-unapproved-x steers a change only.` |
