# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

The read-cost queue drove changes 132 to 135 and finished on 2026-10-02. A summary is in Notion under OSQ > Archive, "osq queue, 2026-10-01 to 2026-10-02 (completed)", and the full file is in git history (commit 50b1cd5). The queue before it drove 103 to 131; see "osq queue, 2026-09-27 to 2026-10-01 (completed)" in the same place.

This queue is five items, picked on 2026-10-02 from the Notion roadmap and checked against the code that day. They make the core more reliable: a provider outage stops counting as a task failure, the last M1 item makes the default harness safe, two gates stop leaking or tripping planners, and every command reports failure one way, which M2's browser actions need. None depends on another.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [provider-outage-deaths] A provider outage is not a task failure

Depends on: nothing

### Goal

When a task dies because the model provider never answered, osq records that as its own dead reason, does not count it toward the stuck rule, and does not wait out the whole task timeout to find out.

### Context

As of 2026-10-02:

- 135 task 1 died twice with `timeout` during a DeepSeek outage. Each time the provider answered after 900 s with "We were unable to start processing your request within the 900-second timeout limit. Please try again later.", pi retried, and osq killed the task at `timeouts.taskTimeoutSeconds` (1800). The first attempt spent 0 tokens and changed no file. The second got five tool calls in after DeepSeek recovered, then hit the timeout.
- Both deaths had the same fingerprint, so `src/watcher/auto-retry.ts` marked the task stuck and the inbox asked for `osq plan 135`. The plan was fine; `osq retry 135 1` finished it.
- The pi adapter already writes `harness_retry` events, `phase: start` with the provider `error` and `phase: end` with `success`, from pi's `auto_retry_start` and `auto_retry_end` (`src/harness/pi/pi-stream.ts`). A `tokens` event with all zeros comes before each failed request. Nothing in the watcher reads either.
- Only the pi adapter emits `harness_retry`. The Notion page "Provider outages are not task failures" under ROADMAP has the timeline.

### Requirements

- A task that dies while its harness is in a provider retry (a `harness_retry` start with no matching end), or that never got a model response, dies with a new reason instead of `timeout`, and its dead marker quotes the provider's error.
- That reason never marks a task stuck, and an automatic retry of it waits before starting again instead of retrying straight into the outage. The wait comes from config.
- osq stops a task early when its harness has been in a provider retry longer than a configured limit, instead of waiting for `timeouts.taskTimeoutSeconds`.
- `osq report` and `osq query` show these deaths as their own reason, so they don't count against a plan.
- Every limit and wait comes from config, with defaults in `DEFAULT_CONFIG`.

### Non-goals

- Teaching the other adapters to report provider errors. Record in the proposal which of claude, codex, opencode and agy could, and leave the adapter interface alone unless one really differs.
- Pausing the task timeout during a retry.
- Switching to another provider or model automatically.

### Notes for planning

- The new dead reason, its marker text and any config keys are Surface.
- Measure test fallout in a scratch worktree first: the dead-reason list is pinned in tests, README and the auto-retry eligibility set.

## [safer-harness-defaults] A new project starts with a contained harness

Depends on: nothing

### Goal

`osq init` and `DEFAULT_CONFIG` no longer give a new project an agent with its permissions switched off, and `osq doctor` says how each harness confines its agent. This is the last open item of milestone M1.

### Context

As of 2026-10-02:

- `DEFAULT_CONFIG` in `src/core/foundation/config.ts` sets `agy.dangerouslySkipPermissions: true`, and `osq init` scaffolds `harness: process.env.OSQ_HARNESS || 'agy'` (`src/core/foundation/init.ts`). A fresh project therefore runs agents with every permission prompt bypassed.
- Change 122 wrote ADR 007 (role environments) and added Claude and opencode denials for git, network tools and sudo. Its brief split off this follow-up: the `osq init` harness default, agy's permission bypass, and the `osq doctor` containment report.
- `osq doctor` has a `harness-containment` check only for Claude Code (`src/core/foundation/config-claude.ts`).
- Still open from the to-do page: does agy work headless without the bypass flag? Check before choosing its default.

### Requirements

- A project that never sets `agy.dangerouslySkipPermissions` does not run agy with the bypass. If agy cannot run headless without it, `osq init` stops scaffolding agy as the default harness instead, and the proposal says which harness it picks and why.
- `osq doctor` reports a `harness-containment` line for every harness: what confines its agent, and a warning when the configured settings bypass it.
- A project that sets the bypass explicitly keeps working, and `osq doctor` warns about it.
- README's harness sections and the Upgrading notes say what changed.

### Non-goals

- Containers or any confinement stage after ADR 007's stage 1.
- Changing role environments.

### Notes for planning

- ADR 007 governs this. Say whether this change stays inside it or needs a revision.
- Changing a default is a consumer-visible change; list it in Surface.

## [removed-requirement-pins] Removing a requirement never breaks the living-spec pin test

Depends on: nothing

