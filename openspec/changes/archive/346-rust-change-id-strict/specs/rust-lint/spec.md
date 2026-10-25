## MODIFIED Requirements

### Requirement: Lint lookup
`lint` SHALL find the change of each id it is given, in order, among the
active entries rust-storage's `list_changes` gives for the root, in that
order: a folder matches when rust-core `parse_change_id` reads the id with
`slug` false into an id that names the folder, as rust-core "Change ids"
says, and an id it refuses matches no folder. The first match is the
change. The first id with no match fails `lint` with
`Spec "<query>" not found in <changes>`, `<changes>` being the root joined
with `openspec/changes` and written by `Path::display`, and `lint` then
checks no change and reads no spec. When `parse_change_id` refuses that
first id, the message SHALL instead be the `ChangeIdError`'s display.

#### Scenario: Lint finds no change
- **WHEN** `lint` runs with the row's query on the lint fixture project, `crates/features/lint/tests/fixtures/lint-project/`
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "<query>" not found in <changes>`, where `<query>` is the row's query as given:

| Query |
|---|
| `9` |
| `0` |
| `clean` |
| `x1` |

#### Scenario: Lint stops at a missing id
- **WHEN** `lint` runs with the args `1`, `9` on the lint fixture project
- **THEN** it gives a `Failed` error for the command `lint` with the message `Spec "9" not found in <changes>` and no other text

#### Scenario: Lint refuses an id that is not a change id
- **WHEN** `lint` runs with the row's args on the lint fixture project
- **THEN** it gives a `Failed` error for the command `lint` with the row's message and no other text, `<changes>` being the root joined with `openspec/changes`:

| Args | Message |
|---|---|
| `1]` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `1`, `0O1` | `"0O1" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `001-clean-x` | `Spec "001-clean-x" not found in <changes>` |
