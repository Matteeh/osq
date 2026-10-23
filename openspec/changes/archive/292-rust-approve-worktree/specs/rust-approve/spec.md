## MODIFIED Requirements

### Requirement: Approve feature
`osq-feature-approve` SHALL expose one public item, the unit struct
`ApproveFeature`, which implements rust-core's `Feature`, holds no storage
connection (ADR 028), and derives `Clone`, `Copy`, `Debug` and `Default`.
Its `name` SHALL be `approve`, and its `commands` SHALL be `approve` and then
`reject`, with the summaries and usages "Approve feature commands" gives.

#### Scenario: Approve feature commands
- **WHEN** a test reads `ApproveFeature`'s name and commands
- **THEN** the name is `approve`, and the commands are, in order, one with the name `approve`, the summary `lint, hash, and approve change folders` and the usage `<id> [--base-ok] [--ignore-dirty]`, and one with the name `reject`, the summary `move an eligible active change intact into rejected history` and the usage `<id> --reason <text>`

### Requirement: Approve arguments
`ApproveFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `approve` and `reject`. An
`approve` invocation's arguments `--base-ok` and `--ignore-dirty` are
flags, which may appear anywhere and more than once, and every other
argument is a change id. `approve` SHALL return
`FeatureError::usage("approve", "expected one change id, got <n>")` for an
invocation with `n` change ids when `n` is not 1, before it reads any
file. The flags change only what "Approval refusals with git on" refuses.
Every other failure of `approve` SHALL be `FeatureError::failed` with the
command `approve` and the message the other approve requirements name.

#### Scenario: Approve argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `approve` with no args | `Usage` error displayed `usage of approve: expected one change id, got 0` |
| `approve` with args `1`, `2` | `Usage` error displayed `usage of approve: expected one change id, got 2` |
| `queue` with args `1` | `UnknownCommand` error displayed `unknown command: queue` |
| `approve` with args `--base-ok`, `--ignore-dirty` | `Usage` error displayed `usage of approve: expected one change id, got 0` |
| `approve` with args `1`, `--base-ok`, `2` | `Usage` error displayed `usage of approve: expected one change id, got 2` |
| `approve` with args `--ignore-dirty`, `9`, `--base-ok`, `--base-ok` | `Failed` error displayed `approve failed: Spec "9" not found in <root>/openspec/changes` |

## ADDED Requirements

### Requirement: Worktree approval
`approve` SHALL read `osq.toml` with rust-config `load_config` after it
checks its arguments and before it reads any change, failing with the
`ConfigError`'s display when it cannot. Git is on when `vcs.enabled` is
true and rust-vcs `GitVcs::root`, run in the root with the config's
`timeouts`, gives a folder that is the root itself once both are
canonicalized. With git on, once every check the other approve
requirements name has passed, `approve` SHALL approve the change into its
own branch and worktree as TypeScript's `approveIntoNewWorktree` in
`src/core/spec/approve-worktree.ts` does, instead of writing the
checkout's marker as "Approval marker" says. With git off, including when
git cannot start, it SHALL approve in the checkout as "Approval marker"
says, as TypeScript does when `selectVcs` gives no git.

Here `<seal>` is the seal rust-storage `change_folder_seal` gives for the
checkout's change folder; `<repo>` is the folder `GitVcs::root` gives;
`<worktree>` is the parent of rust-vcs `stacked_root` for `vcs`, `<repo>`
and the `HOME` variable, empty when unset, joined with `<folder>`;
`<branch>` is `osq/<folder>`; `<base>` is HEAD's commit from rust-vcs
`head`; and "record `<op>` for `<path>`" means rust-vcs
`append_tree_record` to the path rust-vcs `tree_record_path` gives for the
root, read once before the first write, with the time now as
`YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC, `<op>` and `<path>`, and nothing when
that path is none, as TypeScript's `RecordingGitVcs` records. With git on,
`approve` SHALL, in this order:

1. create `<worktree>`'s parent folders, create `<branch>` at `<base>`, or
   at `HEAD` when HEAD has no commit, add the worktree `<worktree>` for
   `<branch>`, and record `worktree-add` for the root, as the invocation
   gives it;
2. when `vcs.prepare` is set, run it in `<worktree>` with rust-harnesses
   `run_verify`, with the process's variables as its source, no configured
   or agent names, no change, diff or extra variables, the config's
   `timeouts.verify_timeout` as its timeout and its
   `timeouts.harness_kill_grace` as its grace. On an exit other than 0, or
   a `ProcessError`, it SHALL roll back and then fail with
   `prepare failed in worktree <worktree> on branch <branch>:`, a newline
   and the output or the error's display, as TypeScript's `runPrepare`
   words it. Unlike TypeScript, which leaves the branch and worktree in
   place, the rollback removes the folder `<worktree>`, runs rust-vcs
   `worktree_prune` in the root, records `worktree-prune` for the root, and
   deletes `<branch>` with rust-vcs `delete_branch`, so a second `approve`
   needs no cleanup. The branch then still points at `<base>` and holds no
   commit of its own, because the approval commit comes after prepare, and
   `delete_branch` refuses any branch HEAD does not hold (ADR 003). When a
   rollback step fails, the rollback stops and the message gains a newline
   and `rollback failed: ` with that error's display;
3. replace `<worktree>/openspec/changes/<folder>` with a copy of the
   checkout's change folder, `.run/` included;
4. write `<seal>` and a newline to the copy's `.run/approved`, `<base>`,
   empty without one, and a newline to `.run/base`, and `<name> <<email>>`
   and a newline to `.run/approver`, where `<name>` and `<email>` are
   rust-vcs `config_value` of `user.name` and `user.email` in the root,
   each empty when unset;
5. commit `openspec/changes/<folder>` with a `GitVcs` in `<worktree>`, the
   message `osq: <id> approved` and the author `vcs.author`, and record
   `commit` for `<worktree>`;
6. remove the folder `<folder>` under rust-vcs `stacked_root` when it
   exists;
7. remove the checkout's change folder, unless rust-vcs `path_exists` says
   `HEAD` holds `openspec/changes/<folder>`.

A `VcsError` or a file error SHALL fail with its display. `approve` SHALL
then return as its output `Approved <id> (<folder>)`, `  Hash: <seal>`,
the line "Rejected branch claim" adds when it renamed a branch,
`  Worktree: <worktree>` and `  Branch: <branch>`, each followed by a
newline, where `<id>` is as "Approval marker" says. Unlike TypeScript, it
writes no `.run/manifest.json` and no `.run/plan.jsonl`, prints no digest
lines, and runs prepare with the verify role's environment.

#### Scenario: Worktree approvals equal TypeScript's
- **WHEN** `approve` runs with the row's query on a scratch git repository `<root>/repo` built as `golden/print-goldens.mjs.txt` builds it: a copy of `tests/fixtures/approve-repo` on the branch `main`, whose one commit holds every file but the folder `openspec/changes/001-alpha-twice`, with the git settings `user.name` `Osq Tester` and `user.email` `tester@example.com`, and an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled = true`, `author = "Osq Bot <bot@example.com>"`, `worktreeRoot` to `<root>/worktrees` and the row's settings
- **THEN** its outcome, its approval lines or its message, the `osq/` branches, the osq worktrees, whether the checkout's copy exists, the approval commit, the lines of `<root>/repo/.git/osq-trees.jsonl` with each `at` written as `<at>`, and the worktree copy's `.run/` files, written as the script writes them, equal `tests/fixtures/approve-worktree/<golden>`, which TypeScript's built `dist` printed for the same repository:

| Golden | Query | Settings |
|---|---|---|
| `draft-001.txt` | `1` | none |
| `committed-002.txt` | `2` | none |
| `prepare-passes-001.txt` | `1` | `prepare = "echo prepared > prepared.txt"` |

