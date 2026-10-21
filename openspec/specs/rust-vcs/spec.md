# rust-vcs Specification

## Purpose
The vcs kernel is osq's git port: it reads repositories and makes the commits osq alone writes, as ADR 003 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/vcs/** -->
The rust-vcs capability SHALL own the `osq-kernel-vcs` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Vcs crate ownership
- **WHEN** file ownership is resolved for the vcs kernel
- **THEN** system maps `crates/kernel/vcs/**` to rust-vcs

### Requirement: Git command
`GitVcs` in `osq-kernel-vcs` SHALL run one `git` process for each git
command a read needs, as TypeScript's `runGit` does, never through a shell.
`GitVcs::new(root)` runs the program `git` in the directory `root`;
`with_program(program)` names another program, and `with_env(key, value)`
adds one environment variable; both return the changed `GitVcs`.

`command(args)` SHALL build the `std::process::Command` for one git command:
the program, then the arguments `-c`, `core.quotepath=false` and each of
`args` in order, the working directory `root`, and an environment that
removes `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`, sets
`GIT_OPTIONAL_LOCKS` to `0`, and then sets each `with_env` pair in the order
given. Every read runs the commands `command` builds, waits for each, and
decodes its standard output as UTF-8 with invalid bytes replaced.

- A command that exits with a code other than 0, or is ended by a signal,
  gives the read's empty answer, which "Repository state reads" and
  "History reads" name.
- A program that cannot be started gives `VcsError::Spawn { command, source }`:
  `command` is the program and every argument joined by single spaces, and
  `source` is the `std::io::Error` starting it failed with. `VcsError`
  SHALL display as `could not run <command>: <source>` and return `source`
  from `std::error::Error::source`.

#### Scenario: Command for a read
- **WHEN** `GitVcs::new("/repo").with_program("git-test").with_env("GIT_CONFIG_NOSYSTEM", "1")` builds `command(&["status", "--porcelain=v1"])`
- **THEN** the command's program is `git-test`, its arguments are `-c`, `core.quotepath=false`, `status` and `--porcelain=v1`, its working directory is `/repo`, and its environment changes are exactly these, by name:

| Variable | Change |
|---|---|
| `GIT_CONFIG_NOSYSTEM` | set to `1` |
| `GIT_DIR` | removed |
| `GIT_INDEX_FILE` | removed |
| `GIT_OPTIONAL_LOCKS` | set to `0` |
| `GIT_WORK_TREE` | removed |

#### Scenario: State reads with a program that cannot start
- **WHEN** a `GitVcs` whose program is `osq-missing-git` runs each read below
- **THEN** it returns `VcsError::Spawn` whose `command` is the row's command and whose source's kind is `NotFound`, the error displays as `could not run ` followed by that command, `: ` and the source, and `source()` gives the source:

| Read | Command |
|---|---|
| `root()` | `osq-missing-git -c core.quotepath=false rev-parse --show-toplevel` |
| `head()` | `osq-missing-git -c core.quotepath=false rev-parse --verify --quiet HEAD` |
| `status()` | `osq-missing-git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all` |
| `config_value("osq.example")` | `osq-missing-git -c core.quotepath=false config --get osq.example` |
| `default_branch("main")` | `osq-missing-git -c core.quotepath=false symbolic-ref --quiet --short refs/remotes/origin/HEAD` |
| `show("HEAD", "a.txt")` | `osq-missing-git -c core.quotepath=false show HEAD:a.txt` |
| `path_exists("HEAD", "a.txt")` | `osq-missing-git -c core.quotepath=false cat-file -e HEAD:a.txt` |
| `list_branches("osq/")` | `osq-missing-git -c core.quotepath=false branch --list --format=%(refname:short) osq/*` |
| `worktree_list()` | `osq-missing-git -c core.quotepath=false worktree list --porcelain` |

### Requirement: Repository state reads
`osq-kernel-vcs` SHALL hold the `Vcs` trait, the read half of osq's
version-control port, and `GitVcs` SHALL implement it with the git
arguments and parsing of TypeScript's `GitVcs`. Each read takes `&self`
and returns `Result<_, VcsError>`; an error comes only from "Git command".
"Trimmed" means leading and trailing whitespace removed, and "empty"
means an empty list, `None` or `false`.

- `root()` gives `Option<PathBuf>`: `rev-parse --show-toplevel`; `None`
  when it fails or its trimmed output is empty, else that path made
  canonical, or the trimmed output as it is when it cannot be.
- `head()` gives `Head { sha, branch }`, both `Option<String>`: `sha` is
  the trimmed output of `rev-parse --verify --quiet HEAD`, run first, and
  `branch` that of `symbolic-ref --quiet --short HEAD`; each is `None` when
  its command fails or its trimmed output is empty.
