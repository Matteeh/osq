## ADDED Requirements

### Requirement: Traceability capability names
<!-- source: src/core/foundation/config-capabilities.ts, src/core/foundation/config.ts, tests/traceability-capability-names.test.ts -->
When `traceability.capabilities` is a list and the project holds at least
one living capability spec, `loadConfig` SHALL check every name in it after
the config is defined. A name SHALL pass when it has a living spec or when
a proposal under `<openspecRoot>/changes/<folder>/proposal.md`, outside the
archive, lists it in `creates`. Otherwise `loadConfig` SHALL throw
`traceability.capabilities names unknown capability <name>; did you mean <nearest>?`,
with `nearestCapability` giving the nearest name and the suffix left out
when there is none, wrapped as a `ConfigLoadError` naming the config file.
`'all'`, and a project with no living capability spec, SHALL pass
unchecked.

#### Scenario: Misspelled name
- **WHEN** a project with a living `pricing` spec sets `traceability.capabilities: ['pricng']`
- **THEN** `loadConfig` throws a `ConfigLoadError` whose message ends with `traceability.capabilities names unknown capability pricng; did you mean pricing?`

#### Scenario: Real name
- **WHEN** it sets `traceability.capabilities: ['pricing']`
- **THEN** `loadConfig` returns the config

#### Scenario: Created by an active change
- **WHEN** it sets `traceability.capabilities: ['gadgets']` and an active change's proposal lists `creates: [gadgets]`
- **THEN** `loadConfig` returns the config

#### Scenario: No living specs
- **WHEN** a project with no living capability spec sets `traceability.capabilities: ['pricing']`
- **THEN** `loadConfig` returns the config

### Requirement: Capability relation guidance
<!-- source: src/core/foundation/init-blocks.ts, PLANNER.md, templates/PLANNER.md, README.md, tests/capability-relations-docs.test.ts -->
`MANAGED_PLANNER_BLOCK` SHALL hold, under `### Parent spec` and right before
the bullet that starts `- Replacing a requirement's behavior`, this bullet:

```
- Every change relates to a capability: it writes a delta or names one in
  `features.reads`, and every read names a living capability or one the
  change creates. List each new capability in `creates` in the proposal
  frontmatter. Never invent a capability to avoid touching an existing one.
```

`PLANNER.md` and `templates/PLANNER.md` SHALL hold the block between their
`OSQ:START` and `OSQ:END` markers. README.md SHALL show `creates` in the
`## Change folder` frontmatter example and say, after it, that every change
writes a delta or names a capability in `features.reads`, that every read
names a real capability, that a new capability is declared in `creates`,
that lint enforces this once the project has a living spec, and that
`traceability.capabilities` must name real capabilities.

#### Scenario: Planner bullet
- **WHEN** `MANAGED_PLANNER_BLOCK`, `PLANNER.md`, and `templates/PLANNER.md` are read with line wrapping collapsed
- **THEN** each holds the bullet, before the `Replacing a requirement's behavior` bullet

#### Scenario: README
- **WHEN** README.md is read
- **THEN** its `## Change folder` section holds `creates:` and the relation rule