#### Scenario: Prepare failure rolls back
- **WHEN** `approve` runs with the query `1` on a repository built as "Worktree approvals equal TypeScript's" builds it with the setting `prepare = "echo prepare said no; exit 3"`, and then, after `osq.toml`'s `prepare` is changed to `echo prepared > prepared.txt`, runs with the query `1` again
- **THEN** the first run gives a `Failed` error whose message, trailing whitespace dropped, is the message of `tests/fixtures/approve-worktree/prepare-fails-001.txt`, `prepare failed in worktree <root>/worktrees/repo/001-alpha-twice on branch osq/001-alpha-twice:\nprepare said no`, written with `\n` escapes; after it there is no `osq/` branch, no osq worktree and no folder `<root>/worktrees/repo/001-alpha-twice`, the checkout's copy exists, and the tree record's lines are `{"at":"<at>","op":"worktree-add","root":"<root>/repo"}` and `{"at":"<at>","op":"worktree-prune","root":"<root>/repo"}`, where TypeScript's golden keeps the branch and the worktree; the second run gives an `Output`, and its golden text equals `prepare-passes-001.txt` except that its record section starts with those two lines

#### Scenario: Git off approves in the checkout
- **WHEN** `approve` runs with the query `1` on a scratch copy of `tests/fixtures/approve-repo` under `CARGO_TARGET_TMPDIR`, which sits inside this repository's git work tree but is not its top level, with an `osq.toml` whose `[vcs]` table sets `enabled = true` and `author = "Osq Bot <bot@example.com>"`
- **THEN** it gives the output `Approved 001 (001-alpha-twice)\n  Hash: sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1\n`, written with `\n` escapes, and the copy's `openspec/changes/001-alpha-twice/.run/approved` holds that seal and a newline

#### Scenario: Stacked copy removed
- **WHEN** `approve` runs with the query `1` on the repository of the row `draft-001.txt` of "Worktree approvals equal TypeScript's", which also holds the file `<root>/worktrees/repo/.stacked/001-alpha-twice/note.txt`
- **THEN** it gives an `Output`, and the folder `<root>/worktrees/repo/.stacked/001-alpha-twice` no longer exists

#### Scenario: Unreadable config
- **WHEN** `approve` runs with the query `1` on a scratch copy of `tests/fixtures/approve-repo` whose `osq.toml` holds a `[vcs]` table with `enabled = "yes"`
- **THEN** it gives a `Failed` error displayed `approve failed: vcs.enabled must be a boolean`, and the copy's `openspec/changes/001-alpha-twice/.run/` does not exist

### Requirement: Approval refusals with git on
With git on, as "Worktree approval" says, once every check the other
approve requirements name has passed and before any write, `approve` SHALL
refuse, in this order, as TypeScript's `approveIntoWorktree` does:

