---
title: osq governs every path except the prose and local files a project names
depends_on: []
verify: pnpm verify
features:
  reads:
    - status-inspection
    - watcher-and-harness
---
## Goal

osq governs every file in a project except the paths a project lists as
ungoverned. A new config key `ungoverned` lists path globs, by default
`README*`, `docs/**`, `LICENSE*`, `.gitignore` and `.env*`. A project's list
replaces the default, and `[]` governs everything, so a new config file,
lockfile or CI workflow stays governed until someone deliberately opts it out.

An ungoverned file belongs to no capability. A task may edit one in its scope
without a delta, so lint stops telling planners to add a delta for it, which on
177 led to README requirements and a README wording test. Lint warns instead
when a delta tries to own an ungoverned file through Code ownership, or names
one in a requirement. The managed `AGENTS.md` and `PLANNER.md` blocks and the
README say a human edits ungoverned files directly on the default branch, with
no change, and that planners never pin them.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/ungoverned-config.test.ts` proves the config key and the `osq init`
scaffold. `tests/ungoverned-lint.test.ts` proves the three lint behaviours
through `osq lint`. `tests/ungoverned-blocks.test.ts` proves the managed blocks
and this repository's copies of them.

## Non-goals

- Detecting tests that read ungoverned files.
- Changing osq's own Code ownership, specs or tests. cli-foundation keeps
  owning `README.md` and `.env.example` here; queue item
  `ungoverned-docs-cleanup` removes them.
- Changing what an executor may write. A task's `scope` still decides, and a
  task may still edit an ungoverned file in its scope.
- Checking living specs. Only a change's own delta specs get the new warnings,
  so every lint on this repository does not repeat warnings about
  cli-foundation's current ownership.
- Any gate on direct edits to the default branch. Ungoverned is a promise that
  osq will not ask for a change, not a new check.

## Surface

- Added: `ungoverned` (config key), a list of path globs, default `['README*', 'docs/**', 'LICENSE*', '.gitignore', '.env*']`.
- Added: lint warning `<capability> Code ownership glob <glob> matches ungoverned paths. Ungoverned files belong to no capability; drop the glob`.
- Added: lint warning `<capability> requirement "<name>" names ungoverned files: <files>. Ungoverned files are not pinned by specs`.
- Changed: the write-without-delta lint warning no longer fires for an ungoverned path.
- Changed: the `osq.config.ts` that `osq init` writes gains three comment lines showing `ungoverned`.
- Changed: `PLANNER.md` and the executor protocol in `AGENTS.md` each gain one line about ungoverned paths (document sections).

## Decisions

- ADR 001: `ungoverned` is read from `osq.config.ts` through the existing jiti loader; nothing new loads config.
- ADR 004: unchanged; the new warnings run inside osq's own lint, not the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: unchanged; the validator does not read `ungoverned`.
- ADR 012: unchanged; nothing here touches the watch service.
- ADR 015: unchanged; no MCP tool changes.

## Assumptions

- `ungoverned` globs match paths the way task `scope` patterns do (`scopeCoversPath`), so `README*` matches only the root README and `.gitignore` only the root file; a nested `packages/ui/README.md` stays governed unless a project adds `**/README*`.
- A word in requirement text names a file only when it holds no glob character, so a requirement listing the default globs is not flagged; a later delta that modifies cli-foundation "Ungoverned paths configuration" will still see one warning for the literal `.gitignore` in it.
- Only Code ownership in a change's own delta specs is checked, so this repository's living cli-foundation ownership of `README.md` and `.env.example` prompts nothing until `ungoverned-docs-cleanup` modifies it.

## Contract

### Requirement: Ungoverned paths

osq SHALL treat every path `ungoverned` matches as owned by no capability: a
task may write one without a delta, and a delta that owns or names one gets a
lint warning. Every other path stays governed.

#### Scenario: A task edits an ungoverned file
- **WHEN** a task scopes a file that `ungoverned` matches and a capability without a delta owns
- **THEN** lint gives no write-without-delta warning for it

#### Scenario: A delta pins an ungoverned file
- **WHEN** a delta's requirement names a file that `ungoverned` matches
- **THEN** lint warns that ungoverned files are not pinned by specs, and the change stays valid

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: adds "Ungoverned paths configuration",
  "Init shows ungoverned paths" and "Ungoverned paths in managed blocks".
- `specs/spec-lint-and-approve/spec.md`: modifies "Capability write without
  delta warning" and "One code ownership reader"; adds "Ungoverned ownership
  warning", "Ungoverned name warning" and "Ungoverned warnings never block".

Three tasks, in order. Task 1 adds the config key. Task 2 adds the lint and
reads task 1's `config-ungoverned.ts` without changing it. Task 3 changes the
managed blocks and the README. No file is shared between tasks.

## Background

**Measured on 2026-10-12** in a scratch worktree at 178 with a rough version of
all three tasks. The full suite failed only in
`tests/ownership-reader.test.ts`, which pins `parseCodeOwnership` to
`parser.ts` and `capability-impact.ts`; the plan keeps the delta ownership
reader in `capability-impact.ts` for that reason, and with it moved there the
test passes. Every other failure also failed on a clean baseline without a
build (`bin-execution`, `package-*`, `web-export`,
`command-inputs-doctor-serve`). The README bullet and the block lines broke no
test that reads README, `AGENTS.md` or `PLANNER.md`.

**Run against the archive**, the prototype flagged what it should: 032's
cli-foundation Code ownership globs `README.md` and `.env.example`, and
requirements such as "Codex consumer guidance" naming `README.md` and
`.env.example`.

**Line budget.** `src/core/foundation/config.ts` is at the 250-line budget.
Collapsing the `agy` and `log` defaults onto one line each made room for the
four lines the key needs.

**Scenario helper.** Living cli-foundation and spec-lint-and-approve each hold
duplicate scenario names, so `scenario('<capability>', ...)` throws for every
lookup in them (disclosed on 176 and 177). The tests use plain `node:test`
blocks named after the scenarios; neither capability is in
`traceability.capabilities`.
