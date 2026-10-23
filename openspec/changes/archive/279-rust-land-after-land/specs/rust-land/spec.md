## MODIFIED Requirements

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
worktree or branch; the only command it runs is the one "Land after-land
command" names.

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
| `main` gained a commit that adds `other.txt` after the branch was cut | `main moved while landing; run osq land 001 again` |
| the checkout's `src/one.txt` holds `edit\n`, not committed | `The checkout has uncommitted changes in files this land writes: src/one.txt; keep them with osq manual "<why>", or commit or stash them, then run osq land 001 again` |
| the checkout's `src/one.txt` holds `edit\n`, not committed, and `osq.toml` also holds `manualEdits = "block"` under `[vcs]` | `The checkout has uncommitted changes in files this land writes: src/one.txt; commit or stash them, then run osq land 001 again` |

#### Scenario: Git refuses the fast-forward
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change whose checkout's git directory holds an `index.lock` file
- **THEN** it gives a `Failed` error for the command `land` whose message is the display of the `VcsError` that `fast_forward` gave, which names `index.lock`, and `main` is at the commit it was at before `land` ran

## ADDED Requirements

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
  `After-land command failed: <command>`, then the last 20 lines of the
  outcome's output after its trailing blank lines are dropped, then
  `run osq land <id> again to retry it`, joined by newlines. The land
  commit and the checkout's fast-forward stay. A start error of
  `run_verify` counts as exit code 1 with its display as the output.

The record and the line texts are TypeScript's, so its inbox shows the
failure as an `after-land-failed` item. A landed change's second `land`
does not rerun the command.

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
