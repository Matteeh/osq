## ADDED Requirements

### Requirement: Server mode is an addition to local use
osq's own decisions SHALL include an accepted, system-wide ADR whose rule is
"Server mode is an addition; an osq server runs the same command functions on
its own clone, and every command keeps working locally exactly as today.", and
AGENTS.md's project rules block SHALL carry that rule. A decision about
running osq on a server that would remove or change a local command SHALL
supersede that ADR first.

#### Scenario: Server-mode rule reaches every agent
- **WHEN** `readDecisions` reads osq's decisions folder and `checkProjectRules` checks AGENTS.md
- **THEN** an accepted ADR for `all` has that rule, the rules block holds its line, and neither reports a problem
