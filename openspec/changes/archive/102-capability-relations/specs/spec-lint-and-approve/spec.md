## ADDED Requirements

### Requirement: Capability creation declaration
<!-- source: src/core/spec/capability-relations.ts, tests/capability-relations.test.ts -->
A proposal MAY declare `creates` in its frontmatter: a list of the
capability names the change creates. `readCreates(data)` SHALL return the
trimmed names from the frontmatter data, an empty list when `creates` is
absent, and mark the value malformed when it is not a list of strings.
`osq lint` SHALL fail a proposal's change with:

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

### Requirement: Capability relations
<!-- source: src/core/spec/capability-relations.ts, src/core/spec/linter.ts, src/core/spec/digest-capability.ts, tests/capability-relations.test.ts -->
When the project holds at least one living capability spec, `osq lint`
SHALL fail a proposal's change with:

- `proposal.md relates to no capability; write a delta under specs/<capability>/spec.md or name a capability in features.reads`
  when the change has no delta folder holding a `spec.md` and
  `features.reads` is empty.
- `features.reads names unknown capability <name>; did you mean <nearest>?`
  for each read that names no living capability and is not in `creates`.
- `specs/<name>/spec.md creates capability <name>, which creates does not list; did you mean <nearest>?`
  for each delta folder whose capability has no living spec and is not in
  `creates`.

`nearestCapability(name, living)` in `src/core/spec/digest-capability.ts`
SHALL return the living name with the smallest edit distance to `name`,
the first in name order on a tie, or null when there is none. The findings
SHALL leave out `; did you mean <nearest>?` when it is null. A project with
no living capability spec SHALL get none of these findings.

#### Scenario: No relation
- **WHEN** a project with a living `pricing` spec lints a change with no delta and `reads: []`
- **THEN** lint fails with the no-relation message naming both fixes

#### Scenario: Read only
- **WHEN** the change has no delta and `reads: [pricing]`
- **THEN** lint reports no relation finding

#### Scenario: Unknown read
- **WHEN** `reads` names `pricng`
- **THEN** lint fails with `features.reads names unknown capability pricng; did you mean pricing?`

#### Scenario: Read of a created capability
- **WHEN** `reads` names `gadgets` and `creates` lists `gadgets` with a delta adding a requirement
- **THEN** lint reports no unknown-read finding

#### Scenario: Silent creation
- **WHEN** the change has `specs/pricng/spec.md` with ADDED requirements and no `creates`
- **THEN** lint fails with `specs/pricng/spec.md creates capability pricng, which creates does not list; did you mean pricing?`

#### Scenario: No living specs
- **WHEN** a project with no living capability spec lints a change with no delta, `reads: [anything]`, and a delta for a new capability
- **THEN** lint reports none of these findings

### Requirement: One code ownership reader
<!-- source: src/core/spec/capability-impact.ts, tests/ownership-reader.test.ts -->
`readCapabilityOwnership(projectRoot, openspecRoot)` SHALL be the one
function that reads capabilities' Code ownership globs, and the only code
under `src/` that calls `parseCodeOwnership`. Every reader of ownership,
such as impact lint, traceability lint, and the traceability report, SHALL
call `readCapabilityOwnership`.

#### Scenario: One caller
- **WHEN** every `.ts` file under `src/` is scanned
- **THEN** `parseCodeOwnership(` appears only in `src/core/spec/parser.ts`, where it is defined, and `src/core/spec/capability-impact.ts`

## MODIFIED Requirements

### Requirement: Capability creation
<!-- source: src/core/spec/digest-capability.ts, src/core/spec/digest-flags.ts, src/core/spec/digest.ts, tests/approval-digest-capability.test.ts, tests/approval-digest-creates.test.ts -->
A delta capability with no living spec SHALL count as deliberately created when
the proposal lists it in `creates`, or when its delta has a `## Purpose`
section and its name resembles no living capability. Any other delta
capability with no living spec SHALL raise one `unknown_capability` flag,
labelled `unknown capability <name> resembles <living>` when a resemblance
exists, naming the first resembling living capability in name order, and
otherwise `unknown capability <name> without a Purpose`.

#### Scenario: Deliberate creation
- **WHEN** a delta with `## Purpose` targets a new name that resembles no living capability
- **THEN** no `unknown_capability` flag fires and the formatted digest shows its heading as `<name> (new capability):`

#### Scenario: Missing Purpose
- **WHEN** a delta without `## Purpose` targets a capability with no living spec and a name resembling none
- **THEN** one `unknown_capability` flag labelled `unknown capability <name> without a Purpose` fires

#### Scenario: Resembling name
- **WHEN** a delta with `## Purpose` targets `watcher-harness` and `watcher-and-harness` has a living spec
- **THEN** one `unknown_capability` flag labelled `unknown capability watcher-harness resembles watcher-and-harness` fires

#### Scenario: Listed in creates
- **WHEN** the proposal lists `creates: [watcher-harness]`, its delta targets `watcher-harness`, and `watcher-and-harness` has a living spec
- **THEN** no `unknown_capability` flag fires and the formatted digest shows `watcher-harness (new capability):`
