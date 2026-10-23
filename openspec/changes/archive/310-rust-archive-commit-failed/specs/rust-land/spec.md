## MODIFIED Requirements

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
