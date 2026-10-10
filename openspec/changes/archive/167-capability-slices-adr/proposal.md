---
title: A capability is a vertical slice named after its source folder
depends_on: []
verify: pnpm verify
features:
  reads: [spec-lint-and-approve]
---
## Goal

One rule decides how osq's code and capabilities line up. ADR 016, accepted
and system-wide, says a capability is a feature as a vertical slice: its code
lives in `src/<capability>/`, which holds every layer the feature needs. The
shared code is split into kernel slices too, each its own capability under
`src/kernel/<capability>/`, so no single kernel capability becomes the next
cli-foundation. It names the kernel slices, how a slice registers its config,
commands, help and MCP tools, how capabilities are renamed and split, and a
target map of 24 slices for osq's own code. A checks test reports
every source file that breaks the rule. It warns for now and fails for each
capability once that capability's move lands. Later changes then move the
code one slice at a time.

## Verify

`pnpm verify`

The typechecks, build, full suite and lint pass. The new
`tests/capability-slices.test.ts` classifies source files by their Code
ownership, checks its classification on a fixed table, and prints the current
tree's findings as diagnostics without failing. The new
`tests/capability-slices-adr.test.ts` checks that ADR 016 is accepted and
system-wide, that its rule is in AGENTS.md, and that it is indexed once.
`tests/decisions-own.test.ts` and `tests/doctor.test.ts` validate the
decisions folder, ADR 016's `checks`, and AGENTS.md's rules block.

## Non-goals

- Moving any source file or renaming any capability. Each slice gets its own
  move change.
- The rename and split generator (`capability-rename-generator`) and the slice
  registry (`slice-registries`). The ADR decides their shape; those items
  build them.
- Renaming `openspec/specs/` or dropping the OpenSpec validator.
- Imposing the layout on projects osq runs. The ADR says a future check for
  them is opt-in config, off by default.

## Surface

- Added: ADR 016, `decisions/016-capability-slices.md` (document)
- Changed: AGENTS.md's `## Project rules` block gains ADR 016's rule
- Changed: the index in `decisions/README.md` lists ADR 016

## Decisions

- ADR 001: unchanged; nothing here loads config.
- ADR 002: the ADR keeps deterministic delta replay; a rename is ordinary REMOVED and ADDED deltas.
- ADR 004: the ADR keeps the OpenSpec layout and validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: the validator becomes its own `validate` slice in the target map; its role is unchanged.
- ADR 012: the watch service becomes the `watch` slice in the target map; its supervisor is unchanged.
- ADR 015: `osq mcp` becomes the `mcp` slice; under decision 3 its tools come from each slice's `slice.ts`.

## Assumptions

- The target map's 24 slices are the right starting cut, in particular the 6 kernel slices (`config`, `state`, `openspec`, `git`, `cli`, `loop`), `harness` as a feature slice rather than kernel, `decisions` as its own slice, and `src/core/spec` split into `openspec`, `lint` and `approve`. Each move change may refine it.
- `src/kernel/<capability>/` is the only nesting. Kernel slices are marked `group: kernel` in `osq.yml`, and a kernel slice never imports a feature slice except through the registry; the checks test does not enforce imports yet.
- Tests stay in `tests/` rather than moving into slice folders; new slice tests are named `tests/<capability>-<topic>.test.ts`.
- Until a capability's move lands, new code for it goes where its code is today, so the queued changes before the moves plan as they would have.

## Background

**Decided with the user on 2026-10-10.** Capabilities become vertical feature
slices, and code moves to match them. This reverses the 2026-09-30 lean of
renaming capabilities to match today's folders (Notion: "Capability names
follow the code"). The OpenSpec layout stays. The ADR comes first, then
`capability-rename-generator` and `slice-registries`, then one move per slice.
The user asked whether this should be config; for osq's own code it is the
ADR, and for other projects any future check is opt-in (decision 9). The
user then asked about the kernel: one `kernel` capability would be written by
most changes, as cli-foundation is today, so the kernel is 6 capabilities
under `src/kernel/`, grouped by `group: kernel` in their `osq.yml`.

