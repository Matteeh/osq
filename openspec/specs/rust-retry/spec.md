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
`osq-kernel-config` and `osq-kernel-vcs`, and on no feature crate.

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
2. an id that matches no active change, matched as TypeScript's
   `matchesFolder` does among rust-storage `list_changes` entries, and no
   archived change of an osq worktree as rust-retry "Archived retry" finds
   it: `Spec "<id>" not found in <root>/openspec/changes`;
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
   `Marker reason "<reason>" is not one osq knows; retry is refused.`;
8. a task whose regressed marker gives `scope_regression`, with no dead
   marker, whose `.run/done/<task>` frontmatter holds a `scope_hash` that is
   a string and not empty:
   `Task <task> of <folder> needs recertification, which Rust retry does not run yet; run the TypeScript osq retry.`

`<id>` here is the folder's leading digits, or the whole folder name when
it has none. A process is running when `pid` is above 0 and `/proc/<pid>`
exists. The reason is the regressed marker's, else the dead marker's,
read as the frontmatter `reason` trimmed through rust-specs
`parse_frontmatter`; when that is missing, blank, not a string or the
frontmatter does not parse, it is `regressed` or `dead` respectively.

#### Scenario: Retry refusals osq adds
- **WHEN** `retry` runs with the row's arguments on a copy of `crates/features/retry/tests/fixtures/retry-project/`
- **THEN** it gives a `Failed` error for the command `retry` with the row's message and leaves every file in the copy unchanged:

| Arguments | Message |
|---|---|
| `12`, `1` | `Marker reason "weird" is not one osq knows; retry is refused.` |
| `11`, `1` | `Task 1 of 011-scope-hash needs recertification, which Rust retry does not run yet; run the TypeScript osq retry.` |

### Requirement: Retry record
A `retry` that is not refused SHALL, as TypeScript's
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
tree naming a folder and matches the id as `matchesFolder` does. Without
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
