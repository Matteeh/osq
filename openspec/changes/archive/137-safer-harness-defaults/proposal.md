---
title: A new project starts with a contained harness
depends_on: []
verify: pnpm verify
features:
  reads:
    - spec-lint-and-approve
    - status-inspection
    - version-control
---
## Goal

A project that never opts in no longer runs agy with every permission prompt
switched off, `osq init` scaffolds Codex instead of agy, and `osq doctor`
prints one `harness-containment` line for the selected harness saying what
confines its agent. This is the last open item of milestone M1.

Today `DEFAULT_CONFIG.agy.dangerouslySkipPermissions` is `true` and `osq init`
writes `harness: process.env.OSQ_HARNESS || 'agy'`, so a fresh project's agent
runs with no guardrail at all. Only Claude Code has a containment line in
doctor.

## Verify

`pnpm verify`

It runs the typechecks, the build, every test, and lint.
`tests/agy-permissions.test.ts` proves the agy argv and the preflight
refusal through `AgyAdapter`. `tests/harness-containment.test.ts` proves one
containment line per harness through `runDoctorChecks`.
`tests/harness-defaults-docs.test.ts` proves the scaffold through
`scaffoldProject` and the README and changelog wording.

## Non-goals

- Containers, a network allowlist, or any confinement stage after ADR 007's
  stage 1.
- Changing role environments.
- Changing `DEFAULT_CONFIG.harness`. It stays `agy`, so a hand-written config
  without `harness` still selects agy, now with its prompts on, and doctor and
  the watcher say so. `osq init` always writes `harness` explicitly. Changing
  the built-in default would also change the model the mock harness records in
  the golden event files, for no gain in safety.
- Writing agy permission rules for the user. agy reads allow rules only from
  `~/.gemini/`, outside the project; see Background.
- Reading an existing opencode agent file to check its permissions.

## Surface

- Changed: `agy.dangerouslySkipPermissions` defaults to `false` (config key). It was `true`.
- Changed: `osq init` scaffolds `harness: process.env.OSQ_HARNESS || 'codex'` in `osq.config.ts` and `OSQ_HARNESS=codex` in `.env.example`. It scaffolded `agy`.
- Changed: `osq watch` refuses to start with the agy harness unless `agy.dangerouslySkipPermissions` is `true`.
- Changed: `osq doctor` prints a `harness-containment` check for every harness. It printed one only for Claude Code. With agy it fails when the bypass is off and warns when it is on.
- Added: README section `### Antigravity (agy)` and `#### agy permissions`.
- Added: README `## Upgrading` notes under `Unreleased:`.

## Decisions

- ADR 001: unaffected; configuration still loads through jiti.
- ADR 002: unaffected; archive applies these deltas like any other.
- ADR 004: unaffected; the change does not run the OpenSpec validator.
- ADR 005: unaffected; the change does not check the validator version.

## Contract

### Requirement: No harness runs without its guardrail by default

A project that does not set `agy.dangerouslySkipPermissions: true` SHALL NOT
run agy with `--dangerously-skip-permissions`. `osq init` SHALL scaffold
`codex`, and `osq doctor` SHALL report what confines the selected harness's
agent, warning when a setting switches that off.

#### Scenario: Fresh project
- **WHEN** `osq init` runs in an empty directory with `OSQ_HARNESS` unset and `osq doctor` runs there
- **THEN** the selected harness is `codex` and doctor's `harness-containment` line names the workspace-write sandbox

#### Scenario: agy with its prompts on
- **WHEN** a project selects `agy` and does not set `agy.dangerouslySkipPermissions`
- **THEN** doctor's `harness-containment` check fails naming `agy.dangerouslySkipPermissions`, and `osq watch` stops before any task spawns

#### Scenario: agy bypass kept on purpose
- **WHEN** a project selects `agy` with `agy.dangerouslySkipPermissions: true`
- **THEN** tasks run with `--dangerously-skip-permissions` as before, and doctor's `harness-containment` line is a warning

## Human steps

### Before approval

None

