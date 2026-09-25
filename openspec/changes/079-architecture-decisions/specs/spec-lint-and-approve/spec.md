# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Decisions section lint
<!-- source: src/core/spec/decisions-lint.ts, src/core/spec/linter.ts, tests/decisions-lint.test.ts -->
In a project whose decisions folder holds at least one ADR with osq
frontmatter, `osq lint` and `osq approve` SHALL reject a `proposal.md` whose
`## Decisions` section is missing or holds nothing but HTML comments and
whitespace, and SHALL reject one whose section doesn't name, as `ADR <n>`,
each accepted ADR whose `applies_to` lists a capability the change writes
through a delta. The error SHALL name the ADR and the capability. A line
beginning `Departs from ADR <n>:` names that ADR. Lint SHALL warn when the
section names an ADR number that doesn't exist or isn't accepted. A system-wide
ADR need not be named, and `None` SHALL pass when no capability-scoped ADR
governs the change. A legacy `spec.md` change document and a project without
an ADR carrying osq frontmatter SHALL be exempt.

#### Scenario: Governing ADR not named
- **WHEN** accepted ADR 009 applies to `ingress`, a change has a delta for `ingress`, and its Decisions section says `None`
- **THEN** lint fails naming ADR 009 and `ingress`

#### Scenario: Governing ADR named
- **WHEN** the same section says `ADR 009: the adapter is the only module that imports dockerode.`
- **THEN** lint reports no decisions error

#### Scenario: Missing section
- **WHEN** a project has an ADR with osq frontmatter and a proposal has no `## Decisions` section
- **THEN** lint fails with an error saying to add the section or write `None`

#### Scenario: Project without ADRs
- **WHEN** a project's decisions folder is missing or holds no ADR with osq frontmatter
- **THEN** a proposal without `## Decisions` gets no decisions finding

#### Scenario: Unknown ADR named
- **WHEN** the section names `ADR 042` and no ADR 042 exists
- **THEN** lint warns and the change stays valid

### Requirement: Project rules lint
<!-- source: src/core/spec/decisions-lint.ts, tests/decisions-lint.test.ts -->
In a project with an ADR carrying osq frontmatter, lint SHALL fail every
linted proposal while the AGENTS.md rules block doesn't match the accepted
system-wide ADRs, with an error saying to run `osq init`, and while there are
more accepted system-wide ADRs than `limits.maxProjectRules`, with an error
naming the limit.

#### Scenario: Stale block
- **WHEN** an accepted system-wide ADR is added and `osq init` has not run
- **THEN** `osq lint` fails the change with an error naming `osq init`, and passes after `osq init`

#### Scenario: Too many rules
- **WHEN** `limits.maxProjectRules` is 2 and three accepted ADRs apply to all
- **THEN** lint fails with an error naming the limit 2

### Requirement: Approval digest decisions
<!-- source: src/core/spec/digest-decisions.ts, src/core/spec/digest.ts, src/core/spec/digest-format.ts, tests/approval-digest-decisions.test.ts -->
The approval digest SHALL carry `decisions`, each accepted ADR that governs the
change, in number order, with its number and rule. When the list isn't empty,
the formatted digest SHALL print `Decisions:` after the capabilities and one
line per ADR as `  ADR <number>: <rule>`. With no governing ADR the formatted
digest SHALL be unchanged.

#### Scenario: Governing decisions listed
- **WHEN** accepted ADR 007 applies to all and accepted ADR 009 applies to a capability the change writes
- **THEN** the digest prints `Decisions:`, then `  ADR 007: <rule>` and `  ADR 009: <rule>`

### Requirement: ADR departure flag
<!-- source: src/core/spec/digest-decisions.ts, src/core/spec/digest.ts, tests/approval-digest-decisions.test.ts -->
The digest SHALL raise one `adr_departure` flag for each line of the proposal's
`## Decisions` section that begins, after an optional `- ` list marker,
`Departs from ADR <n>:`. The flag's label SHALL be `departs from ADR <n>` and
its excerpt the line without the list marker. `adr_departure` flags SHALL come
after every other flag and be recorded in the manifest's `approvalFlags` like
the other flags.

#### Scenario: One departure
- **WHEN** the Decisions section holds `- Departs from ADR 007: the importer needs Vue for the legacy widget.`
- **THEN** exactly one `adr_departure` flag fires, labelled `departs from ADR 007`
