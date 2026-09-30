## MODIFIED Requirements

### Requirement: Running change in status
`osq status` SHALL print `  worktree: <path>` under a change that runs in a
worktree, directly below its heading line. While a task of that change is
running, it SHALL print, below the worktree line,
`  warning: a task is running in this worktree; do not edit it until the task ends`.
`osq status` SHALL NOT read or compare a folder of the same name in the
checkout, and SHALL print no warning about one: approval removes the
checkout's copy, and a folder an older approval left there is not the change.

#### Scenario: Worktree path
- **WHEN** `osq status` runs with `vcs.enabled` and a change approved into a worktree
- **THEN** the change is listed once, as approved, followed by `  worktree: ` and the worktree path

#### Scenario: Edited checkout copy
- **WHEN** the checkout holds a folder named like that change, and a task file in it differs from the worktree's copy
- **THEN** status prints no warning about the checkout, and lists the change once, from its worktree

#### Scenario: Untouched checkout copy
- **WHEN** the checkout holds no folder named like that change
- **THEN** status prints no warning about the checkout

#### Scenario: Task running in the worktree
- **WHEN** a task of a change in a worktree holds a live lock in `.run/running/`
- **THEN** status prints the running-task warning directly below the worktree line, and prints no such warning once the lock is gone

### Requirement: Change location readers
The watcher loop, the baseline search, status and its next step, inbox, show,
the queue and its report detail, report and recent disclosures, the web data
and events, doctor and its price check, and the lifecycle commands `approve`,
`retry`, `reject`, and `verified` SHALL find change folders through the
change locations module. Outside it, only `layout.ts`, `foundation/new.ts`,
`spec/migrate.ts`, `spec/linter.ts`, `cli/lint.ts`, `cli/plan.ts`, and
`watcher/archiver.ts` SHALL call `getChangesDir` or `getArchiveDir`.

#### Scenario: A reader lists changes on its own
- **WHEN** any other file under `src/` calls `getChangesDir` or `getArchiveDir`
- **THEN** the structural test fails and names the file

#### Scenario: Landed change counted once
- **WHEN** a change archived in its worktree has been squashed onto the default branch by hand and committed, and the worktree is kept
- **THEN** `osq queue` shows its item as landed without an ambiguity error, and `osq status`, bare `osq --json`, `osq inbox --json`, and `osq report --json` each count the change once

## REMOVED Requirements

### Requirement: Leftover draft in status
**Reason**: Approval removes the checkout's copy of a change, so a landed change leaves no copy for status to flag.
**Migration**: A copy an approval before this change left in the checkout now lists as an unapproved draft. Remove it with `rm -r openspec/changes/<folder>` once the change has landed.
