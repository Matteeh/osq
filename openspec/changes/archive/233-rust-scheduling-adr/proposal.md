---
title: One ADR says how Rust osq runs approved changes in parallel without them touching the same files
depends_on: ["232"]
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
features:
  reads: [rust-specs, rust-linter, cli-foundation, spec-lint-and-approve]
---
## Goal

The Rust roadmap builds the loop crate and its scheduler next, and says each
Rust piece is built against an accepted decision written right before it.
This change accepts ADR 027, Rust scheduling, from the design page "Parallel
work and scheduling" and Mathias's answers there of 2026-10-18.

ADR 027 decides that a pure rule in core gives every change one state with a
reason (Ready, Waiting on, Blocked by, Needs approval) and starts approved
changes whose approved task scopes overlap nothing running, with `crates/core`
and each kernel crate locking as a whole. Overlap is checked again before
start and before land, landing stays one at a time, and agents are limited per
role with hard caps per run, not by a global limit. Parallel tasks inside one
change are left as a named open question. TypeScript osq, its watcher and
ADR 021's autopilot keep running one change at a time.

The ADR text is written in this change folder as
`adr/027-rust-scheduling.md`, so the human reviews the decision itself at
approve. The task copies it into `decisions/`, links it from the index and
adds its row to the Rust ADR test.

## Verify

`sh scripts/verify-rust.sh`

The script runs the Rust format check, clippy and every workspace test,
corpus tests included. The specs kernel's live decisions corpus and the link
gates corpus read `decisions/`, so they prove ADR 027 parses, validates and
leaves no broken link. The `check` runs `tests/rust-adrs.test.ts`, which
proves ADR 027 is accepted for group `rust`, names its checks, and is linked
from the index exactly once.

## Non-goals

- Any Rust code. The scheduler is `rust-scheduler-core` and reading its input
  from change folders is `rust-loop-schedule`.
- Changing ADR 021 or how TypeScript osq runs changes.
- The backlog adapter for Notion or Jira, webhooks and the board UI.
- Deciding parallel tasks inside one change.

## Surface

- Added: ADR 027, Rust scheduling (`decisions/027-rust-scheduling.md`), and its line in `decisions/README.md`.

## Decisions

- ADR 022: the scheduling ADR fills in what ADR 022 left to the loop kernel, which schedules work; it keeps features in their own crates, which is what makes file-level overlap rare.
- ADR 023: no Rust code changes; the scheduler and the loop follow it in their own changes.
- ADR 024: the scheduling ADR applies to `group:rust` and names `tests/rust-adrs.test.ts` in its `checks`, so it is enforced from the day it is accepted; its Enforcement section names the work that will enforce each other rule.
- ADR 025: the scheduling ADR is an ordinary decision file the specs kernel reads as it is.
- ADR 026: the specs kernel's decision corpus validates the new ADR in Rust; no test runs `node` for it.

## Assumptions

- Approving this change accepts ADR 027 as written in `adr/027-rust-scheduling.md`, including its acceptance line dated 2026-10-20. Edit that file before approving if any decision should read differently.
- ADR 027's `checks` names only `tests/rust-adrs.test.ts`, because a check file must exist when the ADR is accepted ("Rust ADR check files exist"). `rust-scheduler-core` and `rust-loop-schedule` each add their tests to its `checks`, as the ADR's Enforcement section says.
- The rules not enforced yet name the Rust roadmap's Feature crates (run and land) and Runners and harnesses milestones, which have no change numbers yet.
- A trial on a copy of this tree passed `tests/rust-adrs.test.ts` and the other decision tests, the specs kernel's `decisions_corpus.rs`, and the linter's `link_gates_corpus.rs` and `link_graph_corpus.rs` with ADR 027 added. The whole TypeScript test suite passed there too, except 8 tests that need a build (`dist/` and the staged dashboard), which the trial tree lacked.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Rust rebuild decisions" (ADR 027 and its row, scenarios kept).

The change folder holds `adr/027-rust-scheduling.md`, which task 1 copies
byte for byte. No file is shared between tasks.
