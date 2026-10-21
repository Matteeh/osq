# Spec Delta: rust-vcs

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

- A command that exits with a code other than 0, or is ended by a signal,
  gives the read's empty answer, which "Repository state reads" and
  "History reads" name, and the write's answer, which "Branch and worktree
  writes", "Commit writes" and "Merge writes" name.
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

## ADDED Requirements

### Requirement: Branch and worktree writes
The `Vcs` trait SHALL also hold the branch and worktree writes below, and
`GitVcs` SHALL implement them with the git arguments of TypeScript's
`GitVcs`, through "Git command", with the words of "Repository state
reads". Each takes `&self` and returns `Result<(), VcsError>`: `Ok(())`
when its command succeeds, and `VcsError::Failed` when git refuses it. No
write passes a force, reset, rebase or amend option, so git's refusal
stands and nothing is overwritten.

- `create_branch(name, base)`: `branch <name> <base>`; git refuses a name
  that exists.
- `rename_branch(from, to)`: `branch -m <from> <to>`, keeping every commit;
  git refuses a taken name.
- `worktree_add(path, branch)`: `worktree add <path> <branch>`, for a
  branch that exists.
- `worktree_remove(path)`: `worktree remove <path>`; git refuses a worktree
  with modified or untracked files.
- `worktree_prune()`: `worktree prune`, which drops git's records of
  worktrees whose folder no longer exists.

Tests build their repositories as "Repository state reads" says. "The
repository" is the repository's canonical directory, and "the `-one`
worktree" is the folder beside it named after it plus `-one`. "Refused
with `<phrase>`" means `VcsError::Failed` whose `output` contains that
phrase.

#### Scenario: Branch and worktree writes on a repository
- **WHEN** the steps below run in order on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`one\n`), then a commit `next` on `main` changing `a.txt` to `two\n`, and branches `osq/one` and `osq/two` at `base`
- **THEN** each step returns the row's answer, and the repository is then as the row says:

| Step | Answer | Then |
|---|---|---|
| `create_branch("osq/new", "main~1")` | `Ok(())` | `list_branches("osq/")` gives `osq/new`, `osq/one`, `osq/two`, and `osq/new` names the commit `base` |
| `create_branch("osq/one", "main")` | refused with `already exists`, with `command` `git -c core.quotepath=false branch osq/one main` | `osq/one` names the commit `base` |
| `rename_branch("osq/two", "osq/renamed")` | `Ok(())` | `list_branches("osq/")` gives `osq/new`, `osq/one`, `osq/renamed`, and `osq/renamed` names the commit `base` |
| `rename_branch("osq/new", "osq/one")` | refused with `already exists` | `list_branches("osq/")` gives `osq/new`, `osq/one`, `osq/renamed` |
| `worktree_add(<the -one worktree>, "osq/one")` | `Ok(())` | `worktree_list()` gives (the repository, `main`, the commit `next`), (the `-one` worktree, `osq/one`, the commit `base`) |
| `worktree_add(<the -again worktree>, "osq/one")` | refused with `already checked out` | `worktree_list()` gives the same two entries |
| `worktree_remove(<the -one worktree>)` after `u.txt` (`u\n`) is written in the `-one` worktree | refused with `contains modified or untracked files` | `u.txt` still holds `u\n` |
| `worktree_remove(<the -one worktree>)` after `u.txt` is deleted | `Ok(())` | `worktree_list()` gives (the repository, `main`, the commit `next`), and the `-one` worktree's folder does not exist |
| `worktree_prune()` after a `-gone` worktree on `osq/renamed` is added with `git worktree add` and its folder deleted | `Ok(())` | `worktree_list()` gives (the repository, `main`, the commit `next`) |

The refused `create_branch` error also displays as its `command`, then ` failed: ` and its `output`, and its `source()` is `None`.

#### Scenario: Branch and worktree writes with a program that cannot start
- **WHEN** a `GitVcs` whose program is `osq-missing-git` runs each write below
- **THEN** it returns `VcsError::Spawn` whose `command` is the row's command and whose source's kind is `NotFound`:

| Write | Command |
|---|---|
| `create_branch("osq/new", "main")` | `osq-missing-git -c core.quotepath=false branch osq/new main` |
| `rename_branch("osq/one", "osq/renamed")` | `osq-missing-git -c core.quotepath=false branch -m osq/one osq/renamed` |
| `worktree_add("/tmp/osq-tree", "osq/one")` | `osq-missing-git -c core.quotepath=false worktree add /tmp/osq-tree osq/one` |
| `worktree_remove("/tmp/osq-tree")` | `osq-missing-git -c core.quotepath=false worktree remove /tmp/osq-tree` |
| `worktree_prune()` | `osq-missing-git -c core.quotepath=false worktree prune` |

