## ADDED Requirements

### Requirement: Language support has one seam
osq's own decisions SHALL include an accepted, system-wide ADR whose rule is
"A path's language comes from its nearest manifest; language-specific code
sits behind the languages kernel adapter, and a gate names the languages it
misses.", and AGENTS.md's project rules block SHALL carry that rule.

#### Scenario: Language-support rule reaches every agent
- **WHEN** `readDecisions` reads osq's decisions folder and `checkProjectRules` checks AGENTS.md
- **THEN** an accepted ADR for `all` has that rule, the rules block holds its line, and neither reports a problem
