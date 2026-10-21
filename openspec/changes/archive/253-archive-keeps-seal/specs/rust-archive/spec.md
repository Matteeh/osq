## MODIFIED Requirements

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
