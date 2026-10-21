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
`name` SHALL be `land`, and its `commands` SHALL be exactly one `Command`
named `land`, with the summary
`land an archived change onto the default branch` and the usage `<id>`.

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
- **THEN** the name is `land`, and the commands are one command with the name `land`, the summary `land an archived change onto the default branch` and the usage `<id>`

### Requirement: Land arguments
`LandFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `land`, and
`FeatureError::usage("land", "expected one change id, got <n>")` for a
`land` invocation with `n` arguments when `n` is not 1, before it reads
any file. Every other failure of `land` SHALL be `FeatureError::failed`
with the command `land` and the message the other land requirements name.

#### Scenario: Land argument errors
- **WHEN** a test runs the invocation in the row with a root that holds no files
- **THEN** it gives the row's error:

| Invocation | Error |
|---|---|
| `land` with no args | `Usage` error displayed `usage of land: expected one change id, got 0` |
| `land` with args `1`, `2` | `Usage` error displayed `usage of land: expected one change id, got 2` |
| `archive` with args `1` | `UnknownCommand` error displayed `unknown command: archive` |

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
reads it, the change has landed, and `land` SHALL write nothing and,
after the checks of "Land refusals" that apply to a landed change, return
the output `<folder> has already landed; nothing to clean up` and
a newline when no worktree change is `<folder>`, or
`<folder> has already landed; Rust land does not remove worktrees yet`
and a newline when one is.

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
After the lookup and the refusals, `land` SHALL take the HEAD of the
change's worktree as the tip and the checkout's HEAD as the base, and fail
with `<default branch> moved while landing; run osq land <id> again`,
where `<id>` is the folder's text before its first `-`, or the whole name
without one, when either has no commit or the base is not an ancestor of
the tip. It SHALL then write the land commit with the vcs kernel's
`commit_tree(tip, base, message, author, [])`, with the message of "Land
message" and `vcs.author` as the author, and move the checkout to it only
with `fast_forward`. When `fast_forward` gives `Blocked`, `land` SHALL
fail with `The checkout has uncommitted changes in files this land writes:
<paths>; keep them with osq manual "<why>", or commit or stash them, then
run osq land <id> again`, or, when `vcs.manualEdits` is `block`, with
`The checkout has uncommitted changes in files this land writes: <paths>;
commit or stash them, then run osq land <id> again`, with the paths joined
by `, `. When `fast_forward` fails and the checkout's HEAD is no longer
the base, it SHALL fail with the moved message, and otherwise with the
`VcsError`'s display. It SHALL run no verify, push nothing, and remove no
worktree or branch.

On success `land` SHALL return the output `Landed <folder> as <commit>`, a
newline, `Kept branch osq/<folder>` and a newline, as TypeScript's
`landChange` prints them, followed by `Changed <path>` and a newline for
each path in `fast_forward`'s `changed` list, in its order, where
`<path>` is the checkout's repository root joined with the path, shown
with `display()`, as TypeScript's "Land reports changed paths" builds
them.

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
| `main` gained a commit that adds `other.txt` after the branch was cut | `main moved while landing; run osq land 001 again` |
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
