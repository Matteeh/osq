## ADDED Requirements

### Requirement: Last sync in status
<!-- source: src/core/status/status.ts, src/core/status/last-sync.ts, tests/status-sync.test.ts -->
For a change that runs in a worktree, `getStatusOverview` SHALL read the
change folder's `.run/events/change.jsonl` and carry its last `synced` event in
that change's `worktrees` entry as `lastSync`, holding the event's
`timestamp` and its data's `defaultBranch` and `commits`. When the file's last
`sync_stopped` event comes after its last `synced` event, or there is no
`synced` event, it SHALL also carry that event as `lastSyncStop`, holding its
`timestamp` and its data's `reason` and `message`. It SHALL skip lines that do
not parse, and leave out each field whose event does not exist.

`osq status` SHALL print `  last sync: <timestamp>, <n> commits from <default
branch>`, with `commit` when `<n>` is 1, then `  sync stopped: <timestamp>
(<reason>); run osq sync <id> again once it is fixed` when `lastSyncStop` is
set, then the first line of the stop's message on the next line, indented four
spaces. These lines go below the change's worktree line and its warnings and
above its `next:` line. A change without either field SHALL print no such
line.

#### Scenario: Last of several syncs
- **WHEN** a change in a worktree has two `synced` events, the second at `2026-09-29T10:00:00.000Z` with `defaultBranch` `main` and `commits` 1
- **THEN** status prints `  last sync: 2026-09-29T10:00:00.000Z, 1 commit from main` once, directly above the change's `next:` line

#### Scenario: Never synced
- **WHEN** a change in a worktree has no `synced` or `sync_stopped` event
- **THEN** status prints no `last sync:` or `sync stopped:` line, and the overview's `worktrees` entry has neither `lastSync` nor `lastSyncStop`

#### Scenario: Broken line
- **WHEN** the change's `.run/events/change.jsonl` holds a line that is not JSON before a `synced` event
- **THEN** status prints the last sync from that event

#### Scenario: Stopped after the last sync
- **WHEN** a change has a `synced` event, then a `sync_stopped` event at `2026-09-29T11:00:00.000Z` with reason `sync_conflict` and a message naming `src/app.txt`
- **THEN** status prints the `last sync:` line, then `  sync stopped: 2026-09-29T11:00:00.000Z (sync_conflict); run osq sync <id> again once it is fixed`, then the message's first line indented four spaces

#### Scenario: Stop cleared by a later sync
- **WHEN** a change has a `sync_stopped` event followed by a `synced` event
- **THEN** status prints only the `last sync:` line, and the overview has no `lastSyncStop`
