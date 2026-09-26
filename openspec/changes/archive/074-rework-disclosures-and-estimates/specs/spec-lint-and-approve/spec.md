# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Rework declaration
<!-- source: src/core/spec/parser.ts, src/core/spec/linter.ts, tests/fixes-declaration.test.ts -->
A proposal MAY declare `fixes` in its frontmatter as a list of the change ids it
fixes. `parseSpecMd` SHALL expose them as `fixes`, normalized like
`depends_on`, and an absent or malformed value SHALL read as an empty list.
`osq lint` SHALL fail with `fixes names missing change: <id>` for each id that
names no active, archived, or rejected change. `fixes` SHALL NOT affect
dependency completion or execution order.

#### Scenario: Declared fix
- **WHEN** a proposal declares `fixes: ["1"]` and change 001 exists
- **THEN** `parseSpecMd` returns `fixes: ["001"]` and lint reports no `fixes` finding

#### Scenario: Missing fixed change
- **WHEN** a proposal declares `fixes: ["099"]` and no change 099 exists
- **THEN** lint fails with `fixes names missing change: 099`

### Requirement: Approval price gap notice
<!-- source: src/core/spec/approve.ts, src/cli/approve.ts, src/core/report/planning-price-gaps.ts, tests/planning-price-gaps.test.ts -->
When the change being approved has planning sessions with recorded tokens whose
`plan_started` model has no `planning.prices` entry, `osq approve` SHALL print
one line per such model naming the exact key, such as
`planning.prices["claude-opus-5-5"]`, and saying its planning cost stays
unreported. The approval SHALL proceed unchanged.

#### Scenario: Unpriced planning model at approval
- **WHEN** a change with recorded planning tokens from `claude-opus-5-5` is approved and `planning.prices` has no entry for that model
- **THEN** approval succeeds and prints a line naming `planning.prices["claude-opus-5-5"]`

#### Scenario: Priced or unrecorded
- **WHEN** every model with recorded planning tokens has a price entry, or no session recorded tokens
- **THEN** approval prints no price line
