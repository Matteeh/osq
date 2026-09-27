## ADDED Requirements

### Requirement: Capability sidecar
<!-- source: src/core/spec/capability-sidecar.ts, src/core/spec/sidecar-lint.ts, src/core/spec/linter.ts, tests/capability-sidecar.test.ts -->
A capability MAY carry `osq.yml` beside its living spec, at
`<openspecRoot>/specs/<capability>/osq.yml`, and a change MAY carry a
replacement at `specs/<capability>/osq.yml` in its folder. A sidecar SHALL
be a YAML mapping with `group`, a non-empty string, and optionally `tags`, a
list of non-empty strings, and no other key. A capability's description
SHALL come from its spec's `## Purpose`, never from the sidecar.

`parseSidecar(content)` SHALL return the sidecar or the problems found, each
one of `not a YAML mapping`, `group must be a non-empty string`,
`tags must be a list of non-empty strings`, and `unknown key <key>`.
`formatSidecar(sidecar)` SHALL write `group: <group>` and, when there are
tags, `tags:` with one `  - <tag>` line each.

`osq lint` SHALL fail a change with `specs/<capability>/osq.yml: <problem>`
for each problem in a replacement sidecar it carries, and with
`specs/<capability>/osq.yml replaces the sidecar of <capability>, which has no living spec and is not created by this change`
when the capability neither has a living spec nor is in `creates`. A living
sidecar with a problem SHALL be a repository finding,
`<openspecRoot>/specs/<capability>/osq.yml: <problem>`, which does not
change the lint exit code. A missing sidecar SHALL produce no finding.

#### Scenario: Valid sidecar
- **WHEN** `parseSidecar` reads `group: inventory` and `tags: [costing]`
- **THEN** it returns group `inventory` and tags `costing`

#### Scenario: Unknown key
- **WHEN** a change carries `specs/pricing/osq.yml` holding `group: inventory` and `owner: me`
- **THEN** lint fails with `specs/pricing/osq.yml: unknown key owner`

#### Scenario: Missing group
- **WHEN** a change carries a replacement sidecar holding only `tags: [a]`
- **THEN** lint fails with `group must be a non-empty string` for that file

#### Scenario: Replacement for no capability
- **WHEN** a change carries `specs/ghost/osq.yml` and `ghost` has no living spec and is not in `creates`
- **THEN** lint fails with the no-living-spec message for `ghost`

#### Scenario: Broken living sidecar
- **WHEN** `openspec/specs/pricing/osq.yml` is not a YAML mapping and a change reads `pricing`
- **THEN** lint reports a repository finding for it and the change stays valid

#### Scenario: Missing sidecar is silent
- **WHEN** no capability has a sidecar and `capabilities.requireGroups` is unset
- **THEN** lint reports no sidecar finding

### Requirement: Grouped creation
<!-- source: src/core/spec/capability-relations.ts, src/core/spec/sidecar-lint.ts, tests/capability-sidecar.test.ts -->
With `capabilities.requireGroups` true, `osq lint` SHALL fail a proposal's
change with:

- `creates names <name> without a group; write creates: [{ name: <name>, group: <group> }]`
  for a bare name, or an entry whose group is `ungrouped`.
- `<capability> has no group; add specs/<capability>/osq.yml with a group to this change`
  for each capability the change writes a delta for that has a living spec
  whose sidecar is missing or has group `ungrouped`, unless the change
  carries a replacement sidecar for it with another group.

With `capabilities.requireGroups` false or unset, neither SHALL fire.

#### Scenario: Bare name when required
- **WHEN** `requireGroups` is true and `creates: [gadgets]`
- **THEN** lint fails with `creates names gadgets without a group; write creates: [{ name: gadgets, group: <group> }]`

#### Scenario: Grouped name when required
- **WHEN** `requireGroups` is true and `creates: [{ name: gadgets, group: inventory }]`
- **THEN** lint reports no group finding

#### Scenario: Written capability without a group
- **WHEN** `requireGroups` is true, a change writes a delta for `pricing`, and `pricing` has no sidecar
- **THEN** lint fails with `pricing has no group; add specs/pricing/osq.yml with a group to this change`

#### Scenario: Replacement supplies the group
- **WHEN** the same change carries `specs/pricing/osq.yml` with `group: inventory`
- **THEN** lint reports no group finding

#### Scenario: Not required
- **WHEN** `requireGroups` is unset and `creates: [gadgets]`
- **THEN** lint reports no group finding

### Requirement: Sidecar migration
<!-- source: src/core/spec/migrate-sidecars.ts, src/cli/migrate.ts, tests/migrate-sidecars.test.ts -->
`osq migrate sidecars` SHALL write `group: ungrouped` to
`<openspecRoot>/specs/<capability>/osq.yml` for every living capability
that has no sidecar, never overwrite an existing one, and print
`wrote <n> sidecar(s)` and one `  <capability>` line per sidecar written.
`osq migrate openspec` SHALL be unchanged, and an unknown target SHALL
still fail with `unsupported migrate target`.

#### Scenario: Scaffold
- **WHEN** a project has living `pricing` and `orders` specs and `orders` already has a sidecar
- **THEN** `osq migrate sidecars` writes only `pricing/osq.yml` with `group: ungrouped` and prints `wrote 1 sidecar(s)`

#### Scenario: Run twice
- **WHEN** it runs again
- **THEN** it writes nothing and prints `wrote 0 sidecar(s)`

## MODIFIED Requirements

### Requirement: Capability creation declaration
<!-- source: src/core/spec/capability-relations.ts, tests/capability-relations.test.ts, tests/capability-sidecar.test.ts -->
A proposal MAY declare `creates` in its frontmatter: a list of the
capabilities the change creates, each a name or a `{ name, group }` mapping
with both values strings. `readCreates(data)` SHALL return the trimmed names
and, per name, the trimmed group or null for a bare name, an empty list when
`creates` is absent, and mark the value malformed when it is not a list of
such entries. `osq lint` SHALL fail a proposal's change with:

- `creates must be a list of capability names` for a malformed value.
- `creates names <name>, which already has a living spec` for a name with
  a living spec.
- `creates names <name>, but no delta under specs/<name>/spec.md adds a requirement`
  for a name whose delta is missing or has no ADDED requirement.

These checks SHALL apply in every project.

#### Scenario: Declared creation
- **WHEN** a proposal lists `creates: [gadgets]` and its `specs/gadgets/spec.md` adds a requirement with a `## Purpose`
- **THEN** lint reports no `creates` finding

#### Scenario: Already exists
- **WHEN** `creates` names `pricing` and `pricing` has a living spec
- **THEN** lint fails with `creates names pricing, which already has a living spec`

#### Scenario: No delta
- **WHEN** `creates` names `gadgets` and the change has no `specs/gadgets/spec.md`
- **THEN** lint fails with `creates names gadgets, but no delta under specs/gadgets/spec.md adds a requirement`

#### Scenario: Malformed
- **WHEN** `creates` is the string `gadgets`
- **THEN** lint fails with `creates must be a list of capability names`

#### Scenario: Validator accepts creates
- **WHEN** lint runs the pinned OpenSpec validator over a change whose proposal carries `creates:`
- **THEN** the validator reports no finding about the proposal's frontmatter

#### Scenario: Grouped entry
- **WHEN** a proposal lists `creates: [{ name: gadgets, group: inventory }]`
- **THEN** `readCreates` returns the name `gadgets` with group `inventory`, and an entry `{ name: gadgets }` without a group is malformed
