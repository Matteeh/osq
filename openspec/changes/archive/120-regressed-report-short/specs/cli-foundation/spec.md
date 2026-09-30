## ADDED Requirements

### Requirement: Marker output limits
`limits` SHALL carry `markerOutputLines`, default 40, the most output lines a
`.run/` marker keeps when the output has no `✖ failing tests:` section, and
`markerLineChars`, default 400, the most characters a marker keeps of any one
output line. Both SHALL merge from `osq.config.ts` like the other limits.

#### Scenario: Default marker limits
- **WHEN** `DEFAULT_CONFIG.limits` is inspected
- **THEN** `markerOutputLines` is 40 and `markerLineChars` is 400

#### Scenario: Configured marker lines
- **WHEN** `osq.config.ts` sets `limits.markerOutputLines` to 5 and archive-time verification fails with 100 lines of output and no failing-tests section
- **THEN** `.run/regressed/change.md` holds the last 5 output lines and the `Full output:` line
