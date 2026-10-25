## MODIFIED Requirements

### Requirement: Retry refusals
`retry <id> <target>` SHALL refuse, in TypeScript's `retrySpec` order and
with its texts, writing nothing:

1. a target that, trimmed, is neither `change` nor all ASCII digits:
   `Invalid retry target "<target>": expected a numeric task or "change".`;
2. an id that matches no active change among the active entries rust-retry
   "Active worktree retry" lists, and no archived change of an osq worktree
   as rust-retry "Archived retry" finds it:
   `Spec "<id>" not found in <root>/openspec/changes`, or, when rust-core
   `parse_change_id` refuses the id, the `ChangeIdError`'s display. A
   folder matches the id when `parse_change_id` reads it with `slug` false
   into an id that names the folder, as rust-core "Change ids" says, and an
   id it refuses matches no folder;
3. `.run/approved` missing or blank:
   ``Change <id> is not approved. Run `osq approve <id>` before retrying.``;
4. `.run/approved` trimmed other than rust-storage `change_folder_seal` of
   the folder: ``Change <id> no longer matches its approved hash. Run `osq approve <id>` before retrying.``;
5. for `change`, any `.run/running/*.pid`:
   `Change <id> has a running task; retry is refused.`; for a task, a
   `.run/running/<task>.pid` whose JSON object's `pid` is an integer of a
   process that is not running:
   `Task <task> was left running by a stopped watcher (pid <pid>); run osq watch to reap it, then osq retry <id> <task> if it stays dead.`,
   and any other `.run/running/<task>.pid`:
   `Task <task> is running; retry is refused.`;
6. no `.run/regressed/<target>.md` and, for a task, no
   `.run/dead/<target>.md`:
   `No active failure marker for task <task> in <folder>; retry is refused.`,
   or `No active failure marker for change-level regression in <folder>; retry is refused.`;
7. a marker reason that is not a rust-core `FailureReason`:
   `Marker reason "<reason>" is not one osq knows; retry is refused.`

`<id>` here is the folder's leading digits, or the whole folder name when
it has none. A process is running when `pid` is above 0 and `/proc/<pid>`
exists. The reason is the regressed marker's, else the dead marker's,
read as the frontmatter `reason` trimmed through rust-specs
`parse_frontmatter`; when that is missing, blank, not a string or the
frontmatter does not parse, it is `regressed` or `dead` respectively.

#### Scenario: Retry refusals osq adds
- **WHEN** `retry` runs with the row's arguments on a copy of `crates/features/retry/tests/fixtures/retry-project/`
- **THEN** it gives a `Failed` error for the command `retry` with the row's message, where `<root>` is the copy's root, and leaves every file in the copy unchanged:

| Arguments | Message |
|---|---|
| `12`, `1` | `Marker reason "weird" is not one osq knows; retry is refused.` |
| `11`, `1` | `<root>/openspec/changes/011-scope-hash/tasks/1.md: No such file or directory (os error 2)` |

#### Scenario: Retry refuses an id that is not a change id
- **WHEN** `retry` runs with the row's arguments on a copy of `crates/features/retry/tests/fixtures/retry-project/`
- **THEN** it gives a `Failed` error for the command `retry` with the row's message, where `<root>` is the copy's root, and leaves every file in the copy unchanged:

| Arguments | Message |
|---|---|
| `1]`, `1` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `1]`, `x` | `Invalid retry target "x": expected a numeric task or "change".` |
| `001-dead-x`, `1` | `Spec "001-dead-x" not found in <root>/openspec/changes` |

### Requirement: Archived retry
When no active change matches the id, `retry` SHALL load the root's config
through rust-config `load_config`, failing with the config error's text.
With `vcs.enabled` and a rust-vcs `GitVcs` root, it SHALL list rust-storage
`change_trees` from the `worktree_list` worktrees and no stacked folders,
and take the first archived entry of `list_tree_changes` that lies in a
tree naming a folder and matches the id as "Retry refusals" says. Without
one, or with vcs off, the not-found refusal stands. A numeric target on
that change SHALL fail, writing nothing, with `<folder> has archived; osq
retry clears only its land stop: osq retry <id> change`. For `change`,
refusals 3 to 7 and rust-retry "Retry record" SHALL apply to its folder.
It SHALL then commit, in the change's tree with git timeouts from config,
the marker, `.run/events/change.jsonl` and each retained file, as paths
relative to the tree root with `/`, with the message `osq: <id> land
retry` and the author `vcs.author`. When the commit fails, retry SHALL put
each of those files back as `HEAD` holds it, removing one `HEAD` lacks,
stage the paths again ignoring a failure, and fail with `osq could not
record the retry: <git error>`.

