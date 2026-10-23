## ADDED Requirements

### Requirement: Now facts
`read_now_facts(folder: &Path) -> NowFacts` in `osq-kernel-storage` SHALL
read the files of one change folder that TypeScript's `readChangeFolder`
reads to give each task its current status, and SHALL never fail.
`NowFacts` and `NowTask` SHALL be public, exported from the crate root, and
derive `Debug`, `Clone`, `PartialEq` and `Eq`.

`NowFacts` holds:

- `has_proposal: bool`, whether `proposal.md` or `spec.md` exists in the
  folder, following symlinks.
- `tasks: Vec<NowTask>`, one per entry of the folder's `tasks/` whose name
  ends `.md`, of any kind, in byte order of the names. A missing `tasks/`
  adds none.

`NowTask` holds, where `<n>` is the entry's name without `.md`:

- `id: String`, `<n>`.
- `done: bool`, whether an entry `.run/done/<n>` exists, of any kind.
- `manual: bool`, true when `.run/done/<n>` reads as text, its frontmatter
  parses through rust-specs `parse_frontmatter`, and its `manual` is the
  boolean `true`.
- `dead: bool`, whether an entry `.run/dead/<n>.md` exists, of any kind.
- `regressed: bool`, whether an entry `.run/regressed/<n>.md` exists, of
  any kind.
- `running: bool`, whether an entry `.run/running/<n>.pid` exists, of any
  kind, whatever it holds.

A marker whose name is not one of these, such as `.run/dead/3.1.md` or
`.run/regressed/change.md`, belongs to no task. Tests build each folder
under `CARGO_TARGET_TMPDIR`, since `.run/running/` and `*.pid` files are
not committed.

#### Scenario: Now facts of a change folder
- **WHEN** `read_now_facts` reads a scratch change folder holding `proposal.md`, `tasks/1.md`, `tasks/10.md`, `tasks/2.md`, `tasks/3.md`, a folder `tasks/4.md`, `tasks/notes.txt`, `.run/done/1` holding `---\nmanual: true\n---\n`, `.run/done/2` holding `---\nmanual: "true"\nreason: by hand\n---\n`, `.run/done/3` holding `done\n`, a folder `.run/done/4`, `.run/dead/2.md`, `.run/dead/3.1.md`, `.run/regressed/3.md`, `.run/regressed/change.md` and `.run/running/10.pid` holding `not json\n`
- **THEN** `has_proposal` is true and `tasks` is, in this order:

| Id | Done | Manual | Dead | Regressed | Running |
|---|---|---|---|---|---|
| `1` | true | true | false | false | false |
| `10` | false | false | false | false | true |
| `2` | true | false | true | false | false |
| `3` | true | false | false | true | false |
| `4` | true | false | false | false | false |

#### Scenario: Now facts edges
- **WHEN** `read_now_facts` reads a scratch change folder holding only the row's entries
- **THEN** it returns the row's facts:

| Entries | Facts |
|---|---|
| none | `has_proposal` false, no tasks |
| `spec.md`, `tasks/1.md` | `has_proposal` true, task `1` with every flag false |
| `tasks/1.md`, `.run/done/1` holding `---\nmanual: [\n---\n` | `has_proposal` false, task `1` done, not manual |
| `proposal.md`, `tasks/1.md`, `.run/done/1` holding `---\nmanual: true\nreason: 3\n---\n` | `has_proposal` true, task `1` done and manual |
| `proposal.md`, `tasks.md` | `has_proposal` true, no tasks |
