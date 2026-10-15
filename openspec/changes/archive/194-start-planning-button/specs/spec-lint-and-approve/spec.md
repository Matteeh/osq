## ADDED Requirements

### Requirement: Approve waits for a running planner
`approveSpec` SHALL refuse a change for which `readLivePlanner(state)` returns
a planner, before it lints, hashes, or writes anything, with the error
`a planner is running for <folder> since <time>; approve after it finishes`,
`<time>` from `formatPauseUntil`. `osq approve <id>` SHALL print it as it
prints any approval error, `Error approving <id>:` with the message on the
next line, and exit 1, and the dashboard's `approve` action SHALL return it
as its error. A record whose planner process has stopped SHALL not
block approval.

#### Scenario: Approve while planning
- **WHEN** unapproved change 001 has a lint-clean plan and its `.run/plan-run.md` holds a `running` record with `at` `2026-10-14T09:30:00.000Z` and the test's own pid
- **THEN** `osq approve 001` exits 1 with an error whose second line is `  a planner is running for 001-demo since 2026-10-14 09:30 UTC; approve after it finishes`, and the change has no `.run/approved`

#### Scenario: Approve after the planner stopped
- **WHEN** the record's pid belongs to a child process that has exited
- **THEN** `osq approve 001` approves the change
