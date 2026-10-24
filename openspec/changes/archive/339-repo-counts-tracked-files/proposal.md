---
title: The watcher counts the repository from git's tracked files, with line counts cached by blob
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, spec-lint-and-approve, traceability]
---
## Goal

Before each task the watcher measures the repository's size (`repoFiles`,
`repoLines`) with `gatherRepoCounts`. That walks the whole worktree and reads
every file, skipping only `IGNORED_DIRS`, which lacks `target/`. A Rust
worktree holds 13 to 20 GB of Cargo build output, so on 2026-10-24 three
task starts kept the watcher at 100% CPU for minutes before any executor ran.

This change counts what the repository is: the files git tracks, listed by
`git ls-files -s` with each one's blob hash. A blob's line count is cached in
the read index, `.osq/index.sqlite`, under that hash, so a task start reads
only blobs the index has not seen, and files changed since the index. A
folder with no git counts as before. No Rust folder is hard-coded (ADR 017):
build output is left out because git ignores it.

## Verify

`pnpm verify` runs the typechecks, the build, every test and lint. It proves
the blob line table beside the report's streams, the git-backed counts with
an ignored build folder, a warm run that reads no tracked file, changed and
deleted files, a deleted or unusable index, and the walk without git. Every
existing measures, report index and golden events test passes unchanged.

## Non-goals

- Removing finished worktrees in TypeScript `land`.
- Other measures, such as scope counts and import fan-in.
- Pruning `blob_lines` rows for blobs no tree holds any more.
- Sharing one index between the checkout and its worktrees.

## Surface

None

## Decisions

- ADR 008: `blob_lines` is derived from files only. A blob hash names exact content, so a row never goes stale, and deleting the index changes nothing but speed.
- ADR 017: no language or folder name is added to the counts; git's own ignore rules leave build output out.
- ADR 002: archive and delta merge are untouched.
- ADR 010: the validator is untouched.
- ADR 012: the watch service is untouched; the counts run inside the watcher's task start.
- ADR 018: steering planners are untouched.
- ADR 019: tapped planners are untouched.
- ADR 021: autopilot is untouched; its task starts get faster.
- ADR 003: the watcher's git use is two `git ls-files` reads through `runGit`, which writes nothing.

## Assumptions

- The index lives at the root of the tree the task runs in, as `.osq/index.sqlite` does for `osq report`. So the first task in each worktree reads every tracked file once, about 4.5 seconds on this repository, and later tasks read only what changed.
- Untracked files no longer count towards `repoFiles` and `repoLines` in a git tree. The golden events test already masks both, and `report` only stores the raw numbers.
- `git ls-files -m` is git's own check of the folder against the index, so a file it does not list holds its index blob's content.

## Contract

### Requirement: Repository counts

See `specs/watcher-and-harness/spec.md` "Repository counts", and
`specs/metrics-and-reporting/spec.md` "Blob line index" and "Report index
location".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/metrics-and-reporting/spec.md`: MODIFIED "Report index location"; ADDED "Blob line index".
- `specs/watcher-and-harness/spec.md`: ADDED "Repository counts".