### Goal

A change whose delta removes or renames a requirement lands without a task that edits `tests/living-specs-delta-equivalence.test.ts`, and a requirement lost by accident still fails that test.

### Context

As of 2026-10-02:

- `PRESERVED_REQUIREMENTS` in `tests/living-specs-delta-equivalence.test.ts` pins requirement names per capability, from the 017 and 020 to 027 re-seed that change 028 did on 2026-09-19. The test fails when a pinned name is missing from a living spec.
- So every change that removes or renames a pinned requirement needs a `tests.modify` task for that file. Change 112 removed one without it, and its land failed `pnpm verify` on 2026-09-29. Planners now have to remember it every time.
- The same file replays every archived delta and checks the living specs equal the result. That replay is what proves the specs are the sum of approved changes; the pin list only guards the one-time re-seed.

### Requirements

- The pin check skips a pinned name when an archived change's delta removes or renames that requirement in that capability. It still fails, naming the capability and requirement, when a pinned name is missing and no archived delta removed or renamed it.
- Nothing else in the test changes, and the replay check is untouched.

### Non-goals

- Dropping the pin list.
- Any change to delta application or archive.

### Notes for planning

- Read the removed and renamed names from the archived deltas with the delta parser osq already has; don't write a second one.
- Check the planner guidance that tells planners to add a `tests.modify` task for removed requirements, and remove it if this makes it unnecessary.

## [line-budget-full-paths] The line budget exempts files by full path

Depends on: nothing

### Goal

`tests/line-budget.test.ts` exempts only the exact files on its allow list, so a new file over 250 lines fails however it is named.

### Context

As of 2026-10-02:

- The test skips any file whose basename is on `ALLOW_LIST`: `report.ts`, `show.ts`, `opencode.ts`, `agy.ts`, `linter.ts`, `loop.ts`, `migrate.ts`, `delta.ts`, `parser.ts`, `types.ts`.
- So `src/cli/report.ts` passes only because it shares a name with `src/core/report/report.ts`, and any future `types.ts` or `parser.ts` anywhere is exempt. Under ADR 006 a gate either blocks or goes.
- From "Refactoring candidates" on the Notion roadmap, item 4.

### Requirements

- The allow list holds paths relative to `src/`, and the test matches them exactly.
- Every file it exempts today that is over 250 lines stays exempt by its full path. A listed path that no longer exists, or is now under 250 lines, fails the test, so the list only shrinks.
- A file over 250 lines that isn't listed fails, naming the file and its line count.

### Non-goals

- Splitting any file.
- The function budget, which already keys by path and function name.

### Notes for planning

- Measure which basename matches are over the budget today; any that pass only by name either get split or get listed by full path, and the proposal says which.

## [commands-report-failure] Every command reports failure the same way

Depends on: nothing

### Goal

Every osq command reports failure by throwing a `CommandError`, takes its output writers as arguments, and the inbox card session runs actions in its own process, showing the error's message instead of only an exit code.

### Context

As of 2026-10-02:

- Change 111 moved the commands that called `process.exit` to `CommandError`, which `runCli` prints once. A second group never called `process.exit` and still sets `process.exitCode` itself: `land`, `message`, `sync` and `graph` (through an injectable `exit` option), `lint`, `doctor`, `migrate`, the `plan` and `serve` wrappers in `src/cli/index.ts`, `inbox-dispatch.ts`, and `plan-queue.ts`.
- The inbox card session runs each action as a child process (`createChildLauncher` in `src/cli/inbox-terminal.ts`), paying a Node start and a config load each time, and sees only the exit code.
- M2 (tap in the browser) needs commands it can call in-process and carry on after.
- The Notion page "Follow-up to 111: every command reports failure the same way, and the inbox runs actions in-process" has the full analysis.

### Requirements

- No file in `src/cli/` other than `run.ts` sets `process.exitCode`, and a test enforces it next to 111's `process.exit` guard.
- Each command's stdout, stderr and exit code stay byte-identical.
- Commands take config, working directory, and stdout and stderr writers as arguments. The injectable `exit` option goes.
- The inbox card session calls the command function in-process, prints the `CommandError` message and its next step on failure, and keeps the terminal usable after a failed action.

### Non-goals

- `process.exit` outside `src/cli/`: the watcher's signal and preflight exits, and the harness adapters.
- Web write actions. This only prepares for them.

### Notes for planning

- Measure test fallout in a scratch worktree first. `land`, `message`, `sync` and `graph` tests use the injected `exit`, and any test that calls `runCli` must restore `process.exitCode` (`tests/cli-capture.ts`).
- Through `runCli`, a successful `osq approve` runs the planning readers, so tests point `CODEX_HOME`, `OSQ_CLAUDE_PROJECTS_DIR`, `CLAUDE_CONFIG_DIR` and `OPENCODE_PATH` at a temporary folder.
- This may be two changes, commands first and the in-process inbox second; split it if the scope is over the limits.