- unless `--base-ok` was given, HEAD on a branch other than the default
  branch, with `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where `<branch>` is the branch rust-vcs `head` gives, or `a detached HEAD`
  when it gives none, and `<default>` is rust-vcs `default_branch` with
  `vcs.defaultBranch`, or `main` when it is unset, as its fallback;
- unless `--ignore-dirty` was given, rust-vcs `status` entries whose path,
  or whose old path, the `scope` of some task of the change covers, by
  rust-core `scope_covers_path`, with
  `uncommitted changes in task scope: <paths>; <advice>`, where `<paths>`
  are those paths, sorted, each once, joined by `, `, and `<advice>` is
  `keep them with osq manual "<why>", commit them, or pass --ignore-dirty`,
  or `commit them or pass --ignore-dirty` when `vcs.manualEdits` is
  `block`;
- an existing `osq/<folder>` branch, by rust-vcs `list_branches`, whose
  tip lacks `openspec/changes/rejected/<folder>/.run/rejected.md` or that a
  worktree from rust-vcs `worktree_list` has checked out, with
  `branch osq/<folder> already exists`.

A refusal SHALL leave every branch, worktree and file as it was.

#### Scenario: Worktree refusals equal TypeScript's
- **WHEN** `approve` runs with the row's arguments on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings except the row's, after the row's setup
- **THEN** its outcome, its approval lines or its message, the `osq/` branches, the osq worktrees, whether the checkout's copy exists, the approval commit and the worktree copy's `.run/` files equal `tests/fixtures/approve-worktree/<golden>`:

| Golden | Arguments | Setup |
|---|---|---|
| `off-default-001.txt` | `1` | HEAD on a new branch `feature` at `main` |
| `base-ok-001.txt` | `1`, `--base-ok` | HEAD on a new branch `feature` at `main` |
| `dirty-keep-001.txt` | `1` | `src/alpha/index.js` holds `module.exports = { runs: 3 };` and a newline, not committed |
| `dirty-block-001.txt` | `1` | as `dirty-keep-001.txt`, with the setting `manualEdits = "block"` |
| `ignore-dirty-001.txt` | `1`, `--ignore-dirty` | as `dirty-keep-001.txt` |
| `branch-exists-001.txt` | `1` | a branch `osq/001-alpha-twice` at `main` |
| `rejected-branch-001.txt` | `1` | a branch `osq/001-alpha-twice` whose one commit past `main` adds `openspec/changes/rejected/001-alpha-twice/.run/rejected.md` |

#### Scenario: More refusals with git on
- **WHEN** `approve` runs with the query `1` on a repository built as "Worktree approvals equal TypeScript's" builds it, with the row's settings, after the row's setup
- **THEN** it gives a `Failed` error displayed `approve failed: ` and the row's message, and the `osq/` branches, the osq worktrees and the checkout's copy are as they were before the run:

| Setup | Settings | Message |
|---|---|---|
| HEAD detached at `main`'s commit | none | `HEAD is on a detached HEAD, not the default branch main; pass --base-ok to approve from it` |
| none | `defaultBranch = "trunk"` | `HEAD is on main, not the default branch trunk; pass --base-ok to approve from it` |
| `src/alpha/index.js` renamed to `src/alpha/moved.js` with `git mv` | none | `uncommitted changes in task scope: src/alpha/index.js; keep them with osq manual "<why>", commit them, or pass --ignore-dirty` |
| the branch of `rejected-branch-001.txt`, checked out in a worktree at `<root>/other` | none | `branch osq/001-alpha-twice already exists` |

### Requirement: Rejected branch claim
When `osq/<folder>` exists, its tip holds
`openspec/changes/rejected/<folder>/.run/rejected.md`, and no worktree has
it checked out, `approve` SHALL, once every refusal has passed and before
any other write, rename it with rust-vcs `rename_branch` to
`osq/<folder>-rejected-<n>`, with the lowest `<n>` from 1 that no branch
rust-vcs `list_branches` gives for the prefix `osq/<folder>-rejected-`
has, as TypeScript's `claimBranch` in `src/core/spec/approve-branch.ts`
does. Unlike TypeScript, which renames it before deciding whether the
change stacks, Rust renames it after "Stacked approval refusal" has
passed, so a refused change renames nothing. Its output SHALL then hold
`  Kept rejected branch: <kept>` and a newline right after the hash line,
where `<kept>` is the new name.

#### Scenario: Kept branch name skips a taken one
- **WHEN** `approve` runs with the query `1` on the repository of the row `rejected-branch-001.txt` of "Worktree refusals equal TypeScript's", which also holds a branch `osq/001-alpha-twice-rejected-1` at `main`
- **THEN** its output's third line is `  Kept rejected branch: osq/001-alpha-twice-rejected-2`, and the `osq/` branches are `osq/001-alpha-twice`, `osq/001-alpha-twice-rejected-1` and `osq/001-alpha-twice-rejected-2`

### Requirement: Stacked approval refusal
With git on, as "Worktree approval" says, once the refusals "Approval
refusals with git on" names have passed and before any write, `approve`
SHALL refuse a change TypeScript's `awaitedForApproval` in
`src/core/spec/stack-overlap.ts` would stack, with
`Change <folder> would stack on <folders>. Rust approve does not stack approvals yet.`,
where `<folders>` are joined by `, `: first each `depends_on` entry of the
change's proposal, in order, whose folder reads approved or archived, then
each other change folder that shares a delta capability with the change
and reads approved or archived, sorted by name, each folder once. Unlike
TypeScript, which stacks such a change, Rust refuses it, and it reads no
`.run/stacked-on` lines from the change's folder.

- The changes are rust-storage `list_tree_changes` of `change_trees` for
  the root, the worktrees rust-vcs `worktree_list` gives, and the folders
  directly under rust-vcs `stacked_root`. A `depends_on` entry names the
  first change whose folder matches it as "Approve lookup" matches a
  query, and an entry that names none is left out.
- A change's delta capabilities are the names of the folders directly
  under its `specs/`.
- A folder `<f>` reads, as TypeScript's `readDependencyState` gives it:
  landed when the default branch, read as "Approval refusals with git on"
  reads it, holds `openspec/changes/archive/<f>`; otherwise, when the
  branch `osq/<f>` exists, archived when it holds
  `openspec/changes/archive/<f>/.run/approved`, approved when it holds
  `openspec/changes/<f>/.run/approved`, and unapproved otherwise;
  otherwise approved when `<f>/openspec/changes/<f>/.run/approved` under
  `stacked_root`, or the root's `openspec/changes/<f>/.run/approved` or
  `openspec/changes/archive/<f>/.run/approved`, exists; and unapproved
  otherwise.

#### Scenario: Stacking refusals
- **WHEN** `approve` runs with the row's query on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings, after the row's setup, where `003-alpha-thrice` is a copy of the folder `001-alpha-twice` under that name, not committed
- **THEN** it gives a `Failed` error displayed `approve failed: ` and the row's message, and creates no branch, or, where the row says approved, it gives an `Output` and creates the branch `osq/<folder>` for the queried folder:

| Setup | Query | Result |
|---|---|---|
| `approve` ran with `1`; `002-gamma`'s proposal says `depends_on: ["001"]` | `2` | `Change 002-gamma would stack on 001-alpha-twice. Rust approve does not stack approvals yet.` |
| `002-gamma`'s proposal says `depends_on: ["001"]` | `2` | approved |
| `003-alpha-thrice` exists and `approve` ran with `3` | `1` | `Change 001-alpha-twice would stack on 003-alpha-thrice. Rust approve does not stack approvals yet.` |
| `approve` ran with `2` | `1` | approved |
| `<root>/worktrees/repo/.stacked/003-alpha-thrice/openspec/changes/003-alpha-thrice` is a copy of `001-alpha-twice` holding `.run/approved` | `1` | `Change 001-alpha-twice would stack on 003-alpha-thrice. Rust approve does not stack approvals yet.` |
| `002-gamma`'s proposal says `depends_on: ["001"]`; a branch `osq/001-alpha-twice` whose one commit past `main` adds `openspec/changes/archive/001-alpha-twice/.run/approved` | `2` | `Change 002-gamma would stack on 001-alpha-twice. Rust approve does not stack approvals yet.` |
| `003-alpha-thrice` exists and `approve` ran with `3`; `001-alpha-twice`'s proposal says `depends_on: ["003"]` | `1` | `Change 001-alpha-twice would stack on 003-alpha-thrice. Rust approve does not stack approvals yet.` |
| `002-gamma`'s proposal says `depends_on: ["001"]`; `main` gains a commit that adds `openspec/changes/archive/001-alpha-twice/` as a copy of `001-alpha-twice` holding `.run/approved` | `2` | approved |
