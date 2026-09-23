# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: One proposal format
<!-- source: templates/proposal.md, templates/openspec/schemas/osq/templates/proposal.md, templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, src/core/foundation/init-blocks.ts, tests/proposal-format.test.ts -->
The osq schema's proposal template SHALL be byte-identical to
`templates/proposal.md`, the template `osq new` writes. The schema's proposal
instruction and the proposal rules in `templates/openspec/config.yaml` SHALL
name the sections Goal, Verify, Non-goals, Surface, Contract, Human steps, and
Delta in that order, the frontmatter `verify` command, and `features.reads`,
and SHALL NOT ask for Why, What Changes, Capabilities, or Impact sections.
The template's `## Surface` section SHALL hold an HTML comment naming the
categories commands, flags, config keys, frontmatter fields, document sections,
dead reasons, and event types, followed by the line `None`. The managed
`PLANNER.md` block SHALL tell the planner to fill `## Surface` after
`## Non-goals`, list the same categories, and allow a single `None`.

#### Scenario: Both proposal entry points agree
- **WHEN** the schema's proposal template and `templates/proposal.md` are compared
- **THEN** they are byte-identical

#### Scenario: Instruction matches the planner
- **WHEN** the schema's proposal instruction and the managed `PLANNER.md` block are inspected
- **THEN** both name `## Goal`, `## Non-goals`, `## Surface`, and `## Human steps`, and the instruction contains no `What Changes` or `Capabilities` section

#### Scenario: Seeded surface section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Surface` section follows `## Non-goals`, precedes `## Contract`, and holds the categories comment followed by `None`
