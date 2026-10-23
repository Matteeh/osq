## MODIFIED Requirements

### Requirement: Worktree approval
`approve` SHALL read `osq.toml` with rust-config `load_config` after it
checks its arguments and before it reads any change, failing with the
`ConfigError`'s display when it cannot. Right after it, `approve` SHALL
call rust-vcs `project_git_root` on the root and fail with the `NestedRoot`'s
display when it gives one, as rust-vcs "Project root check" says. Git is on
when `project_git_root` gives a folder. With git on, once every check the other approve
requirements name has passed, `approve` SHALL approve the change into its
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
