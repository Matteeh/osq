# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Generated capability move
`generateCapabilityMove(projectRoot, config, changeId, move)` in
`src/core/spec/capability-move.ts` SHALL write a capability rename or split
into the active change `findChange` resolves for `changeId`. It SHALL refuse,
writing nothing, with `change <folder> is approved; generate the move into an
unapproved change` when that folder holds `.run/approved`, and with
`capability <old> has no living spec` when `<old>` has none. A rename SHALL
refuse with `capability <new> already has a living spec` when `<new>` has one.
Every capability name SHALL be lowercase letters and digits in words joined by
`-`, or it refuses with `<name> is not a capability name; use lowercase words
joined by -`.

The requirements moved to each target SHALL be the living requirement blocks
of `<old>` as `parseCapabilitySpec` returns them, in living order. A rename
moves every requirement except `Code ownership` to `<new>`. A split moves the
requirements its map assigns, as "Generated move map" says, and every other
requirement stays in `<old>`. `<old>` is emptied when no requirement other
than `Code ownership` stays.

It SHALL write `specs/<old>/spec.md` as `# Spec Delta: <old>`, a blank line,
and `## REMOVED Requirements`. Then, for each moved requirement in living
order, a blank line, `### Requirement: <name>`,
`**Reason**: Moved to <target> by a generated capability <kind>.` and
`**Migration**: <target> carries the same requirement, byte for byte.`. When
`<old>` is emptied and has a `Code ownership` requirement, a blank line,
`### Requirement: Code ownership`,
`**Reason**: <old> has no requirement left after this generated <kind>.` and
`**Migration**: Each capability that takes its requirements declares its own Code ownership.`
come last.

For each target it SHALL write `specs/<target>/spec.md` as
`# Spec Delta: <target>`. A target with no living spec, a new target, gets a
blank line, `## Purpose`, a blank line and its purpose. Then a blank line,
`## ADDED Requirements`, and each moved block, then, for a new target with
source globs, a generated Code ownership, each separated by one blank line.
The purpose and globs of a rename are `<old>`'s `## Purpose` text and the
globs of its `<!-- source: ... -->` comment; with no such comment, no Code
ownership is generated. A generated Code ownership for target `<t>` and globs
`g1` to `gn` SHALL be these lines: `### Requirement: Code ownership`; the
source comment holding the globs joined by `, `; `The <t> capability SHALL
own <list>.`; a blank line; `#### Scenario: Codebase ownership boundaries`;
`- **WHEN** file ownership is resolved for <t>`; and
`- **THEN** system maps <list> to <t>`. `<list>` is each glob in backticks,
joined as the table shows.

Each new target SHALL get `specs/<target>/osq.yml`: for a rename, a byte copy
of `<old>`'s living sidecar, or `formatSidecar({ group: 'ungrouped' })` when
`<old>` has none. For a split, `formatSidecar({ group })` with the map's
group, else `<old>`'s group, else `ungrouped`. Before writing, it SHALL
remove `specs/<name>/` for `from` and each `to` of a `generated` field the
proposal already holds, so running it again replaces its earlier output.

#### Scenario: Rename moves every requirement
- **WHEN** `gadgets` has requirements `Count`, `Code ownership` with `<!-- source: src/gadgets/** -->`, and `Price`, in that order, and `gadgets` is renamed to `widgets` in unapproved change `002`
- **THEN** `specs/gadgets/spec.md` removes `Count`, `Price`, then `Code ownership`, and `specs/widgets/spec.md` holds `gadgets`'s purpose, the `Count` block, the `Price` block, and a Code ownership with `<!-- source: src/gadgets/** -->`

#### Scenario: Moved text is byte for byte
- **WHEN** the generated rename of `gadgets` to `widgets` is applied with `mergeDelta` to the living specs
- **THEN** each requirement block in the merged `widgets` spec other than Code ownership equals the living `gadgets` block of the same name

#### Scenario: Ownership list
- **WHEN** a generated Code ownership lists these globs
- **THEN** `<list>` reads as follows
  | globs | list |
  | --- | --- |
  | `src/a/**` | `` `src/a/**` `` |
  | `src/a/**`, `tests/a*.test.ts` | `` `src/a/**` and `tests/a*.test.ts` `` |
  | `src/a/**`, `tests/a*.test.ts`, `fixture/a/**` | `` `src/a/**`, `tests/a*.test.ts`, and `fixture/a/**` `` |

#### Scenario: Rename keeps the sidecar
- **WHEN** `gadgets`'s living `osq.yml` holds `group: inventory` and a tag `stock`
- **THEN** the rename writes `specs/widgets/osq.yml` with exactly those bytes

#### Scenario: Approved change refused
- **WHEN** change `002` holds `.run/approved`
- **THEN** the generator fails with `change 002-<slug> is approved; generate the move into an unapproved change` and writes nothing

#### Scenario: Rename onto a living capability refused
- **WHEN** `widgets` already has a living spec
- **THEN** renaming `gadgets` to `widgets` fails with `capability widgets already has a living spec`

