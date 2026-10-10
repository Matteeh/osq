## ADDED Requirements

### Requirement: Capabilities are vertical slices
osq's own decisions SHALL include an accepted, system-wide ADR whose rule is
"A capability is a vertical slice with every layer it needs in one folder
named after it, under src or src/kernel; only kernel slices are shared.", and
AGENTS.md's project rules block SHALL carry that rule. A capability SHALL be
renamed or split only through generated deltas, never by hand.

#### Scenario: Capability-slice rule reaches every agent
- **WHEN** `readDecisions` reads osq's decisions folder and `checkProjectRules` checks AGENTS.md
- **THEN** an accepted ADR for `all` has that rule, the rules block holds its line, and neither reports a problem
