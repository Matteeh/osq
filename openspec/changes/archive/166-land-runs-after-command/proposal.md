---
title: Land runs the project's after-land command
depends_on: []
verify: pnpm verify
features:
  reads: [watcher-and-harness, spec-lint-and-approve, metrics-and-reporting]
---
## Goal

After a change lands, osq runs the command the project configures for that
moment, `vcs.afterLand`, in the checkout, so no human step follows a land. For
osq itself that command is `pnpm build`: the watch service and `osq server`
then reload the new build by themselves, as they already do for a settled new
build.

Today 12 of the 16 proposals from 150 to 165 list "Run `pnpm build`" under
`### After landing`, and `osq land` ends with `osq's own source changed; run
the build and restart the watcher` (`REBUILD_MESSAGE` in `src/cli/land.ts`).
That step needs a shell, so it fails the phone test, and forgetting it caused
the stale-build incidents after 110–112, 116 and 149. A land tapped on the
server dashboard has nobody at a shell to run it.

A failed command cannot undo the land, which is already on the default branch
and, on a server, on `origin`. So the land exits one, names the command, and
records the failure in the project's watch state directory. `osq status` and
the inbox show it until `osq land <id>` runs the command again and it passes.

## Verify

`pnpm verify`

It runs the CLI and UI typechecks, the build, every test, and lint. The new
tests land archived changes in temporary git repositories with `vcs.enabled`
and a `vcs.afterLand` of `node build.cjs`, a local script that writes a file or
exits 1 as each case needs, the way `tests/vcs-land.test.ts` sets up and lands
changes. They check the land's lines, exit code, the checkout, and the
`after-land.json` record, then the inbox, `osq status` and the dashboard label
from a written record, then osq's own config, README, ADR 012 and the plan
prompt.

## Non-goals

- Deploying anything. The command is the project's own.
- The watch service or the server worker building osq by themselves.
- Running the command after `osq sync`, after archive, or in a worktree.
- Undoing a land whose command failed.

## Surface

- Added: `vcs.afterLand` (config key), a command osq runs in the checkout after every successful land.
- Added: `osq land` lines `After-land command passed: <command>` and `After-land command failed: <command>` with the output's tail and `run osq land <id> again to retry it`, and the progress line `Running after-land command: <command>`.
- Changed: `osq land <id>` on an already landed change runs the after-land command again when the last run for that change failed.
- Changed: `osq's own source changed; run the build and restart the watcher` is no longer printed when the after-land command ran and passed.
- Added: `after-land-failed` needs-you kind in bare `osq` and `osq --json`, text row `  <id>: <title> — after-land command failed — osq land <id>`, dashboard label `after-land failed`.
- Added: `osq status` line `After-land command failed for <id>: <command> — osq land <id>`.
- Added: `after-land.json` in `~/.osq/watch/<hash>/`.
- Added: plan prompt line `After land: osq runs <command> after every land, so it is not a human step.`
- Changed: osq's own `osq.config.ts` sets `vcs.afterLand: 'pnpm build'`, and README describes the key.

## Decisions

- ADR 001: `vcs.afterLand` is read from the jiti-loaded config like every other key; no loader is added.
- ADR 004: no validator call is added or moved.
- ADR 005: no validator call is added or moved.
- ADR 010: the validator role is untouched.
- ADR 012: the service still never builds osq. A build now follows a land because `osq land`, a command the human runs, runs the project's after-land command; the service then reloads the settled new build between passes as before. Decision 5 gains one sentence saying so; its rule is unchanged.
- ADR 013: the dashboard only labels the new inbox kind; no write path or HTTP route changes. A land tapped there runs the command through the same land function.
- ADR 015: `osq mcp`'s tools are untouched.

## Assumptions

- The command runs in ADR 007's `prepare` role environment, the one `vcs.prepare` already uses, so it never gets the model key and needs no new role.
- Running `pnpm build` from inside `osq land` rewrites `dist/` while the land process runs from it. The land loads no further module after the command starts, so it finishes on the code it started with.
- A watcher started in a terminal does not reload a new build by itself. With a passing after-land command osq no longer prints the restart reminder, so a terminal watcher keeps its old code until restarted; the watch service and `osq server` reload on their own.
- The failure record is machine-local, like the watch service's records. A land on another machine, or a deleted record, loses only the reminder.

## Contract

### Requirement: Land runs the after-land command

A land that moves the default branch SHALL run `vcs.afterLand` in the checkout,
and a failure SHALL stay visible until a later run passes.

#### Scenario: Passing after-land command
- **WHEN** `vcs.afterLand` is `node build.cjs`, which writes `built.txt` and exits 0, and `osq land 001` lands an archived change
- **THEN** the land exits zero, `built.txt` exists in the checkout, and the lines end with `After-land command passed: node build.cjs`

#### Scenario: Failing after-land command
- **WHEN** `node build.cjs` prints `boom` and exits 1
- **THEN** the default branch holds the land commit, the land exits one with `After-land command failed: node build.cjs`, and the inbox shows `001` with `osq land 001`

## Human steps

### Before approval

None

### After landing

- Run `pnpm build` once. This land itself runs on the build from before 166, which does not know `vcs.afterLand`; from 167 on, `osq land` runs the build.

## Delta

- `specs/version-control/spec.md`: adds "Land runs the after-land command".
- `specs/cli-foundation/spec.md`: adds "After-land command configuration", "Plan prompt names the after-land command" and "README describes the after-land command"; modifies "Land checks the osq build" (no rebuild line after a passing after-land command). Every existing scenario is kept word for word.
- `specs/status-inspection/spec.md`: adds "Failed after-land command in status and inbox"; modifies "Stable inbox object" (the kind list gains `after-land-failed`).
- `specs/web-inspection/spec.md`: modifies "Inbox kind labels".

Three tasks, in order. Task 1 adds the key, runs the command in `landChange`,
writes and clears the record, and drops the rebuild line after a passing run.
Task 2 shows a recorded failure in the inbox, `osq status` and the dashboard;
it imports task 1's record reader from `src/core/vcs/land-after.ts` without
changing it. Task 3 sets osq's own key, amends ADR 012, adds the plan prompt
line and the README paragraph. No file is shared between tasks.

## Background

**Where the record lives.** The archive must not change after land (ADR 003),
and the SQLite index holds only derived data (ADR 008). The watch state
directory already holds machine-local records keyed by the project's real path
(ADR 012), and `osq status` and `readInbox` already take an injectable home for
it.

**Why not run it on every land of a landed change.** A land of an already
landed change prints `has already landed` and cleans up. Running a build there
each time would surprise; it runs only to retry a recorded failure.