#### Scenario: Running it again
- **WHEN** `gadgets` is renamed to `widgets` in `002`, then renamed to `gizmos` in `002`
- **THEN** `002` carries `specs/gadgets/` and `specs/gizmos/` and no `specs/widgets/`

### Requirement: Generated move map
A split SHALL read its map from a YAML file whose top level maps each target
capability name to an entry with `requirements`, a non-empty list of
requirement names of `<old>`, and, for a new target, `purpose`, a non-empty
string, and `source`, a non-empty list of globs. A new target's entry MAY
carry `group`, a non-empty string. The generator SHALL refuse, writing
nothing, with:

- `the map must name at least one capability` for an empty map or one that is not a YAML mapping.
- `map entry <name> lists no requirement` when `requirements` is missing or empty.
- `<old> has no requirement "<requirement>"` for a name `<old>` lacks.
- `requirement "<requirement>" is mapped twice` for a name two entries, or one entry twice, list.
- `Code ownership is generated; leave it out of the map` when an entry lists `Code ownership`.
- `the map cannot name <old>` when an entry is `<old>` itself.
- `map entry <name> needs purpose and source` for a new target missing either.
- `map entry <name> already has a living spec; leave out purpose, group and source` for a living target that carries any of them.

A living target SHALL receive the moved requirements as ADDED requirements,
with no Purpose, Code ownership or sidecar.

#### Scenario: Split into a new and a living capability
- **WHEN** `gadgets` holds `Count`, `Price`, `Stock` and `Code ownership`, the map sends `Count` to new `counting` with `purpose`, `source: [src/counting/**]` and `group: tally`, and `Price` to living `pricing`
- **THEN** `specs/gadgets/spec.md` removes `Count` and `Price` only, `specs/counting/` holds the `Count` block, a Code ownership for `src/counting/**` and `osq.yml` with `group: tally`, and `specs/pricing/spec.md` adds only the `Price` block

#### Scenario: Split empties the old capability
- **WHEN** the map sends every requirement of `gadgets` except `Code ownership` to new capabilities
- **THEN** `specs/gadgets/spec.md` also removes `Code ownership`, last

#### Scenario: Map refusals
- **WHEN** the map is as follows
- **THEN** the split fails with the message, and writes nothing
  | map | message |
  | --- | --- |
  | `{}` | `the map must name at least one capability` |
  | `counting: { purpose: P, source: [s], requirements: [] }` | `map entry counting lists no requirement` |
  | `counting: { purpose: P, source: [s], requirements: [Ghost] }` | `gadgets has no requirement "Ghost"` |
  | `counting: { purpose: P, source: [s], requirements: [Count, Count] }` | `requirement "Count" is mapped twice` |
  | `counting: { purpose: P, source: [s], requirements: [Code ownership] }` | `Code ownership is generated; leave it out of the map` |
  | `gadgets: { requirements: [Count] }` | `the map cannot name gadgets` |
  | `counting: { source: [s], requirements: [Count] }` | `map entry counting needs purpose and source` |
  | `pricing: { group: g, requirements: [Count] }` | `map entry pricing already has a living spec; leave out purpose, group and source` |

### Requirement: Generated move proposal
The generator SHALL edit the change's `proposal.md` frontmatter through the
`yaml` document API, keeping every other key and its formatting. It SHALL set
`generated` to `{ kind, from: <old>, to: [<targets in map order>] }` and put
one `{ name, group }` entry for each new target into `creates`, replacing an
entry with the same name. It SHALL replace any earlier `## Generated` section,
up to the next `## ` heading, and end the proposal with:

```markdown
## Generated

`osq capability <kind>` wrote these files; run it again instead of editing them:

- `<each written path, relative to the change folder, in write order>`

Files outside the specs that name `<old>`, for this change's tasks:

- `<each naming path>`
```

with `None` in place of the second list when it is empty. The naming paths
SHALL be every project file, relative to the project root and sorted, that
holds `<old>` with no letter, digit, `_` or `-` directly before or after it.
The scan leaves out files holding a NUL byte, the OpenSpec root, and
directories named `node_modules`, `dist` or starting with `.`. The generator
SHALL NOT change any of those files.

#### Scenario: Frontmatter and section
- **WHEN** `002`'s proposal has `depends_on: ["001"]` and `gadgets` is renamed to `widgets`
- **THEN** the frontmatter keeps `depends_on: ["001"]` and holds `generated` with `kind: rename`, `from: gadgets`, `to: [widgets]` and `creates` with `{ name: widgets, group: inventory }`, and the proposal ends with the `## Generated` section listing `specs/gadgets/spec.md`, `specs/widgets/osq.yml` and `specs/widgets/spec.md`

#### Scenario: Files that name the capability
- **WHEN** the project holds `tests/gadgets.test.ts` naming `gadgets`, `README.md` naming `gadgets-extra` only, `dist/x.js` and `node_modules/m/x.js` naming `gadgets`, and `osq.config.ts` naming `'gadgets'`
- **THEN** the second list is `osq.config.ts` then `tests/gadgets.test.ts`, and none of those files changes

