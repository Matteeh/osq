# Spec Delta: status-inspection

## ADDED Requirements

### Requirement: Runs after in show
`readRunsAfter(projectRoot, config, folderPath)` in
`src/core/status/show-runs-after.ts` SHALL return the changes an active
change runs after, as `{ folder, capabilities }`, where `capabilities` is the
overlap's capabilities, or null for a declared `depends_on` entry. With
`vcs.enabled` and `GitVcs` selected, it SHALL give, for a folder without
`.run/approved`, what `awaitedForApproval` returns, and for a folder with
it, what `awaitedDependencies` returns. Otherwise it SHALL give an empty
list. `projectRoot` is the checkout's project root, never a worktree's.

`osq show <id>` for an active change SHALL set `runsAfter` in the details when
that list is not empty, and leave it out otherwise, so `osq show --json`
carries it only then. The text output SHALL then print
`Runs after: <entries>` right after the `Depends on:` line, the entries
joined with `, `, each `<folder> (depends_on)` or
`<folder> (also writes <capabilities joined with ", ">)`. Archived and
rejected changes SHALL carry no `runsAfter`.

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
