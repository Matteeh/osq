## ADDED Requirements

### Requirement: Land runs the after-land command
When `vcs.afterLand` is set, `landChange` in `src/core/vcs/land.ts` SHALL run
it in the checkout after a land that moved the default branch, after the
worktree cleanup, and so after the push when `landAndPublish` lands. It SHALL
run through `runVerificationCommand` with no `OSQ_CHANGE`, in ADR 007's
`prepare` role environment, bounded by `timeouts.verifyTimeoutSeconds`, after
calling the progress callback with `Running after-land command: <command>`.
It SHALL NOT run when the land refuses or stops, and SHALL NOT run when
`vcs.afterLand` is unset; such a land prints and returns exactly what it does
today.

When the command exits 0, the land SHALL append `After-land command passed:
<command>` to its lines and exit zero. When it fails or times out, the land
SHALL stay on the default branch, append `After-land command failed:
<command>`, the last `limits.cardOutputLines` lines of its output, and `run
osq land <id> again to retry it`, and exit one. `LandResult` SHALL say whether
the command ran and passed.

A failure SHALL be recorded in `after-land.json` in the project's watch state
directory, `watchStateDir` from `src/core/run/watch-state.ts`, as `{ change,
command, exitCode, failedAt }` with `change` the folder name. A passing run
SHALL remove that file. When `osq land <id>` finds the change already landed
and the file names that change, it SHALL run the command again the same way
before its cleanup lines; otherwise an already landed change SHALL run nothing.
`landChange` SHALL take an injectable `home` for the watch state directory.

#### Scenario: Passing after-land command
- **WHEN** `vcs.afterLand` is `node build.cjs`, which writes `built.txt` and exits 0, and `osq land 001` lands an archived change
- **THEN** the land exits zero, `built.txt` exists in the checkout, stderr holds `Running after-land command: node build.cjs`, the lines end with `After-land command passed: node build.cjs`, and no `after-land.json` exists

#### Scenario: Failing after-land command
- **WHEN** `vcs.afterLand` is `node build.cjs`, which prints `boom` and exits 1, and `osq land 001` lands an archived change
- **THEN** the default branch holds the land commit, the land exits one, its lines hold `After-land command failed: node build.cjs`, `boom` and `run osq land 001 again to retry it`, and `after-land.json` names `001-<words>`, `node build.cjs` and exit code 1

#### Scenario: Retry after a failure
- **WHEN** the failing land above is followed by `osq land 001` with `node build.cjs` now exiting 0
- **THEN** the command runs again, the land exits zero with `After-land command passed: node build.cjs`, and `after-land.json` is gone

#### Scenario: Already landed without a failure
- **WHEN** `001` has landed, no `after-land.json` exists, and `osq land 001` runs again
- **THEN** the command does not run and the land prints what it printed before this change

#### Scenario: Refused land runs nothing
- **WHEN** `vcs.afterLand` is set and `osq land 001` refuses because the checkout is on branch `feature`
- **THEN** the command does not run

#### Scenario: No command configured
- **WHEN** `vcs.afterLand` is unset and `osq land 001` lands
- **THEN** its lines and exit code are what they were before this change