- `status()` gives `Vec<StatusEntry>`, each with `code: String`,
  `path: String` and `from: Option<String>`: `status --porcelain=v1 -z
  --untracked-files=all`, split on NUL. A field shorter than four
  characters is passed over; otherwise its first two characters are the
  code and the rest after the third is the path. When the code holds `R`
  or `C`, the next field is consumed as `from`, which is `None` when it is
  missing or empty. Empty when the command fails.
- `config_value(key)` gives `Option<String>`: the trimmed output of
  `config --get <key>`; `None` when it fails or that is empty.
- `default_branch(fallback)` gives `String`: the trimmed output of
  `symbolic-ref --quiet --short refs/remotes/origin/HEAD` without its
  `origin/` prefix, when the command succeeds and the output starts with
  `origin/` and has more after it; else `fallback`. It never contacts a
  remote.
- `show(rev, path)` gives `Option<String>`: the untrimmed output of
  `show <rev>:<path>`; `None` when it fails.
- `path_exists(rev, path)` gives `bool`: whether `cat-file -e
  <rev>:<path>` succeeds.
- `list_branches(prefix)` gives `Vec<String>`: the non-empty trimmed lines
  of `branch --list --format=%(refname:short) <prefix>*`, in git's order;
  empty when it fails.
- `worktree_list()` gives `Vec<Worktree>`, each with `path: String`,
  `branch: Option<String>` and `head: Option<String>`: the trimmed lines of
  `worktree list --porcelain`. A `worktree <path>` line ends any open entry
  and opens one; `HEAD <sha>` sets its `head`; `branch <ref>` sets its
  `branch`, without a leading `refs/heads/`; an empty line ends it; other
  lines change nothing; the open entry ends with the output. Empty when the
  command fails.

Tests build each repository below in a scratch folder under
`CARGO_TARGET_TMPDIR`, made canonical, with commits made by running `git`
with `GIT_CONFIG_GLOBAL` set to `/dev/null`, `GIT_CONFIG_NOSYSTEM` set to
`1`, `GIT_CEILING_DIRECTORIES` set to the scratch folder, `maintenance.auto`
off, and fixed author and committer names, emails and dates. The `GitVcs`
under test gets the same four settings through `with_env`, so no global or
system git config is read and no network is used. "The repository" is the
repository's canonical directory, and "the commit `<name>`" is the commit
`git rev-parse` names for the branch or commit made with that message.

#### Scenario: State of the read repository
- **WHEN** the reads below run on a repository made with `git init -b main`, holding one commit `base` with `a.txt` (`one\n`) and `notes/b.md` (`# b\n`); branches `osq/one`, `osq/two` and `other` at `base`; `refs/remotes/origin/trunk` at `base` and `refs/remotes/origin/HEAD` a symbolic ref to it; the config `osq.example` set to `yes`; a worktree beside the repository named after it plus `-one` on `osq/one` and one plus `-detached` detached at `base`; and, not committed, `two\n` appended to `a.txt`, `notes/b.md` moved to `notes/c.md` with `git mv`, and new untracked files `new/ü.txt` and `z`
- **THEN** each read returns the row's answer:

| Read | Answer |
|---|---|
| `root()` | the repository |
| `head()` | `sha` the commit `base`, `branch` `main` |
| `status()` | (` M`, `a.txt`, `None`), (`R `, `notes/c.md`, `notes/b.md`), (`??`, `new/ü.txt`, `None`), (`??`, `z`, `None`) |
| `config_value("osq.example")` | `yes` |
| `config_value("osq.missing")` | `None` |
| `default_branch("main")` | `trunk` |
| `show("HEAD", "a.txt")` | `one\n` |
| `show("HEAD", "missing.txt")` | `None` |
| `show("nope", "a.txt")` | `None` |
| `path_exists("HEAD", "notes")` | `true` |
| `path_exists("HEAD", "notes/b.md")` | `true` |
| `path_exists("HEAD", "missing")` | `false` |
| `path_exists("nope", "a.txt")` | `false` |
| `list_branches("osq/")` | `osq/one`, `osq/two` |
| `list_branches("none/")` | none |
| `worktree_list()` | (the repository, `main`, the commit `base`), (the `-detached` worktree, `None`, the commit `base`), (the `-one` worktree, `osq/one`, the commit `base`) |

#### Scenario: Unborn repository
- **WHEN** the reads below run on a repository made with `git init -b main` and nothing else
- **THEN** each read returns the row's answer:

| Read | Answer |
|---|---|
| `head()` | `sha` `None`, `branch` `main` |
| `status()` | none |
| `show("HEAD", "a.txt")` | `None` |
| `default_branch("main")` | `main` |
| `list_branches("")` | none |
| `worktree_list()` | (the repository, `main`, `0000000000000000000000000000000000000000`) |

#### Scenario: Directory outside any repository
- **WHEN** the reads below run on an empty directory in the scratch folder that no repository holds
- **THEN** each read returns the row's answer:

