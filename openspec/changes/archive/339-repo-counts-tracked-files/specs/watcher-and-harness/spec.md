## ADDED Requirements

### Requirement: Repository counts
`gatherRepoCounts(projectRoot, gitSeconds)` in `src/watcher/repo-counts.ts`
SHALL give the start `measures` event's `repoFiles` and `repoLines` from
the files git tracks in the tree the task runs in. `gitSeconds` defaults to
`DEFAULT_GIT_SECONDS`, and the runner passes `timeouts.gitSeconds`.

It SHALL run `git ls-files -s -z` and `git ls-files -m -z` through
`runGit`, with the project root as the working directory. When either
fails, it SHALL count as before: walk the folder, skipping `IGNORED_DIRS`.

From the first command it SHALL take each path once, leaving out entries of
mode `120000` (a symlink) or `160000` (a submodule). A path the second
command lists, or one with a stage other than 0, SHALL be read from disk
and not looked up. Any other path SHALL be looked up by its blob hash in
"Blob line index", and read from disk only when the index has not stored
that blob. The counts for each blob read that way SHALL be stored once at
the end. A path that cannot be read SHALL count nothing and store nothing.
A file holding a NUL byte is not text: it counts nothing and stores `null`.
A text file counts one file and `content.split('\n').length` lines. When
the index cannot be opened, it SHALL read every path, with the same counts.
Untracked and ignored files SHALL never be read or counted.

#### Scenario: Large ignored build folder
- **WHEN** a git repository tracks `src/a.ts` (`a\nb\n`), `notes.txt` (`hello`), `logo.bin` (`x\u0000y`) and the symlink `link.txt` to `notes.txt`, ignores `target/` through `.git/info/exclude` with 200 files under `target/debug/`, and holds the untracked `scratch.txt` (`one\ntwo\n`), and `gatherRepoCounts` runs
- **THEN** it gives `{ files: 2, lines: 4 }`, counting `src/a.ts` and `notes.txt`, and reads no file under `target/` and not `scratch.txt`

#### Scenario: Warm repository counts
- **WHEN** `gatherRepoCounts` runs twice on that unchanged repository
- **THEN** both runs give the same counts, and the second reads no tracked file

#### Scenario: Changed tracked file
- **WHEN** after a first run `src/a.ts` becomes `a\n` uncommitted, `notes.txt` is deleted uncommitted, and `gatherRepoCounts` runs, and then both edits are committed and it runs again
- **THEN** both later runs give `{ files: 1, lines: 2 }`

#### Scenario: Deleted read index
- **WHEN** `.osq/index.sqlite` is deleted after a first run and `gatherRepoCounts` runs again
- **THEN** it gives the same counts and `.osq/index.sqlite` exists again

#### Scenario: Read index that cannot open
- **WHEN** `.osq` is a regular file in that repository and `gatherRepoCounts` runs
- **THEN** it gives `{ files: 2, lines: 4 }`

#### Scenario: Folder with no git
- **WHEN** a folder in no git repository holds `src/a.ts` (`a\n`), `notes.txt` (`hello`) and `node_modules/pkg/index.js` (`junk\n`), and `gatherRepoCounts` runs
- **THEN** it gives `{ files: 2, lines: 3 }`, as the walk counts
