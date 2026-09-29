## MODIFIED Requirements

### Requirement: Vcs land operations
The `Vcs` port SHALL also offer `commitTree`, `fastForward`, and
`countCommits`. `commitTree(source, parent, message, author)` SHALL write a
commit whose tree is the tree of commit `source`, whose only parent is
`parent`, whose message is `message`, passed to git in a file and never as an
argument, and whose author is `author`, with git's configured identity as
committer, and return the new commit. It SHALL change no working tree, no
index, and no ref, and run no hook. When `git config --type=bool --get
commit.gpgSign` prints `true`, it SHALL pass `-S`, because `git commit-tree`
ignores that setting. `fastForward(commit)` SHALL first collect every `status`
entry whose path, or whose old path for a rename or copy, `commit` changes
relative to HEAD. When there is any, it SHALL return `blocked` with those
paths, relative to the project root and sorted, and run no write. Otherwise it
SHALL run `git merge --ff-only <commit>` and return `done` with an empty
`blocked` list and `changed` holding every path `commit` changes relative to
the old HEAD, relative to the project root and sorted. A `blocked` result
SHALL carry no `changed` field. When git refuses it SHALL fail with git's
output, leaving HEAD, the index, and the tree as they were. `commitTree` and
`fastForward` SHALL be bounded by `timeouts.gitCommitSeconds`.
`countCommits(from, to)` SHALL return how many commits `to` has that `from`
lacks, and 0 when either ref does not exist. Under `NoVcs`, `countCommits`
SHALL return 0, and `commitTree` and `fastForward` SHALL fail naming the
reason git is off.

#### Scenario: Commit from a branch's tree
- **WHEN** branch `side` was cut from `main` and has two more commits, the checkout on `main` has a modified tracked file and a staged file, and `commitTree('side', 'main', message, 'osq <osq@example.invalid>')` runs
- **THEN** the new commit's tree equals `side`'s tip tree, its only parent is `main`'s tip, its author is `osq <osq@example.invalid>`, its message is `message`, and HEAD, `main`, `indexDigest`, and `status` are unchanged

#### Scenario: Commit tree runs no hook
- **WHEN** the repository's `pre-commit` hook exits 1 and `commitTree` runs
- **THEN** it returns a commit

#### Scenario: Commit tree signs when git is set to
- **WHEN** `commit.gpgSign` is true and `gpg.program` names a script that records its call and prints a signature
- **THEN** `commitTree`'s commit carries a `gpgsig` header and the script ran

#### Scenario: Fast-forward past unrelated work
- **WHEN** the checkout on `main` has a modified tracked `a.txt`, a staged `s.txt`, and an untracked `drafts/x`, and `fastForward` names a commit whose parent is HEAD and which changes only `b.txt`
- **THEN** it returns `done`, HEAD is that commit, `b.txt` matches it, `a.txt` is still modified, `s.txt` is still staged, and `drafts/x` remains

#### Scenario: Uncommitted file the commit changes
- **WHEN** the checkout has a modified tracked `b.txt` and `fastForward` names a commit that changes `b.txt`
- **THEN** it returns `blocked` with `['b.txt']`, and HEAD and `b.txt` are unchanged

#### Scenario: Not a fast-forward
- **WHEN** `main` has a commit that the named commit does not contain
- **THEN** `fastForward` fails with git's output and HEAD is unchanged

#### Scenario: Counting commits
- **WHEN** `side` has two commits `main` lacks
- **THEN** `countCommits('main', 'side')` is 2, `countCommits('side', 'main')` is 0, and `countCommits('missing', 'main')` is 0

#### Scenario: Fast-forward reports changed paths
- **WHEN** `fastForward` names a commit whose parent is HEAD and which changes only `b.txt`
- **THEN** it returns `{ status: 'done', blocked: [], changed: ['b.txt'] }`

## ADDED Requirements

### Requirement: Land reports changed paths
`landChange` SHALL return, beside its lines and code, `changed`: the absolute
path of every file the land commit changes, built by joining each path in
`fastForward`'s `changed` list to the repository root that `vcs.root()`
returns, or to the project root when that is null. A land that makes no
commit, such as a change that has already landed, SHALL return an empty
`changed` list.

#### Scenario: Changed paths after a land
- **WHEN** `osq land 001` lands a change whose task wrote `src/one.txt`
- **THEN** `landChange`'s `changed` holds `<repository root>/src/one.txt`

#### Scenario: Nothing changed on cleanup
- **WHEN** `landChange` runs for a change that has already landed
- **THEN** its `changed` is empty