**Measured on 2026-10-10.** Of 405 files under `src/`, none sits in a folder
named after its owner, none is unowned, and 5 command files in `src/cli/`
(`digest`, `lint`, `migrate`, `query`, `report`) are owned by two
capabilities. The archive has no table of files per change, so the target map
comes from file names and the capabilities changes 136 to 165 wrote. Each move
change sizes its own slice. In a scratch worktree with both tasks applied,
`pnpm verify` passed with no change to any existing test.

**One finding per file covers both of the brief's checks.** The brief asks for
files whose owner's name differs from their folder, and for owners that span
several top-level folders. An owner that spans folders always has a file
outside the folder named after it, so `misplaced` reports both.

**Warn, then fail, per capability.** A test that failed now would fail every
change until all moves land. A list of moved capabilities in the test makes
each move lock its slice in, and the test fails on everything once every
living capability is on the list. Warnings are `node:test` diagnostics, so the
suite stays green.

**Why a delta.** AGENTS.md belongs to cli-foundation, and `osq lint` requires a
delta. The cli-foundation delta adds "Capabilities are vertical slices", which
pins the rule rather than the ADR number, as "Server mode is an addition to
local use" does.

**Order.** Task 1 writes the checks test, so that ADR 016's `checks` entry
names an existing file when task 2 accepts it; `osq doctor` fails on an
accepted ADR whose check file is missing.

## Contract

### Requirement: Source files are classified against their capability slice
`tests/capability-slices.test.ts` SHALL classify every file under `src/` by the
capabilities whose Code ownership globs cover it. A file is `unowned` with no
owner, `shared` with more than one, and `misplaced` when its one owner is not
named after the file's slice folder: the top-level folder under `src/`, or for
a file under `src/kernel/`, the folder under that. A file directly under
`src/` is judged only on its owners, and a file directly under `src/kernel/`
sits in no slice.

#### Scenario: Classifying a fixed set of files
- **WHEN** the classification reads ownerships `report` (`src/report/**`, `src/cli/report.ts`), `web` (`src/web/**`), `config` (`src/index.ts`, `src/kernel/config/**`, `src/kernel/loose.ts`) and `shadow` (`src/web/both.ts`), for files `src/report/a.ts`, `src/cli/report.ts`, `src/core/x.ts`, `src/web/both.ts`, `src/index.ts`, `src/kernel/config/load.ts` and `src/kernel/loose.ts`
- **THEN** it reports exactly these findings, sorted by file, and nothing for `src/report/a.ts`, `src/index.ts` or `src/kernel/config/load.ts`

| file | kind | owners |
| --- | --- | --- |
| `src/cli/report.ts` | misplaced | report |
| `src/core/x.ts` | unowned | (none) |
| `src/kernel/loose.ts` | misplaced | config |
| `src/web/both.ts` | shared | shadow, web |

### Requirement: Findings warn until a capability's move lands
The checks test SHALL fail on a finding whose owners include a capability in
its list of moved capabilities, or on any finding once every living capability
is in that list, and SHALL otherwise print each finding as a diagnostic and
pass. Every name in the list SHALL be a living capability.

#### Scenario: osq's tree before any move
- **WHEN** the checks test runs on osq's tree with an empty list of moved capabilities
- **THEN** it passes and prints one diagnostic per unowned or shared file and one count per capability with misplaced files

### Requirement: ADR 016 is accepted and reaches every agent
`decisions/016-capability-slices.md` SHALL be an accepted, system-wide ADR
whose rule is "A capability is a vertical slice with every layer it needs in
one folder named after it, under src or src/kernel; only kernel slices are
shared.", whose `checks` is `tests/capability-slices.test.ts`, and
AGENTS.md's rules block SHALL be what `renderRulesBlock` renders.

#### Scenario: Reading osq's decisions after task 2
- **WHEN** `readDecisions` reads the repository's decisions folder and `checkProjectRules` checks AGENTS.md
- **THEN** ADR 016 is listed as `accepted` for `all` with that rule and check, the rules block ends with its line, and neither reports a problem

## Human steps

### Before approval

None

### After landing

- Update the Notion page "Capability names follow the code" and the roadmap with ADR 016.

## Delta

- cli-foundation: ADDED "Capabilities are vertical slices", proven by task 2's
  `tests/capability-slices-adr.test.ts`.

The change also reads spec-lint-and-approve, whose `readCapabilityOwnership`
and `ownerCapabilities` the checks test reuses. No file is shared between
tasks.
