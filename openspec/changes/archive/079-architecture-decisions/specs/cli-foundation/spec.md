# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Architecture decision records
<!-- source: src/core/foundation/decisions.ts, tests/decisions-read.test.ts -->
osq SHALL read ADRs from the markdown files directly under `paths.decisions`,
leaving out `README.md`, through one module, `src/core/foundation/decisions.ts`,
that every other part of osq uses. A file whose YAML frontmatter has a `status`
key SHALL be an ADR. Any other markdown file SHALL be ignored and listed as
ignored. An ADR's number SHALL be the leading digits of its file name, as
written, such as `007`, and ADR numbers SHALL compare by numeric value, so
`ADR 7` names `007`. Its title SHALL be its first `# ` heading without a
leading `<number>.`. Frontmatter SHALL carry `status`, one of `proposed`,
`accepted`, or `superseded`; `applies_to`, either `all` or a list of
capability names; `rule`, one sentence saying what a spec must do; and, on a
superseded ADR, `superseded_by`, the number of its replacement. Only accepted
ADRs SHALL take effect. An accepted ADR SHALL govern a change when it applies
to `all` or names a capability the change writes. A missing decisions folder
SHALL read as no ADRs.

#### Scenario: Frontmatter ADR
- **WHEN** `decisions/007-ui-framework.md` has frontmatter `status: accepted`, `applies_to: all`, `rule: UI components use React.` and the heading `# 007. UI framework`
- **THEN** osq reads ADR `007` titled `UI framework`, applying to all, with that rule

#### Scenario: Plain markdown ADR
- **WHEN** a file under the decisions folder has no frontmatter
- **THEN** it is listed as ignored and takes no effect

### Requirement: Architecture decision validation
<!-- source: src/core/foundation/decisions.ts, tests/decisions-read.test.ts -->
Validation SHALL report an error for an ADR whose `status` is not one of the
three values, an accepted ADR without a valid `applies_to`, an accepted ADR
whose `rule` is missing, spans more than one line, or is longer than
`limits.maxRuleLength` characters, and a superseded ADR whose `superseded_by`
is missing or names no existing ADR. It SHALL report a warning for each
ignored file and for each capability name in `applies_to` that has no living
spec, since the capability may not exist yet.

#### Scenario: Rule too long
- **WHEN** an accepted ADR's rule is one character longer than `limits.maxRuleLength`
- **THEN** validation reports an error naming the ADR and the limit

#### Scenario: Future capability
- **WHEN** an accepted ADR applies to `ingress` and no living spec named `ingress` exists
- **THEN** validation reports a warning, not an error

### Requirement: Project rules block
<!-- source: src/core/foundation/rules-block.ts, src/core/foundation/init.ts, src/cli/init.ts, tests/rules-block.test.ts -->
`osq init` SHALL write a project rules block into AGENTS.md between
`<!-- OSQ:RULES:START -->` and `<!-- OSQ:RULES:END -->`, directly before the
`<!-- OSQ:START -->` managed block and separated from it by one blank line.
The block SHALL hold the heading `## Project rules`, a blank line, and one line
per accepted ADR that applies to all, in number order, each reading
`- <rule> ADR <number>`, such as `- UI components use React. ADR 007`. With no
such ADR the block SHALL be absent, and `osq init` SHALL remove one that
exists. Writing the block SHALL never change AGENTS.md content outside its
markers, including the osq managed block, and a second run SHALL change
nothing.

#### Scenario: Two system-wide rules
- **WHEN** ADRs 003 and 007 are accepted and apply to all, and `osq init` runs twice
- **THEN** AGENTS.md holds one rules block with the 003 line before the 007 line, directly before the managed block, and the second run leaves the file byte-identical

#### Scenario: Superseded rule
- **WHEN** ADR 003 becomes superseded by accepted system-wide ADR 008 and `osq init` runs
- **THEN** the 003 line is gone and the 008 line is present

### Requirement: Decisions doctor check
<!-- source: src/core/foundation/doctor-decisions.ts, src/core/foundation/doctor.ts, tests/rules-block.test.ts -->
`osq doctor` SHALL add a `decisions` check, after `managed-blocks`, when the
decisions folder holds a markdown file other than `README.md` or AGENTS.md
holds a rules marker. The check SHALL fail on any validation error, on a rules
block that doesn't match the accepted ADRs, saying to run `osq init`, and on
more system-wide rules than `limits.maxProjectRules`, naming the limit. With no
failure and at least one validation warning it SHALL pass with a warning that
lists each ignored file and unknown capability. Without ADR files or a rules
marker, the check list SHALL be unchanged.