### Requirement: Generated move lint
A proposal MAY carry `generated`, which only the generator writes. `osq lint`
SHALL fail a change whose `generated` is not a mapping with `kind` `rename` or
`split`, a string `from` and a list of strings `to`, with `generated must name
kind rename or split, from, and a list to`. It SHALL fail one whose `from` has
no living spec with `generated names <from>, which has no living spec`.
Otherwise, leaving out every requirement named `Code ownership`, it SHALL
fail:

- `<to> ADDED "<name>" differs from the requirement REMOVED from <from>` on
  the target delta, when an ADDED block in a `to` delta differs from the
  living `<from>` block of the same name after both are trimmed and their
  line endings normalized.
- `<to> ADDED "<name>", which the generated <kind> does not REMOVE from <from>`
  on the target delta, when an ADDED requirement in a `to` delta is not
  REMOVED in `specs/<from>/spec.md`.
- `<from> REMOVED "<name>", which no capability in to ADDS` on the `from`
  delta, when a requirement REMOVED from `<from>` is ADDED by no `to` delta.

`lintChangeFolder` SHALL run this check, through
`collectGeneratedMoveFindings` in `src/core/spec/generated-move-lint.ts`, for
every proposal. A proposal without `generated` gets no finding from it.

#### Scenario: Untouched generated rename
- **WHEN** a change carries a rename of `gadgets` to `widgets` exactly as the generator wrote it
- **THEN** lint reports no finding from this check

#### Scenario: Edited requirement
- **WHEN** one word of the `Count` block in `specs/widgets/spec.md` is changed
- **THEN** lint fails with `widgets ADDED "Count" differs from the requirement REMOVED from gadgets`

#### Scenario: Extra requirement
- **WHEN** `specs/widgets/spec.md` also adds a requirement `Colour`
- **THEN** lint fails with `widgets ADDED "Colour", which the generated rename does not REMOVE from gadgets`

#### Scenario: Dropped requirement
- **WHEN** the `Price` block is deleted from `specs/widgets/spec.md`
- **THEN** lint fails with `gadgets REMOVED "Price", which no capability in to ADDS`

#### Scenario: Malformed field
- **WHEN** `generated` is the string `rename`
- **THEN** lint fails with `generated must name kind rename or split, from, and a list to`

## MODIFIED Requirements

### Requirement: Merged living spec validation
Lint SHALL write the text `mergeDelta` returns for every delta that merges to
`openspec/specs/<capability>/spec.md` in a temporary folder, run `openspec
validate --specs --strict --json --no-interactive` there once with
`OPENSPEC_TELEMETRY=0` and the configured verify timeout, and remove the
folder. It SHALL skip this when no delta merges or the validator binary is
unavailable. A merged spec with no requirement, a capability the change
empties and archive removes, SHALL be left out of the folder.

#### Scenario: No delta merges
- **WHEN** every delta of a change fails to merge
- **THEN** lint reports the merge errors and runs no merged spec validation

#### Scenario: Emptied capability not validated
- **WHEN** a change removes every requirement of `gadgets` and adds them to a new `widgets`
- **THEN** lint reports no `gadgets after archive` finding, and validates the merged `widgets`

### Requirement: Living spec replay in landing order
The living-spec replay test SHALL rebuild each living capability spec by
merging archived deltas in landing order: archives without a change-level
`archived` event first, in folder-name order, then the rest by that event's
timestamp and folder name, read with `readLandedAt`. It SHALL then merge, in
folder-name order, each active change folder holding the record at
`archiveSpecsRecordPath`, whose deltas archive has already applied for the
change-level `verify`. It SHALL merge with `mergeLivingSpec` from
`src/core/spec/apply-deltas.ts`, and replay every capability that has a
living folder or appears in a replayed delta. A capability whose replay ends
with no requirement SHALL have no living folder, and every other one SHALL
match its living spec.

#### Scenario: Later number landed first
- **WHEN** a later-numbered change archived before an earlier-numbered one and both write the same capability
- **THEN** the replay merges the earlier-landed delta first and matches the living spec

#### Scenario: Archives before the event existed
- **WHEN** archives lack an `archived` event
- **THEN** the replay merges them first, in folder-name order

#### Scenario: Change being archived
- **WHEN** `openspec/changes/` holds `archive/`, an active `002-b` with the archive record, an active `001-a` with the record, and an active `003-c` without it
- **THEN** the replay picks up `001-a` then `002-b` after the archived folders, and leaves out `003-c`

#### Scenario: Every capability replayed
- **WHEN** the replay runs over osq's own archive
- **THEN** it checks every folder under `openspec/specs/`, `traceability`, `version-control` and `web-inspection` included, read from the tree rather than from a fixed list

#### Scenario: Generated rename replays
- **WHEN** a temporary project archives a generated rename of `gadgets` to `widgets` with `applyArchiveSpecs`, and its deltas are replayed from scratch with `mergeLivingSpec`
- **THEN** the replay of `gadgets` ends with no requirement, `openspec/specs/gadgets/` does not exist, and the replay of `widgets` equals the living `widgets` spec
