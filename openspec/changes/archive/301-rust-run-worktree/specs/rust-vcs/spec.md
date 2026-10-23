## ADDED Requirements

### Requirement: Patch and discard
The `Vcs` trait SHALL also hold `patch` and `discard`, and `GitVcs` SHALL
implement them with the git arguments of TypeScript's `patch` and
`discard` in `src/core/vcs/git-vcs-write.ts`, through "Git command".

- `patch(base: Option<&str>)` gives `String`, the binary diff of the whole
  working tree, untracked files included, against `base`, or `HEAD`
  without one, leaving the index and the working tree as they were. It
  reads `rev-parse --git-path index`, resolved against the root, copies
  that file, when it exists, into a new temporary folder as `index`, runs
  `add -A` with `GIT_INDEX_FILE` set to the copy, and answers the output
  of `-c core.quotepath=false diff --cached --binary <base>` run with the
  same variable. The temporary folder is removed whatever happens.
  `VcsError::Failed` when `add` or `diff` fails.
- `discard(paths: &[&str])` gives `()`, returning the listed paths to
  HEAD's state in an osq worktree. Nothing runs when `paths` is empty.
  Otherwise it reads `rev-parse --git-dir`, `rev-parse --git-common-dir`
  and `symbolic-ref --quiet --short HEAD`, and refuses with
  `VcsError::Failed` whose `command` is `git discard` and whose `output` is
  `discard requires a linked worktree` when the first two name the same
  folder, resolved against the root, or `discard requires HEAD on a branch
  starting "osq/"` when HEAD is on no branch or a branch that does not
  start with `osq/`. Then the paths HEAD tracks under `paths` are those
  `ls-tree -r --name-only HEAD -- <paths>` lists, and the paths the index
  tracks are those `ls-files -- <paths>` lists. It runs `rm --cached -q --
  <index paths HEAD does not track>` when there are any, `restore
  --source=HEAD --staged --worktree -- <HEAD paths>` when there are any,
  and `clean -fd -- <paths>`. `VcsError::Failed` when any of them fails.

#### Scenario: Patch leaves the tree as it was
- **WHEN** a test runs `patch(None)` on a repository whose commit holds `a.txt` (`one\n`) and `b.txt` (`gone\n`), after `a.txt` is changed to `two\n`, `b.txt` is deleted, `c.txt` (`new\n`) is staged and `d.txt` (`loose\n`) is left untracked
- **THEN** the answer starts with `diff --git a/a.txt b/a.txt` and holds a `diff --git` line for `b.txt`, `c.txt` and `d.txt`, `+two`, `-gone`, `+new` and `+loose`, and `git status --porcelain` prints the same lines before and after

#### Scenario: Patch against a base
- **WHEN** a test runs `patch(Some(<first>))` on a repository with a first commit holding `a.txt` (`one\n`) and a second changing it to `two\n`, with a clean working tree
- **THEN** the answer holds `-one` and `+two`

#### Scenario: Discard in an osq worktree
- **WHEN** a test runs `discard` with the row's paths in the `-one` worktree of a repository whose `main` commit holds `a.txt` (`one\n`) and `keep.txt` (`keep\n`), the worktree on a new branch `osq/one`, after `a.txt` is changed to `two\n`, `c.txt` (`new\n`) is staged, `d/e.txt` (`loose\n`) is left untracked and `keep.txt` is changed to `kept\n`
- **THEN** it returns `Ok(())`, and `git status --porcelain --untracked-files=all` in the worktree prints the row's lines:

| Paths | Status |
|---|---|
| none | ` M a.txt`, `A  c.txt`, ` M keep.txt`, `?? d/e.txt` |
| `a.txt`, `c.txt`, `d` | ` M keep.txt` |
| `a.txt` | `A  c.txt`, ` M keep.txt`, `?? d/e.txt` |

#### Scenario: Discard refusals
- **WHEN** a test runs `discard` with the paths `a.txt` in the row's tree, after `a.txt` is changed to `two\n` there
- **THEN** it gives `VcsError::Failed` with the `command` `git discard` and the row's `output`, and `a.txt` still holds `two\n`:

| Tree | Output |
|---|---|
| the repository itself, on `main` | `discard requires a linked worktree` |
| the `-one` worktree on a new branch `work` | `discard requires HEAD on a branch starting "osq/"` |
