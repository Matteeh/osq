## ADDED Requirements

### Requirement: Lock units
`osq-core` SHALL map each file path of an approved task scope to the lock
unit it holds, in its `schedule` module, with no IO. `lock_unit(path)` SHALL
return `crates/core` for a path that starts with `crates/core/`,
`crates/kernel/<name>` for a path that starts with `crates/kernel/<name>/`,
and the path itself for any other path. Paths are compared as given. Two
changes overlap when the lock units of their files share at least one unit.

#### Scenario: Lock unit of a path
- **WHEN** `lock_unit` reads the path in the row
- **THEN** it returns the row's unit:

| Path | Unit |
|---|---|
| `src/a.ts` | `src/a.ts` |
| `crates/core/src/lib.rs` | `crates/core` |
| `crates/core/Cargo.toml` | `crates/core` |
| `crates/kernel/specs/src/lib.rs` | `crates/kernel/specs` |
| `crates/kernel/specs/tests/parse.rs` | `crates/kernel/specs` |
| `crates/kernel/README.md` | `crates/kernel/README.md` |
| `crates/features/run/src/lib.rs` | `crates/features/run/src/lib.rs` |
| `crates/corex/a.rs` | `crates/corex/a.rs` |

### Requirement: Change scheduling
`schedule(queue, running)` in `osq-core`'s `schedule` module SHALL decide,
with no IO, which approved changes may start now, as ADR 027 says. Each
`QueuedChange` holds its `id`, whether it is `approved`, its `dependencies`,
each a `Dependency` with an `id` and whether it is `done`, and the `files` of
its approved task scopes. Each `RunningChange` holds its `id` and `files`.
The result SHALL be a `Schedule` holding `states`, one `ScheduledChange` with
the change's `id` and `ScheduleState` per queued change in queue order, and
`start`, the ids of the `Ready` changes in queue order. A queued change whose
id names a running change SHALL be left out of both, and each state SHALL
follow "Schedule states".

#### Scenario: Scheduling is deterministic
- **WHEN** `schedule` runs twice on any queue and running set
- **THEN** both results are equal

#### Scenario: Started and running changes never overlap
- **WHEN** `schedule` runs on any queue and running set
- **THEN** no two of the started and running changes share a lock unit, except running changes with each other

#### Scenario: An unmet dependency never starts
- **WHEN** `schedule` runs on any queue and running set
- **THEN** no started change is unapproved or has a dependency that is not done

### Requirement: Schedule states
A queued change's state in `schedule`'s result SHALL be the first of these
that holds:

1. `NeedsApproval` when it is not approved.
2. `WaitingOn` the first of its dependencies, in their order, that is not done.
3. `BlockedBy` the first running change, in running order, that it overlaps.
4. `BlockedBy` the first change before it in the queue that this call made `Ready` and that it overlaps.
5. `Ready`.

A `BlockedBy` state SHALL hold the other change's id and the lock units the
two share, in byte order. A state SHALL display as its reason: `ready`,
`needs approval`, `waiting on <id>`, or `blocked by <id>: ` followed by the
shared units joined by `, `.

#### Scenario: Every state and overlap rule
- **WHEN** `schedule` runs with the running change `300` holding `src/a.ts` and the queue below, in this order
- **THEN** each change has the row's state, displayed as given, and `start` is `204`, `206`:

| Id | Approved | Dependencies | Files | State |
|---|---|---|---|---|
| `201` | no | none | `src/x.ts` | `needs approval` |
| `202` | yes | `150` done, `151` not done, `152` not done | `src/y.ts` | `waiting on 151` |
| `203` | yes | `150` done | `src/a.ts`, `src/b.ts` | `blocked by 300: src/a.ts` |
| `204` | yes | none | `crates/kernel/specs/src/lib.rs` | `ready` |
| `205` | yes | none | `crates/kernel/specs/tests/parse.rs` | `blocked by 204: crates/kernel/specs` |
| `206` | yes | none | `crates/core/src/lib.rs`, `src/b.ts` | `ready` |
| `207` | yes | none | `crates/core/Cargo.toml`, `src/b.ts` | `blocked by 206: crates/core, src/b.ts` |
| `300` | yes | none | `src/z.ts` | left out |

#### Scenario: Running changes come first
- **WHEN** `schedule` runs with the running changes `300` holding `src/a.ts` and `301` holding `src/b.ts`, and one queued approved change `210` holding `src/b.ts` and `src/a.ts`
- **THEN** `210` is `blocked by 300: src/a.ts` and `start` is empty

## MODIFIED Requirements

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the six Rust rebuild ADRs 022 to 027, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs`, ADR 024 the linter kernel's link gate
tests, ADR 025 `crates/core/tests/event_corpus.rs`, and ADR 026 the specs
kernel's golden, validation, replay and parity tests and the linter
kernel's no-runtime-Node test. ADR 027, scheduling, SHALL also name core's
scheduler tests, until the loop adds its tests.
The index SHALL link each once, and AGENTS.md's project rules block SHALL
not change, since none applies to all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts`, `crates/kernel/linter/tests/link_gates.rs`, `crates/kernel/linter/tests/link_gates_corpus.rs` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts`, `crates/kernel/specs/tests/golden_corpus.rs`, `crates/kernel/specs/tests/validate_corpus.rs`, `crates/kernel/specs/tests/replay_corpus.rs`, `crates/kernel/specs/tests/openspec_validate_parity_corpus.rs`, `crates/kernel/specs/tests/openspec_archive_parity_corpus.rs`, `crates/kernel/linter/tests/node_spawn_corpus.rs` |
| 027 | `027-rust-scheduling.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/schedule.rs`, `crates/core/tests/schedule_props.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025`, `ADR 026` or `ADR 027`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 027 is looked up from the repository root
- **THEN** each one exists
