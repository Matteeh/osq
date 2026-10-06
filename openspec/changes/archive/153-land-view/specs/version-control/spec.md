## ADDED Requirements

### Requirement: Vcs diff count
The `Vcs` port SHALL also offer `diffStat(from, to, exclude)`, a read that
returns the number of files changed and the lines added and removed between
the merge base of `from` and `to` and `to`. `GitVcs` SHALL run
`git diff --numstat --no-renames <from>...<to> -- . :(exclude)<path>`, with one
`:(exclude)<path>` pathspec per entry of `exclude`, bounded by
`timeouts.gitSeconds` like every read. Each output line SHALL count as one
file; a binary file, which git prints with `-` for both counts, SHALL count as
one file with no lines. `diffStat` SHALL return null, not fail, when either
ref does not exist. `NoVcs` SHALL return null.

#### Scenario: Branch work counted from its merge base
- **WHEN** branch `side` was cut from `main`, adds a three-line `a.txt` and removes one line of `b.txt`, and `main` then gains a commit changing `c.txt`
- **THEN** `diffStat('main', 'side', [])` returns 2 files, 3 added and 1 removed

#### Scenario: Excluded folder and binary file
- **WHEN** `side` also adds `openspec/x.md` and a binary `logo.png`
- **THEN** `diffStat('main', 'side', ['openspec'])` counts `logo.png` as one file with no lines and leaves out `openspec/x.md`

#### Scenario: Unknown ref
- **WHEN** `diffStat('main', 'osq/none', [])` runs, or `NoVcs` is asked
- **THEN** it returns null