#### Scenario: Stale block
- **WHEN** a new accepted system-wide ADR is added and `osq init` has not run
- **THEN** doctor prints `[fail] decisions:` with a message naming `osq init`, and passes after `osq init`

#### Scenario: Ignored file
- **WHEN** the decisions folder holds one ADR with frontmatter and one without
- **THEN** doctor prints a `[warn] decisions:` line naming the file without frontmatter and exits zero

### Requirement: Plan prompt architecture decisions
<!-- source: src/cli/plan-sections.ts, src/cli/plan-queue.ts, src/cli/plan.ts, tests/plan-decisions.test.ts -->
When the project has at least one accepted ADR, the plan prompt SHALL carry an
`## Architecture Decisions` section after `## Capability Specs` and before
`## Brief`. It SHALL start with the sentence
`Read in full every ADR that applies to all, and every ADR that applies to a capability this change writes. Name each governing capability ADR in the proposal's ## Decisions section.`
and list each accepted ADR in number order as
`- ADR <number>: <title>. Applies to: <all, or capability names joined by ", ">. Rule: <rule> Path: <repository-relative path>`.
Proposed and superseded ADRs SHALL NOT appear. Without an accepted ADR the
section SHALL be absent.

#### Scenario: Accepted and superseded ADRs
- **WHEN** ADR 003 is superseded and ADRs 007 and 009 are accepted
- **THEN** the section lists 007 and 009 with their scopes, rules, and paths, and does not mention 003

### Requirement: Planner decisions guidance
<!-- source: src/core/foundation/init-blocks.ts, PLANNER.md, templates/PLANNER.md, tests/proposal-format.test.ts -->
The managed `PLANNER.md` block SHALL tell the planner to write `## Decisions`
after `## Surface`, with one line per accepted ADR that governs a capability
the change writes saying what the decision means for this change, to name a
system-wide ADR only to depart from it, to start a departure line with
`Departs from ADR <n>:` and give the reason, to treat a needed departure as a
reason for a new ADR, to write `None` when no ADR governs the change, and to
repeat a rule in a task only when that task touches the area.

#### Scenario: Planner block names the section
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it names `## Decisions`, `Departs from ADR <n>:`, and `None`

### Requirement: Decision limits
<!-- source: src/core/foundation/config.ts, tests/decisions-read.test.ts -->
`limits` SHALL carry `maxRuleLength`, default 160, the most characters an
accepted ADR's rule may have, and `maxProjectRules`, default 10, the most
system-wide rules the AGENTS.md block may hold. Both SHALL merge from
`osq.config.ts` like the other limits.

#### Scenario: Configured rule length
- **WHEN** `osq.config.ts` sets `limits.maxRuleLength` to 40
- **THEN** an accepted ADR with a 41-character rule fails validation naming 40

### Requirement: osq's own decision records
<!-- source: decisions/**, tests/decisions-read.test.ts -->
ADRs 001, 002, 004, and 005 in osq's `decisions/` SHALL carry osq frontmatter
with status `accepted`, a capability-scoped `applies_to`, and a one-line rule,
and SHALL keep their bodies unchanged. `decisions/README.md` SHALL describe the
frontmatter format. None of them SHALL apply to all, so osq's AGENTS.md has no
rules block.

#### Scenario: Own ADRs validate
- **WHEN** osq's own decisions folder is read and validated against its living specs
- **THEN** it yields four accepted ADRs, no ignored file, no error, and no warning

## MODIFIED Requirements

### Requirement: One proposal format
<!-- source: templates/proposal.md, templates/openspec/schemas/osq/templates/proposal.md, templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, src/core/foundation/init-blocks.ts, tests/proposal-format.test.ts -->
The osq schema's proposal template SHALL be byte-identical to
`templates/proposal.md`, the template `osq new` writes. The schema's proposal
instruction and the proposal rules in `templates/openspec/config.yaml` SHALL
name the sections Goal, Verify, Non-goals, Surface, Decisions, Contract, Human
steps, and Delta in that order, the frontmatter `verify` command, and
`features.reads`, and SHALL NOT ask for Why, What Changes, Capabilities, or
Impact sections. The template's `## Surface` section SHALL hold an HTML comment
naming the categories commands, flags, config keys, frontmatter fields,
document sections, dead reasons, and event types, followed by the line `None`.
The template's `## Decisions` section SHALL hold an HTML comment describing
decision lines and departure lines, followed by the line `None`. The managed
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

#### Scenario: Seeded decisions section
- **WHEN** `osq new` seeds a proposal
- **THEN** its `## Decisions` section follows `## Surface`, precedes `## Contract`, and holds a comment followed by `None`
