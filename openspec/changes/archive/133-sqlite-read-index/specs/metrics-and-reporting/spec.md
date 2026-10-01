## ADDED Requirements

### Requirement: Report index location
`osq report` SHALL keep its index in `.osq/index.sqlite` at the project root,
and SHALL write `.osq/.gitignore` holding `*` when it creates the folder, so
git ignores the folder without a change to the project's `.gitignore`. Only
`osq report` SHALL use the index.

#### Scenario: First report in a project
- **WHEN** `osq report` runs in a project without a `.osq/` folder
- **THEN** afterwards `.osq/index.sqlite` exists, `.osq/.gitignore` holds `*`, and `git status` lists neither

### Requirement: Report read index
`osq report` SHALL keep a SQLite index of the event streams of archived
changes. For each archived event stream, the report SHALL use the indexed
events when the file's size and modification time match the index, and SHALL
otherwise read the file and update the index. A stream whose file no longer exists SHALL drop out of the
index. Indexed events SHALL equal what the shared reader gives for the file.

#### Scenario: Warm index
- **WHEN** `osq report` runs twice on an unchanged project
- **THEN** the second run reads no archived event stream from disk, and both runs print the same report

#### Scenario: Archived stream gains a line
- **WHEN** an archived `change.jsonl` gains a line between two runs
- **THEN** the second run reads that file again, counts the line, and updates the index

#### Scenario: Removed archive
- **WHEN** an archived change folder is removed between two runs
- **THEN** after the second run the index holds no stream from that folder

### Requirement: Report index safety
The index SHALL be derived from the files only: no osq state SHALL live only
in it, and deleting it SHALL change nothing but speed. A missing, corrupt,
locked, or outdated index, or a runtime without `node:sqlite`, SHALL never
change the report's output or fail the command. A corrupt index or one with
another schema version SHALL be replaced. When the index cannot be read or
written, the report SHALL read the files.

#### Scenario: Deleted index
- **WHEN** `.osq/index.sqlite` is deleted between two runs
- **THEN** the second run prints the same report and writes the index again

#### Scenario: Corrupt index
- **WHEN** `.osq/index.sqlite` holds bytes that are not a SQLite database
- **THEN** `osq report` prints the same report as without an index, and afterwards the file is a valid index

#### Scenario: Locked index
- **WHEN** another connection holds a write lock on the index while `osq report` runs
- **THEN** the report prints the same output and the command succeeds
