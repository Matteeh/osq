## ADDED Requirements

### Requirement: Change folder files
`read_change_files(folder: &Path) -> ChangeFiles` in `osq-kernel-storage`
SHALL read the files of one change folder that TypeScript's
`checkLocks`, `checkArchives` and `checkDoneMarkers` read, and SHALL never
fail. `ChangeFiles`, `LockFile` and `DoneMarker` SHALL be public, exported
from the crate root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`.

`ChangeFiles` holds:

- `has_proposal: bool`, whether `proposal.md` or `spec.md` exists in the
  folder, as a file, a folder or anything else.
- `has_tasks: bool`, whether `tasks` or `tasks.md` exists in the folder, as
  a file, a folder or anything else.
- `locks: Vec<LockFile>`, one per entry of `.run/running` whose name ends
  `.pid`, then one per entry of `.run/locks` whose name ends `.pid`, each
  folder's names in byte order. A missing folder adds none.
- `done_markers: Vec<DoneMarker>`, one per entry of `.run/done`, in byte
  order of the names. A missing folder adds none.

`LockFile` holds `path: PathBuf`, the folder's path joined with the
entry's relative path, and `pid: Option<i64>`, the `pid` member of the
file's JSON object when that member is a JSON integer, and `None` when the
entry cannot be read as text, is not a JSON object, or has no integer `pid`.

`DoneMarker` holds `path: PathBuf`, the folder's path joined with the
entry's relative path, and `verified: bool`, true when the entry reads as
text, its frontmatter parses through rust-specs `parse_frontmatter`, and
either `scope_hash` is a string, or `manual` is the boolean `true` and
`reason` is a string.

#### Scenario: Lock pids
- **WHEN** `read_change_files` reads a scratch change folder whose `.run/running/1.pid` holds the row's text
- **THEN** `locks` is one `LockFile` with that path and the row's pid:

| Text | Pid |
|---|---|
| `{"pid":4242,"startedAt":1}` | `Some(4242)` |
| `{"pid":-1}` | `Some(-1)` |
| `{"pid":"4242"}` | `None` |
| `{"pid":1.5}` | `None` |
| `{}` | `None` |
| `[4242]` | `None` |
| `not json` | `None` |

#### Scenario: Done marker kinds
- **WHEN** `read_change_files` reads a scratch change folder whose `.run/done/1.md` holds the row's text
- **THEN** `done_markers` is one `DoneMarker` with that path and the row's verified value:

| Text | Verified |
|---|---|
| `---\nscope_hash: abc\n---\n` | `true` |
| `---\nscope_hash: "12"\n---\n` | `true` |
| `---\nscope_hash: 12\n---\n` | `false` |
| `---\nmanual: true\nreason: checked by hand\n---\n` | `true` |
| `---\nmanual: "true"\nreason: checked by hand\n---\n` | `false` |
| `---\nmanual: true\n---\n` | `false` |
| `---\nmanual: true\nreason: 3\n---\n` | `false` |
| `---\nreason: checked by hand\n---\n` | `false` |
| `done\n` | `false` |
| `---\nscope_hash: [\n---\n` | `false` |

#### Scenario: Change folder file order and presence
- **WHEN** `read_change_files` reads a scratch change folder holding the row's entries, each file written with the text `{"pid":1}` unless the row says otherwise
- **THEN** it returns the row's facts, paths written relative to the folder:

| Entries | Facts |
|---|---|
| none | `has_proposal` false, `has_tasks` false, no locks, no done markers |
| `proposal.md`, `tasks/1.md` | `has_proposal` true, `has_tasks` true, no locks, no done markers |
| `spec.md`, `tasks.md` | `has_proposal` true, `has_tasks` true, no locks, no done markers |
| folder `proposal.md`, folder `tasks.md` | `has_proposal` true, `has_tasks` true, no locks, no done markers |
| `.run/running/2.pid`, `.run/running/10.pid`, `.run/running/notes.txt`, `.run/locks/1.pid`, folder `.run/running/3.pid` | locks `.run/running/10.pid` pid `Some(1)`, `.run/running/2.pid` pid `Some(1)`, `.run/running/3.pid` pid `None`, `.run/locks/1.pid` pid `Some(1)` |
| `.run/done/2.md` text `done`, `.run/done/10.md` text `done`, folder `.run/done/3.md` | done markers `.run/done/10.md`, `.run/done/2.md`, `.run/done/3.md`, each verified `false` |
