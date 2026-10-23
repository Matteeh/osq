## MODIFIED Requirements

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

## ADDED Requirements

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
