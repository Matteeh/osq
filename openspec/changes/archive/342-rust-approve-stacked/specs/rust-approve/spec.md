## REMOVED Requirements

### Requirement: Stacked approval refusal
**Reason**: Rust approve now stacks such a change as TypeScript does, so it no longer refuses it.
**Migration**: "Stacked approval" records the stacked approval with the same selection, now including the chain-tip rule and the change's own `.run/stacked-on` lines.

## ADDED Requirements

### Requirement: Stacked approval
With git on, as "Worktree approval" says, once the refusals "Approval
refusals with git on" names have passed and "Rejected branch claim" has
renamed any rejected branch, `approve` SHALL work out what the change waits
for as TypeScript's `awaitedForApproval` in `src/core/spec/stack-overlap.ts`
does. When that is not empty, it SHALL record a stacked approval as
TypeScript's `recordStackedApproval` in `src/core/spec/stack-dependencies.ts`
does, in place of the branch and worktree "Worktree approval" makes.

The reads:

- The changes are rust-storage `list_tree_changes` of `change_trees` for
  the root, the worktrees rust-vcs `worktree_list` gives, and the folders
  directly under rust-vcs `stacked_root`. A folder's path is the path of
  the first of these changes with that folder name. A `depends_on` entry
  names the first change whose folder matches it as "Approve lookup"
  matches a query. An entry that names none is left out.
- A change's delta capabilities are the names of the folders directly
  under its `specs/`.
- A folder `<f>` reads, as TypeScript's `readDependencyState` gives it,
  with its hash:
  - landed when the default branch, read as "Approval refusals with git
    on" reads it, holds `openspec/changes/archive/<f>`;
  - otherwise, when the branch `osq/<f>` exists: archived when it holds
    `openspec/changes/archive/<f>/.run/approved`, approved when it holds
    `openspec/changes/<f>/.run/approved`, and unapproved otherwise, with
    that marker's text from rust-vcs `show`, trimmed, as its hash;
  - otherwise approved, with the first of these files that exists, trimmed,
    as its hash: `<f>/openspec/changes/<f>/.run/approved` under
    `stacked_root`, then the root's `openspec/changes/<f>/.run/approved`,
    then its `openspec/changes/archive/<f>/.run/approved`;
  - otherwise unapproved.
  A folder is awaited when it reads approved or archived.
- A `.run/stacked-on` line, split on whitespace, is an overlap line when
  it has a folder, a hash, the word `overlap` and a fourth word. Its
  capabilities are that word's `,`-separated parts, empty ones left out.
  Every other line is passed over.
- The awaited entries of a change folder at `<p>` are, in order:
  - each `depends_on` entry of `<p>/proposal.md` that names an awaited
    folder not named yet, as a declared entry with that folder's hash;
  - then each overlap line of `<p>/.run/stacked-on` whose folder no
    earlier entry names and is awaited, as an overlap entry with the
    line's hash and capabilities.
- The overlaps are each other awaited change folder, once per name, that
  shares a delta capability with the change, as an overlap entry with its
  hash and the shared capabilities, sorted. The overlaps are sorted by
  folder name. A change with no delta capability has none.
- The closure of a folder `<f>` is every folder reached by following
  awaited entries from `<f>`'s path, then from each folder reached, leaving
  out `<f>`. A folder with no path adds nothing.
- What the change waits for is the awaited entries of the checkout's change
  folder. After them come each of the overlaps that no earlier entry names
  and that no closure of another endpoint holds, where the endpoints are the
  folders of those entries and of the overlaps, each once.

With `<stacked>` the folder `<folder>` under `stacked_root` for `vcs`, the
folder `project_git_root` gives and the `HOME` variable, empty when unset,
and `<seal>` as "Worktree approval" says, a stacked approval SHALL, in this
order:

1. remove `<stacked>` when it exists;
2. copy the checkout's change folder, `.run/` included, to
   `<stacked>/openspec/changes/<folder>`;
3. write `<seal>` and a newline to the copy's `.run/approved`, creating
   `.run/` when needed, and `.run/approver` as "Worktree approval" writes
   it;
4. write the copy's `.run/stacked-on`: one line per entry of what the
   change waits for, in order, `<folder> <hash>` for a declared entry and
   `<folder> <hash> overlap <capabilities>` for an overlap entry, with the
   capabilities joined by `,`, the lines joined by a newline, with none
   after the last;
5. remove the checkout's change folder, unless rust-vcs `path_exists` says
   `HEAD` holds `openspec/changes/<folder>`.

