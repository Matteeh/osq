# Spec Delta: web-inspection

## ADDED Requirements

### Requirement: Runs after in the change view
The web document's change SHALL carry `runsAfter`, what "Runs after in show"
gives for an active change, built with the server's project root, and leave
it out when that list is empty or the change is archived or rejected. The
change view's header SHALL then show a `Runs after` row whose value lists
each entry as `osq show` prints it, `<folder> (depends_on)` or
`<folder> (also writes <capabilities joined with ", ">)`, joined with `, `.
With no `runsAfter`, the header SHALL show no such row. The row SHALL show
for an unapproved change on the approve view and for an approved, waiting
change alike.

#### Scenario: Change view names what it runs after
- **WHEN** the change view renders a change whose `runsAfter` is `[{ folder: '001-a', capabilities: ['orders'] }, { folder: '000-z', capabilities: null }]`
- **THEN** its header has a `Runs after` row reading `001-a (also writes orders), 000-z (depends_on)`

#### Scenario: No row without a wait
- **WHEN** the change view renders a change with no `runsAfter`
- **THEN** its header has no `Runs after` row

#### Scenario: Web document carries the wait
- **WHEN** the web document is built for a temporary repository where `001-a`, which writes `orders`, is approved into a worktree and the draft `002-b` also writes `orders`
- **THEN** `002-b`'s change has `runsAfter` `[{ folder: '001-a', capabilities: ['orders'] }]`, and `001-a`'s change has no `runsAfter` key
