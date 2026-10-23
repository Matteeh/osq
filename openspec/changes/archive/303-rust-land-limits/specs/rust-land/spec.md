## MODIFIED Requirements

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