A stacked approval makes no branch, worktree or commit, adds no line to the
tree record, and writes no `.run/base` and no event. A `VcsError` or a file
error SHALL fail with its display. `approve` SHALL then return as its output
`Approved <id> (<folder>)`, `  Hash: <seal>`, the line "Rejected branch
claim" adds when it renamed a branch, `  Waiting for: <folders>` with the
folders of what the change waits for joined by `, `, one
`  Runs after <f>, which also writes <capabilities>` per overlap entry, in
order, with its capabilities joined by `, `, and `  Stacked: <stacked>`,
each followed by a newline. As in "Worktree approval", it writes no
`.run/manifest.json` and no `.run/plan.jsonl` and prints no digest lines.

#### Scenario: Stacked approvals equal TypeScript's
- **WHEN** `approve` runs with each query of the row's steps in turn on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings, after the row's setup, where `003-alpha-thrice` and `004-alpha-four` are uncommitted copies of the folder `001-alpha-twice` under those names, made before the first run
- **THEN** the last run's outcome and approval lines, the `osq/` branches, the osq worktrees, whether the queried folder's checkout copy exists, the lines of `<root>/repo/.git/osq-trees.jsonl` with each `at` written as `<at>`, every file under `<root>/worktrees/repo/.stacked/<folder>` and the stacked copy's `.run/` files, written as `golden/print-stacked-goldens.mjs.txt` writes them, equal `tests/fixtures/stacked-golden/<golden>`, which TypeScript's built `dist` printed for the same repository:

| Golden | Steps | Setup |
|---|---|---|
| `overlap-003.txt` | `1`, `3` | `003-alpha-thrice` exists |
| `chain-004.txt` | `1`, `3`, `4` | `003-alpha-thrice` and `004-alpha-four` exist |
| `declared-002.txt` | `1`, `2` | `002-gamma`'s proposal says `depends_on: ["001"]` |
| `kept-003.txt` | `1`, `3` | `003-alpha-thrice` exists; a branch `osq/003-alpha-thrice` whose one commit past `main` adds `openspec/changes/rejected/003-alpha-thrice/.run/rejected.md` |

#### Scenario: What a stacked approval waits for
- **WHEN** `approve` runs with the row's query on a repository built as "Worktree approvals equal TypeScript's" builds it, with no settings, after the row's setup, where `003-alpha-thrice` is a copy of the folder `001-alpha-twice` under that name, not committed, `<seal>` is `sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1`, and "sealed" is a `.run/approved` holding `sealed` and a newline
- **THEN** it gives an `Output`, and `<root>/worktrees/repo/.stacked/<folder>/openspec/changes/<folder>/.run/stacked-on` for the queried folder holds the row's lines, joined by a newline with none after the last, or, where the row says not stacked, it creates the branch `osq/<folder>` and no folder `<root>/worktrees/repo/.stacked/<folder>`:

| Setup | Query | Result |
|---|---|---|
| `approve` ran with `1`; `002-gamma`'s proposal says `depends_on: ["001"]` | `2` | `001-alpha-twice <seal>` |
| `002-gamma`'s proposal says `depends_on: ["001"]` | `2` | not stacked |
| `003-alpha-thrice` exists and `approve` ran with `3` | `1` | `003-alpha-thrice <seal> overlap alpha` |
| `approve` ran with `2` | `1` | not stacked |
| `<root>/worktrees/repo/.stacked/003-alpha-thrice/openspec/changes/003-alpha-thrice` is a copy of `001-alpha-twice` that is sealed | `1` | `003-alpha-thrice sealed overlap alpha` |
| `002-gamma`'s proposal says `depends_on: ["001"]`; a branch `osq/001-alpha-twice` whose one commit past `main` adds `openspec/changes/archive/001-alpha-twice/.run/approved`, sealed | `2` | `001-alpha-twice sealed` |
| `003-alpha-thrice` exists and `approve` ran with `3`; `001-alpha-twice`'s proposal says `depends_on: ["003"]` | `1` | `003-alpha-thrice <seal>` |
| `002-gamma`'s proposal says `depends_on: ["001"]`; `main` gains a commit that adds `openspec/changes/archive/001-alpha-twice/` as a copy of `001-alpha-twice` that is sealed | `2` | not stacked |
| `approve` ran with `2`; `001-alpha-twice/.run/stacked-on` in the checkout holds `002-gamma sha256:old overlap gamma,,beta` and a newline, then `junk`, then `001-alpha-twice x` | `1` | `002-gamma sha256:old overlap gamma,beta` |
| `approve` ran with `2`; `001-alpha-twice/.run/stacked-on` in the checkout holds `003-alpha-thrice sha256:old overlap alpha` | `1` | not stacked |