| Read | Answer |
|---|---|
| `root()` | `None` |
| `head()` | `sha` `None`, `branch` `None` |
| `status()` | none |
| `config_value("osq.example")` | `None` |
| `default_branch("main")` | `main` |
| `path_exists("HEAD", "a.txt")` | `false` |
| `list_branches("")` | none |
| `worktree_list()` | none |

### Requirement: History reads
The `Vcs` trait SHALL also hold the reads of commit history below, and
`GitVcs` SHALL implement them with the git arguments and parsing of
TypeScript's `GitVcs`, through "Git command", with the words of
"Repository state reads".

- `merge_base(a, b)` gives `Option<String>`: the trimmed output of
  `merge-base <a> <b>`; `None` when it fails or that is empty, so when the
  two share no commit or a ref is unknown.
- `is_ancestor(ancestor, descendant)` gives `bool`: whether `merge-base
  --is-ancestor <ancestor> <descendant>` succeeds.
- `count_commits(from, to)` gives `u64`: the trimmed output of `rev-list
  --count <from>..<to>` read as a whole number; `0` when the command fails
  or the output is not one.
- `diff_stat(from, to, exclude)` gives `Option<DiffStat>`, with `files`,
  `added` and `removed`, all `u64`: `diff --numstat --no-renames
  <from>...<to> -- .`, then `:(exclude)<entry>` for each entry of `exclude`
  in order. Each non-empty output line splits on tabs into an added and a
  removed field; `-` counts as 0 lines; a line where either field is not
  `-` or a whole number is passed over; every other line counts one file
  and adds its lines. `None` when the command fails, so when a ref is
  unknown or the two share no commit.
- `trailer_values(from, to, key)` gives `Vec<String>`: the output of `log
  --format=%x1e%(trailers:key=<key>,valueonly,separator=%x1f)
  <from>..<to>`, split on U+001E and then on U+001F, each piece trimmed,
  keeping the non-empty ones in order, so newest commit first; empty when
  the command fails.

#### Scenario: Reads of the history repository
- **WHEN** the reads below run on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`one\n`) and `skip/s.txt` (`s\n`); a branch `feature` from `base` with three commits, oldest first: `first`, with the trailer `Osq-Change: 240`, setting `a.txt` to `one\ntwo\nthree\n` and `skip/s.txt` to `s\nt\n`; `plain`, adding `bin.dat` holding the bytes 0, 1, 2 and 0; and `second`, with the trailers `Osq-Change: 241` and `Osq-Change: 241b`, setting `a.txt` to `two\nthree\n`; then one commit `main only` on `main`, adding `m.txt` (`m\n`); and a branch `lone` at a commit with no parent made by `git commit-tree` from `main`'s tree
- **THEN** each read returns the row's answer:

| Read | Answer |
|---|---|
| `merge_base("main", "feature")` | the commit `base` |
| `merge_base("main", "lone")` | `None` |
| `merge_base("main", "nope")` | `None` |
| `is_ancestor("main~1", "feature")` | `true` |
| `is_ancestor("main", "main")` | `true` |
| `is_ancestor("feature", "main")` | `false` |
| `is_ancestor("nope", "main")` | `false` |
| `count_commits("main", "feature")` | `3` |
| `count_commits("feature", "main")` | `1` |
| `count_commits("nope", "main")` | `0` |
| `diff_stat("main", "feature", &[])` | `files` 3, `added` 3, `removed` 1 |
| `diff_stat("main", "feature", &["skip"])` | `files` 2, `added` 2, `removed` 1 |
| `diff_stat("main", "nope", &[])` | `None` |
| `diff_stat("main", "lone", &[])` | `None` |
| `trailer_values("main", "feature", "Osq-Change")` | `241`, `241b`, `240` |
| `trailer_values("main", "feature", "Other")` | none |
| `trailer_values("feature", "main", "Osq-Change")` | none |
| `trailer_values("main", "nope", "Osq-Change")` | none |

#### Scenario: History reads with a program that cannot start
- **WHEN** a `GitVcs` whose program is `osq-missing-git` runs each read below
- **THEN** it returns `VcsError::Spawn` whose `command` is the row's command and whose source's kind is `NotFound`:

| Read | Command |
|---|---|
| `merge_base("main", "feature")` | `osq-missing-git -c core.quotepath=false merge-base main feature` |
| `is_ancestor("main", "feature")` | `osq-missing-git -c core.quotepath=false merge-base --is-ancestor main feature` |
| `count_commits("main", "feature")` | `osq-missing-git -c core.quotepath=false rev-list --count main..feature` |
| `diff_stat("main", "feature", &["skip"])` | `osq-missing-git -c core.quotepath=false diff --numstat --no-renames main...feature -- . :(exclude)skip` |
| `trailer_values("main", "feature", "Osq-Change")` | `osq-missing-git -c core.quotepath=false log --format=%x1e%(trailers:key=Osq-Change,valueonly,separator=%x1f) main..feature` |
