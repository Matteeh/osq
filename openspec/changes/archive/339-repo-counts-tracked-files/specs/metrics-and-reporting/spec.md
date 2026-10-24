## MODIFIED Requirements

### Requirement: Report index location
`osq report` SHALL keep its index in `.osq/index.sqlite` at the project root,
and SHALL write `.osq/.gitignore` holding `*` when it creates the folder, so
git ignores the folder without a change to the project's `.gitignore`. Only
`osq report`, `osq query` and the watcher's repository counts, through
"Blob line index", SHALL use the index.

#### Scenario: First report in a project
- **WHEN** `osq report` runs in a project without a `.osq/` folder
- **THEN** afterwards `.osq/index.sqlite` exists, `.osq/.gitignore` holds `*`, and `git status` lists neither

## ADDED Requirements

### Requirement: Blob line index
`openBlobLineIndex(projectRoot)` in `src/core/report/blob-line-index.ts`
SHALL open the read index at `<projectRoot>/.osq/index.sqlite` the way
`openStreamIndex` does, through one shared opener in
`src/core/report/stream-index.ts`, and keep a table `blob_lines` with a
text primary key `blob`, a git blob hash, and a nullable integer `lines`.
It SHALL resolve to null when `openStreamIndex` would. Its `lookup(blob)`
SHALL give the stored line count, `null` for a blob stored as not text,
and `undefined` for a blob it has not stored. Its `store(entries)` SHALL
write every `{ blob, lines }` entry in one transaction, replacing any row
for the same blob. `lookup`, `store` and `close` SHALL never throw; a
failed read gives `undefined` and a failed write stores nothing. The table
SHALL leave the `meta` schema version and the `streams` table as they are.
A blob hash names exact content, so a row never goes stale, and deleting
the index changes nothing but speed.

#### Scenario: Stored blob line counts
- **WHEN** `store` writes `{ blob: 'aaa', lines: 3 }` and `{ blob: 'bbb', lines: null }`, the index is closed and opened again, and `lookup` runs for the row's blob
- **THEN** it gives the row's answer

| blob | answer |
| --- | --- |
| `aaa` | `3` |
| `bbb` | `null` |
| `ccc` | `undefined` |

#### Scenario: Blob lines beside the report's streams
- **WHEN** a project's index holds a `streams` row written through `openStreamIndex`, and `openBlobLineIndex` then stores a blob
- **THEN** the `streams` row is still there, the `meta` schema version is unchanged, and `openStreamIndex` still finds the row

#### Scenario: Blob line index that cannot open
- **WHEN** `<projectRoot>/.osq` is a regular file, not a folder
- **THEN** `openBlobLineIndex` resolves to null
