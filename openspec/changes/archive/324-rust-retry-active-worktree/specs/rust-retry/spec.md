## MODIFIED Requirements

### Requirement: Retry refusals
`retry <id> <target>` SHALL refuse, in TypeScript's `retrySpec` order and
with its texts, writing nothing:

1. a target that, trimmed, is neither `change` nor all ASCII digits:
   `Invalid retry target "<target>": expected a numeric task or "change".`;
2. an id that matches no active change, matched as TypeScript's
   `matchesFolder` does among the active entries rust-retry "Active
   worktree retry" lists, and no archived change of an osq worktree as
   rust-retry "Archived retry" finds it:
   `Spec "<id>" not found in <root>/openspec/changes`;
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

### Requirement: Scope recertification
A task `retry` of an active change that passes refusals 1 to 7 SHALL be a
recertification, as in TypeScript's `retrySpec`, when the task has a
regressed marker and no dead marker, the reason is `scope_regression`, and
the frontmatter of `.run/done/<task>` holds a `scope_hash` that is a string
and not empty. The change's tree root is the root of the rust-storage
`ChangeTree` that holds its folder: the worktree for a change in an osq
worktree, else the root. A recertification SHALL, in this order:

1. read `tasks/<task>.md` of the change folder through rust-specs
   `read_task_file`, failing with that error's text;
2. load the root's config through rust-config `load_config`, failing with
   the config error's text;
3. run the task file's `verify` through rust-harnesses `run_verify` in the
   change's tree root, with the process environment as its source, no
   configured or agent names, `OSQ_CHANGE` set to the change folder's
   absolute path, no `OSQ_DIFF`, the timeout `timeouts.verifyTimeout` and
   the kill grace `timeouts.harnessKillGrace`, failing with the process
   error's text when the command cannot start;
4. take the task's current scope files and scope hash, as rust-retry
   "Recertified done marker" says, with paths relative to the change's
   tree root;
5. when the verify's exit code is 0, rewrite `.run/done/<task>` as rust-retry
   "Recertified done marker" says;
6. rename `.run/regressed/<task>.md` to `<task>.<ordinal>.md`, and when the
   exit code is not 0 also `.run/done/<task>` to `<task>.<ordinal>`, with the
   ordinal rust-retry "Retry record" takes;
7. append to `.run/events/<task>.jsonl` one `recertification` event line
   through rust-core `event_line`, with the current time as an ISO 8601 UTC
   timestamp to the millisecond, the task, the outcome `passed` for exit
   code 0 and `requeued` otherwise, the differing paths, the attribution,
   the command, the exit code, the output, whether it timed out, the done
   marker's `scope_hash` as the recorded hash and the current scope hash,
   and, only when requeued, the attempt `ordinal + 1` and the reason
   `scope_regression`, with no `automatic` key;
8. return `Recertified <id> task <task> (scope regression cleared)` when it
   passed, or `Requeued <id> task <task> for agent work (next attempt: <ordinal + 1>)`,
   then `  Reason: scope_regression` and one `  Retained: <path>` per
   renamed file in rename order, the path relative to the change folder
   with `/`, each line followed by a newline.

Steps 1 to 3 write nothing when they fail. The differing paths are the
lines of the regressed marker's body before its first blank line that
start with `- `, that prefix removed and the rest trimmed. The attribution
is the regressed marker's frontmatter `attribution` as JSON when it is a
list, and an empty list otherwise. The output is TypeScript's
`tailVerifyOutput` of the command's output with `limits.markerOutputLines`
lines and `limits.markerLineChars` characters: empty when the output is
blank after trimming its end; the output unchanged when the trimmed output
has at most that many lines and none longer than that many characters;
otherwise its last that many lines, each longer line cut to that many
characters followed by `… (<n> more characters)`, joined with a newline.

#### Scenario: Recertification equals TypeScript's
- **WHEN** `retry` runs with the row's arguments on a new copy of `crates/features/retry/tests/fixtures/recert-project/`
- **THEN** the output and the `.run/` tree of the copy's `openspec/changes/001-recert/` equal the row's golden in `crates/features/retry/tests/fixtures/recert-golden/`, a copy of `openspec/changes/297-rust-retry-scope-recert/golden/`, written as rust-retry "Retry equals TypeScript's" writes a golden, with every line outside an event file that starts `recertified_at: ` written `recertified_at: <timestamp>`:

