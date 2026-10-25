# Spec Delta: status-inspection

## MODIFIED Requirements

### Requirement: Runs after in show
`readRunsAfter(projectRoot, config, folderPath)` in
`src/core/status/show-runs-after.ts` SHALL return the changes an active
change runs after, as `{ folder, capabilities }`, where `capabilities` is the
overlap's capabilities, or null for a declared `depends_on` entry. An entry
whose awaited entry carries `reapproved: true` SHALL carry
`reapproved: true` too, and every other entry no `reapproved` key. With
`vcs.enabled` and `GitVcs` selected, it SHALL give, for a folder without
`.run/approved`, what `awaitedForApproval` returns, and for a folder with
it, what `awaitedDependencies` returns. Otherwise it SHALL give an empty
list. `projectRoot` is the checkout's project root, never a worktree's.

`osq show <id>` for an active change SHALL set `runsAfter` in the details when
that list is not empty, and leave it out otherwise, so `osq show --json`
carries it only then. The text output SHALL then print
`Runs after: <entries>` right after the `Depends on:` line, the entries
joined with `, `, each `<folder> (depends_on)` or
`<folder> (also writes <capabilities joined with ", ">)`, and
`<folder> (also writes <capabilities joined with ", ">; approved again since)`
for an entry with `reapproved`. Archived and rejected changes SHALL carry no
`runsAfter`.

#### Scenario: Show a change that runs after another
- **WHEN** `osq show` runs for the change below, in a temporary repository where `001-a`, which writes `orders`, is approved into a worktree
- **THEN** it prints the line below after `Depends on:`, or none:

| Change | Line |
|---|---|
| draft `002-b` writing `orders` | `Runs after: 001-a (also writes orders)` |
| `002-b` writing `orders`, approved and stacked | `Runs after: 001-a (also writes orders)` |
| draft `002-b` writing `billing` with `depends_on: ["001"]` | `Runs after: 001-a (depends_on)` |
| draft `002-b` writing only `billing` | none |

#### Scenario: Runs after in show JSON
- **WHEN** `osq show 002 --json` runs for the stacked `002-b` that overlaps `001-a` on `orders`, and again after `001-a` has landed
- **THEN** the first output's `runsAfter` is `[{ "folder": "001-a", "capabilities": ["orders"] }]`, and the second has no `runsAfter` key

#### Scenario: Show an overlap approved again since
- **WHEN** in a temporary repository `001-a`, which writes `orders`, is approved into a worktree, `002-b`, writing `orders`, is approved and stacked, and then `001-a`'s approved hash changes, and `osq show 002` runs with and without `--json`
- **THEN** the text prints `Runs after: 001-a (also writes orders; approved again since)` after `Depends on:`, and the JSON's `runsAfter` is `[{ "folder": "001-a", "capabilities": ["orders"], "reapproved": true }]`

## ADDED Requirements

### Requirement: Overlap approved again in the inbox
`readOverlapReapproved(projectRoot, config)` in
`src/core/status/inbox-overlap.ts` SHALL, with `vcs.enabled` and `GitVcs`
selected, visit every change `listChanges` returns with location `active`
and `.run/approved` in its folder, counted once by folder name. For each
entry of its `awaitedDependencies` that carries `reapproved: true`, it SHALL
give one needs-you item. Otherwise it SHALL give no item, and it SHALL write
nothing.

The item SHALL be
`{ kind: 'overlap-reapproved', change: { id, title }, task: null, command: 'osq show <id>', overlapReapproved: { folder, capabilities } }`,
with the waiting change's id and title, the title from its proposal or else
its folder name, and the entry's folder and overlap. `readInbox` SHALL add
these items to the needs-you group, sorted with the other items by id.
`formatInboxText` SHALL render one as
`  <id>: <title> — waits for <folder> (also writes <capabilities joined with ", ">), approved again since — osq show <id>`.

#### Scenario: Overlap approved again in the inbox
- **WHEN** in a temporary repository `001-a`, which writes `orders`, is approved into a worktree, `002-b` titled `Two`, writing `orders`, is approved and stacked, and `001-a`'s approved hash is in the state below
- **THEN** `osq --json` and the text inbox hold what the row says:

| `001-a` | needs-you item for `002` | text row |
|---|---|---|
| approved with the hash `002-b` recorded | none | none |
| approved with another hash | `{ kind: "overlap-reapproved", change: { id: "002", title: "Two" }, task: null, command: "osq show 002", overlapReapproved: { folder: "001-a", capabilities: ["orders"] } }` | `  002: Two — waits for 001-a (also writes orders), approved again since — osq show 002` |
| landed | none | none |
