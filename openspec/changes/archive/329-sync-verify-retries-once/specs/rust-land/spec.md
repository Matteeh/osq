## MODIFIED Requirements

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
way with `check failed` in place of `verify failed`. A command whose run
does not exit 0 SHALL run once more at once in the same worktree, as
TypeScript's `runSyncVerify` does; only when that second run also does not
exit 0 does the command stop the sync as above, with the second run's
output tail. For each run that exits 0, and for a run that did not exit 0
followed by one that does, it SHALL write the whole output to the archived folder's
`.run/logs/change-<k>.log`, where `<k>` is one more than the number of
files in `.run/logs/` named `change-<digits>.log`, creating the folder and,
when it is absent, `.run/logs/.gitignore` holding `*\n`. It SHALL then
append a `verify_ran` event to `.run/events/change.jsonl` whose data is
`command`, `exitCode`, the run's exit code, `duration` in whole milliseconds, `log`
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

#### Scenario: Sync verify runs twice
- **WHEN** `land` runs as "Sync verify outcomes" runs it with the row's frontmatter line, where `<marker>` is a path in the test's scratch folder outside the worktree and absent before `land` runs
- **THEN** `land` gives the row's result, and the archived folder's `.run/events/change.jsonl` on the branch's tip ends with the row's events:

| Frontmatter | Result | Events |
|---|---|---|
| `verify: if [ -e <marker> ]; then echo second; else touch <marker>; echo first; exit 1; fi` | lands | `verify_ran` with `exitCode` 1, `log` `.run/logs/change-1.log` and `output` `first\n`, `verify_ran` with `exitCode` 0, `log` `.run/logs/change-2.log` and `output` `second\n`, then `synced` |
| `verify: if [ -e <marker> ]; then echo run 2; exit 1; else touch <marker>; echo run 1; exit 1; fi` | `Failed` with `001-alpha-orders: verify failed on osq/001-alpha-orders merged with main:\nrun 2` | `regressed` with `reason` `sync_verify_red`, after the events the branch held before `land` ran |
