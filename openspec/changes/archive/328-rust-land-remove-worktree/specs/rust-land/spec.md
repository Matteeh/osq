## MODIFIED Requirements

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
"Land cleanup" and then "Land after-land retry", which writes only the
after-land record and what its command writes. Its landed lines are
`<folder> has already landed` and a newline followed by the cleanup's line
and a newline when "Land cleanup" attempted a removal, or
`<folder> has already landed; nothing to clean up` and a newline when it
did not. Without a retry, `land` SHALL return the landed lines as its
output, or, when the cleanup failed, fail with `FeatureError::failed` with
the command `land` and those lines without the last newline as the
message.

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
| the fixture change's worktree remains at its "Land cleanup" path `<path>`, under a `vcs.worktreeRoot` set in `osq.toml` | `001-alpha-orders has already landed\nRemoved worktree <path>\n` |
| the fixture change's worktree was removed with `git worktree remove --force`, and the checkout holds `openspec/changes/archive/001-alpha-orders/proposal.md` | `001-alpha-orders has already landed; nothing to clean up\n` |

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
no branch; it removes only the worktree "Land cleanup" names, and the only
commands it runs are those "Land sync", "Land sync verify", "Land cleanup"
and "Land after-land command" name.

After `fast_forward` gives `Done`, `land` SHALL run "Land cleanup" and
then "Land after-land command". On success `land` SHALL return the output
`Landed <folder> as <commit>` and a newline, then the cleanup's line and a
newline when it attempted a removal, then `Kept branch osq/<folder>` and a
newline, as TypeScript's `landChange` prints them, followed by
`Changed <path>` and a newline for each path in `fast_forward`'s
`changed` list, in its order, where `<path>` is the checkout's repository
root joined with the path, shown with `display()`, as TypeScript's "Land
reports changed paths" builds them, then the lines "Land after-land
command" adds. When the cleanup failed, `land` SHALL instead fail with
`FeatureError::failed` with the command `land` and all those lines without
the last newline as the message; the land commit and the checkout's
fast-forward stay.

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
| the fixture change's archived folder also holds `.run/stacked-on` holding `000-base sha256:x\n`, committed on its branch | output `001-alpha-orders has already landed; nothing to clean up\n` |

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
  lookup"'s landed lines.
- Otherwise `land` SHALL fail with `FeatureError::failed` with the command
  `land`, whose message is `After-land command failed: <command>`, the
  output tail "Land after-land command" names, `run osq land <id> again to
  retry it` and "Land lookup"'s landed lines without the last newline, joined by
  newlines, as TypeScript's `cleanupLanded` orders its lines.

With `vcs.afterLand` unset, with no record, with a record that does not
parse, or with one that names another change, `land` SHALL run nothing,
leave the record's bytes as they are, and return "Land lookup"'s landed
lines. A refusal of "Land refusals" runs nothing and leaves the record.

#### Scenario: Retry on a landed change
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change whose worktree remains, after `main` gained a commit that adds `openspec/changes/archive/001-alpha-orders/proposal.md`, with the row's record for the repository's checkout and the row's `afterLand` under `[vcs]`
- **THEN** `main` gains no commit, and `land` returns the row's output or fails with the row's message, written with `\n` escapes, where `<landed>` is `001-alpha-orders has already landed; nothing to clean up`, since the worktree is not at its "Land cleanup" path, and the checkout's `built.txt` and the record are as the row says:

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

## ADDED Requirements

### Requirement: Land cleanup
The cleanup SHALL remove the change's worktree as TypeScript's
`cleanupChange` removes it. Its path `<path>` is
`<vcs.worktreeRoot>/<repo>/<folder>`, as version-control "Worktree
location" gives it: a leading `~` in `vcs.worktreeRoot` expands to `HOME`,
empty when unset, `<repo>` is the last component of the checkout's
repository root, and `<folder>` is the change folder. It attempts a removal
only when a folder is at `<path>` or the root's `worktree_list` lists an
entry whose path is `<path>`; otherwise it does nothing and gives no line.
It SHALL run these steps in order and stop at the first that fails:

1. When the checkout holds `openspec/changes/archive/<folder>` and the
   folder `<path>/openspec/changes/archive/<folder>/.run/logs` exists, copy
   every file under it, with its folders, into the checkout's
   `openspec/changes/archive/<folder>/.run/logs`, leaving every file that
   is already there as it is.
2. Delete `<path>` with every file in it, ignored files included, when it
   exists, with no time limit.
3. Run the vcs kernel's `worktree_prune` at the root, bounded by the
   config's git timeouts.

When every step passes, its line is `Removed worktree <path>`. When a step
fails, its line is `Could not remove worktree <path>: <cause>`, where
`<cause>` is the failing step's error display, and the cleanup failed.
`<path>` is shown with `display()`. The cleanup SHALL neither read nor
remove `openspec/changes/<folder>` in the checkout.

#### Scenario: Cleanup outcomes
- **WHEN** a land repository whose `osq.toml` sets `vcs.worktreeRoot` to `<scratch>/wt` and whose `main` commits git ignore rules for `node_modules/`, `target/` and `.run/logs/` holds the fixture change in a worktree at `<path>`, `<scratch>/wt/checkout/001-alpha-orders`, with the row's state, and `land` runs with the query `1`
- **THEN** the row's outcome holds, where `<commit>` is the land commit and `<lines>` are "Land commit"'s lines from `Kept branch` on:

| State | Outcome |
|---|---|
| the worktree holds the ignored file `node_modules/pkg/index.js` | output `Landed 001-alpha-orders as <commit>\nRemoved worktree <path>\n<lines>`; no folder is at `<path>`, and `git worktree list` does not list `<path>` |
| the worktree's archived folder holds the ignored `.run/logs/probe.log` holding `probe` | the checkout's `openspec/changes/archive/001-alpha-orders/.run/logs/probe.log` holds `probe`, and `git status --porcelain` in the checkout prints nothing |
| as the row above, and the checkout already holds that log holding `kept` before `land` runs | the checkout's log still holds `kept` |
| the checkout holds the untracked file `openspec/changes/001-alpha-orders/notes.md` | the change lands and that file keeps its bytes |
| the worktree holds the folder `node_modules/locked` holding one file, with the folder's write permission removed | a `Failed` error for the command `land` whose message begins `Landed 001-alpha-orders as <commit>\nCould not remove worktree <path>: ` and ends with `\nKept branch osq/001-alpha-orders` followed by the `Changed` lines; `main`'s HEAD is `<commit>` |

#### Scenario: Cleanup of a landed change
- **WHEN** such a land repository's `main` gained a commit adding `openspec/changes/archive/001-alpha-orders/proposal.md`, the row's state holds, and `land` runs with the query `1`
- **THEN** it gives the row's output, written with `\n` escapes, and `main` gains no commit:

| State | Output |
|---|---|
| the worktree remains at `<path>` | `001-alpha-orders has already landed\nRemoved worktree <path>\n` |
| the worktree remains at `<path>`, and `land` already ran once for the change | `001-alpha-orders has already landed; nothing to clean up\n` |
| git no longer lists `<path>`, and a folder at `<path>` holds `target/big` | `001-alpha-orders has already landed\nRemoved worktree <path>\n`, and no folder is at `<path>` |
| git still lists `<path>`, but its folder was deleted | `001-alpha-orders has already landed\nRemoved worktree <path>\n`, and `git worktree list` does not list `<path>` |
