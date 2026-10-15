## MODIFIED Requirements

### Requirement: Automatic scope recertification
When the scope recertification audit finds a stale done task that has no
active regression marker, the watcher SHALL recertify that task without a human
only when it has at least one differing path and, for every differing path, all
of these hold:

1. A later-numbered task in the same change has a resolved approved `scope`
   that covers the path, as `scopeCoversPath` decides.
2. That later task's `measures` end events carry the path from the done task's
   recorded hash to the current hash without a gap: one end event's `before`
   equals the done marker's recorded `scope_files` hash, each later end event's
   `before` equals the previous one's `after`, and the last end event's `after`
   equals the current hash. A missing hash counts as `null`, which means the
   file was absent.
3. The done task's verify passes at detection.

Within one task's stream, an end event whose `before` for the path equals the
`before` of that task's previous end event for the path SHALL replace that
previous end event before the chain is checked, because the earlier attempt's
changes were discarded, as a dead task's are in a worktree. `readEndSegments`
in `src/core/run/scope-segments.ts` SHALL return one task's end segments for one
path with that rule applied, and the audit SHALL read segments only through it.

An automatic recertification SHALL refresh the done marker through the same
function `osq retry` uses for a passing recertification. It SHALL append one
`recertification` event with `outcome: passed` and `automatic: true`, carrying
the same differing paths, attribution, verify result, and hashes as a human
recertification. It SHALL write no regression marker and no `regressed` event,
and it SHALL not halt the change. The watcher SHALL log one line per
automatically recertified task. Any other stale task SHALL be recorded and
halt the change exactly as before.

#### Scenario: A later task extends the file
- **WHEN** task 1 finished with `src/a.ts`, task 2's scope covers it, task 2 is the only thing that changed it, and task 1's verify passes
- **THEN** task 1's done marker holds the current hashes with `recertification_count: 1`, one `recertification` event carries `outcome: passed` and `automatic: true`, no `.run/regressed/1.md` exists, and task 3 runs

#### Scenario: Verify fails at detection
- **WHEN** the chain is intact but task 1's verify fails
- **THEN** task 1 gets a regression marker and a `regressed` event, and the change halts

#### Scenario: Human edit breaks the chain
- **WHEN** `src/a.ts` was edited by hand between task 1's done marker and task 2's start
- **THEN** task 2's first `before` doesn't match task 1's recorded hash, so task 1 gets a regression marker and the change halts

#### Scenario: File outside every later scope
- **WHEN** a changed file of task 1 is covered by no later task's scope
- **THEN** task 1 gets a regression marker and the change halts

#### Scenario: Resolver upgrade only
- **WHEN** a done marker lacks the current resolver version but no file differs
- **THEN** it is recorded as a scope regression exactly as before

#### Scenario: Discarded attempt of the later task
- **WHEN** a change runs in an osq worktree with tasks 1, 2 and 3, task 2's scope covers task 1's `src/one.txt`, the harness reports no `file_changed` event, task 2's first attempt writes `src/one.txt` and a file outside its scope and dies with `scope_violation`, its automatic retry writes `src/one.txt` again and is done, and task 1's verify passes
- **THEN** task 1 is recertified automatically with one `recertification` event carrying `automatic: true` and attribution `[{ path: "src/one.txt (modified)", attribution: "2", source: "measures" }]`, no `.run/regressed/1.md` exists, and task 3 runs

#### Scenario: Segments of a discarded attempt
- **WHEN** task 2's stream holds two `measures` end events for `src/a.ts`, the first from `h1` to `h2` and the second from `h1` to `h3`
- **THEN** `readEndSegments` returns one segment, from `h1` to `h3`

#### Scenario: Segments of a kept attempt
- **WHEN** task 2's stream holds two `measures` end events for `src/a.ts`, the first from `h1` to `h2` and the second from `h2` to `h3`
- **THEN** `readEndSegments` returns both segments in stream order

### Requirement: Scope recertification audit
Before locking an upcoming task, the watcher SHALL compare every earlier
automated done task's recorded resolver-aware scope hash and resolver version
with the current tree in one audit. Every stale task SHALL run its own verify
command under the configured verify timeout. A stale task that automatic scope
recertification recertifies SHALL be done again. Every other stale task SHALL
receive an active regression marker and typed regression event containing
sorted differing paths, verification command and result, recorded and current
scope hashes, resolver upgrade context, and per-path attribution whether
verification passed or failed.

A differing path SHALL be attributed to a later done task only when exactly one
later task's normalized file-change events name a resolver-produced path and
the current file hash agrees with that task's resolver-produced completion hash
when available. When no later task's file-change events name the path, the
audit SHALL credit it from measured hashes instead: the candidates are the
later done tasks whose `measures` end segments for the path, read through
`readEndSegments`, hold at least one segment whose `before` differs from its
`after`, and the same completion-hash check applies. A path credited this way
SHALL carry `source: "measures"` in its attribution entry; a path credited from
file-change events, `ambiguous`, or `unknown` SHALL carry no `source` key.
Multiple qualifying tasks SHALL be `ambiguous`; absence of a trustworthy
candidate SHALL be `unknown`.

An active regression marker SHALL make later audits idempotent. Any newly
regressed task SHALL return `blocked_by_regression` without locking, running,
counting, or writing failure state for the upcoming task. Logging SHALL contain
one stale-task line followed by one numerically ordered change summary.

#### Scenario: More than one completed task is stale
- **WHEN** multiple earlier done tasks differ from their recorded resolved scopes before another task is due
- **THEN** every stale task is verified and recorded in one audit while the upcoming task remains unlocked and excluded from `tasksRun`

#### Scenario: Resolver version is stale
- **WHEN** an automated active done marker lacks `scope_resolver: 2` even though its aggregate hash matches
- **THEN** detection verification runs once and records a scope regression with resolver-upgrade context and no invented differing file path

#### Scenario: Detection verification times out
- **WHEN** a stale task's verify command exceeds `verifyTimeoutSeconds`
- **THEN** its marker and event retain the timeout result and the change halts for human recertification

#### Scenario: Halted cycle repeats
- **WHEN** another watcher cycle observes the same active scope regression markers
- **THEN** it writes no duplicate markers or events and does not re-run detection verification

#### Scenario: Later edit attribution
- **WHEN** normalized file-change and resolver-produced completion evidence identifies one later done task for a differing path
- **THEN** the marker and event name that task, otherwise recording `ambiguous` or `unknown` according to the evidence

#### Scenario: Automatically recertified task
- **WHEN** the only stale task qualifies for automatic scope recertification
- **THEN** the audit reports no regressed task and the upcoming task runs

#### Scenario: Credit from measured hashes
- **WHEN** task 1's `src/a.ts` differs, task 2 is done, its `measures` end event takes `src/a.ts` from `h1` to `h2`, and no stream holds a `file_changed` event
- **THEN** the attribution entry is `{ path: "src/a.ts (modified)", attribution: "2", source: "measures" }`

#### Scenario: Typed event wins
- **WHEN** task 1's `src/a.ts` differs, task 3's stream holds a `file_changed` event for `src/a.ts`, task 3's done marker records no hash for it, and task 2's `measures` end event takes `src/a.ts` from `h1` to `h2`
- **THEN** the attribution entry is `{ path: "src/a.ts (modified)", attribution: "3" }` with no `source` key

#### Scenario: Two later tasks measured the path
- **WHEN** no stream holds a `file_changed` event and the `measures` end events of both task 2 and task 3 change `src/a.ts`
- **THEN** the attribution entry is `{ path: "src/a.ts (modified)", attribution: "ambiguous" }`
