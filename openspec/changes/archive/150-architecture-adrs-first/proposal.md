---
title: A new osq project starts with architecture and style ADRs
depends_on: []
verify: pnpm verify
features:
  reads: [watcher-and-harness]
---
## Goal

The decisions that shape every executor task most are how the project is
built: its layers, where state lives, how errors flow, what a test looks
like, and how things are named. osq already carries accepted system-wide ADR
rules to every executor through the AGENTS.md rules block. But `osq init`
creates no `decisions/` folder, the planner block never says to start there,
and `osq doctor` says nothing when a project has no ADRs at all.

After this change, `osq init` creates `decisions/` with a README and a starter
ADR, `000-how-this-project-is-built.md`, with `status: proposed` and headed
questions to answer. The planner block says a project with no accepted
system-wide ADR writes its architecture and style ADRs first. `osq doctor`
warns until one is accepted, and the README shows the order: init, ADRs, then
the first feature brief. Decisions lint now starts when the first ADR is
accepted, not when the first ADR file appears, so the proposed starter adds
no lint rule of its own.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests scaffold temporary
projects and check the decisions README and starter ADR, that a re-run or a
project with ADRs keeps its files, the doctor warning and when it clears,
decisions lint with only a proposed ADR, and the new planner and README
wording in every checked-in copy.

## Non-goals

- Any gate that blocks a change for missing ADRs. The doctor line is a
  warning and never fails doctor.
- Judging code against ADR rules; that is a later validator step.
- Prescribing answers. The starter asks questions; osq knows nothing about the
  consumer's stack.
- Writing osq's own ADRs again or changing any accepted ADR. osq's own
  `decisions/` already holds ADRs, so `osq init` adds nothing there.
- Refreshing the starter or the decisions README. Like the other templates,
  they belong to the project after the first copy.

## Surface

- Added: `decisions/README.md` and `decisions/000-how-this-project-is-built.md`, written by `osq init` (under `paths.decisions`).
- Changed: the `decisions` doctor check warns `no accepted ADR applies to all; write the architecture and style ADRs first`.
- Changed: decisions lint applies once the project has an accepted ADR, not any ADR file.
- Changed: the managed `PLANNER.md` block gains a line on writing architecture and style ADRs first.
- Changed: README `## Install`, `## What it puts in your repo`, and `### Architecture decisions`.

## Decisions

- ADR 001: unchanged; no config loading changes.
- ADR 004: unchanged; decisions lint is osq's own check and never runs the OpenSpec validator.
- ADR 005: unchanged; the peer range check does not change.
- ADR 010: unchanged; the validator's config, doctor line and run are untouched, and the starter ADR is proposed, so it gives the validator no rule.

## Background

**Why lint moves to accepted ADRs.** `collectDecisionsFindings` in
`src/core/spec/decisions-lint.ts` returns nothing while the decisions folder
holds no ADR, and otherwise requires `## Decisions` in every proposal. Only
accepted ADRs take effect ("Architecture decision records"), so a proposed ADR
switching on a lint rule was already odd. With a starter in every new project
it would switch the rule on before any decision exists. Measured in a scratch
copy of the tree after 149: with the starter and the old trigger, 258 tests
failed, almost all on `proposal.md needs a ## Decisions section` for fixture
proposals. Gating only the missing-section error still failed four tests,
because fixture proposals name `ADR 009` and drew the unknown-ADR warning. With
the whole lint gated on an accepted ADR, only the pinned tests below failed.

**Numbering.** The starter is ADR `000`. Tests and real projects write their
own ADR 001 after `osq init`, and a starter at `001` made two ADR 001s; the
traceability tests then resolved the starter instead of the test's ADR. A
project that keeps the starter accepts it as its ADR 000 or deletes it.

**When the starter is written.** Only when the decisions folder holds no
markdown file other than `README.md`, so `osq init` on osq itself, or on any
project with ADRs, adds no starter. The README is written only when missing.
Neither is touched by `--refresh-schema`.

**The doctor warning (ADR 006 decision 4).** It measures one fact per project:
whether an accepted ADR applies to `all`. It goes silent the moment one is
accepted, so a project pays it once. It sits inside the existing `decisions`
check, which appears only when the folder holds an ADR file or AGENTS.md holds
a rules marker, so a project without decisions keeps its check list
unchanged. New projects get the folder from `osq init` and therefore the
warning. osq's own accepted ADRs 003, 006 and 007 apply to `all`, so osq's
doctor stays clean.

**Measured fallout.** With the starter, the doctor warning, the lint gate and
the planner line in place, the full suite in the scratch copy failed in
exactly these tests, besides three that also fail in an unmodified copy for
lack of a `.git`:

- `tests/pi/doctor.test.ts`: two tests pin the doctor check names for a
  scaffolded project and now see `decisions` after `managed-blocks`.
- `tests/codex/adapter.test.ts`: "doctor probes the same configured Codex
  binary and reports failures" counts 9 doctor lines and now sees 10.
- `tests/decisions-lint.test.ts`: "warns when the section names an ADR that is
  not accepted" uses a project whose only ADR is proposed; it needs an
  accepted ADR beside it to keep checking the warning.
- `tests/function-budget.test.ts`: only because the prototype grew
  `scaffoldProject` to 85 lines. The task keeps it under 80 with a helper.

The planner line changed no test result. `tests/managed-blocks.test.ts`, the
doctor's managed-block check, and the plan prompt compare the repository's
`PLANNER.md` and `templates/PLANNER.md` with the constant, so task 2 updates
all three together. No test pins the README lines task 2 changes.

## Contract

### Requirement: Decisions scaffold
`osq init` SHALL create the decisions folder with a README and a proposed
starter ADR, and SHALL never overwrite either.

#### Scenario: Fresh project
- **WHEN** `osq init` runs in an empty directory and then `osq doctor` runs
- **THEN** `decisions/README.md` and `decisions/000-how-this-project-is-built.md` exist, and doctor prints `[warn] decisions:` naming `no accepted ADR applies to all` and exits zero

## Human steps

### Before approval

- Land 149 first (`osq land 149`). 150's measurements were taken on 149's tree.

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Decisions scaffold", "Planner architecture-first guidance", and "Architecture-first documentation"; modifies "Decisions doctor check".
- `specs/spec-lint-and-approve/spec.md`: modifies "Decisions section lint".

Two tasks, in order. No file is shared between tasks.