When the retried marker's reason is `commit_failed`, retry SHALL make the
archive commit in place of the `osq: <id> land retry` commit, as
TypeScript's `commitArchivedRetry` does. With a `GitVcs` at the tree's
root with the config's `timeouts`, it takes every `path` and every `from`
of rust-vcs `status` that equals, or lies under,
`openspec/changes/<folder>`, `openspec/changes/archive` or
`openspec/specs`, relative to the tree's root with `/`, sorted and without
repeats. For each of those paths that `HEAD` holds, as `show` reads it,
and the tree lacks, it SHALL write `HEAD`'s text there, `stage` it, and
remove it again, so the commit stages its deletion even when the failed
archive commit already staged it. It then commits the paths with `commit`,
the author `vcs.author`, and the message rust-archive "Worktree archive"
gives, with the archived folder's rust-storage `read_change` `title` and
its path relative to the tree's root as `<archive path>`. When that commit
fails, retry SHALL write the archived folder's `.run/regressed/` files and
`.run/events/change.jsonl` back as they were before the retry, removing a
file that was absent, stage those paths again ignoring a failure, and fail
with `osq could not commit the archive: <output>`, `<output>` being the
`output` of `VcsError::Failed` or the display of any other `VcsError`.

#### Scenario: Archived retry equals TypeScript's
- **WHEN** a test builds the row's scratch repository as `crates/features/retry/tests/fixtures/archived-golden/print-archived-goldens.mjs.txt` describes, with `osq.toml` naming git on or off as the row says, and runs `retry` with the row's arguments at `<scratch>/repo`
- **THEN** the result, the archive folder's `.run/` tree, the tip subject of `osq/<folder>` and the worktree's `git status --porcelain` equal the row's golden in `crates/features/retry/tests/fixtures/archived-golden/`, a copy of `openspec/changes/290-rust-retry-archived/golden/`, written as that script writes them:

| Arguments | Git | Golden |
|---|---|---|
| `1`, `change` | on | `land-stop-001.txt` |
| `001-land-stop`, ` change ` | on | `land-stop-padded-001.txt` |
| `1`, `1` | on | `land-stop-task-001.txt` |
| `2`, `change` | on | `stale-002.txt` |
| `3`, `change` | on | `no-marker-003.txt` |
| `1`, `change` | off | `git-off-001.txt` |

#### Scenario: Archived retry commit fails
- **WHEN** the git-on repository of "Archived retry equals TypeScript's" also holds a `pre-commit` hook in its `.git/hooks/` that exits 1, and `retry` runs with `1`, `change`
- **THEN** it gives a `Failed` error for the command `retry` whose message starts with `osq could not record the retry: `, and the archive folder's `.run/` tree, the tip subject and the worktree status equal those `land-stop-task-001.txt` holds

#### Scenario: Failed archive commit retried
- **WHEN** a test builds the failed archive of `crates/features/retry/tests/fixtures/archive-failed/`: `<scratch>/repo` on `main` holding `osq.toml` naming git on with the author `osq <osq@example.com>`, and the folder's `before/openspec/specs/`, committed; a worktree at `<scratch>/trees/007-sample` on a new branch `osq/007-sample` holding `before/openspec/changes/007-sample/`, committed as `osq: 007 approved`; then the worktree's `openspec/` replaced by `after/openspec/`, staged with `git add -A -- openspec`, and the archived folder's `.run/regressed/change.md` and `.run/events/change.jsonl` written as the `tree:` of `archive-fails-007.txt` in that folder gives them, unstaged, so `git status --porcelain --untracked-files=all` in the worktree gives that golden's `status:` lines; and a test with no `pre-commit` hook runs `retry` with `007`, `change` at `<scratch>/repo`
- **THEN** it gives the output `Retried 007 change (next attempt: 2)\n  Reason: commit_failed\n  Retained: .run/regressed/change.1.md\n`; the full message of `osq/007-sample`'s tip is the `tip:` text of `worktree-007.txt` in that folder; `git show --no-renames --name-status --format=` of the tip lists that golden's `commit:` lines and also `A\topenspec/changes/archive/007-sample/.run/events/change.jsonl` and `A\topenspec/changes/archive/007-sample/.run/regressed/change.1.md`; the worktree's `git status --porcelain --untracked-files=all` is empty; the archived folder's `.run/regressed/` holds only `change.1.md`, holding the marker the failure wrote; and its `.run/events/change.jsonl` holds the failure's `regressed` line followed by a `retry` event whose data is `{"attempt":2,"reason":"commit_failed","target":"change"}`

#### Scenario: Failed archive commit retry refused
- **WHEN** a test builds the failed archive of "Failed archive commit retried" with a `pre-commit` hook in `<scratch>/repo/.git/hooks/` that prints `refused by hook` to stderr and exits 1, and runs `retry` with `007`, `change` at `<scratch>/repo`
- **THEN** it gives a `Failed` error for the command `retry` whose message starts with `osq could not commit the archive: ` and contains `refused by hook`; the archived folder's `.run/` tree, written as the golden's script writes it, is the `tree:` of `archive-fails-007.txt` in that folder; the tip of `osq/007-sample` is still `osq: 007 approved`; and the worktree's `git status --porcelain --untracked-files=all` lines are that golden's `status:` lines, as a set, with `?? openspec/changes/archive/007-sample/.run/events/change.jsonl` and `?? openspec/changes/archive/007-sample/.run/regressed/change.md` written `A  ` in place of `?? `