### After landing

- A project that runs agy must add `agy: { dangerouslySkipPermissions: true }`
  to its `osq.config.ts`, or switch harness, before its next `osq watch`. The
  README Upgrading notes say so; this repository runs pi and needs nothing.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Agy permissions".
- `specs/cli-foundation/spec.md`: adds "Harness containment report";
  modifies "Claude diagnostics" and "Codex consumer guidance".

Three tasks, in order. Task 1 turns agy's bypass off by default and adds its
preflight. Task 2 adds the containment line for every harness. Task 3 changes
the scaffold and documents the change. No file is shared between tasks.

## Background

**Does agy work headless without the bypass? No.** Probed on 2026-10-02 with
agy 1.2.7 in a scratch directory, with the argv osq uses minus the bypass:
`agy -p "<prompt>" --model gemini-3.8-flash-high --mode accept-edits
--output-format stream-json`. The agent asked to run `echo probe-ok >
out.txt`, and agy denied it: `permission check failed ... user denied
permission to run command`, then on stderr `a tool required the "command"
permission that headless mode cannot prompt for, so it was auto-denied`. The
run exited 0 with `denied_actions` in its result, so a task would only die
later on a red verify after spending tokens. Three ways around it failed or
fall outside the project:

- `--sandbox` denied the same command.
- A project `.agents/hooks.json` `PreToolUse` hook that answered
  `{"decision":"allow"}`, with or without `permissionOverrides`, ran but did
  not grant the command. Hooks can deny, not allow.
- agy honours `permissions.allow` rules in headless runs, but only from
  `~/.gemini/antigravity-cli/settings.json` and `~/.gemini/config/projects/`.
  Both are outside the project, and a prefix allowlist cannot cover the
  commands an executor runs.

So agy stays usable as an executor only with the bypass, which a project now
has to set explicitly. The watcher's preflight refuses earlier than a red
verify would. Interactive planning with agy needs no bypass, because a human
answers the prompts.

**Why Codex is the scaffolded default.** Of the six harnesses, Codex is the
only one whose own sandbox holds without any setting: osq runs it with
`--sandbox workspace-write`, `--ask-for-approval never` and shell network
access off, so writes stay in the project, `.git` is read-only, and the
network is off. Claude Code denies `git` and network tools but leaves Bash
unconfined unless `claude.sandbox` is set, and that needs `bubblewrap` and
`socat`. opencode relies on its agent file's deny patterns. Pi confines
nothing.

**ADR 007.** This change stays inside it. Decision 5 says osq writes each
harness's own permission settings where it has them and treats them as a
guardrail. For agy the guardrail is its own prompt, and osq stops switching it
off. No ADR revision is needed.

**Measured fallout.** In a scratch worktree with a prototype of all three
tasks, the full suite failed only where the tests pin the old behaviour:
`tests/config.test.ts` (bypass default), `tests/harness-interactive.test.ts`
(agy interactive argv carries the bypass), `tests/doctor.test.ts`,
`tests/codex/adapter.test.ts` and `tests/pi/doctor.test.ts` (check names and
counts without `harness-containment`), and `tests/codex-guidance.test.ts`
(agy as the scaffolded default). Each is in its task's scope with
`tests.modify: true`. `tests/claude/exec-doctor.test.ts` passes unchanged. A
first prototype that also changed `DEFAULT_CONFIG.harness` broke
`tests/golden-events.test.ts`, `tests/runner-lifecycle-logging.test.ts`,
`tests/harness-catalog.test.ts` and `tests/pi/config.test.ts`, which is why
that default stays.

**Line budgets.** `src/core/foundation/config.ts` is at 249 lines; task 1
only flips a value. `src/core/foundation/harness-catalog.ts` is at 249 lines,
so the per-harness containment functions live in the new
`src/core/foundation/harness-containment.ts`, and the catalog attaches them
where it builds `HARNESS_CATALOG`. `src/core/foundation/doctor.ts` is at 231.
`src/harness/agy/agy.ts` is on the line-budget allow list.
