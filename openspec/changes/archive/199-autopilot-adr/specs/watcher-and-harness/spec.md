## ADDED Requirements

### Requirement: Autopilot decision
osq's decisions SHALL include ADR 021, `decisions/021-autopilot.md`, accepted
with the capabilities, rule and checks test its scenario names, and no
decision problem. The index SHALL link it once, AGENTS.md's rules block SHALL
not change, its sections SHALL name what autopilot is built from, and
`DEFAULT_CONFIG` SHALL leave autopilot off.

#### Scenario: Autopilot ADR is accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** ADR 021 is listed and not ignored, with status `accepted`, `appliesTo` `["watcher-and-harness", "cli-foundation", "status-inspection", "version-control"]`, the rule "With autopilot on, a human approves the queue once; osq plans, approves, runs and lands each approved item in order and stops when recovery runs out.", `checks` `["tests/autopilot-adr.test.ts"]`, `validateDecisions` reports no error and no warning, and `decisions/README.md` links `021-autopilot.md` exactly once

#### Scenario: Rules block without ADR 021
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 021` and `checkProjectRules` reports nothing

#### Scenario: Autopilot ADR names its mechanism
- **WHEN** the sections of `decisions/021-autopilot.md` are read
- **THEN** each section contains every term in its row

| section | terms |
| --- | --- |
| `## Decision` | `autopilot.enabled`, `osq queue approve`, `autopilot.maxSteers`, `gates.autoRetries`, `osq approve`, `osq land`, `ADR 018`, `ADR 019` |
| `## Consequences for ADR 003, ADR 006 and ADR 018` | `ADR 003`, `ADR 006`, `ADR 018` |
| `## Rejected` | `Skipping a gate` |

#### Scenario: Autopilot is off by default
- **WHEN** `DEFAULT_CONFIG` is read as a plain record
- **THEN** its `autopilot` value is absent, or an object whose `enabled` is not `true`
