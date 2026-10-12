---
title: osq's own specs and tests stop pinning README and root prose docs
depends_on: ["179", "177"]
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - watcher-and-harness
    - web-inspection
---
## Goal

osq's own repository follows the default `ungoverned` list. cli-foundation no
longer owns `README.md` or the repository's `.env.example`, no living
requirement names either file, and no test reads them, so a README edit needs
no change and breaks no test.

Measured on 2026-10-12: with `README.md` and `.env.example` replaced by one
junk line, 83 tests in 37 test files fail, and 0 fail without the swap. This
change removes those README and repository `.env.example` assertions. It
removes 20 requirements that pin README wording, or replaces them with a
renamed copy that keeps the program behavior. It rewrites 16 more without
their README clause.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree. Each task's own verify also checks that its test files no longer read
the root `README.md` or the repository's `.env.example`.

## Non-goals

- Editing README text or `.env.example`.
- Unpinning CHANGELOG wording: the CHANGELOG assertions in the steering,
  harness-default, pi-default and release tests stay, and "Steering changelog
  entries" keeps the CHANGELOG clause of "Steering guidance".
- Unpinning `AGENTS.md`, `PLANNER.md`, `templates/.env.example` or
  `decisions/README.md`.
- Changing any program behavior. No file under `src/` changes.

## Surface

None

## Decisions

- ADR 001: config loading is untouched; only the requirement text around it changes.
- ADR 004: the validator invocation is untouched.
- ADR 005: the peer range rule is untouched.
- ADR 008: "Harness-reported cost" and "Label recording" keep their read-index behavior word for word.
- ADR 010: "osq's own validator configuration" keeps the validator config; only the README section pin goes.
- ADR 012: the watch service is untouched.
- ADR 015: "MCP command" keeps its transport text; only the README section pin goes.

## Assumptions

- A requirement whose README scenario must go is REMOVED and re-ADDED under a new name, because a MODIFIED requirement must keep every scenario and a delta cannot ADD and REMOVE the same name.
- "Verification placeholder guidance" says "consumer guidance" but its test reads `PLANNER.md`, not the README, so it stays as it is.
- After archive, `README.md` and `.env.example` belong to no capability. Only `src/` files are checked for an owner, so nothing fails.

## Contract

The deltas under `specs/` are the contract. In summary:

- cli-foundation `Code ownership` drops `README.md` and `.env.example`; `AGENTS.md` and `PLANNER.md` stay.
- REMOVED outright (pure README pins): "Scope resolver upgrade guidance", "Pi consumer guidance", "Claude consumer guidance", "Reference mutation setup", "Spec command documentation", "README command groups", "Architecture-first documentation", "README names changes waiting to land", "README describes the after-land command", "README intro describes the flow".
- REMOVED and re-ADDED under a new name without the README part: "Planner verify start guidance" → "Planner verify start rule", "osq runs its own changes under version control" → "osq's own version control configuration", "Capability relation guidance" → "Capability relation planner bullet", "Capability sidecar guidance" → "osq's own capability sidecars", "Codex guidance" → "Codex scaffold guidance", "osq validates its own changes" → "osq's own validator configuration", "Change verify rerun count" → "Change verify rerun configuration", "Steering guidance" → "Steering changelog entries", and in metrics-and-reporting "Cost reporting and price table disclaimer" → "Harness-reported cost", "Label command" → "Label recording".
- MODIFIED without the README clause: "Import graph lint limits", "Inbox follow flag", "Graph command", "Scaffolded harness default", "Inbox card actions run in-process", "Decisions scaffold", "Format command configuration", "Server commands", "Planning against a server", "MCP command", "Capability command", "Product description", "Package hygiene and release distribution", "Capability-driven planner validation", and in metrics-and-reporting "Inbox waiting report output".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: 15 MODIFIED, 8 ADDED, 18 REMOVED requirements.
- `specs/metrics-and-reporting/spec.md`: 1 MODIFIED, 2 ADDED, 2 REMOVED requirements.

No file is shared between tasks.
