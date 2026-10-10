---
queue_item: capability-rename-generator
queue_hash: sha256:2b366a1dfa6d20d95034f44cb864ef790a62797e094b98473a4158015e828100
planner: null
date: 2026-10-10
---

### Goal

Renaming or splitting a capability is a change osq generates deterministically. The planner and the human only review it, approve it and land it, and replay rebuilds the same living specs afterwards.

### Context

As of 2026-10-10 (Notion: "Capability names follow the code", section "Making the rename something osq does"):

- A rename can be written today as REMOVED requirements on the old capability and the same text ADDED to the new one. A split does the same with a mapping from requirement to capability. Both delta kinds replay deterministically.
- The archive holds 345 delta files under `specs/watcher-and-harness/` alone, so a hand-written rename would be large and easy to get wrong.
- Since 139, the pin check skips REMOVED and RENAMED requirements.
- `traceability.capabilities` in `osq.config.ts` and `readCreates` in `src/core/spec/capability-relations.ts` name capabilities. Each capability has an `osq.yml` with a `group:`.

### Requirements

- `osq capability rename <old> <new>` and `osq capability split <old> --map <file>` write a normal change folder: the deltas, copied byte for byte from the living spec, the new capabilities' `osq.yml`, and each new capability's `Code ownership` requirement and source comment.
- Lint proves that each ADDED requirement in a generated rename or split is identical to the REMOVED one, so a rename cannot quietly change a requirement.
- At archive, a capability left with no requirements loses its folder and `osq.yml`.
- Replaying the archive after a generated change lands gives the same living specs that archive wrote.
- Tests that name a capability, `traceability.capabilities` and the docs are not rewritten by the generator; the generated proposal lists them for the planner's tasks.

### Non-goals

- A first-class "renamed capability" delta that OpenSpec doesn't have.
- Moving source files. The rename changes that use this generator move the code in their own tasks.

### Notes for planning

- Decide whether the generator is a user command or plumbing the planner runs while planning, in line with the surface staying brief, plan, approve, land.
