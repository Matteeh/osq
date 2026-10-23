---
title: osq plan can plan one queue item out of order
depends_on: []
verify: pnpm verify
features:
  reads: [metrics-and-reporting, spec-lint-and-approve, watcher-and-harness, web-inspection]
---
## Goal

`osq plan --next` always takes the first eligible queue item, so planning
a later item means planning every eligible item before it; planning 303
forced planning 300 to 302 first. `osq plan <slug> -p` for a queue slug
ignores the queue brief and makes an empty scaffold. This change lets
`osq plan --next <slug>` plan one named queue item exactly as `--next`
plans the first, and refuse with a reason when that item cannot be
planned.

## Verify

`pnpm verify` runs the CLI and UI typechecks, the build, every test and
lint. It proves the named item is planned with its own brief and queue
hash while earlier items stay unplanned, that the three refusals write
nothing, and that `--next` without a slug and every other planning test
still behave as before.

## Non-goals

- The Rust plan feature; a later item ports it.
- Reordering `queue.md`.
- Planning a queue item through `osq plan <slug>` without `--next`.

## Surface

- Changed: `osq plan --next` (flag) takes an optional queue slug: `osq plan --next [slug]`.
- Added: the plan refusals `Queue item "<slug>" is not in the queue.`, `Queue item "<slug>" already has change <id> (<state>).` and `Queue item "<slug>" is waiting on <slugs>.`

## Decisions

- ADR 001: no change to config loading.
- ADR 004: no change to the OpenSpec validator.
- ADR 005: no change to the validator peer range.
- ADR 010: the validator is untouched.
- ADR 012: the watch service is untouched.
- ADR 015: `osq mcp` gains no tool; its plan tools stay as they are.
- ADR 018: the steering planner is untouched; `--next` with a slug never steers.
- ADR 019: `--run` still refuses `--next`, with or without a slug.
- ADR 016: the row choice is a status-inspection module under `src/core/status/`, called by the planning module there; the CLI keeps only option handling.
- ADR 021: autopilot keeps calling queue planning without a slug, so it still takes the first eligible item.

## Assumptions

- The new tests use `node:test` directly, not `scenario()`: the living cli-foundation spec holds eight repeated scenario names, such as `Defaults` and `Invalid value`, so `lookupScenario` refuses every cli-foundation lookup until they are renamed.
- The remote CLI forwards `--next <slug>` to the server as it forwards `--next`; only its check that treats `next` as a boolean changes.

## Contract

### Requirement: Next queue item planning

See `specs/cli-foundation/spec.md`, with the new scenarios "Named queue
item" and "Named queue item refused".

### Requirement: Queue module boundaries

See `specs/status-inspection/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: MODIFIED "Next queue item planning", with the scenarios "Named queue item" and "Named queue item refused".
- `specs/status-inspection/spec.md`: MODIFIED "Queue module boundaries": the row choice lives in its own module.
