---
status: accepted
applies_to: [traceability]
rule: Traceability warns on osq's own traceability capability until its trial decides to block, widen, or drop it.
checks:
  - tests/trace-own-config.test.ts
---
# 011. Traceability trial

Date: 2026-10-06

## Status

Accepted

## Context

ADR 006 decision 4 allows a warning only while its signal is being measured. A
gate blocks or it goes, and a warning is a gate that has not earned its place
yet. Traceability and mutation checks shipped in changes 081 and 083, but no
capability ever opted in, so neither has produced a signal to measure. Change
154 opts osq's own repository in for the first time.

It opts in `traceability` alone, because that is the smallest capability to
link: 36 scenarios and 16 functions in 8 files, against version-control's 98
scenarios and 58 functions in 20 files. The trial can judge the mechanics on a
body of work one change can carry, and widen to version-control only if the
signal is good enough.

The validator of ADR 010 is separate. It does not read traceability results,
and its findings never enter this measurement.

## Decision

1. **What runs.** Traceability is opted in for `traceability` in `warn` mode.
   Every lint of a change that touches a tagged traceability function or a
   traceability scenario test adds its findings as warnings; osq runs the
   focused tests, and StrykerJS 10 mutation checks run through `tsx` with a
   300-second budget per task. All of it observes only: none of it changes a
   task's done state, a marker, or a retry.
2. **What counts as a trial change.** A change is a trial change when its
   approval prints a traceability lint finding, or when any of its task
   streams holds a `focused_ran` or `mutation_ran` event.
3. **What is recorded per trial change.** Four signals:
   - the link findings, each unreadable form among them;
   - the mutation picks, by outcome and reason;
   - the survivors of each measured pick;
   - the time added per task, the sum of that task's `focused_ran` and
     `mutation_ran` durations.

## Measurement

The trial is due for a decision after 8 trial changes or on 2026-12-15,
whichever comes first. A human labels each link finding true, a real missing
or stale link, or false, and each survivor true, a missing assertion, or
false, noise, in the brief that follows.

- **Block.** `traceability` moves to `require` mode when at least three
  quarters of the link findings are true, at least three quarters of the picks
  are measured, and the median time added per task with a pick is at most
  120 s.
- **Widen.** `version-control` is opted in, still in `warn` mode, for one more
  window of the same size, when the block thresholds hold but the window holds
  fewer than 10 link findings and picks in all.
- **Drop.** The opt-in and the mutation command are removed when fewer than
  half the link findings are true, fewer than half the picks are measured, or
  the median time added per task is over 300 s.
- **Anything else.** One more window of the same size, and then traceability
  must block or go.
- Mutation checks stay only if at least one in four labeled survivors is true.
  Otherwise the command is dropped, whatever the link decision.

## Consequences

- Most mutation picks cost about 5 s, but a pick of `scenario` costs about
  171 s, so a third pick in the same task can record `budget`.
- Twelve prose mentions of `@scenario` in `src/` are reported unreadable,
  because the scanner reads a doc comment mention as an invalid tag. They are
  false positives, and lint warns about them whenever a change scopes one of
  those files.
- `scanSource`'s picks are `range_unknown`, because its helpers hold regular
  expression literals with unbalanced brackets. Every pick of `scanSource`
  records `range_unknown`.
- Until the measurement says otherwise, traceability and mutation findings are
  advice a human reads, not a gate.

## Rejected

- **Opting in every capability at once.** The signal would be buried in
  findings from much larger capabilities, and a bad trial would be hard to
  unwind across all of them.
- **A homegrown mutator.** The trial measures what osq tells projects to run;
  StrykerJS is the reference setup.
- **Starting in `require` mode.** ADR 006 decision 4 allows a warning only
  while its signal is measured; a blocking gate before the false-positive rate
  is known would invert that rule.
