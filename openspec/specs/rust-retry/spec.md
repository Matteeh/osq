# rust-retry Specification

## Purpose
The retry feature clears a dead or regressed task or change so it runs again, as TypeScript's `osq retry` does. It holds the feature's logic and its command, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/retry/** -->
The rust-retry capability SHALL own the `osq-feature-retry` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Retry crate ownership
- **WHEN** file ownership is resolved for the retry feature
- **THEN** system maps `crates/features/retry/**` to rust-retry

### Requirement: Retry command
`osq-feature-retry` SHALL expose one public item, `RetryFeature`, a unit
struct that implements core's `Feature` and derives `Clone`, `Copy`,
`Debug` and `Default`. Its `name()` is `retry`, and its `commands()` is one
command with the name `retry`, the summary `clear a dead or regressed task
or change so it runs again` and the usage `<id> <task|change>`. The crate
depends on `osq-core`, `osq-kernel-storage`, `osq-kernel-specs`,
`osq-kernel-config`, `osq-kernel-vcs` and `osq-kernel-harnesses`, and on no
feature crate.

#### Scenario: Retry feature commands
- **WHEN** a test reads `RetryFeature`'s name and commands
- **THEN** the name is `retry`, and the commands are exactly one, with the name `retry`, the summary `clear a dead or regressed task or change so it runs again` and the usage `<id> <task|change>`

### Requirement: Retry arguments
`RetryFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `retry`, and
`FeatureError::usage("retry", "expected a change id and a target, got <n>")`
for a `retry` invocation with `n` arguments when `n` is not 2, before it
reads any file. Every other failure of `retry` SHALL be
`FeatureError::failed` with the command `retry` and the message the other
retry requirements name.

#### Scenario: Retry argument errors
- **WHEN** a test runs the invocation in the row with a scratch root that holds no `openspec/` folder
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `retry` with args `1` | `Usage` error displayed `usage of retry: expected a change id and a target, got 1` |
| `retry` with args `1`, `2`, `3` | `Usage` error displayed `usage of retry: expected a change id and a target, got 3` |
| `inbox` with no args | `UnknownCommand` error displayed `unknown command: inbox` |

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

### Requirement: Retry record
A `retry` that is not refused and is not a recertification, as rust-retry
"Scope recertification" names one, SHALL, as TypeScript's
`retainFailureMarkers` and `appendTargetEvent` do:

- take the ordinal as one more than the highest `<n>` of any
  `<target>.<n>.md` in `.run/dead/` or `.run/regressed/`, or 1;
- rename `.run/regressed/<target>.md` to `<target>.<ordinal>.md`, then
  `.run/dead/<target>.md` to `<target>.<ordinal>.md`, then, for a task
  with a regressed marker, `.run/done/<target>` to
  `<target>.<ordinal>` when it exists, each when present;
- append to `.run/events/<target>.jsonl`, creating the folder, one
  `retry` event line through rust-core `event_line`, with the target, the
  reason, the attempt `ordinal + 1`, no `automatic` key, and the current
  time as an ISO 8601 UTC timestamp to the millisecond;
- return the output `Retried <id> task <task> (next attempt: <attempt>)`,
  or `Retried <id> change (next attempt: <attempt>)`, then
  `  Reason: <reason>` and one `  Retained: <path>` per renamed file in
  rename order, the path relative to the change folder with `/`, each
  line followed by a newline.

#### Scenario: Retry equals TypeScript's
- **WHEN** `retry` runs with the row's arguments on a new copy of `crates/features/retry/tests/fixtures/retry-project/`, after writing the row's running marker into the row's change folder, where a live pid is the test's own process id and a stale pid is `2147483646`
- **THEN** the result and the change folder's `.run/` tree, apart from `running/`, equal the row's golden in `crates/features/retry/tests/fixtures/golden/`, a copy of `openspec/changes/277-rust-retry/golden/`; the golden gives `outcome: output` and the output, or `outcome: failed` and the `Failed` message for the command `retry` with the copy's root written `<root>`, then `tree:` and each file as `--- <path>` and its text, an event line parsed, its `timestamp` written `<timestamp>`, and written back with sorted keys:

| Arguments | Change folder | Running marker | Golden |
|---|---|---|---|
| `1`, `1` | `001-dead` | none | `dead-001.txt` |
| `001`, ` 1 ` | `001-dead` | none | `padded-001.txt` |
| `2`, `1` | `002-history` | none | `history-002.txt` |
| `3`, `change` | `003-change-regressed` | none | `change-003.txt` |
| `3`, `1` | `003-change-regressed` | none | `change-003-task.txt` |
| `004`, `2` | `004-task-regressed` | none | `regressed-004.txt` |
| `005-dead-and-regressed`, `1` | `005-dead-and-regressed` | none | `both-005.txt` |
| `6`, `1` | `006-unapproved` | none | `unapproved-006.txt` |
| `7`, `1` | `007-stale` | none | `stale-007.txt` |
| `8`, `1` | `008-healthy` | none | `healthy-008.txt` |
| `8`, `change` | `008-healthy` | none | `healthy-008-change.txt` |
| `9`, `1` | `009-running` | `1.pid` with a live pid | `running-live-009.txt` |
| `9`, `1` | `009-running` | `1.pid` with a stale pid | `running-stale-009.txt` |
| `9`, `1` | `009-running` | `1.pid` holding `not json` | `running-garbage-009.txt` |
| `9`, `change` | `009-running` | `1.pid` with a live pid | `running-change-009.txt` |
| `9`, `1` | `009-running` | `2.pid` with a live pid | `running-other-009.txt` |
| `10`, `1` | `010-scope-plain` | none | `scope-plain-010.txt` |
| `13`, `1` | `013-blank-reason` | none | `blank-reason-013.txt` |
| `1`, `x` | `001-dead` | none | `bad-target.txt` |
| `99`, `1` | `001-dead` | none | `not-found.txt` |

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

### Requirement: Recertified done marker
A recertification SHALL take the task's scope hash from rust-storage
`task_scope_hash` of the tree root with the task file's `scope`, and, when
the verify passes, rewrite the done marker with rust-storage
`refresh_done_marker`, passing the recorded hash, that scope hash and the
current time as an ISO 8601 UTC timestamp to the millisecond. A
`DoneMarkerError` SHALL fail `retry` with a `Failed` error for the command
`retry` whose message is its display. The retry crate SHALL keep no scope
resolver, scope hash or frontmatter writer of its own.

#### Scenario: Recertified scope files
- **WHEN** a new copy of `crates/features/retry/tests/fixtures/recert-project/` has `openspec/changes/001-recert/tasks/4.md` rewritten to `---`, `title: t`, `verify: sh checks/pass.sh`, `scope:` and one `  - <entry as a JSON string>` line per row entry, then `---`, each line followed by a newline, and `.run/approved` rewritten to rust-storage `change_folder_seal` of that folder and a newline, and `retry` runs with `1`, `4`
- **THEN** the rewritten `.run/done/4` holds the row's `scope_hash` line, and its `scope_files` line and the indented lines after it are the row's:

| Scope entries | `scope_hash` | `scope_files` lines |
|---|---|---|
| `../outside.txt` | `sha256:985bc8dcecaee4913c191e1d3b327a931d48951f486500edd41ab73a57918030` | `scope_files:`, `  ../outside.txt: null` |
| `/abs/file.txt` | `sha256:d84705e84283af54e8d2e9a3d8f1a7f34c018c3aeb577b80d8186dd3577d841a` | `scope_files:`, `  /abs/file.txt: null` |
| `../*.txt`, `/abs/*.txt` | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `scope_files: {}` |
| `src` | `sha256:7aaf195b39732b39c116a660cd4ffe54eae09e8fc8a4970b2d7e295e68ad4892` | `scope_files:`, `  src: null` |
| `.\src\one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `scope_files:`, `  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| `src/two/*` | `sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d` | `scope_files:`, `  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7` |
| `src/two/deep/?.txt` | `sha256:3515f8747e9ad61510ae928351f0d194a568fb85538f2a36a8cf865bcc42f53a` | `scope_files:`, `  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/one.txt`, `./src/one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `scope_files:`, `  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| `src/two/**/*.txt` | `sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342` | `scope_files:`, `  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/**` | `sha256:d21bc7711678dcf1a2bd9bc1c5e7be5282b4baa70f6d001ba39ab0937d5ef4ac` | `scope_files:`, `  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae`, `  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |

#### Scenario: Recertified marker text
- **WHEN** a new copy of `crates/features/retry/tests/fixtures/recert-project/` has `openspec/changes/001-recert/.run/done/4` rewritten to `---`, `scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, the row's frontmatter line, `---` and `2026-10-01T10:00:00.000Z`, each line followed by a newline, and `retry` runs with `1`, `4`
- **THEN** the rewritten marker's lines start with `---`, `scope_hash: sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` and the row's lines:

| Frontmatter line | Lines |
|---|---|
| `flag: true` | `flag: true` |
| `note: ""` | `note: ""` |
| `stamp: "0x1f"` | `stamp: "0x1f"` |
| `stamp: "12e45"` | `stamp: "12e45"` |
| `stamp: "-1"` | `stamp: "-1"` |
| `stamp: "True"` | `stamp: "True"` |
| `stamp: "a:"` | `stamp: "a:"` |
| `stamp: a.b/c_d-e+f:g@h` | `stamp: a.b/c_d-e+f:g@h` |
| `stamp: 1.2.3` | `stamp: 1.2.3` |
| `nothing:` | `nothing: null` |
| `list: [{a: 1, b: [x]}, [y, z], {}, []]` | `list:`, `  - a: 1`, `    b:`, `      - x`, `  - - y`, `    - z`, `  - {}`, `  - []` |
| `nested: {a: {b: c}}` | `nested:`, `  a:`, `    b: c` |
| `codes: {7: seven}` | `codes:`, `  "7": seven` |
| `recertification_count: 0` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `recertification_count: "3"` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `original_scope_hash: ""` | `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, `scope_files:` |

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

### Requirement: Approval reaction
`RetryFeature`'s `reacts_to` SHALL give `EventKind::Approved` alone, and its
`react` SHALL clear the steering triggers of a change a human approved
again, as TypeScript's `retireSteering` in `src/core/spec/approve-steer.ts`
does through `retrySpec`, as the first reaction of ADR 030. For an
`approved` event delivered to a change folder, with `<tree>` the folder's
parent's parent's parent and `<id>` the folder name's leading digits,
`react` SHALL take each of the event's `targets`, in order, and:

- skip the target, writing nothing, when neither
  `.run/regressed/<target>.md` nor, for a task, `.run/dead/<target>.md`
  exists in the folder, or when the folder's `.run/events/<target>.jsonl`
  holds, with a timestamp not before the `approved` event's, a `retry` event
  whose `target` is the target, or a `regressed` or `dead` event whose
  `task` is the target, so an event delivered again changes nothing and
  never clears a failure recorded after the approval, such as the stop
  rust-approve "Default-branch approval" records when its sync stops;
- otherwise retry the target as `retry <id> <target>` retries a target of an
  active change in `<tree>`, as "Retry refusals", "Retry record" and "Scope
  recertification" say, without "Plan edits refusal", since the approval
  just committed the plan.

A refusal or a write error SHALL fail the reaction with that `FeatureError`,
leaving the targets before it retired, so the next delivery skips them and
tries the rest. With every target handled, and for any other event, `react`
SHALL return an `Output` with empty text; an event of another kind writes
nothing.

#### Scenario: Retry reacts to approvals
- **WHEN** a test reads `RetryFeature`'s `reacts_to`
- **THEN** it is `[EventKind::Approved]`

#### Scenario: Approval reaction retires triggers
- **WHEN** `react` runs with a `Reaction` for an `approved` event with the row's `targets`, timestamped now, on a scratch project with git off whose change folder `001-a` holds `tasks/1.md` and `tasks/2.md`, `.run/approved` with the folder's seal, `.run/dead/1.md` with `reason: blocked` and `.run/regressed/change.md` with `reason: verify_red`
- **THEN** it gives an `Output` with empty text, and the folder's `.run/` holds the row's files in place of those two markers, each `retry` line in `<target>.jsonl` with the row's `attempt` and the marker's reason; running `react` again with the same event leaves every file under `.run/` as it was:

| Targets | Files |
|---|---|
| `1` | `dead/1.1.md`, `regressed/change.md`, `events/1.jsonl` with attempt 2 |
| `change`, `1` | `dead/1.1.md`, `regressed/change.1.md`, `events/change.jsonl` and `events/1.jsonl`, each with attempt 2 |
| `2` | `dead/1.md`, `regressed/change.md`, and no event file |
| none | `dead/1.md`, `regressed/change.md`, and no event file |

#### Scenario: Later failures are kept
- **WHEN** `react` runs for an `approved` event with the `targets` `1` on the folder of "Approval reaction retires triggers", then a new `.run/dead/1.md` with `reason: verify_red` is written, and `react` runs again with the same event
- **THEN** the second run gives an `Output` with empty text, and `.run/dead/1.md` and `events/1.jsonl` keep the bytes they had before it

#### Scenario: Approval reaction refusals
- **WHEN** `react` runs for an `approved` event with the row's `targets` on the folder of "Approval reaction retires triggers" after the row's setup
- **THEN** it gives the `Failed` error that `retry 001 <target>` gives for the row's first refused target on a copy of that folder, and the row's files are as it says:

| Setup | Targets | Files |
|---|---|---|
| `.run/running/2.pid` holding `{"pid":999999,"startedAt":0}` | `1`, `change` | `dead/1.1.md` and `events/1.jsonl` written, `regressed/change.md` kept and no `events/change.jsonl` |
| `tasks/1.md` gains a line after `.run/approved` was written | `1` | `dead/1.md` kept and no event file |

#### Scenario: Other events are passed over
- **WHEN** `react` runs for a `rejected` event on the folder of "Approval reaction retires triggers"
- **THEN** it gives an `Output` with empty text and every file under `.run/` keeps its bytes

#### Scenario: Failures recorded after the approval are kept
- **WHEN** `react` runs for an `approved` event with the `targets` `change` and `1` on the folder of "Approval reaction retires triggers", after the row's line, timestamped one second after the event, is appended to the row's stream
- **THEN** it gives an `Output` with empty text, the row's target keeps its marker and its stream gains no `retry` line, and the other target is retired with attempt 2:

| Stream | Line | Kept target |
|---|---|---|
| `change.jsonl` | a `regressed` event whose `task` is `change` and whose `reason` is `sync_conflict` | `change` |
| `1.jsonl` | a `dead` event whose `task` is `1` and whose `reason` is `blocked` | `1` |
| `1.jsonl` | a `regressed` event whose `task` is `1` | `1` |
