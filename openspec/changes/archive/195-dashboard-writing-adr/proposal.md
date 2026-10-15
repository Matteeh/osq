---
title: One ADR says how the dashboard is written, so executors stop learning its rules by failing
depends_on: ["192"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
---
## Goal

The dashboard in `packages/ui` has rules that are spread over one spec
requirement and two test files, and habits that are written nowhere. Change
192 task 4 died once on `scope_violation` because nothing told it how state
should cross a component it did not own; 194 task 7 dodged a timer ban with
`AbortSignal.timeout` because the ban was only a token list in a test.

This change adds ADR 020, which applies to web-inspection, so every planner
that writes web-inspection names it under `## Decisions` and every executor
reads it. Its rule: the dashboard renders server documents, logic sits in pure
model files, components only render, shared state uses React context, and no
state library is added. Its decisions cover data, files, state and tests, and
say when to revisit the state decision. It denies the common state,
data-fetching and router packages, so the watcher kills a task that adds one.

Its checks test, `tests/dashboard-writing-adr.test.ts`, enforces what can be
tested: the ADR record, the denied packages against the UI manifest, and the
view-file bans `tests/ui-change.test.tsx` holds today for
`packages/ui/src/change/`, widened to every screen folder and joined by
`AbortSignal.timeout`. The old scan moves into the new test and leaves
`tests/ui-change.test.tsx`. The one file that breaks the widened bans today,
`change/ChangeView.tsx`, sits on an explicit exception list that only shrinks.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree,
including the new `tests/dashboard-writing-adr.test.ts`, the changed
`tests/ui-change.test.tsx`, and `osq doctor`'s own-decision tests, which fail
when an accepted ADR names a check file that does not exist.

## Non-goals

- Adding a state, data-fetching or router library.
- Restructuring existing screens to match. `change/ChangeView.tsx` keeps its
  planning clock on the exception list until a change that touches it moves
  the clock out.
- Checking colour tokens or phone sizing in a test. The ADR states them; two
  screen CSS files use `#fff` today.
- Moving the UI manifest ban in `tests/ui-data.test.tsx`; it keeps its own list.
- A design system.

## Surface

- Added: ADR 020, `decisions/020-dashboard-writing.md` (document)
- Added: `tests/dashboard-writing-adr.test.ts` (the ADR's check file)

## Decisions

- ADR 013: no server, transport or write action changes.
- ADR 019: not touched; the Change page's Start planning button stays as it is.

Task 1 adds the dashboard writing decision, `decisions/020-dashboard-writing.md`,
which governs every later change that writes web-inspection.

## Assumptions

- Measured on 2026-10-15: of every file in `packages/ui/src/<screen>/`, only
  `change/ChangeView.tsx` holds a banned token (`AbortSignal.timeout`, the
  planning clock from 194). `fetch(`, `EventSource` and `addEventListener`
  appear only in `data.ts` and `router.ts`, which sit directly under
  `packages/ui/src` and are not screen folders. No screen folder holds a
  subfolder.
- Measured on 2026-10-15 in a scratch worktree with a draft ADR 020 (with
  `checks` and `denies`) and its README line: every test that reads osq's own
  decisions passed unchanged, `tests/doctor.test.ts`,
  `tests/decisions-own.test.ts` and the other ADR tests included.
- The token `markdown` stays banned in every screen, as it is in `change/`
  today. A later docs screen that needs the word moves it to an exception or
  changes the rule through a new ADR.

## Contract

The web-inspection delta below is the contract.

## Human steps

### Before approval

None

### After landing

- Update the Notion roadmap: ADR 020 records how the dashboard is written.

## Delta

- `specs/web-inspection/spec.md`: ADDED "Dashboard writing decision", "Dashboard screen sources" and "Dashboard UI manifest" (task 1).

No file is shared between tasks.