### Requirement: Commit writes
The `Vcs` trait SHALL also hold the index and commit writes below, and
`GitVcs` SHALL implement them with the git arguments and author handling
of TypeScript's `GitVcs`, through "Git command", with the words of
"Branch and worktree writes". Each takes `&self`; `paths` is `&[&str]`.

- `stage(paths)` gives `()`: nothing runs when `paths` is empty; otherwise
  `add -A -- <paths>`, which stages exactly those paths, deletions
  included. `VcsError::Failed` when it fails.
- `commit(paths, message, author)` gives `String`, the new commit. When
  `paths` is not empty it first runs `add -- <paths>`. It then runs
  `commit --author=<author> -F -`, followed by `--only -- <paths>` when
  `paths` is not empty, with `message` as standard input, never as an
  argument, so it commits only those paths and leaves anything else staged
  as it was, or with no paths commits the index as it stands. The answer
  is the trimmed output of `rev-parse --verify HEAD`. `VcsError::Failed`
  when any of the three commands fails.
- `commit_tree(source, parent, message, author, extra_parents)` gives
  `String`, the new commit, with `extra_parents` a `&[&str]`. It reads
  `config --type=bool --get commit.gpgSign`, then runs `commit-tree
  <source>^{tree} -p <parent>`, then `-p <extra>` for each entry of
  `extra_parents` in order, then `-F -`, then `-S` when that config read
  succeeded with the trimmed output `true`, because `commit-tree` ignores
  that setting. `message` is its standard input, and it sets
  `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL` to the name and email of
  `author`. The answer is its trimmed output. It changes no ref, the index
  or the working tree. `VcsError::Failed` when `commit-tree` fails.
- `author` splits as TypeScript's `parseAuthor` does: when it ends with `>`
  and holds a `<`, the name is what comes before its first `<` without
  trailing whitespace and the email is what lies between that `<` and the
  final `>`; otherwise the name is the whole of `author` and the email is
  empty.

The tests' `GitVcs` also gets `GIT_AUTHOR_DATE`, `GIT_COMMITTER_NAME`,
`GIT_COMMITTER_EMAIL` and `GIT_COMMITTER_DATE` through `with_env`. "The
author" of a commit is the name and email `git log -1 --format=%an%n%ae`
prints for it, "its parents" are the commits `git rev-list --parents -n 1`
names after it, in order, and "the author `Osq Bot`" is `Osq Bot <bot@example.com>`.

#### Scenario: Stage and commit on a repository
- **WHEN** the steps below run in order on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`one\n`), `gone.txt` (`g\n`) and `other.txt` (`o\n`), and then, not committed, `two\n` appended to `a.txt` and to `other.txt` and `gone.txt` deleted from the folder
- **THEN** each step returns the row's answer, and the repository is then as the row says:

| Step | Answer | Then |
|---|---|---|
| `stage(&["a.txt", "gone.txt"])` | `Ok(())` | `status()` gives (`M `, `a.txt`, `None`), (`D `, `gone.txt`, `None`), (` M`, `other.txt`, `None`) |
| `stage(&[])` | `Ok(())` | `status()` gives the same three entries |
| `stage(&["missing.txt"])` | refused with `did not match any files` | `status()` gives the same three entries |
| `commit(&["other.txt"], "first\n\nOsq-Change: 245\n", "Osq Bot <bot@example.com>")` | the commit `HEAD` names | `status()` gives (`M `, `a.txt`, `None`), (`D `, `gone.txt`, `None`); the commit's subject is `first`, `trailer_values("HEAD~1", "HEAD", "Osq-Change")` gives `245`, and its author is `Osq Bot`, `bot@example.com` |
| `commit(&[], "second\n", "Osq Bot <bot@example.com>")` | the commit `HEAD` names | `status()` gives none, and `diff_stat("HEAD~1", "HEAD", &[])` gives `files` 2, `added` 1, `removed` 1 |
| `commit(&[], "empty\n", "Osq Bot <bot@example.com>")` | refused with `nothing to commit`, with `command` `git -c core.quotepath=false commit --author=Osq Bot <bot@example.com> -F -` | `HEAD` names the commit of the step before |
| `commit(&["a.txt"], "same\n", "Osq Bot <bot@example.com>")` | refused with `nothing`, with `command` `git -c core.quotepath=false commit --author=Osq Bot <bot@example.com> -F - --only -- a.txt` | `HEAD` names the same commit |

