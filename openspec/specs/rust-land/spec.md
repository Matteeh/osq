# rust-land Specification

## Purpose
The land feature merges an archived change onto the default branch: its rules, the land commit, `osq land` and its endpoint. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/land/** -->
The rust-land capability SHALL own the `osq-feature-land` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Land crate ownership
- **WHEN** file ownership is resolved for the land feature
- **THEN** system maps `crates/features/land/**` to rust-land

### Requirement: Land feature
`osq-feature-land` SHALL expose one public item, the unit struct
`LandFeature`, which implements rust-core's `Feature`, holds no state, as
ADR 028 says, and derives `Clone`, `Copy`, `Debug` and `Default`. Its
`name` SHALL be `land`, and its `commands` SHALL be exactly three
`Command`s, in this order: `land`, with the summary
`land an archived change onto the default branch` and the usage `<id>`;
`sync`, with the summary `merge the default branch into a change's branch`
and the usage `<id>`; and `message`, with the summary
`print an archived change's land commit message` and the usage `<id>`.

The land scenarios run on scratch git repositories under
`CARGO_TARGET_TMPDIR`, with no network and no remote. A land repository
is one such repository: a checkout on `main` whose local git config sets
`user.name`, `user.email` and `commit.gpgSign` to `false`, holding one
commit with `src/one.txt` holding `one\n` and `notes.txt` holding
`notes\n`, and an untracked `osq.toml` holding
`[vcs]\nenabled = true\nauthor = "osq <osq@example.invalid>"\n`. A
worktree change `<folder>` in it is a branch `osq/<folder>` cut from
`main` with a worktree outside the checkout, whose one more commit writes
`src/one.txt` holding `two\n` and the archived folder
`openspec/changes/archive/<folder>`. The fixture change is the worktree
change `001-alpha-orders` whose archived folder is a copy of
`tests/fixtures/land-change/001-alpha-orders`.

#### Scenario: Land feature commands
- **WHEN** a test reads `LandFeature`'s name and commands
- **THEN** the name is `land`, and the commands are, in order, `land` with the summary `land an archived change onto the default branch`, `sync` with the summary `merge the default branch into a change's branch`, and `message` with the summary `print an archived change's land commit message`, each with the usage `<id>`

### Requirement: Land arguments
`LandFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `land`, `sync` and `message`,
and `FeatureError::usage("<command>", "expected one change id, got <n>")`
for a `land`, `sync` or `message` invocation with `n` arguments when `n`
is not 1, before it reads any file. Every other failure of `land` SHALL be
`FeatureError::failed` with the command `land` and the message the other
land requirements name; every other failure of `sync` and `message` SHALL
be `FeatureError::failed` with that command and the message "Sync
command" or "Message command" names.

#### Scenario: Land argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no files
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `land` with no args | `Usage` error displayed `usage of land: expected one change id, got 0` |
| `land` with args `1`, `2` | `Usage` error displayed `usage of land: expected one change id, got 2` |
| `archive` with args `1` | `UnknownCommand` error displayed `unknown command: archive` |

#### Scenario: Sync and message argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no files
- **THEN** it gives the row's error, and the root still holds no files:

| Invocation | Error |
|---|---|
| `sync` with no args | `Usage` error displayed `usage of sync: expected one change id, got 0` |
| `sync` with args `1`, `2` | `Usage` error displayed `usage of sync: expected one change id, got 2` |
| `message` with no args | `Usage` error displayed `usage of message: expected one change id, got 0` |
| `message` with args `1`, `2` | `Usage` error displayed `usage of message: expected one change id, got 2` |

### Requirement: Land settings
`land` SHALL read the root's settings with rust-config `load_config`,
failing with the `ConfigError`'s display when it fails. With `vcs.enabled`
false, or when `GitVcs` at the root gives no repository `root`, it SHALL
fail with `osq land needs vcs.enabled and git`, as TypeScript's
`requireGit` does. The default branch SHALL be the vcs kernel's
`default_branch` with `vcs.defaultBranch` as its fallback, or `main` when
that is unset. A `VcsError` from any git read or write SHALL fail with its
display unless a land requirement names another message.

#### Scenario: Settings refusals
- **WHEN** `land` runs with the id `1` on the row's root
- **THEN** it gives a `Failed` error for the command `land` with the row's message, and the checkout's HEAD is unchanged:

| Root | Message |
|---|---|
| a land repository holding the fixture change, with no `osq.toml` | `osq land needs vcs.enabled and git` |
| a land repository holding the fixture change, with `osq.toml` holding `[vcs]\nenabled = false\n` | `osq land needs vcs.enabled and git` |
| a land repository holding the fixture change, with `osq.toml` holding `[vcs]\nenabled = true\n` | `vcs.author is required when vcs.enabled is true` |

### Requirement: Land lookup
`land` SHALL find the change in the osq worktrees as TypeScript's
`changeTrees` and `buildSquashMessage` find it. Each entry of the root's
`worktree_list`, in its order, whose branch is `osq/<x>`, whose
canonical path is not the root's canonical path, and whose path holds the
directory `openspec/changes/<x>` or `openspec/changes/archive/<x>`, is
the worktree of change `<x>`. A folder matches the query as TypeScript's
`matchesFolder` matches it: with `trimmed` the query without surrounding
whitespace, and `padded` the value of `trimmed`'s leading ASCII digits
padded with zeros to three digits when `trimmed` starts with one, or else
`trimmed`, a folder matches when its name equals `trimmed` or `padded`,
or starts with `trimmed` followed by `-` or `padded` followed by `-`.

The change SHALL be the first worktree change matching the query whose
worktree holds `openspec/changes/archive/<x>`, or else the first folder of
the root's rust-storage `list_changes` whose location is archived and
which matches the query. When the default branch holds the path
`openspec/changes/archive/<folder>`, as the vcs kernel's `path_exists`
reads it, the change has landed. `land` SHALL then make no commit and,
after the checks of "Land refusals" that apply to a landed change, run
"Land after-land retry", which writes only the after-land record and what
its command writes. Its landed line is
`<folder> has already landed; nothing to clean up` and a newline when no
worktree change is `<folder>`, or
`<folder> has already landed; Rust land does not remove worktrees yet`
and a newline when one is. Without a retry, `land` SHALL return the
landed line as its output.

Otherwise `land` SHALL fail, writing nothing, in this order: with
`<x> has not archived on osq/<x>` for the first worktree change matching
the query whose worktree holds `openspec/changes/<x>`; and with
`No archived change "<query>" in an osq worktree`, with the query as
given, when no worktree change matching the query has an archived folder.
The change's archived folder is then `openspec/changes/archive/<folder>`
in its worktree.

#### Scenario: Change for a query
- **WHEN** `land` runs with the row's query on a land repository holding the row's changes, each a worktree change unless the row says otherwise
- **THEN** it gives the row's result, where `Landed` means the output begins `Landed <folder> as `, and a `Failed` result leaves `main` where it was:

| Changes | Query | Result |
|---|---|---|
| the fixture change | `1` | `Landed 001-alpha-orders` |
| the fixture change | `001` | `Landed 001-alpha-orders` |
| the fixture change | `  1  ` | `Landed 001-alpha-orders` |
| the fixture change | `001-alpha-orders` | `Landed 001-alpha-orders` |
| the fixture change | `001-alpha` | `Landed 001-alpha-orders` |
| the fixture change | `2` | `Failed` with `No archived change "2" in an osq worktree` |
| the fixture change | `alpha` | `Failed` with `No archived change "alpha" in an osq worktree` |
| `001-alpha-orders`, whose worktree holds it under `openspec/changes/001-alpha-orders` and not under the archive | `1` | `Failed` with `001-alpha-orders has not archived on osq/001-alpha-orders` |
| the fixture change, with its worktree's branch renamed to `work/001-alpha-orders` | `1` | `Failed` with `No archived change "1" in an osq worktree` |

#### Scenario: Already landed
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change after `main` gained a commit that adds `openspec/changes/archive/001-alpha-orders/proposal.md`, with the row's worktrees
- **THEN** it gives the row's output, written with `\n` escapes, and `main` gains no commit:

| Worktrees | Output |
|---|---|
| the fixture change's worktree remains | `001-alpha-orders has already landed; Rust land does not remove worktrees yet\n` |
| the fixture change's worktree was removed with `git worktree remove --force`, and the checkout holds `openspec/changes/archive/001-alpha-orders/proposal.md` | `001-alpha-orders has already landed; nothing to clean up\n` |

### Requirement: Land message
`land` SHALL build the land commit's message from rust-storage
`read_land_facts` of the change's archived folder, as TypeScript's
`formatSquashMessage` builds it: these lines joined with newlines, so the
message ends with a newline:

- `osq: <id> <words>`, where `<id>` is the folder's text before its first
  `-`, or the whole name without one, and `<words>` is the text after it
  with each `-` replaced by a space, or empty;
- an empty line, the goal, and an empty line;
- for each task in order, `[manual] task <number>: <title>` when it is
  manual, and `[verified] task <number>: <title>` otherwise;
- an empty line, then the trailers, then an empty line.

The trailers SHALL be, in order: `Osq-Change: <folder>`; `Osq-Base:
<base>` when the facts hold a base; `Osq-Head: <head>` when the change's
`worktree_list` entry gives a head that is not empty once trimmed, with
that trimmed head; `Osq-Approved: <approved>` and `Osq-Approved-By:
<approver>` when the facts hold them; one `Osq-Model: <model>` per
distinct task model, in task order; and one `Osq-Version: <version>` per
distinct task version, in task order.

#### Scenario: Golden land message
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change
- **THEN** the land commit's message equals `tests/fixtures/land-message.txt`, which TypeScript's `buildSquashMessage` wrote for the same folder, with `<head>` replaced by the branch tip `osq/001-alpha-orders` had before the land

#### Scenario: Message for a bare folder
- **WHEN** `land` runs with the query `1` on a land repository holding the worktree change `001`, whose archived folder holds only `proposal.md` holding `---\ntitle: A\n---\n## Verify\n\nx\n`
- **THEN** the land commit's message is `osq: 001 \n\n\n\n\nOsq-Change: 001\nOsq-Head: <head>\n`, written with `\n` escapes, where `<head>` is the branch tip `osq/001` had before the land

### Requirement: Land commit
After the lookup, the refusals and "Land sync", `land` SHALL take the HEAD
of the change's worktree as the tip and the checkout's HEAD as the base,
and fail with `<default branch> moved while landing; run osq land <id>
again`, where `<id>` is the folder's text before its first `-`, or the
whole name without one, when either has no commit or the base is not an
ancestor of the tip. It SHALL then write the land commit with the vcs
kernel's `commit_tree(tip, base, message, author, [])`, with the message
of "Land message" and `vcs.author` as the author, and move the checkout to
it only with `fast_forward`. When `fast_forward` gives `Blocked`, `land`
SHALL fail with `The checkout has uncommitted changes in files this land
writes: <paths>; keep them with osq manual "<why>", or commit or stash
them, then run osq land <id> again`, or, when `vcs.manualEdits` is
`block`, with `The checkout has uncommitted changes in files this land
writes: <paths>; commit or stash them, then run osq land <id> again`, with
the paths joined by `, `. When `fast_forward` fails and the checkout's
HEAD is no longer the base, it SHALL fail with the moved message, and
otherwise with the `VcsError`'s display. It SHALL push nothing and remove
no worktree or branch; the only commands it runs are those "Land sync",
"Land sync verify" and "Land after-land command" name.

On success `land` SHALL return the output `Landed <folder> as <commit>`, a
newline, `Kept branch osq/<folder>` and a newline, as TypeScript's
`landChange` prints them, followed by `Changed <path>` and a newline for
each path in `fast_forward`'s `changed` list, in its order, where
`<path>` is the checkout's repository root joined with the path, shown
with `display()`, as TypeScript's "Land reports changed paths" builds
them, then the lines "Land after-land command" adds.

#### Scenario: Land from the branch tip
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change, whose checkout also has a modified `notes.txt`, a staged new `staged.txt` and an untracked `drafts/x`
- **THEN** `main` holds one new commit whose only parent is the old `main`, whose tree equals the tree of `osq/001-alpha-orders`, and whose author is `osq <osq@example.invalid>`; the checkout's HEAD is that commit, `src/one.txt` holds `two\n`, `notes.txt` is still modified, `staged.txt` is still staged, `drafts/x` remains, the branch `osq/001-alpha-orders` and its worktree remain, and the output is `Landed 001-alpha-orders as <commit>\nKept branch osq/001-alpha-orders\n` followed by `Changed <root>/<path>\n` for each path below, in this order, where `<root>` is the checkout's canonical path:

| Path |
|---|
| `openspec/changes/archive/001-alpha-orders/.run/approved` |
| `openspec/changes/archive/001-alpha-orders/.run/approver` |
| `openspec/changes/archive/001-alpha-orders/.run/base` |
| `openspec/changes/archive/001-alpha-orders/.run/done/1` |
| `openspec/changes/archive/001-alpha-orders/.run/done/2` |
| `openspec/changes/archive/001-alpha-orders/.run/events/1.jsonl` |
| `openspec/changes/archive/001-alpha-orders/.run/events/2.jsonl` |
| `openspec/changes/archive/001-alpha-orders/.run/events/change.jsonl` |
| `openspec/changes/archive/001-alpha-orders/proposal.md` |
| `openspec/changes/archive/001-alpha-orders/specs/orders/spec.md` |
| `openspec/changes/archive/001-alpha-orders/tasks.md` |
| `src/one.txt` |

#### Scenario: Land commit stops
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change, with the row's state
- **THEN** it gives a `Failed` error for the command `land` with the row's message, `main` is at the commit it was at before `land` ran, and every file in the checkout keeps its bytes:

| State | Message |
|---|---|
| the checkout's `src/one.txt` holds `edit\n`, not committed | `The checkout has uncommitted changes in files this land writes: src/one.txt; keep them with osq manual "<why>", or commit or stash them, then run osq land 001 again` |
| the checkout's `src/one.txt` holds `edit\n`, not committed, and `osq.toml` also holds `manualEdits = "block"` under `[vcs]` | `The checkout has uncommitted changes in files this land writes: src/one.txt; commit or stash them, then run osq land 001 again` |

#### Scenario: Git refuses the fast-forward
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change whose checkout's git directory holds an `index.lock` file
- **THEN** it gives a `Failed` error for the command `land` whose message is the display of the `VcsError` that `fast_forward` gave, which names `index.lock`, and `main` is at the commit it was at before `land` ran

### Requirement: Land refusals
After the lookup finds the change, and before it reports a landed change
or writes anything, `land` SHALL refuse, writing nothing, in this order,
as TypeScript's `landChange` and `buildSquashMessage` refuse:

- When the change has not landed and its land facts' `stacked_on` is not
  empty: `<folder> is stacked on <names joined by ", ">; Rust land does not
  land stacked changes yet`.
- When the checkout's HEAD branch is not the default branch: `osq land
  runs on <default branch>; the checkout is on <branch>`, or `the checkout
  is on a detached HEAD` when HEAD names no branch.
- When the change has a worktree and its archived folder there,
  `openspec/changes/archive/<folder>`, holds `.run/regressed/change.md`
  whose frontmatter `reason`, trimmed, is `commit_failed`, as TypeScript's
  `assertLandableWorktree` reads it: `<folder>'s archive commit failed; fix
  the cause, then run osq retry <id> change`, where `<id>` is the folder's
  text before its first `-`, or the whole name without one.
- When the change has a worktree and its `status` lists any entry: `<path>
  has uncommitted changes: <paths joined by ", ">; commit or discard them
  first`, where `<path>` is the worktree's path as `worktree_list` gives it.
- When the change has not landed, its land facts hold an `archived_at`
  and at least one capability, and another worktree change `<other>` that
  has an archived folder has not landed, has `openspec/changes/archive/<other>/.run/approved`
  on the branch `osq/<other>`, as the vcs kernel's `show` reads it, has an
  `archived_at` earlier than this change's, compared as text, and shares
  a capability with this change: `<other> archived before <folder> and
  also writes <shared capabilities joined by ", ">; land it first`, for the
  first such change in worktree order. A change stacked on this change,
  one whose `stacked_on` names this change or names a change that is itself
  stacked on this change, read from the worktree changes' archived
  folders, SHALL not be compared.

Uncommitted changes in the checkout SHALL NOT refuse a land; "Land commit"
stops only for those in files the land writes.

#### Scenario: Refusals before the land
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change, with the row's state
- **THEN** it gives a `Failed` error for the command `land` with the row's message, where `<wt>` is the fixture change's worktree path, and `main` is at the commit it was at before `land` ran:

| State | Message |
|---|---|
| the fixture change's archived folder also holds `.run/stacked-on` holding `000-base sha256:x\n000-more sha256:y\n`, committed | `001-alpha-orders is stacked on 000-base, 000-more; Rust land does not land stacked changes yet` |
| the checkout is on a new branch `feature` cut from `main` | `osq land runs on main; the checkout is on feature` |
| the checkout's HEAD is detached at `main` | `osq land runs on main; the checkout is on a detached HEAD` |
| the fixture change's worktree has an untracked `notes.txt` | `<wt> has uncommitted changes: notes.txt; commit or discard them first` |
| the worktree change `002-beta-orders`, whose archived folder holds `specs/orders/spec.md`, `specs/billing/spec.md`, `.run/approved` and an `archived` event at `2026-10-20T12:00:00.000Z` | `002-beta-orders archived before 001-alpha-orders and also writes orders; land it first` |

#### Scenario: Refusals for a landed change
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change after `main` gained a commit that adds `openspec/changes/archive/001-alpha-orders/proposal.md`, with the row's state
- **THEN** it gives a `Failed` error for the command `land` with the row's message, or the row's output, written with `\n` escapes:

| State | Result |
|---|---|
| the checkout is on a new branch `feature` cut from `main` | `osq land runs on main; the checkout is on feature` |
| the fixture change's worktree has an untracked `notes.txt` | `<wt> has uncommitted changes: notes.txt; commit or discard them first`, where `<wt>` is its worktree path |
| the fixture change's archived folder also holds `.run/stacked-on` holding `000-base sha256:x\n`, committed on its branch | output `001-alpha-orders has already landed; Rust land does not remove worktrees yet\n` |

#### Scenario: Earlier changes that do not refuse
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change and the row's other worktree changes, each with an archived folder whose files the row gives
- **THEN** it lands `001-alpha-orders`: its output begins `Landed 001-alpha-orders as `

| Other changes |
|---|
| `002-beta-orders` holding `specs/billing/spec.md`, `.run/approved` and an `archived` event at `2026-10-20T12:00:00.000Z` |
| `002-beta-orders` holding `specs/orders/spec.md`, `.run/approved` and an `archived` event at `2026-10-20T14:00:00.000Z` |
| `002-beta-orders` holding `specs/orders/spec.md`, `.run/approved` and no `.run/events/change.jsonl` |
| `002-beta-orders` holding `specs/orders/spec.md` and an `archived` event at `2026-10-20T12:00:00.000Z`, with no `.run/approved` |
| `002-beta-orders` holding `specs/orders/spec.md`, `.run/approved` and an `archived` event at `2026-10-20T12:00:00.000Z`, after `main` gained a commit that adds `openspec/changes/archive/002-beta-orders/proposal.md` and the fixture change's branch merged that commit |
| `002-beta-orders` holding `specs/orders/spec.md`, `.run/approved`, an `archived` event at `2026-10-20T12:00:00.000Z` and `.run/stacked-on` holding `001-alpha-orders sha256:x\n` |
| `002-beta-orders` holding `specs/billing/spec.md`, `.run/approved`, an `archived` event at `2026-10-20T14:00:00.000Z` and `.run/stacked-on` holding `001-alpha-orders sha256:x\n`, and `003-gamma-orders` holding `specs/orders/spec.md`, `.run/approved`, an `archived` event at `2026-10-20T12:00:00.000Z` and `.run/stacked-on` holding `002-beta-orders sha256:y\n` |
| `002-beta-orders` holding `specs/orders/spec.md`, `.run/approved` and an `archived` event at `2026-10-20T12:00:00.000Z`, with the fixture change's `.run/events/change.jsonl` removed on its branch |

#### Scenario: Land on a failed archive commit
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change whose archived folder in its worktree also holds, uncommitted, `.run/regressed/change.md` holding the row's text
- **THEN** it gives a `Failed` error for the command `land` with the row's message, where `<wt>` is the fixture change's worktree path, `main` is at the commit it was at before `land` ran, and the worktree's files and `git status --porcelain` are as they were before:

| Marker | Message |
|---|---|
| `---\nreason: commit_failed\n---\nrefused by hook\n` | `001-alpha-orders's archive commit failed; fix the cause, then run osq retry 001 change` |
| `---\nreason:  commit_failed \n---\n` | `001-alpha-orders's archive commit failed; fix the cause, then run osq retry 001 change` |
| `---\nreason: sync_conflict\n---\nconflict\n` | `<wt> has uncommitted changes: openspec/changes/archive/001-alpha-orders/.run/regressed/change.md; commit or discard them first` |

### Requirement: Land git limits
`land` SHALL build every `GitVcs` it runs, at the root and in a change's
worktree, with `with_timeouts` and the loaded config's `timeouts`, so
`timeouts.gitSeconds` bounds each git read and `timeouts.gitCommitSeconds`
each commit and merge. A git command that runs out of time SHALL fail with
its `VcsError::TimedOut` display, `<command> timed out after <limit>`, as
"Land settings" says for every `VcsError`, and the checkout's HEAD SHALL stay
unchanged.

#### Scenario: A slow git status stops land at the configured limit
- **WHEN** `land` runs with the id `1` on a land repository holding the fixture change, whose `osq.toml` adds `[timeouts]\ngitSeconds = 1\n`, with `extensions.worktreeConfig` set to `true` and `core.fsmonitor` set to `sleep 30` in the row's worktree config
- **THEN** within 5 seconds it gives a `Failed` error for the command `land` with the message `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all timed out after 1s`, and the checkout's HEAD is unchanged:

| Worktree config | Status that runs out of time |
|---|---|
| the change's worktree | the change worktree's status, read before the commit |
| the checkout | the checkout's status, read by the fast-forward |

### Requirement: Land after-land command
After a land whose `fast_forward` gives `Done`, when `vcs.afterLand` is
set, `land` SHALL run it as TypeScript's `runAfterLand` does: through
rust-harnesses `run_verify` in the checkout root, with the process
environment as the source, no configured or agent names, no change, no
diff, no extra variables, `timeouts.verifyTimeoutSeconds` as the timeout
and `timeouts.harnessKillGracePeriodMs` as the kill grace. With
`vcs.afterLand` unset, `land` runs nothing and its output is "Land
commit"'s.

The failure record is `after-land.json` in
`<HOME>/.osq/watch/<hash>/`, where `<hash>` is the lowercase hex SHA-256
of the checkout root's canonical path, or of the path as given when it has
none, as TypeScript's `watchStateDir` computes it.

- When the command exits 0, `land` SHALL remove the record when it exists
  and add the line `After-land command passed: <command>` to "Land
  commit"'s output.
- Otherwise it SHALL write the record as one JSON object and a newline,
  `{"change":"<folder>","command":"<command>","exitCode":<code>,"failedAt":"<time>"}`,
  creating its folders. `<time>` is the current time in ISO 8601 UTC to
  the millisecond. `land` then fails with `FeatureError::failed` with the
  command `land`. The message is "Land commit"'s output lines, then
  `After-land command failed: <command>`, then the last
  `limits.cardOutputLines` lines of the outcome's output after its trailing blank lines are dropped, then
  `run osq land <id> again to retry it`, joined by newlines. The land
  commit and the checkout's fast-forward stay. A start error of
  `run_verify` counts as exit code 1 with its display as the output.

The record and the line texts are TypeScript's, so its inbox shows the
failure as an `after-land-failed` item. A landed change's second `land`
reruns the command only as "Land after-land retry" says.

#### Scenario: After-land outcomes
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change, whose `osq.toml` also holds the row's lines under `[vcs]` and `[timeouts]`
- **THEN** the change lands as "Land from the branch tip" says, and `land` returns "Land commit"'s output followed by the row's lines, or fails with "Land commit"'s output lines followed by the row's lines, each line written here without its newline, where `<tip>` is "Land commit"'s output:

| Settings | Result |
|---|---|
| none | output `<tip>` and no record |
| `afterLand = "printf 'built\\n' > built.txt"` | output `<tip>` then `After-land command passed: printf 'built\n' > built.txt`; the checkout's `built.txt` holds `built\n`, and no record |
| `afterLand = "echo one; echo two; exit 3"` | failure `<tip>` then `After-land command failed: echo one; echo two; exit 3`, `one`, `two`, `run osq land 001 again to retry it`; the record holds `change` `001-alpha-orders`, `command` `echo one; echo two; exit 3`, `exitCode` 3 and a `failedAt` that ends with `Z` and is 24 characters long |
| `afterLand = "seq 1 25; printf '\\n\\n'; exit 1"` | failure `<tip>` then `After-land command failed: seq 1 25; printf '\n\n'; exit 1`, the lines `6` to `25`, `run osq land 001 again to retry it`; the record's `exitCode` is 1 |
| `afterLand = "sleep 10"`, `verifyTimeoutSeconds = 1` | failure `<tip>` then `After-land command failed: sleep 10`, `run osq land 001 again to retry it`, in under 5 seconds; the record's `exitCode` is 1 |

#### Scenario: A passing command clears the record
- **WHEN** the record for the repository's checkout holds `{"change":"001-alpha-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}` and `land` runs with the query `1` with `afterLand = "true"` under `[vcs]`
- **THEN** the output ends with `After-land command passed: true` and a newline, and the record no longer exists

#### Scenario: After-land tail from the config
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change, whose `osq.toml` also holds `afterLand = "echo one; echo two; echo three; exit 3"` under `[vcs]` and `cardOutputLines = 2` under `[limits]`
- **THEN** it fails with "Land commit"'s output lines followed by `After-land command failed: echo one; echo two; echo three; exit 3`, `two`, `three` and `run osq land 001 again to retry it`, each line written here without its newline

### Requirement: Land after-land retry
For a landed change, after the checks of "Land refusals" that apply to a
landed change pass, `land` SHALL rerun the after-land command as
TypeScript's `retryAfterLand` does: only when `vcs.afterLand` is set and
rust-storage `read_after_land_failure`, given the checkout root and
`HOME`, returns a record whose `change` equals the change's folder. It
SHALL then run the configured command, not the record's `command`, exactly
as "Land after-land command" runs it, and remove or rewrite the record as
that requirement says, with the new exit code and time.

- When the command exits 0, `land` SHALL return the line
  `After-land command passed: <command>` and a newline, followed by "Land
  lookup"'s landed line.
- Otherwise `land` SHALL fail with `FeatureError::failed` with the command
  `land`, whose message is `After-land command failed: <command>`, the
  output tail "Land after-land command" names, `run osq land <id> again to
  retry it` and "Land lookup"'s landed line without its newline, joined by
  newlines, as TypeScript's `cleanupLanded` orders its lines.

With `vcs.afterLand` unset, with no record, with a record that does not
parse, or with one that names another change, `land` SHALL run nothing,
leave the record's bytes as they are, and return "Land lookup"'s landed
line. A refusal of "Land refusals" runs nothing and leaves the record.

#### Scenario: Retry on a landed change
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change whose worktree remains, after `main` gained a commit that adds `openspec/changes/archive/001-alpha-orders/proposal.md`, with the row's record for the repository's checkout and the row's `afterLand` under `[vcs]`
- **THEN** `main` gains no commit, and `land` returns the row's output or fails with the row's message, written with `\n` escapes, where `<landed>` is `001-alpha-orders has already landed; Rust land does not remove worktrees yet`, and the checkout's `built.txt` and the record are as the row says:

| Record | `afterLand` | Result | `built.txt` | Record after |
|---|---|---|---|---|
| `{"change":"001-alpha-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}` | `"printf 'built\\n' > built.txt"` | output `After-land command passed: printf 'built\n' > built.txt\n<landed>\n` | holds `built\n` | none |
| `{"change":"001-alpha-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}` | `"echo one; exit 3"` | failure `After-land command failed: echo one; exit 3\none\nrun osq land 001 again to retry it\n<landed>` | none | `change` `001-alpha-orders`, `command` `echo one; exit 3`, `exitCode` 3, and a `failedAt` that ends with `Z`, is 24 characters long and is not `2026-10-01T10:00:00.000Z` |
| `{"change":"002-beta-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}` | `"printf 'built\\n' > built.txt"` | output `<landed>\n` | none | the same bytes |
| none | `"printf 'built\\n' > built.txt"` | output `<landed>\n` | none | none |
| `{"change":"001-alpha-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}` | unset | output `<landed>\n` | none | the same bytes |
| `not json` | `"printf 'built\\n' > built.txt"` | output `<landed>\n` | none | the same bytes |

#### Scenario: Refused retry runs nothing
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change after `main` gained a commit that adds `openspec/changes/archive/001-alpha-orders/proposal.md`, whose checkout is on a new branch `feature` cut from `main`, with the record `{"change":"001-alpha-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}` for the repository's checkout and `afterLand = "printf 'built\\n' > built.txt"` under `[vcs]`
- **THEN** it gives a `Failed` error for the command `land` with `osq land runs on main; the checkout is on feature`, the checkout has no `built.txt`, and the record keeps its bytes

### Requirement: Land sync
After "Land refusals" pass for a change that has not landed, and before
"Land commit", `land` SHALL take the default branch into `osq/<folder>`
in the change's worktree, as TypeScript's `syncWithDefaultBranch` does
for an archived change, with a `GitVcs` at the worktree's path built as
"Land git limits" says. The archived folder is
`openspec/changes/archive/<folder>` in the worktree, and `<id>` is the
folder's text before its first `-`, or the whole name without one. When
the default branch is an ancestor of the worktree's HEAD, `land` SHALL
write nothing here. Otherwise it SHALL work in this order:

1. Before it writes anything, for each folder directly under the archived
   folder's `specs/` that holds a `spec.md`, in byte order of the folder
   names, it SHALL read the names rust-specs `parse_delta` gives under
   `modified`, then `removed`, then each rename's `from`. For each name it
   SHALL compare the requirement's `raw` text, from rust-specs
   `parse_living_spec` of `openspec/specs/<capability>/spec.md` read with
   the vcs kernel's `show`, at the requirements base and at the default
   branch, where a missing file or requirement counts as none. The
   requirements base is the trimmed text of the archived folder's
   `.run/requirements-base`, or of `.run/base` when that is absent or
   blank, and none when both are, and then the base side is none. When any
   of them differs, the sync SHALL stop with the reason
   `requirement_changed` and the message `<folder>: <default branch>
   changed requirements this change rewrites since it was approved:
   <capability>: <requirement>, ...; run osq plan <id> to revise the plan
   against <default branch>`, the pairs joined by `, `.
2. It SHALL keep the bytes of the archived folder's
   `.run/events/change.jsonl`, or note that it is absent, take `<n>` as
   `count_commits` from the worktree's HEAD to the default branch, and
   merge the default branch with `merge(<default branch>, false)`. A
   conflict at a path that is `openspec/specs` or under `openspec/specs/`,
   that is `openspec/changes/archive` or under `openspec/changes/archive/`,
   or whose file name is `Cargo.lock`, is resolved in step 3. When any
   other path conflicts, the sync SHALL stop with the reason
   `sync_conflict` and the message `<folder>: <paths joined by ", ">
   conflict with <default branch>; run osq plan <id>, and approving the
   revised plan restarts osq/<folder> from <default branch>`, naming only
   those other paths in the merge's order.
3. For each conflicting path under `openspec/changes/archive/`, it SHALL
   write the default branch's copy, read with `show`, or remove the file
   when the default branch has none. For each capability folder directly
   under the worktree's `openspec/specs/` and each capability the archived
   folder has a delta for, in byte order and once each, it SHALL write the
   default branch's copy of `openspec/specs/<capability>/spec.md`, or
   remove that file when the default branch has none, leaving a capability
   alone when the default branch has none and the file does not exist. It
   SHALL stage every path this writes or removes. It SHALL then apply the
   archived folder's deltas with rust-specs `merge_change` over the
   worktree's `openspec/specs/`, as archive does: it writes each merged
   text to `openspec/specs/<capability>/spec.md`, creating folders, or, for
   a capability the change empties, removes that file and the
   capability's `osq.yml`; and it stages each delta capability's
   `openspec/specs/<capability>/spec.md`. A `MergeChangeError` SHALL stop
   with the reason `sync_failed` and its display. Then, for each
   conflicting path whose file name is `Cargo.lock`, in byte order, it
   SHALL write the default branch's copy, or remove the file when it has
   none, run `cargo update --workspace --offline` in the lock file's folder
   in the worktree, and stage the lock file. A command that does not exit 0
   SHALL stop with the reason `sync_failed` and the message `<folder>:
   rebuilding <lock file> failed on osq/<folder> merged with <default
   branch>:`, a newline, and the command's output tail.
4. When `vcs.prepare` is set, it SHALL run it in the worktree. A command
   that does not exit 0 SHALL stop with the reason `sync_failed` and the
   message `prepare failed in worktree <worktree> on branch osq/<folder>:`,
   a newline, and the command's whole output, where `<worktree>` is the
   worktree's path as `worktree_list` gives it.
5. It SHALL run "Land sync verify", then append to the archived folder's
   `.run/events/change.jsonl` a `synced` event, through rust-core's
   `Envelope` and `event_line`, with the current time in ISO 8601 UTC to
   the millisecond and the data `defaultBranch`, `commits` `<n>`, and
   `duration`, the whole milliseconds from the merge's start to this
   step, and stage that file.
6. It SHALL commit the index with `commit(&[], message, author)`, with
   `vcs.author` as the author and the message `osq: <id> sync <default
   branch>`, a blank line, and `Osq-Change: <folder>`. A `VcsError` SHALL
   stop with the reason `sync_failed` and its display.

A `VcsError` from any other git read or write after the merge starts SHALL
stop with the reason `sync_failed` and its display. Every stop after the
merge starts SHALL first run `merge_abort`, ignoring its error, then write
the kept bytes of `.run/events/change.jsonl` back, or remove the file when
it was absent, so the worktree's HEAD and its tracked files are as they
were. A `VcsError` before the merge starts fails as "Land settings" says.

Each command this requirement runs SHALL go through rust-harnesses
`run_verify` as "Land after-land command" runs its command, with the
worktree or the lock file's folder as the working folder, and a start
error counts as exit code 1 with its display as the output. A command's
output tail is its last `limits.cardOutputLines` lines after its
trailing blank lines are dropped, joined by newlines.

A stop SHALL fail `land` with `FeatureError::failed` for the command
`land` and the stop's message, after "Land stop record" when it records
the stop. After a sync commit, "Land commit"'s tip and "Land message"'s
`Osq-Head` SHALL be that commit, read again from the worktree.

In the scenarios, the orders spec with the requirement `<R>` is `# orders Specification\n\n## Purpose\nOrders.\n\n## Requirements\n\n### Requirement: <R>\nThe system SHALL <r>.\n\n#### Scenario: <R> works\n- **WHEN** <r>\n- **THEN** <r>\n`, with `<r>` the name in lowercase.

#### Scenario: Sync before the land
- **WHEN** `land` runs with the query `1` on a land repository holding the row's change, after `main` gained the row's commit
- **THEN** it lands the change: its output begins `Landed <folder> as `, the land commit's tree equals the tree of the branch's tip, the branch's tip is a commit whose first parent is the tip before `land` ran, whose second parent is the old tip of `main`, and whose message is `osq: 001 sync main\n\nOsq-Change: <folder>\n`, the land commit's message holds `Osq-Head: <that commit>`, the archived folder's `.run/events/change.jsonl` on the branch ends with a `synced` event whose `defaultBranch` is `main` and whose `commits` is 1, and the row's check holds on the branch:

| Change | `main`'s commit | Check |
|---|---|---|
| the fixture change | adds `other.txt` holding `other\n` | `other.txt` holds `other\n` and `src/one.txt` holds `two\n` |
| the worktree change `001-alpha-orders` whose branch's commit also adds `openspec/specs/orders/spec.md` holding the orders spec with the requirement `Alpha`, and whose archived folder holds `proposal.md` holding `---\ntitle: A\n---\n## Verify\n\nx\n` and `specs/orders/spec.md` holding `## ADDED Requirements\n\n### Requirement: Alpha\nThe system SHALL alpha.\n\n#### Scenario: Alpha works\n- **WHEN** alpha\n- **THEN** alpha\n` | adds `openspec/specs/orders/spec.md` holding the orders spec with the requirement `Beta` | `openspec/specs/orders/spec.md` holds `### Requirement: Alpha` once and `### Requirement: Beta` once, and no line starting `<<<<<<<`, `=======` or `>>>>>>>` |
| the worktree change `001-alpha-orders` whose branch's commit also adds `openspec/changes/archive/000-base/notes.md` holding `branch\n`, with the fixture change's archived files | adds `openspec/changes/archive/000-base/notes.md` holding `main\n` | `openspec/changes/archive/000-base/notes.md` holds `main\n` |

#### Scenario: Sync rebuilds a conflicting lock file
- **WHEN** `main` holds a Cargo workspace whose root `Cargo.toml` is `[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n`, with the crate `crates/base` and its `Cargo.lock`, the fixture change's branch then adds the crate `crates/alpha` and its rebuilt `Cargo.lock`, `main` then adds the crate `crates/beta` and its rebuilt `Cargo.lock`, so the merge conflicts only in `Cargo.lock`, and `land` runs with the query `1`
- **THEN** it lands the change, and on the branch's tip `Cargo.lock` names `alpha`, `base` and `beta`, holds no line starting `<<<<<<<`, and `cargo metadata --offline --locked --format-version 1` exits 0 in the worktree

#### Scenario: Sync stops
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change, after `main` gained the row's commit, with the row's settings
- **THEN** it gives a `Failed` error for the command `land` whose message is the row's, where `<wt>` is the worktree's path; `main` and the checkout's HEAD are where they were; the worktree's status is empty; and the branch's tip is the row's tip, where `<old>` is the tip before `land` ran:

| `main`'s commit | Settings | Message | Tip |
|---|---|---|---|
| writes `src/one.txt` holding `main\n` | none | `001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main` | the stop record's commit |
| writes `src/one.txt` holding `main\n`, and adds `sub/Cargo.lock` holding `main\n` while the branch held `sub/Cargo.lock` holding `branch\n` | none | `001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main` | the stop record's commit |
| adds `sub/Cargo.toml` holding `[package\n` and `sub/Cargo.lock` holding `main\n` while the branch held `sub/Cargo.lock` holding `branch\n` | none | starts `001-alpha-orders: rebuilding sub/Cargo.lock failed on osq/001-alpha-orders merged with main:\n` | `<old>` |
| adds `other.txt` | `prepare = "echo nope; exit 1"` under `[vcs]` | `prepare failed in worktree <wt> on branch osq/001-alpha-orders:\nnope\n` | `<old>` |
| adds `other.txt` | a `pre-commit` hook that exits 1, set with the checkout's local `core.hooksPath` | the display of the sync commit's `VcsError`, which starts `git ` and holds ` failed: ` | `<old>` |

#### Scenario: Requirement changed since approval
- **WHEN** `main` holds the orders spec with the requirement `Order totals` at commit `B`, the worktree change `001-alpha-orders` cut from `B` holds an archived folder with `.run/base` holding `B` and `specs/orders/spec.md` holding `## MODIFIED Requirements\n\n### Requirement: Order totals\nThe system SHALL total orders twice.\n\n#### Scenario: Order totals works\n- **WHEN** order totals\n- **THEN** order totals\n`, `main` then gains commit `C` that changes the text of `Order totals`, and `land` runs with the query `1`, with the row's `.run/requirements-base` committed in the archived folder
- **THEN** `land` gives the row's result:

| `.run/requirements-base` | Result |
|---|---|
| none | `Failed` with `001-alpha-orders: main changed requirements this change rewrites since it was approved: orders: Order totals; run osq plan 001 to revise the plan against main`, the branch's tip the stop record's commit with reason `requirement_changed` |
| `C` | output that begins `Landed 001-alpha-orders as ` |

#### Scenario: Sync stop tail from the config
- **WHEN** `land` runs with the query `1` on a land repository holding the worktree change `001-alpha-orders`, whose archived folder holds the fixture change's files with `proposal.md` holding `---\ntitle: A\nverify: echo one; echo two; echo three; exit 1\n---\n## Verify\n\nx\n`, after `main` gained a commit that adds `other.txt`, and whose `osq.toml` also holds `cardOutputLines = 2` under `[limits]`
- **THEN** it gives a `Failed` error for the command `land` whose message ends with `:\ntwo\nthree`, written with `\n` escapes

### Requirement: Land stop record
When "Land sync" or "Land sync verify" stops with the reason
`sync_conflict`, `requirement_changed` or `sync_verify_red`, `land` SHALL
record the stop on the change's branch as TypeScript's `recordLandStop`
does, after the stop's own writes are undone. In the archived folder in
the worktree it SHALL write `.run/regressed/change.md` holding
`---\nreason: <reason>\n---\n<message>\n`, creating its folder, append to
`.run/events/change.jsonl` a `regressed` event with the current time in
ISO 8601 UTC to the millisecond and the data `task` `change`, `reason`
and `output` holding the message, through rust-core's `Envelope` and
`event_line`, and commit exactly those two paths with `commit`, authored
by `vcs.author`, with the message `osq: <id> land stopped`. When that
commit fails, it SHALL write both files back as they were, removing a file
that was absent, stage both paths again so the index matches HEAD, and
fail with the stop's message, a newline, and `osq could not record the
stop: <VcsError display>`. A stop with the reason `sync_failed` SHALL
record nothing. The record SHALL write nothing to the checkout or the
default branch, and SHALL leave the worktree's status empty.

#### Scenario: A code conflict is recorded
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change after `main` gained a commit that writes `src/one.txt` holding `main\n`
- **THEN** the branch's tip has the message `osq: 001 land stopped\n` and the tip before `land` ran as its only parent, it changes exactly the archived folder's `.run/regressed/change.md` and `.run/events/change.jsonl`, the marker holds `---\nreason: sync_conflict\n---\n<message>\n`, where `<message>` is the error's message, and the events file is its bytes before `land` ran followed by one `regressed` line whose data is `{"task":"change","reason":"sync_conflict","output":"<message>"}`

#### Scenario: A record that cannot commit
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change after `main` gained a commit that writes `src/one.txt` holding `main\n`, with a `pre-commit` hook that exits 1, set with the checkout's local `core.hooksPath`
- **THEN** it gives a `Failed` error whose message is the conflict message, a newline, and `osq could not record the stop: ` followed by the commit's `VcsError` display; the branch's tip is the tip before `land` ran; the archived folder has no `.run/regressed/change.md`; its `.run/events/change.jsonl` keeps its bytes; and the worktree's status is empty

### Requirement: Land sync verify
In step 5 of "Land sync", before the `synced` event, `land` SHALL run the
archived proposal's `verify`, as TypeScript's `runSyncVerify` does for an
archived change, when rust-specs `parse_proposal` of the archived folder's
`proposal.md` gives a `verify` that is not empty, and then the proposal's
`check`, the trimmed `check` string of its frontmatter read with rust-specs
`parse_frontmatter`, when that is not empty. Each runs in the worktree
through `run_verify` as "Land sync" runs its commands, with no change set,
bounded by `timeouts.verifyTimeoutSeconds`.

A verify that does not exit 0 SHALL stop the sync with the reason
`sync_verify_red` and the message `<folder>: verify failed on
osq/<folder> merged with <default branch>:`, a newline, and the output
tail "Land sync" names; a check that does not exit 0 SHALL stop the same
way with `check failed` in place of `verify failed`. For each command that
exits 0, it SHALL write the whole output to the archived folder's
`.run/logs/change-<k>.log`, where `<k>` is one more than the number of
files in `.run/logs/` named `change-<digits>.log`, creating the folder and,
when it is absent, `.run/logs/.gitignore` holding `*\n`. It SHALL then
append a `verify_ran` event to `.run/events/change.jsonl` whose data is
`command`, `exitCode` 0, `duration` in whole milliseconds, `log`
`.run/logs/change-<k>.log`, and `output`, the output's tail, left out when
that tail is empty. The tail is the output itself when its text with
trailing whitespace dropped is not empty and has at most
`limits.markerOutputLines` lines, each at most `limits.markerLineChars`
characters; otherwise it is the last `limits.markerOutputLines` lines of
that text, each line over `limits.markerLineChars` characters cut to its
first `limits.markerLineChars` followed by `… (<m> more characters)`,
joined by newlines; and it is empty when that text is empty. These are
TypeScript's `writeVerifyLog` and `tailVerifyOutput` with those limits,
40 and 400 by default.

#### Scenario: Sync verify outcomes
- **WHEN** `land` runs with the query `1` on a land repository holding the worktree change `001-alpha-orders`, whose archived folder holds the fixture change's files with `proposal.md` holding `---\ntitle: A\n<frontmatter>---\n## Verify\n\nx\n`, after `main` gained a commit that adds `other.txt`, with the row's frontmatter lines
- **THEN** `land` gives the row's result, and the archived folder's `.run/events/change.jsonl` on the branch's tip ends with the row's events, the `synced` event last when it lands:

| Frontmatter | Result | Events |
|---|---|---|
| `verify: echo ok` | lands | `verify_ran` with `command` `echo ok`, `exitCode` 0, `log` `.run/logs/change-1.log` and `output` `ok\n`, then `synced`; the worktree's `.run/logs/change-1.log` holds `ok\n`, `.run/logs/.gitignore` holds `*\n`, and the branch's tip holds no `.run/logs` file |
| `verify: seq 1 45` | lands | `verify_ran` whose `output` is the lines `6` to `45` joined by newlines, then `synced` |
| `verify: printf '%0401d' 0; echo` | lands | `verify_ran` whose `output` is 400 zeros followed by `… (1 more characters)`, then `synced` |
| `verify: true` and `check: echo smoke` | lands | `verify_ran` with `command` `true` and no `output`, `verify_ran` with `command` `echo smoke` and `output` `smoke\n`, then `synced` |
| `verify: echo broken; exit 1` | `Failed` with `001-alpha-orders: verify failed on osq/001-alpha-orders merged with main:\nbroken` | `regressed` with `reason` `sync_verify_red`, after the events the branch held before `land` ran |
| `verify: true` and `check: echo smoke failed; exit 1` | `Failed` with `001-alpha-orders: check failed on osq/001-alpha-orders merged with main:\nsmoke failed` | `regressed` with `reason` `sync_verify_red`, after the events the branch held before `land` ran, with no `verify_ran` |

#### Scenario: Sync verify tail from the config
- **WHEN** `land` runs as "Sync verify outcomes" runs it with the frontmatter line `verify: echo one; echo two; echo abcdefgh` and an `osq.toml` that also holds `markerOutputLines = 2` and `markerLineChars = 5` under `[limits]`
- **THEN** the change lands, and the `verify_ran` event's `output` is `two\nabcde… (3 more characters)`, written with `\n` escapes

### Requirement: Sync command
`sync <id>` SHALL take the default branch into an archived change's
branch without landing it, as TypeScript's `syncChange` does for an
archived change in an osq worktree, failing with the first message in
this order and writing nothing before step 6:

1. It SHALL read the root's settings as "Land settings" says, and fail
   with `osq sync needs vcs.enabled and git` when `vcs.enabled` is false
   or `GitVcs` at the root gives no repository `root`.
2. The worktree changes are those "Land lookup" defines. The change SHALL
   be the first worktree change matching the query, as "Land lookup"
   matches, whose worktree holds `openspec/changes/archive/<folder>`.
   With none, `sync` SHALL fail with `<folder> has not archived; Rust sync
   does not sync an active change yet` for the first matching worktree
   change whose worktree holds `openspec/changes/<folder>`, and otherwise
   with `No change "<query>" runs in an osq worktree`, with the query as
   given.
3. When rust-storage `read_land_facts` of the archived folder in the
   worktree gives a `stacked_on` that is not empty, it SHALL fail with
   `<folder> is stacked on <names joined by ", ">; Rust sync does not sync
   stacked changes yet`.
4. It SHALL read `status` with a `GitVcs` at the worktree's path built as
   "Land git limits" says. Each entry's `path`, and its `from` when it has
   one, counts unless it is `openspec/changes/archive/<folder>/tasks.md`
   or starts with `openspec/changes/archive/<folder>/.run/`. When any path
   counts, it SHALL fail with `<worktree> has uncommitted changes: <the
   counted paths, without repeats, in byte order, joined by ", ">; commit
   or discard them first`, where `<worktree>` is the worktree's path as
   `worktree_list` gives it.
5. The default branch SHALL be the one "Land settings" names.
6. It SHALL run "Land sync", with "Land sync verify" in its step 5, on the
   worktree exactly as `land` runs it, except that no stop SHALL write the
   record "Land stop record" names: a stop undoes its own writes as "Land
   sync" says and fails `sync` with the stop's message. When "Land sync"
   writes nothing because the default branch is an ancestor of the
   worktree's HEAD, the output SHALL be `osq/<folder> already has
   <default branch>` and a newline; when it commits, the output SHALL be
   `Synced osq/<folder> with <default branch>` and a newline.

`sync` SHALL never write the checkout, the default branch, or another
worktree, and SHALL not run "Land commit". TypeScript's progress line on
stderr is not part of the output.

#### Scenario: Sync equals TypeScript's
- **WHEN** a test runs `sync` with each row's `query` of `tests/fixtures/sync-message-golden/sync.json`, on a land repository built for the row as `tests/fixtures/sync-message-golden/print-sync-message-goldens.mjs.txt` builds it, with each commit message the script gives
- **THEN** a row with `exit` 0 gives output text equal to its `stdout`, and a row with `exit` 1 gives a `Failed` error for the command `sync` whose message is its `error`; and after the run the full message of `osq/001-alpha-orders`'s tip, as `git log -1 --format=%B` prints it, equals the row's `tip`, the worktree's `git status --porcelain --untracked-files=all` equals its `status`, the archived folder holds `.run/regressed/change.md` exactly when `regressed` is true, and the worktree's `openspec/specs/orders/spec.md` equals the row's `spec` when the row has one; `<wt>` stands for the worktree's path:

| Row | Query | Result |
|---|---|---|
| `clean-001` | `1` | `Synced osq/001-alpha-orders with main\n` |
| `current-001` | `1` | `osq/001-alpha-orders already has main\n` |
| `spec-conflict-001` | `1` | `Synced osq/001-alpha-orders with main\n`, with the merged `orders` spec |
| `code-conflict-001` | `1` | `001-alpha-orders: src/one.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq/001-alpha-orders from main`, with no record |
| `vcs-off-001` | `1` | `osq sync needs vcs.enabled and git` |
| `dirty-001` | `1` | `<wt> has uncommitted changes: notes.txt; commit or discard them first` |
| `run-dirt-001` | `001` | `Synced osq/001-alpha-orders with main\n` |
| `renamed-001` | `1` | `<wt> has uncommitted changes: moved.txt, notes.txt; commit or discard them first` |
| `tasks-dirt-001` | `1` | `Synced osq/001-alpha-orders with main\n` |
| `missing-2` | `2` | `No change "2" runs in an osq worktree` |

#### Scenario: Sync refusals Rust adds
- **WHEN** `sync` runs with the query `1` on a land repository holding the row's change after `main` gained a commit that writes `other.txt` holding `other\n`
- **THEN** it gives a `Failed` error for the command `sync` with the row's message, and the change's branch tip and worktree status are what they were before `sync` ran:

| Change | Message |
|---|---|
| `001-alpha-orders`, whose worktree holds it under `openspec/changes/001-alpha-orders` with `.run/approved`, and not under the archive | `001-alpha-orders has not archived; Rust sync does not sync an active change yet` |
| the fixture change, whose archived folder also holds `.run/stacked-on` holding `000-base sha256:x\n000-more sha256:y\n`, committed | `001-alpha-orders is stacked on 000-base, 000-more; Rust sync does not sync stacked changes yet` |

### Requirement: Message command
`message <id>` SHALL print the message "Land message" builds for an
archived change in an osq worktree, as TypeScript's `messageCommand`
prints it on stdout, and write nothing and run no git write. It SHALL fail
with the first message in this order:

1. It SHALL read the root's settings as "Land settings" says, and fail
   with `osq message needs vcs.enabled and git` when `vcs.enabled` is
   false or `GitVcs` at the root gives no repository `root`.
2. Among the worktree changes "Land lookup" defines that match the query,
   as "Land lookup" matches, it SHALL fail with `<folder> has not archived
   on osq/<folder>` for the first whose worktree holds
   `openspec/changes/<folder>`. Otherwise the change SHALL be the first
   whose worktree holds `openspec/changes/archive/<folder>`, and with none
   it SHALL fail with `No archived change "<query>" in an osq worktree`,
   with the query as given.
3. When rust-storage `read_land_facts` of the archived folder in the
   worktree gives a `stacked_on` that is not empty, it SHALL fail with
   `<folder> is stacked on <names joined by ", ">; Rust message does not
   build stacked changes' messages yet`.

The output SHALL be the message "Land message" builds from those facts,
with the worktree change's `worktree_list` head as `Osq-Head`. Whether the
change has landed does not matter. TypeScript's `Branch: osq/<folder>`
line on stderr is not part of the output.

#### Scenario: Message equals TypeScript's
- **WHEN** a test runs `message` with each row's `query` of `tests/fixtures/sync-message-golden/message.json`, on a land repository built for the row as `tests/fixtures/sync-message-golden/print-sync-message-goldens.mjs.txt` builds it
- **THEN** a row with `exit` 0 gives output text equal to its `stdout` with `<head>` replaced by the tip `osq/<folder>` had before the run, and a row with `exit` 1 gives a `Failed` error for the command `message` whose message is its `error`; no row changes a branch or the worktree's status:

| Row | Query | Result |
|---|---|---|
| `fixture-001` | `1` | the fixture change's message, equal to `tests/fixtures/land-message.txt` |
| `bare-001` | `001` | `osq: 001 \n\n\n\n\nOsq-Change: 001\nOsq-Head: <head>\n` |
| `vcs-off-001` | `1` | `osq message needs vcs.enabled and git` |
| `active-001` | `1` | `001-alpha-orders has not archived on osq/001-alpha-orders` |
| `missing-2` | `2` | `No archived change "2" in an osq worktree` |

#### Scenario: Message for a stacked change
- **WHEN** `message` runs with the query `1` on a land repository holding the fixture change, whose archived folder also holds `.run/stacked-on` holding `000-base sha256:x\n`, committed
- **THEN** it gives a `Failed` error for the command `message` with the message `001-alpha-orders is stacked on 000-base; Rust message does not build stacked changes' messages yet`
