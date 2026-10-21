## ADDED Requirements

### Requirement: Archive keeps the approval seal
After `archiveSpecFolder` relocates a change, it SHALL tick only the
archived folder's root `tasks.md`, and only the checkboxes
`hashChangeFolder` clears: where a line starts with any spaces and tabs, a
`-`, one or more spaces or tabs and `[ ]`, that space becomes `x`. A `*`
bullet, a `tasks.md` in any subfolder and every other file SHALL keep their
bytes, and a root `tasks.md` whose text does not change, or that does not
exist, SHALL not be written. So `hashChangeFolder` of the archived folder
SHALL equal the seal in its `.run/approved`, and the archive keeps proving
what was approved.

#### Scenario: Archived seal matches approval
- **WHEN** `archiveSpecFolder` archives a change whose root `tasks.md` holds the lines of the "Root task lines" table, whose `notes/tasks.md` holds `- [ ] a nested tasks file keeps its bytes`, and whose `.run/approved` holds `hashChangeFolder` of the change folder before the archive
- **THEN** `hashChangeFolder` of the archived folder equals the text of its `.run/approved`

#### Scenario: Root task lines
- **WHEN** `archiveSpecFolder` archives a change whose root `tasks.md` holds each line below
- **THEN** the archived root `tasks.md` holds the line after:

| Line before | Line after |
|---|---|
| `- [ ] 1. first item` | `- [x] 1. first item` |
| `  - [ ] nested item` | `  - [x] nested item` |
| `-`, a tab, `[ ] a tab after the dash` | `-`, a tab, `[x] a tab after the dash` |
| `* [ ] a star item` | `* [ ] a star item` |
| `- [x] 2. already done` | `- [x] 2. already done` |
| `-[ ] no space after the dash` | `-[ ] no space after the dash` |

#### Scenario: Nested tasks file keeps its bytes
- **WHEN** `archiveSpecFolder` archives a change whose `notes/tasks.md` holds `- [ ] a nested tasks file keeps its bytes` and a newline
- **THEN** the archived `notes/tasks.md` holds exactly those bytes

#### Scenario: Archive without a root tasks file
- **WHEN** `archiveSpecFolder` archives a change with no root `tasks.md`
- **THEN** the archive succeeds and the archived folder has no root `tasks.md`
