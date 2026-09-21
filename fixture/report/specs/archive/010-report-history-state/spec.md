---
title: Report history state
depends_on: [009]
features:
  reads: [metrics-and-reporting]
---
## Goal

Provide a fixture change whose task event files exercise missing coverage, an unexplained re-run, and a historical dead event while its markers determine current state.

## Contract

| Marker / Event | Expected Output / Behavior |
|---|---|
| Task 1 done marker | Current state counts it done even though it has no event file |
| Task 2 started pair | History counts two attempts and one unexplained re-run |
| Task 3 dead event | History reports the dead reason without overriding its marker |

## Non-goals

- Synthesizing missing event files.
- Changing the shape of the report fixture used by other capability tests.

## Delta

- `specs/metrics-and-reporting/spec.md`: fixture coverage for missing event files, unexplained re-runs, and historical dead events.
