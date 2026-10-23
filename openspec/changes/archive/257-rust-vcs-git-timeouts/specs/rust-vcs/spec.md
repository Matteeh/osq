## MODIFIED Requirements

### Requirement: Git command
`GitVcs` in `osq-kernel-vcs` SHALL run one `git` process for each git
command a read or a write needs, as TypeScript's `runGit` does, never
through a shell. `GitVcs::new(root)` runs the program `git` in the
directory `root`; `with_program(program)` names another program, and
`with_env(key, value)` adds one environment variable; both return the
changed `GitVcs`.

`command(args)` SHALL build the `std::process::Command` for one git command:
the program, then the arguments `-c`, `core.quotepath=false` and each of
`args` in order, the working directory `root`, and an environment that
removes `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`, sets
`GIT_OPTIONAL_LOCKS` to `0`, and then sets each `with_env` pair in the order
given. A write may then set its own variables on that command, after the
`with_env` pairs, and may give the process a text as its standard input.
Every read and write runs the commands `command` builds, waits for each,
and decodes its standard output and standard error as UTF-8 with invalid
bytes replaced.

Every command SHALL be bounded by a limit from rust-config's `Timeouts`, as
TypeScript's `GitVcs` bounds it. `with_timeouts(timeouts: &Timeouts)` sets
the limits and returns the changed `GitVcs`, and `GitVcs::new` uses
`Timeouts::default()`, which are TypeScript's defaults, so
`GitVcs::new(root)` equals `GitVcs::new(root).with_timeouts(&Timeouts::default())`.
The commands TypeScript runs through `runCommit` are bounded by
`timeouts.git_commit`: `commit`, `commit-tree`, and every `merge`
command, which `merge`, `merge_abort` and `fast_forward` run. Every other
command is bounded by `timeouts.git`. A command still running when its
limit has passed SHALL be killed and waited for, so it leaves no process
behind, and SHALL give `VcsError::TimedOut { command, limit }`, from a read
and from a write alike. `command` is joined as for `Spawn`, and `limit` is
the `std::time::Duration` that bounded it. `VcsError::TimedOut` SHALL
display as `<command> timed out after <limit>`, with the limit in
`Duration`'s `Debug` form, such as `200ms` or `10s`, and return `None` from
`std::error::Error::source`. The limit counts from the start of the
process. Waiting SHALL take no fixed polling interval or other number
from code.

- A command that exits with a code other than 0, or is ended by a signal
  other than the kill of its own limit, gives the read's empty answer,
  which "Repository state reads" and "History reads" name, and the write's
  answer, which "Branch and worktree writes", "Commit writes" and "Merge
  writes" name.
- A program that cannot be started gives `VcsError::Spawn { command, source }`:
  `command` is the program and every argument joined by single spaces, and
  `source` is the `std::io::Error` starting it failed with. `VcsError::Spawn`
  SHALL display as `could not run <command>: <source>` and return `source`
  from `std::error::Error::source`.
- A write git refuses gives `VcsError::Failed { command, output }`:
  `command` is joined as for `Spawn`, and `output` is the command's
  standard output followed by its standard error, as TypeScript's error
  message holds them. `VcsError::Failed` SHALL display as
  `<command> failed: <output>` and return `None` from
  `std::error::Error::source`.

The timeout scenarios use a fake git program: an executable shell script
written under `CARGO_TARGET_TMPDIR` holding
`#!/bin/sh\nif [ "$3" = "$OSQ_FAKE_SLOW" ]; then exec sleep 30; fi\nexit 0\n`,
run as `GitVcs::new(<dir>).with_program(<script>).with_env("OSQ_FAKE_SLOW", <command>).with_timeouts(&limits)`,
where `<dir>` is a folder under `CARGO_TARGET_TMPDIR` and `limits` is
`Timeouts { git: Duration::from_millis(200), git_commit: Duration::from_millis(400), ..Timeouts::default() }`.
Its third argument is the git command's name, after `-c` and
`core.quotepath=false`, so only the row's command sleeps and every other
command exits 0 with no output at once.

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

#### Scenario: Default timeouts
- **WHEN** a test compares `GitVcs::new("/repo")` with `GitVcs::new("/repo").with_timeouts(&Timeouts::default())`, and with `GitVcs::new("/repo").with_timeouts(&limits)`
- **THEN** the first two are equal and the third differs from them

#### Scenario: Commands that run out of time
- **WHEN** a `GitVcs` on the fake git program, slow on the row's slow command, runs the row's call
- **THEN** within 10 seconds it returns `VcsError::TimedOut` whose `command` is the row's command, with `<fake>` the script's path, and whose `limit` is the row's limit; the error displays as that command, ` timed out after ` and the limit, and `source()` gives `None`:

| Call | Slow command | Command | Limit |
|---|---|---|---|
| `root()` | `rev-parse` | `<fake> -c core.quotepath=false rev-parse --show-toplevel` | `200ms` |
| `status()` | `status` | `<fake> -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all` | `200ms` |
| `show("HEAD", "a.txt")` | `show` | `<fake> -c core.quotepath=false show HEAD:a.txt` | `200ms` |
| `is_ancestor("main", "side")` | `merge-base` | `<fake> -c core.quotepath=false merge-base --is-ancestor main side` | `200ms` |
| `count_commits("main", "side")` | `rev-list` | `<fake> -c core.quotepath=false rev-list --count main..side` | `200ms` |
| `worktree_list()` | `worktree` | `<fake> -c core.quotepath=false worktree list --porcelain` | `200ms` |
| `create_branch("side", "main")` | `branch` | `<fake> -c core.quotepath=false branch side main` | `200ms` |
| `stage(&["a.txt"])` | `add` | `<fake> -c core.quotepath=false add -A -- a.txt` | `200ms` |
| `commit(&[], "m", "a <b>")` | `commit` | `<fake> -c core.quotepath=false commit --author=a <b> -F -` | `400ms` |
| `commit_tree("side", "main", "m", "a <b>", &[])` | `commit-tree` | `<fake> -c core.quotepath=false commit-tree side^{tree} -p main -F -` | `400ms` |
| `merge("side", false)` | `merge` | `<fake> -c core.quotepath=false merge --no-ff --no-commit side` | `400ms` |
| `merge_abort()` | `merge` | `<fake> -c core.quotepath=false merge --abort` | `400ms` |
| `fast_forward("side")` | `merge` | `<fake> -c core.quotepath=false merge --ff-only side` | `400ms` |

#### Scenario: Commands that finish in time
- **WHEN** a `GitVcs` on the fake git program, with `OSQ_FAKE_SLOW` set to `none`, runs `root()`, `create_branch("side", "main")` and `merge_abort()`
- **THEN** `root()` returns `Ok(None)`, since the fake prints nothing, and the two writes return `Ok(())`
