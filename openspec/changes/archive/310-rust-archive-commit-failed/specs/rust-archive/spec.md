## MODIFIED Requirements

### Requirement: Worktree archive
With `vcs.enabled` on and a change that sits in a tree naming its folder,
`archive` SHALL, after the move and the ticked task lines, commit the
archive in that tree as TypeScript's `commitWorktreeArchive` does. With a
`GitVcs` at the tree's root with the config's `timeouts`, it takes every
`path` and every `from` of rust-vcs `status` that equals, or lies under, the
change folder's old path, `openspec/changes/archive` or `openspec/specs`,
each relative to the tree's root with `/`, sorted and without repeats, and
commits them with rust-vcs `commit`, the author `vcs.author`, and the
message made of these lines, each followed by a newline:

- `osq: <id> archived`
- an empty line
- the change's rust-storage `read_change` `title`, or an empty line when it has none
- `archived to <archive path>`
- an empty line
- `Osq-Change: <folder>`

`<id>` is the folder's leading digits, or the whole folder name when it
has none, and `<archive path>` the archived folder's path relative to the
tree's root with `/`. The `Output` text SHALL then be
`<archive path> on osq/<folder>`.

When the commit fails, `archive` SHALL leave the archived folder and the
living specs as they are, record the failure in the archived folder as
TypeScript's `haltWorktreeChange` does for a `commit_failed` halt, and fail
with `osq could not commit the archive of <folder>: <error>`, `<error>`
being the `VcsError`'s display. The record's detail is git's output, the
`output` of `VcsError::Failed` or the display of any other `VcsError`, cut
as TypeScript's `tailVerifyOutput` cuts it with `limits.markerOutputLines`
and `limits.markerLineChars` from the config. `archive` SHALL write
`.run/regressed/change.md` holding `---\nreason: commit_failed\n---\n<detail>\n`,
creating its folder, then append to `.run/events/change.jsonl` one
`regressed` event with the data `task` `change`, `reason` `commit_failed`
and `output` the detail, through rust-core's `Envelope` and `event_line`,
with the current time in ISO 8601 UTC to the millisecond. Both stay
uncommitted. A record that cannot be written leaves the error as it is.

A change in the project root, with vcs on or off, SHALL be archived with
no git call after the lookup, and its `Output` text stays the archived
folder's path.

#### Scenario: Worktree archive equals TypeScript's
- **WHEN** a test builds the scratch repository `openspec/changes/295-rust-archive-worktree/golden/print-archive-worktree-goldens.mjs.txt` describes for the row's case, from `tests/fixtures/project`, and runs `archive` with the argument `007` on `<scratch>/repo`
- **THEN** it gives an `Output` with the row's text, and the row's tree gives, after `name: ` and the archived folder's name, the same `tip:`, `commit:` and `status:` lines as the row's golden in `tests/fixtures/worktree-golden/`, a copy of `openspec/changes/295-rust-archive-worktree/golden/`; for the `worktree` case, the files under the tree's `openspec/` are also exactly the files under `tests/golden/project/openspec/`, each byte for byte:

| Case | Tree | Output text | Golden |
|---|---|---|---|
| `worktree` | `<scratch>/trees/007-sample` on `osq/007-sample` | `openspec/changes/archive/007-sample on osq/007-sample` | `worktree-007.txt` |
| `taken` | `<scratch>/trees/007-sample` on `osq/007-sample` | `openspec/changes/archive/007-sample-1 on osq/007-sample` | `taken-007.txt` |
| `root` | `<scratch>/repo` on `main` | `openspec/changes/archive/007-sample` | `root-007.txt` |

#### Scenario: Worktree archive commit fails
- **WHEN** a test builds the scratch repository of the `hook-fails` case, whose `pre-commit` hook prints `refused by hook` and exits 1, and runs `archive` with the argument `007` on `<scratch>/repo`
- **THEN** it gives a `Failed` error whose display starts with `archive failed: osq could not commit the archive of 007-sample: ` and contains `refused by hook`, and `<scratch>/trees/007-sample` on `osq/007-sample` gives the same `name:`, `tree:`, `tip:`, `commit:` and `status:` lines as `archive-fails-007.txt` in `tests/fixtures/commit-failed-golden/`, a copy of `openspec/changes/310-rust-archive-commit-failed/golden/`, written as that folder's script writes them, each event's `timestamp` written `<timestamp>`

#### Scenario: Config that does not load
- **WHEN** a test writes `osq.toml` holding `[vcs]`, `enabled = true`, each followed by a newline, to a fresh scratch copy of `tests/fixtures/project`, and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error displayed `archive failed: ` followed by the display of the error rust-config `load_config` gives for that copy, and every other file and folder of the copy is the fixture's, byte for byte
