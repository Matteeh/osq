---
title: A new project starts on pi
depends_on: ["137"]
verify: pnpm verify
features:
  reads: []
---
## Goal

`osq init` scaffolds pi as the default harness instead of codex, and the README
and CHANGELOG say so. Change 137 picked codex for its own sandbox; the human
chose pi afterwards, because it runs any command headless, needs no generated
files, reads `AGENTS.md` itself, and is what this repository runs.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/pi-default-scaffold.test.ts` proves the scaffold through
`scaffoldProject` and `loadConfig`. `tests/pi-default-docs.test.ts` proves the
README and CHANGELOG wording.

## Non-goals

- Containers or any confinement stage after ADR 007's stage 1.
- Making `osq doctor` warn about pi. Its `harness-containment` line already
  says, as a passing check, that nothing confines the agent.
- Scaffolding a `pi` config block with a provider or model.
- Changing `DEFAULT_CONFIG.harness`, which stays `agy` as 137 left it.

## Surface

- Changed: `osq init` scaffolds `harness: process.env.OSQ_HARNESS || 'pi'` in `osq.config.ts` and `OSQ_HARNESS=pi` as the first line of `.env.example`. 137 made it `codex`; no release shipped that.

## Decisions

- ADR 001: unaffected; configuration still loads through jiti.
- ADR 004: unaffected; the change does not run the OpenSpec validator.
- ADR 005: unaffected; the change does not check the validator version.

## Contract

### Requirement: A new project starts on pi

`osq init` SHALL scaffold pi as the harness in `osq.config.ts` and
`.env.example`, keep the Codex guidance comments, and the README SHALL say
that pi is the scaffolded default and that nothing confines its agent.

#### Scenario: Fresh project
- **WHEN** `osq init` runs in an empty directory and `loadConfig` runs there with `OSQ_HARNESS` unset
- **THEN** the harness is `pi`

#### Scenario: Codex one line away
- **WHEN** a consumer reads the scaffolded `.env.example`
- **THEN** the commented Codex guidance is still there

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: removes "Codex consumer guidance"; adds
  "Codex guidance" (its text without the codex default) and "Scaffolded
  harness default"; modifies "Config file errors" and "Pi consumer guidance".

Two tasks, in order. Task 1 changes the scaffold and the tests that pin it.
Task 2 changes the README and CHANGELOG. No file is shared between tasks.

## Background

**Why remove and add instead of modify.** 137 added the scenario "Codex is the
scaffolded default" to "Codex consumer guidance". A MODIFIED block must keep
every scenario by name, and that one is no longer true, so the requirement is
removed and added back as "Codex guidance" without it, and the default moves
to its own requirement. Neither name is in the pin list of
`tests/living-specs-delta-equivalence.test.ts`.

**Why pi is not confined, and why that is fine here.** Pi has no permission
prompts and no sandbox. 137's doctor line for pi says so plainly, which is
different from agy's bypass, a flag that switched a guardrail off by default.
The confinement draft in Notion (ROADMAP > Security, "Confinement ADR") makes
a container per role the boundary from its stage 2 on, and harness permissions
only a guardrail, so the default harness is not where confinement comes from.

**Pinned tests, measured.** A prototype on 2026-10-02 with pi scaffolded
failed `tests/codex-guidance.test.ts`, which pins codex as the scaffolded
default, and `tests/config-load-errors.test.ts`, which swaps the scaffold's
`'agy'` for `'codex'` by string replace and expects `codex`; with pi
scaffolded that swap does nothing. Since then 137 added
`tests/harness-defaults-docs.test.ts`, which pins the codex scaffold and the
README Upgrading line `scaffolds Codex`. All three belong to task 1, which
drops that README assertion; task 2's new test pins the pi wording instead, so
the README file has one owner and no task waits on another's tests.

**Scope limit.** One task would need nine scope entries against the limit of
eight, and the scope resolver has no brace patterns, hence two tasks.
