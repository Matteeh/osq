## ADDED Requirements

### Requirement: Sidecars at archive
<!-- source: src/watcher/archive-sidecars.ts, src/watcher/archiver.ts, src/core/run/manifest.ts, tests/archive-sidecars.test.ts -->
After `applyOpenSpecDeltas`, archive SHALL write sidecars into
`<openspecRoot>/specs/`:

- For each `creates` entry with a group whose capability now has a living
  spec and no sidecar, `formatSidecar({ group })`.
- For each replacement `specs/<capability>/osq.yml` the change carries, a
  copy of it, replacing any sidecar there.

Nothing else SHALL write a sidecar except `osq migrate sidecars`. The
approval manifest SHALL record, for every capability it records a spec hash
for, `hashes["<capability>/osq.yml"]`: the sidecar's hash, or null when it
has none.

#### Scenario: Created with a group
- **WHEN** a change with `creates: [{ name: gadgets, group: inventory }]` archives
- **THEN** `openspec/specs/gadgets/osq.yml` holds `group: inventory`

#### Scenario: Bare creation
- **WHEN** a change with `creates: [gadgets]` archives
- **THEN** no `openspec/specs/gadgets/osq.yml` is written

#### Scenario: Replacement
- **WHEN** a change carrying `specs/pricing/osq.yml` with `group: sales` archives and `pricing` had `group: inventory`
- **THEN** the living sidecar holds `group: sales`

#### Scenario: Manifest hashes
- **WHEN** a change that writes `pricing` is approved and `pricing` has a sidecar
- **THEN** the manifest holds `pricing/osq.yml` with that sidecar's hash, and `null` for a written capability without one
