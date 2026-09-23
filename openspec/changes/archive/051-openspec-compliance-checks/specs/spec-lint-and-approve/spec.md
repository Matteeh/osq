# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: OpenSpec merge parity
<!-- source: src/core/spec/delta.ts, tests/delta-merge.test.ts, tests/living-specs-delta-equivalence.test.ts -->
The delta merge SHALL produce byte-identical living specs to `openspec archive`
for every delta that `openspec archive` accepts, and SHALL refuse with
`DeltaMergeError` every delta it refuses: a MODIFIED block that leaves out a
scenario of the existing requirement, and an ADDED requirement whose name
already exists. RENAMED entries SHALL use the `### Requirement:` form, and the
merge SHALL refuse any other form rather than skip it. The merge SHALL keep
scenario text verbatim and SHALL keep base spec bytes it does not change.

#### Scenario: OpenSpec rename form
- **WHEN** a delta renames with ``- FROM: `### Requirement: A` `` and ``- TO: `### Requirement: B` ``
- **THEN** the merged spec carries requirement `B` in place of `A`

#### Scenario: Bare rename form
- **WHEN** a delta renames with ``- FROM: `A` ``
- **THEN** the merge raises `DeltaMergeError` naming the `### Requirement:` form, and `osq lint` reports it

#### Scenario: Dropped scenario or duplicate addition
- **WHEN** a MODIFIED block leaves out an existing scenario, or an ADDED requirement already exists
- **THEN** the merge raises `DeltaMergeError`, and `osq lint` reports it

#### Scenario: New capability purpose
- **WHEN** a delta creates a capability from its `## Purpose`
- **THEN** the purpose text follows the `## Purpose` heading on the next line, as `openspec archive` writes it

### Requirement: Differential archive test
<!-- source: tests/openspec-differential.test.ts, tests/fixtures/openspec-diff/** -->
A differential test SHALL copy each fixture case into two temporary repositories
that carry the scaffolded osq schema. It SHALL merge the case's changes with
`openspec archive --yes --json` in one and with `applyOpenSpecDeltas` in the
other, and SHALL assert byte-identical `openspec/specs` trees or matching
refusals. It SHALL run `openspec validate --strict` on every accepted fixture
change. It SHALL use `OSQ_OPENSPEC_BIN` when set and the local
`node_modules/.bin/openspec` otherwise, and every failure message SHALL name the
validator version.

#### Scenario: Fixture coverage
- **WHEN** the fixture cases are listed
- **THEN** they cover ADDED, MODIFIED, REMOVED, and RENAMED requirements, a new capability with `## Purpose`, a second change to a capability the first change created, GIVEN and AND scenario bullets, a dropped scenario, a duplicate ADDED name, and the bare RENAMED form

#### Scenario: Offline by default
- **WHEN** the test runs without `OSQ_OPENSPEC_BIN`
- **THEN** it invokes only the locally installed validator and needs no network

### Requirement: Scheduled upstream OpenSpec check
<!-- source: .github/workflows/openspec-latest.yml, tests/openspec-latest-workflow.test.ts -->
A scheduled GitHub Actions workflow SHALL install `@fission-ai/openspec@latest`
outside the lockfile, print its version, and run the differential test with
`OSQ_OPENSPEC_BIN` pointing at that installation. It SHALL also be runnable on
demand.

#### Scenario: Weekly run against the latest release
- **WHEN** the schedule fires or a maintainer dispatches the workflow
- **THEN** the differential test runs against the latest OpenSpec, and a failure names that version

### Requirement: Architecture Decision Record 005: OpenSpec validator peer range
<!-- source: decisions/005-openspec-validator-peer-range.md, decisions/README.md -->
The project SHALL record and accept ADR 005. It supersedes ADR 004's drift rule:
the exact pin stays for osq's own development and CI, doctor and lint warn on a
different version inside the `peerDependencies` range and fail outside it, and
the scheduled workflow signals when a pin bump needs its own ADR. It SHALL
record that archive folders keep osq's `<id>-<slug>` naming.

#### Scenario: ADR 005 acceptance and indexing
- **WHEN** decisions in the repository are inspected
- **THEN** `decisions/005-openspec-validator-peer-range.md` is present with status Accepted and indexed in `decisions/README.md`

## MODIFIED Requirements

### Requirement: Pinned OpenSpec validator failure gating
<!-- source: src/core/spec/linter.ts, src/core/spec/openspec-version.ts, src/core/approve.ts, tests/validator-missing.test.ts, tests/openspec-version.test.ts, tests/no-skipped-in-src.test.ts -->
The linter and approval engine SHALL require that `@fission-ai/openspec` is installed. A version equal to the pinned `1.13.1` SHALL pass. A different version inside the `peerDependencies` range declared in osq's `package.json` SHALL produce a warning citing ADR 005 and SHALL NOT fail. If the binary is missing or the version is outside that range, `osq lint` and `osq approve` SHALL fail with exit code 1, reporting an error citing ADR 004 and the install command `pnpm add -D @fission-ai/openspec@1.13.1`. Zero checks report skipped, and the word "skipped" SHALL NOT appear in `src/`.

#### Scenario: Missing validator binary causes lint and approval failure
- **WHEN** `node_modules/.bin/openspec` is missing or unavailable
- **THEN** `osq lint` and `osq approve` fail reporting an error citing ADR 004 and `pnpm add -D @fission-ai/openspec@1.13.1`

#### Scenario: Version drift causes lint and approval failure
- **WHEN** `openspec` reports a version outside the declared peer range
- **THEN** `osq lint` and `osq approve` fail reporting version drift citing ADR 004 and `pnpm add -D @fission-ai/openspec@1.13.1`

#### Scenario: Version inside the peer range warns
- **WHEN** `openspec` reports a version inside the declared peer range that differs from `1.13.1`
- **THEN** `osq lint` passes with a warning naming the version, the range, and ADR 005

#### Scenario: Zero checks report skipped and word absent from src
- **WHEN** validation and diagnostic checks execute across the project
- **THEN** no check reports a skipped status and `grep -ri "skipped" src/` finds zero matches
