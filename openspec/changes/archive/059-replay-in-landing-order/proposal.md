---
title: Replay in landing order
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
---
## Goal

The living-spec replay test replays archived changes in the order they
actually landed, not in folder-name order.

`tests/living-specs-delta-equivalence.test.ts` rebuilds every living spec by
merging the archived deltas and compares the result with `openspec/specs/`. It
replays archives in folder-name order, which assumes changes land in number
order. 058 broke that assumption: 054 depended on it, so it archived at 08:11,
before 057 at 09:15. The living `cli-foundation` spec therefore has 058's
`Tests read the verified build` before 057's `Serve export flag`. The name-order
replay puts them the other way round and fails `pnpm verify` on `main`. The
living spec is right; the test's ordering is wrong.

Archives 038 onward record their landing time as a change-level `archived`
event. Archives 016 to 037 predate that event and landed in number order. The
replay takes the archives without an event first, in name order, then the rest
by event time, with ties broken by name.

## Verify

`pnpm verify`

The replay test passes again on this repository, where 058 landed before 057.
A new case proves the ordering rule on a fixture archive in which a
later-numbered change landed first. It needs no network service, TTY, or real
model.

## Non-goals

- Editing any living spec or archived change.
- Changing the watcher's archive sequence. Its archive-time verify runs before
  it applies deltas to the living specs, which is how 057 archived green and
  left `main` red. That gap deserves its own change.
- Changing `readLandedAt` or any other source file.

## Surface

None

## Contract

### Requirement: Living spec replay in landing order

The living-spec replay test SHALL apply archived deltas in landing order:
archives without an `archived` event first by folder name, then archives with
one by event timestamp, then by folder name.

#### Scenario: Later number landed first
- **WHEN** change 058 archived before change 057 and both write `cli-foundation`
- **THEN** the replay applies 058's delta before 057's and matches the living spec

## Human steps

- Review the proposal, the delta, and the task, then run
  `pnpm osq approve 059` yourself.

## Delta

- `specs/spec-lint-and-approve/spec.md` adds `Living spec replay in landing
  order`.

One task owns the one test file.
