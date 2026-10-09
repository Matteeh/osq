## MODIFIED Requirements

### Requirement: Operations osq never runs
The `Vcs` port SHALL have no operation that force-pushes, rebases, amends,
resets, rewrites history, deletes a branch or tag, stashes, cleans ignored
files, or removes a worktree by force. Its only push SHALL be `pushBranch`,
which "Vcs remote operations" defines. No git argument list in
`src/core/vcs/` SHALL contain `--force`, `--force-with-lease`, `--amend`,
`--hard`, `-D`, `-x`, `rebase`, `reset`, `filter-branch`, `--mirror`,
`--delete`, or `--no-verify`, and only `src/core/vcs/git-vcs-remote.ts` SHALL
hold a git argument list containing `push`.

#### Scenario: Forbidden argument
- **WHEN** a git argument list in `src/core/vcs/` contains `--force`
- **THEN** the structural test fails and names the file

#### Scenario: Push outside the remote module
- **WHEN** a git argument list in any file of `src/core/vcs/` other than `git-vcs-remote.ts` contains `push`
- **THEN** the structural test fails and names the file

## ADDED Requirements

### Requirement: Vcs remote operations
The `Vcs` port SHALL also offer `fetchBranch` and `pushBranch`, implemented
for git in `src/core/vcs/git-vcs-remote.ts`.

`fetchBranch(remote, branch)` SHALL run `git fetch --no-tags <remote>
refs/heads/<branch>` and return the commit `FETCH_HEAD` then names. It SHALL
change no local branch, no working tree and no index, and fail with git's
output when the fetch fails.

`pushBranch(remote, commit, branch)` SHALL run `git push --porcelain <remote>
<commit>:refs/heads/<branch>`. Its refspec SHALL never start with `+`, and it
SHALL pass no force option. It SHALL return `{ status: 'done' }` when git
exits 0, and `{ status: 'rejected' }` when git exits nonzero and a porcelain
line starting with `!` reports `[rejected]`, which is how git refuses an update
that is not a fast-forward. Every result SHALL carry git's combined output.
Any other failure SHALL fail with git's output.

Both SHALL run through osq's own git process, with the redirecting variables
removed as every git call is, `GIT_TERMINAL_PROMPT=0` added so a missing
credential fails instead of waiting for a terminal, and a bound of
`timeouts.gitRemoteSeconds`, default 120 from `DEFAULT_GIT_REMOTE_SECONDS` in
`src/core/foundation/config-vcs.ts`. The credentials they use SHALL come only
from the user's git and SSH setup; no role environment gains a variable for
them. Under `NoVcs`, both SHALL fail naming the reason git is off.

#### Scenario: Fetch a branch
- **WHEN** a bare repository is the remote `origin`, its `main` is at commit `C`, and the clone's `main` is behind it
- **THEN** `fetchBranch('origin', 'main')` returns `C`, and the clone's `main`, `status` and `indexDigest` are unchanged

#### Scenario: Push a fast-forward
- **WHEN** `origin`'s `main` is an ancestor of commit `X`
- **THEN** `pushBranch('origin', X, 'main')` returns `done` and `origin`'s `main` is `X`

#### Scenario: Push refused when the remote moved
- **WHEN** `origin`'s `main` has a commit that `X` lacks
- **THEN** `pushBranch('origin', X, 'main')` returns `rejected` and `origin`'s `main` is unchanged

#### Scenario: No such remote
- **WHEN** the repository has no remote named `origin`
- **THEN** `fetchBranch('origin', 'main')` fails with git's output

### Requirement: Land publishes to origin
`landChange` SHALL take an optional `beforeMove(commit)`. When given, it SHALL
call it with the land commit after the commit is built and before the
checkout's default branch moves; when it throws, the land SHALL stop with
that error and leave the default branch where it was.

`landAndPublish(projectRoot, config, idOrPrefix, progress, hooks)` in
`src/core/vcs/land-publish.ts` SHALL land as `landChange` does and keep
`origin`'s default branch equal to the checkout's:

1. It SHALL run `fetchBranch('origin', <default branch>)`. When that fails, it SHALL stop with `Could not fetch origin/<branch>; nothing was landed` followed by git's output, before any write.
2. When `origin`'s commit is the default branch or one of its ancestors, it SHALL go on. When the default branch is an ancestor of `origin`'s commit, it SHALL fast-forward the checkout to that commit with `fastForward` and print `Updated <branch> to origin/<branch>`. Otherwise it SHALL stop with `<branch> and origin/<branch> have diverged; nothing was landed. Merge origin/<branch> into <branch> on the server, then run osq land <id> again`.
3. It SHALL call `hooks.afterFetch` when given, then run `landChange` with a `beforeMove` that runs `pushBranch('origin', commit, <branch>)`. On `done` it SHALL print `Pushed <commit> to origin/<branch>`. On `rejected` it SHALL stop with `origin/<branch> moved while landing; run osq land <id> again`, so the checkout's default branch stays where it was.
4. When the change had already landed and `origin`'s commit is a strict ancestor of the default branch, it SHALL push the default branch's HEAD the same way and print the same line.

A stop SHALL be an `Error` with the message above, which `landCommand` turns
into a `CommandError` as it does every land refusal. `landChange` itself
SHALL never fetch or push.

#### Scenario: Land pushes the land commit
- **WHEN** `origin`'s `main` equals the checkout's and archived change `001` is landed with `landAndPublish`
- **THEN** the checkout's `main` and `origin`'s `main` are the same land commit, and the lines hold `Pushed <commit> to origin/main` and `Landed 001-<slug> as <commit>`

#### Scenario: Origin ahead before the land
- **WHEN** `origin`'s `main` has one commit the checkout's `main` lacks and the checkout's `main` is its parent
- **THEN** the land prints `Updated main to origin/main`, then lands, and `origin`'s `main` is the land commit with that commit among its ancestors

#### Scenario: Origin moved while landing
- **WHEN** `hooks.afterFetch` pushes a new commit to `origin`'s `main` from another clone
- **THEN** the land stops with `origin/main moved while landing; run osq land 001 again`, the checkout's `main` is unchanged, `origin`'s `main` is that new commit, and a second `landAndPublish` lands and pushes

#### Scenario: Diverged branches
- **WHEN** the checkout's `main` and `origin`'s `main` each have a commit the other lacks
- **THEN** the land stops with `main and origin/main have diverged; nothing was landed. Merge origin/main into main on the server, then run osq land 001 again`, and neither branch moves

#### Scenario: No origin
- **WHEN** the repository has no remote named `origin`
- **THEN** the land stops with a message starting `Could not fetch origin/main; nothing was landed` and the change is not landed

#### Scenario: Terminal land goes out with the next server land
- **WHEN** change `001` was landed with `landChange`, so `origin`'s `main` is behind, and `landAndPublish` runs for `001`
- **THEN** it prints `Pushed <commit> to origin/main` and `origin`'s `main` equals the checkout's