| Arguments | Golden |
|---|---|
| `1`, `1` | `passed-1.txt` |
| `1`, `2` | `requeued-2.txt` |
| `001`, `3` | `long-3.txt` |
| `1`, `4` | `again-4.txt` |

#### Scenario: Recertification refusals
- **WHEN** a new copy of `crates/features/retry/tests/fixtures/recert-project/` also holds an `osq.toml` holding `bogus = 1`, and `retry` runs with `1`, `1`
- **THEN** it gives a `Failed` error for the command `retry` with the message `bogus is not an osq.toml key`, and every file in the copy apart from `osq.toml` is unchanged

## ADDED Requirements

### Requirement: Active worktree retry
With `vcs.enabled` and a rust-vcs `GitVcs` root, `retry` SHALL look for
the active change among the active entries of rust-storage
`list_tree_changes`, over `change_trees` built from the root's
`worktree_list` worktrees and no stacked folders, as TypeScript's
`findChange` does. A failing worktree listing SHALL fail `retry` with the
`VcsError`'s display. With vcs off, it SHALL look among the active
entries of `list_changes` for the root. Refusals 3 to 7, rust-retry
"Retry record" and rust-retry "Scope recertification" SHALL then apply to
the folder that entry names, in its own tree. A retry of an active change
SHALL commit nothing.

#### Scenario: Active worktree retry equals TypeScript's
- **WHEN** a test builds the row's scratch repository as `crates/features/retry/tests/fixtures/active-golden/print-active-goldens.mjs.txt` describes, from the change folders in `crates/features/retry/tests/fixtures/active-project/`, with `osq.toml` naming git on or off as the row says, and runs `retry` with the row's arguments at `<scratch>/repo`
- **THEN** the result, the worktree change folder's `.run/` tree, the tip subject of `osq/<folder>` and the worktree's `git status --porcelain --untracked-files=all` equal the row's golden in `crates/features/retry/tests/fixtures/active-golden/`, a copy of `openspec/changes/324-rust-retry-active-worktree/golden/`, written as that script writes them:

| Arguments | Git | Edit | Golden |
|---|---|---|---|
| `1`, `1` | on | none | `dead-001.txt` |
| `2`, `change` | on | none | `change-002.txt` |
| `3`, `1` | on | none | `recert-003.txt` |
| `4`, `1` | on | plan edits | `plan-edits-004.txt` |
| `4`, `1` | on | tasks ticked and a `.run` file | `tasks-only-004.txt` |
| `1`, `1` | on | a draft `001-dead` in the checkout | `draft-001.txt` |
| `1`, `1` | off | none | `git-off-001.txt` |

### Requirement: Plan edits refusal
After it finds an active change in a tree that names a folder, and before
refusal 3, `retry` SHALL refuse a change whose worktree holds plan edits
its last commit lacks, as TypeScript's `assertPlanCommitted` does, writing
nothing. It SHALL read rust-vcs `status` with a `GitVcs` at the tree's
root and the config's `timeouts`, failing with the `VcsError`'s display
when that fails. A plan edit is an entry's `path` or `from` that lies under
the change folder, relative to the tree's root with `/`, other than the
folder's `tasks.md` and anything under its `.run/`. The edits, relative to
the change folder, sorted by bytes and without repeats, give the refusal
`Change <id> has plan edits not committed in its worktree: <edits joined by ", ">. Run osq approve <id> to approve them.`
A change in the root's own tree is never refused this way.

#### Scenario: Plan edits refused
- **WHEN** a test builds the git-on repository of "Active worktree retry equals TypeScript's", then in `004-plan-edits`'s worktree renames `tasks/1.md` to `tasks/2.md` with `git mv` and writes `.run/extra.txt`, and runs `retry` with `4`, `1`
- **THEN** it gives a `Failed` error for the command `retry` with the message `Change 004 has plan edits not committed in its worktree: tasks/1.md, tasks/2.md. Run osq approve 004 to approve them.`, and the worktree's change folder is unchanged apart from those two edits
