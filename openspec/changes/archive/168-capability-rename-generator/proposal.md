---
title: osq writes the change that renames or splits a capability
depends_on: ["167"]
verify: pnpm verify
features:
  reads: [version-control, status-inspection, web-inspection]
---
## Goal

ADR 016 decision 5 says a capability is renamed or split only by a change
whose deltas osq generates. This change builds that generator. A planner
working on a rename or split runs `osq capability rename <old> <new> --change
<id>` or `osq capability split <old> --map <file> --change <id>`. osq then
writes the deltas into the change folder being planned: every moved
requirement REMOVED from the old capability and ADDED to the new one, copied
byte for byte from the living spec. It also writes each new capability's
`osq.yml` and its generated `Code ownership` requirement, and lists in the
proposal every file outside the specs that names the old capability. The
planner writes the tasks, and the human reviews, approves and lands the change
as usual.

Three guards keep the move honest. Lint fails a generated change when an ADDED
requirement differs from the living requirement it moves, or when a REMOVED one
lands nowhere. Archive and the land sync drop a capability left with no
requirements, along with its `osq.yml`. The living-spec replay test now covers
every capability, so a removed capability must be absent after replay.

Today a rename would be hand-written REMOVED and ADDED blocks: about 100
requirements for cli-foundation alone, and one changed byte goes unnoticed.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests build temporary projects with living specs and an unapproved change
folder. They generate renames and splits through `generateCapabilityMove` and
the command functions, lint the result with `lintChangeFolder`, apply it with
`applyArchiveSpecs`, and replay the deltas with `mergeLivingSpec`. The
modified replay test then checks every living capability of osq itself.

## Non-goals

- A first-class "renamed capability" delta. OpenSpec has none (ADR 016).
- Moving source files, or rewriting tests, `traceability.capabilities` or docs
  that name the old capability. The changes that use the generator do that in
  their own tasks, from the list the generator writes.
- Creating change folders. The generator writes into an existing unapproved
  change, the one `osq plan` or `osq new` made.
- Running the generator against an `osq server` (`OSQ_SERVER`); it runs only
  locally.
- An MCP tool for the generator.
- Renaming osq's own capabilities. The slice moves are queued later.

## Surface

- Added: `osq capability rename <old> <new> --change <id>` (plumbing command).
- Added: `osq capability split <old> --map <file> --change <id>` (plumbing command), with a YAML map file of `<capability>: { purpose, group, source, requirements }`.
- Added: `generated` (proposal frontmatter field), `{ kind: rename | split, from, to }`, written by the generator and read by lint.
- Added: `## Generated` (proposal section the generator writes).
- Added: lint errors `<to> ADDED "<name>" differs from the requirement REMOVED from <from>`, `<to> ADDED "<name>", which the generated <kind> does not REMOVE from <from>`, `<from> REMOVED "<name>", which no capability in to ADDS`, `generated must name kind rename or split, from, and a list to`, and `generated names <from>, which has no living spec`.
- Changed: archive and the land sync remove `openspec/specs/<capability>/` when a delta leaves that capability with no requirement.
- Changed: README's Plumbing commands list `osq capability rename` and `osq capability split`.

## Decisions

- ADR 001: the command loads config like every other command; no loader is added.
- ADR 002: removing an emptied capability is part of the deterministic merge in `applyOpenSpecDeltas`, with no model involved.
- ADR 004: merged-spec validation still runs the pinned validator with its flags. It only leaves out a capability the change empties, because that capability is deleted.
- ADR 005: the validator version check is unchanged.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` gets no tool for the generator. The generator writes only inside the unapproved change folder it names, the same boundary the MCP tools keep.

## Assumptions

- The generator is plumbing the planner runs while planning, not an everyday command. It never creates a change folder, so the surface stays brief, plan, approve, land.
- Lint checks identity against the checkout's living spec at plan and approve time. If the default branch rewrites a moved requirement after approval, the existing `requirement_changed` sync stop already catches it.
- The file list is a superset: every project file outside the OpenSpec root, `node_modules`, `dist` and dot-folders that names the old capability as a whole word, `src/` included. A common word such as `traceability` lists many files.
- After a move, lint's merged-spec check reports OpenSpec warnings the moved requirements already had again, now under the new capability's name. They are warnings only.

## Contract

### Requirement: Generated capability move

`osq capability rename` and `osq capability split` SHALL write into one
unapproved change folder the deltas that move requirements, copied byte for
byte from the living spec, and lint SHALL fail a generated change whose moved
text differs.

#### Scenario: Rename
- **WHEN** `osq capability rename gadgets widgets --change 002` runs and `gadgets` has a living spec
- **THEN** `002` carries `specs/gadgets/spec.md` removing every `gadgets` requirement and `specs/widgets/spec.md` adding each one, byte for byte, plus a generated Code ownership

#### Scenario: Edited move
- **WHEN** a planner edits one word of a requirement in `specs/widgets/spec.md`
- **THEN** `osq lint 002` fails with `widgets ADDED "<name>" differs from the requirement REMOVED from gadgets`

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/spec-lint-and-approve/spec.md`: adds "Generated capability move", "Generated move map", "Generated move proposal" and "Generated move lint"; modifies "Merged living spec validation" (an emptied capability is not validated) and "Living spec replay in landing order" (every capability, and an emptied one is absent). Every existing scenario is kept word for word.
- `specs/watcher-and-harness/spec.md`: adds "Emptied capability removed".
- `specs/cli-foundation/spec.md`: adds "Capability command".

Four tasks, in order. Task 1 removes an emptied capability in
`applyOpenSpecDeltas`, skips it in merged-spec validation, and widens the
replay test. Task 2 adds the generated-move lint. Task 3 writes the generator
in `src/core/spec`. Task 4 adds the CLI command, its help group, its local-only
entry and the README lines. No file is shared between tasks. Following ADR 016
decision 7, the new code goes where spec-lint-and-approve and cli-foundation
code lives today.