#### Scenario: Commit from a tree
- **WHEN** each write below runs on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`one\n`), a branch `feature` from `base` with a commit adding `f.txt` (`f\n`), and a branch `other` from `base` with a commit adding `o.txt` (`o\n`), with `main` checked out and nothing uncommitted
- **THEN** each write returns the row's answer, and `main`, `feature`, `other` and `HEAD` name the commits they named before and `status()` gives none:

| Write | Answer |
|---|---|
| `commit_tree("feature", "main", "bridge\n", "Osq Bot <bot@example.com>", &[])` | a commit whose tree is `feature`'s tree, whose parents are the commit `base`, whose subject is `bridge` and whose author is `Osq Bot`, `bot@example.com` |
| `commit_tree("feature", "main", "bridge\n", "Osq Bot <bot@example.com>", &["feature", "other"])` | a commit whose parents are the commit `base`, then `feature`'s commit, then `other`'s commit |
| `commit_tree("feature", "main", "bridge\n", "Osq Bot<bot@example.com>", &[])` | a commit whose author is `Osq Bot`, `bot@example.com` |
| `commit_tree("feature", "main", "bridge\n", "Osq Bot", &[])` | a commit whose author is `Osq Bot` with an empty email |
| `commit_tree("feature", "main", "bridge\n", "<x@example.com>", &[])` | refused with `empty ident name` |

#### Scenario: Commit from a tree that git is set to sign
- **WHEN** `commit_tree("feature", "main", "signed\n", "Osq Bot <bot@example.com>", &["other"])` runs on the repository of "Commit from a tree" after `git config commit.gpgSign true` and `git config gpg.program osq-missing-gpg` set its own config
- **THEN** it is refused with `gpg failed to sign the data`, with `command` `git -c core.quotepath=false commit-tree feature^{tree} -p main -p other -F - -S`, and `main` names the commit it named before

#### Scenario: Commit writes with a program that cannot start
- **WHEN** a `GitVcs` whose program is `osq-missing-git` runs each write below
- **THEN** it gives the row's answer, a `VcsError::Spawn` whose source's kind is `NotFound` wherever the row names a command:

| Write | Answer |
|---|---|
| `stage(&[])` | `Ok(())` |
| `stage(&["a.txt"])` | `osq-missing-git -c core.quotepath=false add -A -- a.txt` |
| `commit(&["a.txt"], "m\n", "Osq Bot <bot@example.com>")` | `osq-missing-git -c core.quotepath=false add -- a.txt` |
| `commit(&[], "m\n", "Osq Bot <bot@example.com>")` | `osq-missing-git -c core.quotepath=false commit --author=Osq Bot <bot@example.com> -F -` |
| `commit_tree("feature", "main", "m\n", "Osq Bot <bot@example.com>", &[])` | `osq-missing-git -c core.quotepath=false config --type=bool --get commit.gpgSign` |

### Requirement: Merge writes
The `Vcs` trait SHALL also hold the merges below, and `GitVcs` SHALL
implement them with the git arguments and results of TypeScript's
`GitVcs`, through "Git command", with the words of "Branch and worktree
writes". Each takes `&self`. `MergeOutcome` is `Clean` or
`Conflict { paths }`, and `FastForward` is `Done { changed }` or
`Blocked { paths }`, each holding a `Vec<String>` of paths relative to the
repository, sorted, and each deriving `Debug`, `Clone`, `PartialEq` and
`Eq`.

- `merge(rev, squash)` gives `MergeOutcome`: `merge --squash <rev>` when
  `squash` is true, else `merge --no-ff --no-commit <rev>`. When it
  succeeds the answer is `Clean`, with the result staged and not
  committed. When it fails it reads `diff --name-only --diff-filter=U -z`,
  split on NUL, keeping the non-empty paths, sorted: when there are any the
  answer is `Conflict` with them, and otherwise, or when that read fails,
  `VcsError::Failed` with the merge's command and output, because git
  refused to start the merge and changed nothing.
- `merge_abort()` gives `()`: `merge --abort`; `VcsError::Failed` when it
  fails, such as when no merge is in progress.