#### Scenario: Stacked folder replaced
- **WHEN** `approve` runs with the query `1` and then `3` on a repository built as the row `overlap-003.txt` of "Stacked approvals equal TypeScript's" builds it, which also holds the file `<root>/worktrees/repo/.stacked/003-alpha-thrice/note.txt`, written before the first run
- **THEN** the second run gives an `Output`, and the folder `<root>/worktrees/repo/.stacked/003-alpha-thrice` holds no `note.txt`

## MODIFIED Requirements

### Requirement: Worktree approval
`approve` SHALL read `osq.toml` with rust-config `load_config` after it
checks its arguments and before it reads any change, failing with the
`ConfigError`'s display when it cannot. Right after it, `approve` SHALL
call rust-vcs `project_git_root` on the root and fail with the `NestedRoot`'s
display when it gives one, as rust-vcs "Project root check" says. Git is on
when `project_git_root` gives a folder. With git on, once every check the other approve
requirements name has passed, and when "Stacked approval" finds nothing the
change waits for, `approve` SHALL approve the change into its
own branch and worktree as TypeScript's `approveIntoNewWorktree` in
`src/core/spec/approve-worktree.ts` does, instead of writing the
checkout's marker as "Approval marker" says. With git off, including when
git cannot start, it SHALL approve in the checkout as "Approval marker"
says, as TypeScript does when `selectVcs` gives no git.

Here `<seal>` is the seal rust-storage `change_folder_seal` gives for the
checkout's change folder; `<repo>` is the folder `project_git_root` gives;
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
- **WHEN** `approve` runs with the query `1` on a scratch copy of `tests/fixtures/approve-repo` under `CARGO_TARGET_TMPDIR`, which sits inside this repository's git work tree but is not its top level, with an `osq.toml` whose `[vcs]` table sets `enabled = false` and `author = "Osq Bot <bot@example.com>"`
- **THEN** it gives the output `Approved 001 (001-alpha-twice)\n  Hash: sha256:9aee5f041660ed83152089fd3d7880dd5fb428427af3e27e1aa995cd95b34ad1\n`, written with `\n` escapes, and the copy's `openspec/changes/001-alpha-twice/.run/approved` holds that seal and a newline

#### Scenario: Stacked copy removed
- **WHEN** `approve` runs with the query `1` on the repository of the row `draft-001.txt` of "Worktree approvals equal TypeScript's", which also holds the file `<root>/worktrees/repo/.stacked/001-alpha-twice/note.txt`
- **THEN** it gives an `Output`, and the folder `<root>/worktrees/repo/.stacked/001-alpha-twice` no longer exists

#### Scenario: Unreadable config
- **WHEN** `approve` runs with the query `1` on a scratch copy of `tests/fixtures/approve-repo` whose `osq.toml` holds a `[vcs]` table with `enabled = "yes"`
- **THEN** it gives a `Failed` error displayed `approve failed: vcs.enabled must be a boolean`, and the copy's `openspec/changes/001-alpha-twice/.run/` does not exist

### Requirement: Rejected branch claim
When `osq/<folder>` exists, its tip holds
`openspec/changes/rejected/<folder>/.run/rejected.md`, and no worktree has
it checked out, `approve` SHALL, once every refusal has passed and before
any other write, rename it with rust-vcs `rename_branch` to
`osq/<folder>-rejected-<n>`, with the lowest `<n>` from 1 that no branch
rust-vcs `list_branches` gives for the prefix `osq/<folder>-rejected-`
has, as TypeScript's `claimBranch` in `src/core/spec/approve-branch.ts`
does. As in TypeScript, it renames the branch before "Stacked approval"
decides whether the change stacks, so a stacked approval renames it too.
Its output, worktree or stacked, SHALL then hold
`  Kept rejected branch: <kept>` and a newline right after the hash line,
where `<kept>` is the new name.

#### Scenario: Kept branch name skips a taken one
- **WHEN** `approve` runs with the query `1` on the repository of the row `rejected-branch-001.txt` of "Worktree refusals equal TypeScript's", which also holds a branch `osq/001-alpha-twice-rejected-1` at `main`
- **THEN** its output's third line is `  Kept rejected branch: osq/001-alpha-twice-rejected-2`, and the `osq/` branches are `osq/001-alpha-twice`, `osq/001-alpha-twice-rejected-1` and `osq/001-alpha-twice-rejected-2`
