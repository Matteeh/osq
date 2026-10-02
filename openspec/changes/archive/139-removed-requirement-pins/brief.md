---
queue_item: removed-requirement-pins
queue_hash: sha256:6b4804b81c679dcc5daff440e783bf80db80ba33d45db1de26e1781dbf2b4d8a
planner: null
date: 2026-10-02
---

### Goal

A change whose delta removes or renames a requirement lands without a task that edits `tests/living-specs-delta-equivalence.test.ts`, and a requirement lost by accident still fails that test.

### Context

As of 2026-10-02:

- `PRESERVED_REQUIREMENTS` in `tests/living-specs-delta-equivalence.test.ts` pins requirement names per capability, from the 017 and 020 to 027 re-seed that change 028 did on 2026-09-19. The test fails when a pinned name is missing from a living spec.
- So every change that removes or renames a pinned requirement needs a `tests.modify` task for that file. Change 112 removed one without it, and its land failed `pnpm verify` on 2026-09-29. Planners now have to remember it every time.
- The same file replays every archived delta and checks the living specs equal the result. That replay is what proves the specs are the sum of approved changes; the pin list only guards the one-time re-seed.

### Requirements

- The pin check skips a pinned name when an archived change's delta removes or renames that requirement in that capability. It still fails, naming the capability and requirement, when a pinned name is missing and no archived delta removed or renamed it.
- Nothing else in the test changes, and the replay check is untouched.

### Non-goals

- Dropping the pin list.
- Any change to delta application or archive.

### Notes for planning

- Read the removed and renamed names from the archived deltas with the delta parser osq already has; don't write a second one.
- Check the planner guidance that tells planners to add a `tests.modify` task for removed requirements, and remove it if this makes it unnecessary.
