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

## ADDED Requirements

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