- `fast_forward(commit)` gives `FastForward`. It reads `status()`, then
  `diff --name-only -z HEAD <commit>`, split on NUL, keeping the non-empty
  paths, as the changed paths, none when that read fails. The blocked
  paths are every status entry's `path` and `from` that is a changed path,
  each once, sorted. When there are any the answer is `Blocked` with them,
  and nothing is written. Otherwise it runs `merge --ff-only <commit>`:
  `VcsError::Failed` when git refuses, such as for a commit that is not a
  fast-forward, else `Done` with the changed paths, sorted.

#### Scenario: Merges on a repository
- **WHEN** the steps below run in order on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`one\n`) and `b.txt` (`b\n`); a branch `clean` from `base` with a commit adding `n.txt` (`n\n`); a branch `clash` from `base` with a commit setting `a.txt` and `b.txt` to `clash\n`; and a commit `mainside` on `main` setting `a.txt` and `b.txt` to `main\n`, with `main` checked out and nothing uncommitted
- **THEN** each step returns the row's answer, `HEAD` still names the commit `mainside`, and the repository is then as the row says, where "a merge in progress" means the file `.git/MERGE_HEAD` exists in the repository:

| Step | Answer | Then |
|---|---|---|
| `merge("clean", false)` | `Clean` | `status()` gives (`A `, `n.txt`, `None`), and a merge is in progress |
| `merge_abort()` | `Ok(())` | `status()` gives none |
| `merge("clash", false)` | `Conflict` with `a.txt`, `b.txt` | `status()` gives (`UU`, `a.txt`, `None`), (`UU`, `b.txt`, `None`) |
| `merge_abort()` | `Ok(())` | `status()` gives none, and `a.txt` holds `main\n` |
| `merge_abort()` | refused with `no merge to abort` | `status()` gives none |
| `merge("nope", false)` | refused with `not something we can merge`, with `command` `git -c core.quotepath=false merge --no-ff --no-commit nope` | `status()` gives none |
| `merge("nope", true)` | refused with `not something we can merge`, with `command` `git -c core.quotepath=false merge --squash nope` | `status()` gives none |
| `merge("clean", true)` | `Clean` | `status()` gives (`A `, `n.txt`, `None`), and no merge is in progress |

#### Scenario: Fast-forwards on a repository
- **WHEN** the steps below run in order on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`a\n`), `c.txt` (`c\n`) and `m.txt` (`m\n`); a branch `ahead` from `base` with a commit setting `c.txt` to `c2\n` and `m.txt` to `m2\n` and adding `e.txt` (`e\n`); and a branch `side` from `base` with a commit setting `a.txt` to `side\n`; with `main` checked out at `base` and, not committed, `dirty\n` appended to `m.txt`, `c.txt` moved to `z.txt` with `git mv`, and a new untracked file `x.txt`
- **THEN** each step returns the row's answer, and the repository is then as the row says:

| Step | Answer | Then |
|---|---|---|
| `fast_forward("ahead")` | `Blocked` with `c.txt`, `m.txt` | `HEAD` names the commit `base`, and `m.txt` holds `m\ndirty\n` |
| `fast_forward("ahead")` after `z.txt` is moved back to `c.txt` with `git mv` and `m.txt` is set to `m\n` | `Done` with `c.txt`, `e.txt`, `m.txt` | `HEAD` names `ahead`'s commit, and `status()` gives (`??`, `x.txt`, `None`) |
| `fast_forward("side")` | refused with `Not possible to fast-forward`, with `command` `git -c core.quotepath=false merge --ff-only side` | `HEAD` names `ahead`'s commit, and `a.txt` holds `a\n` |
| `fast_forward("nope")` | refused with `not something we can merge`, with `command` `git -c core.quotepath=false merge --ff-only nope` | `HEAD` names `ahead`'s commit |

#### Scenario: Merge writes with a program that cannot start
- **WHEN** a `GitVcs` whose program is `osq-missing-git` runs each write below
- **THEN** it returns `VcsError::Spawn` whose `command` is the row's command and whose source's kind is `NotFound`:

| Write | Command |
|---|---|
| `merge("feature", false)` | `osq-missing-git -c core.quotepath=false merge --no-ff --no-commit feature` |
| `merge("feature", true)` | `osq-missing-git -c core.quotepath=false merge --squash feature` |
| `merge_abort()` | `osq-missing-git -c core.quotepath=false merge --abort` |
| `fast_forward("feature")` | `osq-missing-git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all` |
