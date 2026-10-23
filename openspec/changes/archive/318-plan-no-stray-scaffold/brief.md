---
queue_item: plan-no-stray-scaffold
queue_hash: sha256:4cab6a5bcea5062126216de65422afff017b4101b668b6b4310adf77c6081bf3
planner: null
date: 2026-10-23
---

### Goal

On 2026-10-23 a planner session ran `osq plan 307`, expecting change 307 to exist. It didn't: `osq plan --next` had been blocked by dead tasks. osq took `307` as the name of a new change, created `openspec/changes/307-307/` from the template, then failed with `No brief provided`, leaving the empty scaffold behind. It sat in `osq status` as an unapproved change until a human asked what it was. A failed `osq plan` should leave nothing, and a bare number is never a new change's name.

### Context

As of 2026-10-23:

- `src/cli/plan.ts` calls `createChange` before `readBriefInput` (in `src/cli/plan-queue.ts`), so a missing brief leaves the folder.
- The Rust plan feature already behaves: `plan <id>` only steers an existing change and refuses an unknown id, and `plan --next` writes the folder in one step with its brief.

### Requirements

- `osq plan <name>` reads the brief before it writes anything; when the brief cannot be read, it fails and creates no folder.
- `osq plan <name>` where `<name>` is all digits and matches no change refuses, writing nothing, with a message that names the number and points to `osq plan --next` or a descriptive name.
- Tests see no new folder under `openspec/changes/` after both refusals.

### Non-goals

- The Rust plan feature.
- Cleaning up folders left by earlier runs.
