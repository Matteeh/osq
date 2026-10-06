## MODIFIED Requirements

### Requirement: Decisions section lint
In a project whose decisions folder holds at least one accepted ADR,
`osq lint` and `osq approve` SHALL reject a `proposal.md` whose
`## Decisions` section is missing or holds nothing but HTML comments and
whitespace, and SHALL reject one whose section doesn't name, as `ADR <n>`,
each accepted ADR whose `applies_to` lists a capability the change writes
through a delta. The error SHALL name the ADR and the capability. A line
beginning `Departs from ADR <n>:` names that ADR. Lint SHALL warn when the
section names an ADR number that doesn't exist or isn't accepted. A system-wide
ADR need not be named, and `None` SHALL pass when no capability-scoped ADR
governs the change. A legacy `spec.md` change document and a project without
an accepted ADR SHALL be exempt, so proposed or superseded ADRs alone produce
no decisions finding.

#### Scenario: Governing ADR not named
- **WHEN** accepted ADR 009 applies to `ingress`, a change has a delta for `ingress`, and its Decisions section says `None`
- **THEN** lint fails naming ADR 009 and `ingress`

#### Scenario: Governing ADR named
- **WHEN** the same section says `ADR 009: the adapter is the only module that imports dockerode.`
- **THEN** lint reports no decisions error

#### Scenario: Missing section
- **WHEN** a project has an accepted ADR and a proposal has no `## Decisions` section
- **THEN** lint fails with an error saying to add the section or write `None`

#### Scenario: Project without ADRs
- **WHEN** a project's decisions folder is missing or holds no accepted ADR
- **THEN** a proposal without `## Decisions` gets no decisions finding

#### Scenario: Only a proposed ADR
- **WHEN** a project's only ADR is `000-how-this-project-is-built.md` with `status: proposed`, and a proposal has no `## Decisions` section or names `ADR 009` in it
- **THEN** lint reports no decisions finding

#### Scenario: Unknown ADR named
- **WHEN** a project has an accepted ADR, and the section names `ADR 042` and no ADR 042 exists
- **THEN** lint warns and the change stays valid
