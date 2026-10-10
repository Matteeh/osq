# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

The 2026-10-04 queue drove changes 145 to 155 and finished on 2026-10-07. A summary is in Notion under OSQ > Archive, "osq queue, 2026-10-04 to 2026-10-07 (completed)". Each item's text is kept as `brief.md` in its archived change folder. Earlier queues drove 136 to 144, 132 to 135 and 103 to 131; their summaries are in the same place.

This queue is eight items, picked on 2026-10-07 from the Notion roadmap and checked against the code that day. Three bug fixes come first: six of the last eight task deaths killed a task whose code was correct, five on a flaky test (147, 153 twice, 154, 155) and one on a formatting-only diff (155). Then four items start server mode, decided on 2026-10-07: the server is an addition, and the CLI and local use stay fully supported and maintained next to it. `server-mode-adr` decides how before any server code is written, `approve-highlights` (added 2026-10-08) opens the approve view with what the human must notice, `osq-server` runs osq on a server reachable over a private network, `remote-cli` points the same `osq` binary at a server, and `local-mcp` gives planners a tool surface that enforces the change folder. The server items depend on each other in that order. The bug fixes depend on nothing.

Two more fixes were added on 2026-10-10, after landing 160 to 163 hit both bugs: `landed-means-on-main` (status and queue called every archived change landed, so 160 to 163 sat unlanded unnoticed) and `stacked-land-keeps-history` (a stacked change conflicts with its own dependency once that dependency lands).

### Where things stand (2026-10-10)

`osq queue` marks remote-cli and local-mcp as `landed`; that is the first new bug. Main holds up to 160. The actual state:

- 161 osq-server: steered after a requirement conflict with 160 and restarted from main on 2026-10-10. All 8 tasks run again. When it archives: `osq land 161`, then `pnpm build` and restart the watcher.
- 162 remote-cli: archived, not landed, stacked on the old 161 (`osq/161-osq-server-restarted-1`). `osq land 162` will stop on code conflicts. Then plan it again with `osq plan 162` in a Claude Code session, approve, let it restart from main, and land it.
- 163 local-mcp: archived, not landed, stacked on 162. Same as 162, after 162 lands.
- Then `osq plan --next` picks `landed-means-on-main`. Don't run `--next` before 163 has landed: it would pick that item now, because the queue reads 162 and 163 as landed, and a new sibling branch next to the server stack risks another conflict restart.

One change at a time: land each before the next is planned again. The local `osq.config.ts` edits (opencode harness, `opencode-go/deepseek-v4-flash`, variant `high`) are in `git stash` as "local harness"; reapply them by hand, not with `git stash pop`, because 160 changed every quote in that file.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [flaky-tests-fixed] The known flaky tests pass under full-suite load

Depends on: nothing

### Goal

The three tests known to fail at random under full-suite load pass every time. Each one has killed a task whose code was correct and cost a whole executor rerun.

### Context

As of 2026-10-07 (Notion: "Why 153 task 2 died", "Why 155 task 2 died", "Making osq bulletproof" candidate 1):

- `tests/report-reads-once.test.ts` copies `fixture/report` with `fs.cp` in `copyFixture`, including `.osq/`. Other report tests open the fixture's read index in place, so `.osq/index.sqlite-shm` can vanish mid-copy (`ENOENT ... lstat 'fixture/report/.osq/index.sqlite-shm'`). This killed 147 task 1 and 154 task 2 at change verify.
- `tests/inbox.test.ts`, "reads the inbox through a core helper without advancing the cursor", reads the inbox in-process, then spawns the CLI, and asserts each running task's `elapsedSeconds` differs by at most 2. The spawn's own time counts toward the 2 s. Alone it takes about 0.9 s, and under the full suite 3–4 s. This killed 153 task 2 twice.
- `tests/watch-service-build.test.ts`, "clears the wait and spawns the pending task once src/ is no newer than dist/", removes its temp directory in `afterEach` while something the watcher cycle started still writes into it (`ENOTEMPTY ... rmdir '<tmp>/openspec'`). This killed 155 task 2. The landed workaround is `maxRetries: 10, retryDelay: 50` on that `fs.rm`, which hides the race.
- `osq query "select change, task, reason from dead_attempts"` lists every `change_verify_red` death; each one's dead marker under `.run/dead/` names the failing test.

### Requirements

- The report test no longer copies anything another test may be writing: it copies the fixture without `.osq/`, or every report test works on its own copy.
- The inbox test's assertion no longer depends on how long a CLI spawn takes.
- The watch-service-build teardown waits until nothing the test started still writes, then removes the directory without retries.
- Each fixed test still asserts what it asserted before.

### Non-goals

- A rerun-on-failure mechanism; that is `flaky-test-guard`.
- Fixing tests not named here. A further flaky test found on the way goes in `## Outside scope`.

### Notes for planning

- These are preexisting tests: each task that edits one sets `tests.modify: true` and scopes it.
- For the watch-service-build race, find what keeps writing after `runWatcherCycle` resolves before choosing the fix. If it is something osq itself leaves running after a cycle, that is a source bug and in scope.
- Look for the same patterns in other tests (in-place fixture indexes, timing tolerance around a spawn, teardown during a watcher cycle) and list them in the proposal; fix them only if cheap.

## [flaky-test-guard] A change verify that fails only outside the task reruns once before the task dies

Depends on: nothing

### Goal

When a task's own verify passes and the change-level verify fails only in tests unrelated to the task, osq reruns the change verify once. If the rerun passes, the task is done and osq records which test flaked. A flaky test then costs one verify run instead of a whole executor attempt, and osq names it so someone fixes it.

### Context

As of 2026-10-07 (Notion: "Making osq bulletproof" candidate 2, "Why 153 task 2 died" candidate 2):

- `runChangeVerifyGate` (`src/watcher/change-verify.ts`) runs the proposal's `verify` after each task. A red result kills the task with `change_verify_red` (`src/watcher/failure-reason.ts`); `src/watcher/auto-retry.ts` then respawns the executor.
- `excerptVerifyOutput` (`src/core/run/verify-excerpt.ts`) already finds the `✖ failing tests:` block, which names each failing test file.
- `src/core/spec/import-graph.ts` and `src/core/spec/test-impact.ts` already work out which tests import a task's scope, for lint.
- Five of the last eight deaths were flaky tests at change verify: 147 task 1, 153 task 2 (twice), 154 task 2, 155 task 2.

### Requirements

- When the change verify fails, the task's own verify passed, and no failing test imports a file in the task's scope or was created or changed by the task, osq reruns the change verify once before deciding.
- A passing rerun marks the task done as usual and records an event naming each test that failed the first time.
- A failing rerun, or a failing test that touches the task, kills the task as today.
- `osq report` lists tests that flaked, with how often.
- The number of reruns comes from config, and one rerun is the default.

### Non-goals

- Rerunning a task's own verify.
- Quarantining or skipping flaky tests.

### Notes for planning

- New event types and fields break `tests/golden-events.test.ts`; scope `tests/fixtures/events` and regenerate with `UPDATE_GOLDEN=1`.
- When the failing tests cannot be read from the output, there is no rerun: the task dies as today.

## [osq-runs-formatter] osq formats a task's files before verify

Depends on: nothing

### Goal

osq runs the project's formatter on the files a task changed before it runs verify, so a formatting-only diff can never kill a task. Formatting has one correct result, so under ADR 006 it is osq's step, not the agent's.

### Context

As of 2026-10-07 (Notion: "Why 155 task 2 died" candidates 2 and 3):

- 155 task 2's second attempt passed all 3,441 tests and failed only `biome check` on line wrapping in two files. With two different death reasons, the change halted, and a human ran `osq retry 155 2`.
- This repository's `package.json` has `format` (`biome format --write src tests packages/ui/src`) and `lint` (`biome check ...`), and `verify` ends with `pnpm lint`.
- Gate commands live in config under `gates` (`src/core/foundation/config-gates.ts`, for example `baselineVerify`). `osq.config.ts` sets none for formatting.
- The executor's `Touched:` line is the agent's claim. osq knows the task's real changes from git in the worktree.

### Requirements

- A config key holds a format command that takes the files to format. With no key set, nothing changes.
- After the executor exits and before the task's verify, osq runs that command on the task's changed files that still exist, and the formatted files become part of the task's result.
- A failing format command is recorded and does not kill the task by itself; verify still decides.
- `osq init` mentions the key, and this repository sets it.

### Non-goals

- Fixing lint findings other than formatting.
- Formatting files outside the task's changes.

### Notes for planning

- Formatting must not change a file outside the task's scope, or the scope audit fires. Format only scoped files and say so.
- Check how a formatted file interacts with the scope hashes done tasks record.

## [server-mode-adr] An ADR decides how osq runs on a server next to local use

Depends on: nothing

### Goal

Write the server-mode ADR that ADR 006 decision 7 promises, before any server code. Its rule: server mode is an addition. The CLI and local use with a checkout stay fully supported and maintained, and every command keeps working locally exactly as today.

### Context

As of 2026-10-07 (Notion: "Server, UI and MCP: how the pieces talk (proposal, 2026-10-06)"):

- ADR 006 decision 7: "osq runs on a server that holds its own clone, and the human decides from an app... Server mode gets its own ADR when its brief is written. Local use with a checkout stays supported."
- ADR 009: `osq serve` writes only on loopback (`127.0.0.1`, `SERVE_HOST` in `src/core/web/web-server.ts`), for requests that prove Host, Origin and a per-server token, through the CLI's command functions.
- ADR 012: the watcher runs under osq's own detached supervisor, with records in `~/.osq/watch/<hash>/`, one watcher per project.
- ADR 007: each role gets only the environment it declares.
- Since 142 and 144 every command takes `CommandInputs` (`cwd`, `config`, `stdout`, `stderr`; `src/cli/command-inputs.ts`) and runs in-process.
- The user decided on 2026-10-07: the server is an addition, not a replacement; both stay; MCP comes after the server.

### Requirements

- A new accepted ADR in `decisions/` whose rule says server mode is an addition and local mode stays supported, and which decides:
  - what the server holds: its own clone, how it gets changes from planners, and how landed work leaves it (ADR 003 still holds: osq alone writes git);
  - how the server runs: on 155's supervisor, one project or several;
  - one sign-in scheme for the HTTP API and later MCP, with a human scope that can tap and a planner scope that cannot approve, land, reject or retry;
  - how the CLI reaches a server: forwarding whole commands to the server's command functions, or a backend interface inside core;
  - what the dashboard shows when served remotely.
- The ADR lists what it rejects and why, including systemd units, GitHub-only headless mode and MCP tap tools.
- AGENTS.md's project rules gain the ADR's one-line rule.

### Non-goals

- Any server code. The following queue items build it.
- Removing or changing any local command.

### Notes for planning

- Plan this with the user: they want to design server mode together. Bring each decision as options with a recommendation.
- The ADR's `checks` can be empty until `osq-server` adds tests; say which tests will enforce it.
- Weigh forwarding whole commands: it reuses `CommandInputs` and keeps one code path, but streaming output, exit codes and commands that read local files (`plan`, `lint` on a local draft) need an answer.

## [approve-highlights] The approve view opens with what the human must notice

Depends on: server-mode-adr

### Goal

The approve view opens with a short Notice block that osq derives from the plan: at most five notices sorted by severity, the rest folded, and a plain "Nothing unusual" when there is nothing to judge. A red notice must be opened before Approve unlocks. osq records which notices were shown and opened and what followed, so notices that never matter can be dropped. This is ADR 014's rule that every tap view leads with what the human must notice, built first on the approve view because it is useful locally and needs no server.

### Context

As of 2026-10-08 (mockup: https://claude.ai/artifact/GbooJHm44SaVUx1UdPHfsB):

- The approve view (148, "Approve review document" and "Approve review view" in web-inspection) shows every proposal section in full, then deltas side by side, then the digest flags beside the Approve button. Nothing ranks what matters.
- A backtest of candidate rules over 140–158, each plan as first approved: no plan rule predicted any task death. Five of the nine troubled changes died on flaky tests, and 149 and 151 died on frozen invariants (`tests/no-skipped-in-src.test.ts`, `src/watcher/fingerprint.ts`) their plans never named. Surface lines, human steps, `src/watcher/` paths and "file named outside scope" each fired on 9 to 15 of 19 plans, too often to be notices. With the set below, about half the plans read "Nothing unusual". The Notice block directs judgement; failure prediction stays with the gates.
- ADR 006 decision 6 (hash the plan when first reported ready, compare with the approved hash) is not built: only `plan_started` and `plan_exited` are recorded in `.run/plan.jsonl`.

### Requirements

- Notices, each from the change folder and config alone:
  - Red: scope reaches osq's rules (`PLANNER.md`, `AGENTS.md`, `CLAUDE.md`, `decisions/`, `templates/`, executor prompts); a delta removes a requirement or a scenario; a `Departs from ADR` line.
  - Amber: more tasks than a configured count, or a task scope resolving to more files than a configured count; `package.json` in scope; a non-empty `## Assumptions` section; `verify_starts: any`; a requirement no task's tests cover, where traceability is on.
  - Grey: `tests.modify`; a new capability; plan revisions between first ready and approval.
- At most a configured number of notices show (default 5), sorted by severity; the rest fold. With no red or amber notice the block reads "Nothing unusual".
- Approve stays disabled in the dashboard until each red notice has been opened. osq records shown and opened notices, never a claim that the human understood. `osq approve` in the CLI prints the same notices.
- The proposal gains a fixed `## Assumptions` section, `None` or one line per assumption; the template, lint and PLANNER.md say so.
- osq records the plan hash when the plan is first reported ready, so revisions can be counted (ADR 006 decision 6).
- Each shown notice is recorded with what followed (approved, planned again, rejected, halted), and `osq report` or `osq query` can list notices by outcome.
- Severity is shown in colour and in form (label and stripe), readable at phone width in both themes.

### Non-goals

- Predicting task deaths; that stays with the gates.
- An AI reviewer at plan time. It may follow as a measured trial.
- "I understood" checkboxes: they record a claim osq cannot check (ADR 006 decision 3).

### Notes for planning

- The backtest script is easy to rerun; carry its rule list into tests as a table over fixture plans.
- Changing the proposal template touches pinned tests; measure test fallout in a scratch worktree first.

## [osq-server] osq runs on a server reachable over a private network

Depends on: server-mode-adr

### Goal

osq can run as a server for a project: the watcher service, the dashboard and the HTTP API, run from the server's own clone, reachable from a phone or laptop over a private network such as Tailscale or an SSH tunnel. A human can approve, land, reject and retry from a browser that isn't on the server, and a land pushes the result to `origin`. Today's loopback `osq serve` keeps working unchanged.

### Context

As of 2026-10-08:

- `osq serve` (`src/cli/serve.ts`, `src/core/web/web-server.ts`) binds `127.0.0.1` on `serve.port` (default 4173, `src/core/foundation/config-serve.ts`). It serves `packages/ui` from `ui/dist` and `/api/report`, `/api/graph`, `/api/system`, `/api/inbox`, `/api/events`, `/api/changes/` and `/api/actions/`. Write actions are in `web-write.ts` and `web-actions.ts`, under ADR 009, which allows only the hosts `127.0.0.1` and `localhost`.
- `osq watch --background` and `--stop` run the watcher under the supervisor from 155 (ADR 012, `src/cli/watch-service.ts`).
- The dashboard has approve (148) and land (153) views.
- 159 wrote ADR 013 (remote access, proposed, to supersede ADR 009) and ADR 014 (server mode). Sign-in is deferred; its requirement is on the Notion page "Server, UI and MCP".

### Requirements

- First, ADR 013 built: the write guard allows the configured hosts and their `https://` origins as well as loopback, osq still binds only loopback, and ADR 013 becomes accepted while ADR 009 becomes superseded by it. Phone taps over Tailscale Serve work after this step alone.
- Whatever else ADR 014 decides for the server, built: starting and stopping the server under the ADR 012 supervisor, API paths under `/p/<project>/`, land pushing the land commit to `origin` as a fast-forward and stopping when the remote moved, and the dashboard header and service panel.
- Every limit, port, host and lifetime comes from config.
- `osq serve` on loopback behaves exactly as before, and its tests pass unchanged.

### Non-goals

- Sign-in and scopes; deferred by ADR 014.
- The CLI talking to a server; that is `remote-cli`.
- MCP, the phone app, TLS termination (Tailscale Serve or a reverse proxy does it; say so in docs).
- Landing through a forge PR, or a server with no `origin`; ADR 014 names both and builds neither.

### Notes for planning

- The dashboard must show which server and project it is on, and what the watcher service is doing.
- Push credentials belong to osq's own git process and never reach the executor or verify (ADR 007).

## [remote-cli] The osq CLI works against a server

Depends on: osq-server

### Goal

The same `osq` binary can point at an osq server, and its commands then act on the server's project. With no server configured, every command works locally exactly as today.

### Context

As of 2026-10-07:

- Every command takes `CommandInputs` and runs in-process (`src/cli/command-inputs.ts`, `resolveInputs`); `src/cli/` has about 25 command functions.
- `server-mode-adr` decides between forwarding whole commands and a backend interface inside core.

### Requirements

- A setting outside the repository's committed config (so one checkout can use either mode) selects a server and its sign-in.
- Read commands (`osq`, `status`, `show`, `report`, `query`, `spec`) and the human taps work against the server with the same output as locally.
- A planner can write a change's files to the server and run lint there, as the ADR decides.
- With no server set, nothing changes, and the local tests pass unchanged.
- A command that cannot work remotely says so in one line, naming the local alternative.

### Non-goals

- Removing or deprecating any local path.
- MCP; that is `local-mcp`.

## [local-mcp] osq mcp gives planners tools that write only inside the change folder

Depends on: remote-cli

### Goal

`osq mcp` runs an MCP server over stdio with the planning tools only, against a local project or a server. Its write tool refuses any path outside the change folder, so that planner rule becomes a gate. Approve, land, reject and retry are never tools.

### Context

As of 2026-10-07 (Notion: "Server, UI and MCP" options B and D):

- The planner rules "write only inside that change folder" and "never run `osq approve`" are instructions in `PLANNER.md`, not gates.
- `osq plan` hands off through `plan-prompt.md` in the change folder.
- Runtime dependencies are `chokidar`, `yaml`, `commander` and `jiti`; adding one needs an ADR.

### Requirements

- Tools to read the brief, the plan prompt, a requirement (`osq spec`) and history (`osq query`); to write and delete files inside the change folder only; and to run `osq lint` on it.
- Every tool calls the same command functions as the CLI, locally or through the `remote-cli` setting.
- No tool approves, lands, rejects, retries or writes outside the change folder.

### Non-goals

- MCP over HTTP on the server.
- Confining a planner that also has a shell; MCP enforces only what goes through it.

### Notes for planning

- Decide between the MCP SDK (a new dependency, so an ADR) and a small in-house JSON-RPC layer, and say why.
- Try it on a real plan before calling it done; large files through tool calls are the open risk.
## [landed-means-on-main] Status and queue call a change landed only when main holds it

Depends on: nothing

### Goal

`osq show`, `osq status`, `osq queue` and the dashboard say a change is landed only when the default branch holds it. An archived change that has not landed says so and names `osq land <id>` as its next step.

### Context

As of 2026-10-10:

- `readArchivedNextStep` in `src/core/status/next-step.ts` returns state `landed` for every archived change that needs no steering, without asking git. `osq show 160` printed `Next: landed` while main stopped at 159.
- `selectAssociation` in `src/core/status/queue-state.ts` maps any archived association to `landed`. On 2026-10-10 `osq queue` showed remote-cli and local-mcp as `landed` while both sat unlanded.
- `readDependencyState` in `src/core/spec/stack-dependencies.ts` already tells `landed` from `archived` with git, and `osq land`, `dispatch-land.ts` and `show-land-model.ts` use it.
- `osq status` prints archived changes as one count, `Archived specs: <n>`, with no landed or unlanded split.
- Result: 160 to 163 sat archived for a day with nothing pointing at `osq land`.

### Requirements

- With git, an archived change that the default branch does not hold has its own next-step state (for example `archived`) whose command is `osq land <id>`, in `osq show`, `osq status`, the inbox and the dashboard.
- `osq queue` and the queue report show such an item as archived, not landed.
- `osq status` lists archived changes that have not landed by id, each with `osq land <id>`.
- Without git (`vcs.enabled` off), archived stays the end state, as today.

### Non-goals

- Changing what `osq land` does.

### Notes for planning

- Reuse `readDependencyState`; don't add a second way to decide landed.
- Many tests and golden fixtures pin `Next: landed`; measure the fallout in a scratch worktree before writing task scope.
## [stacked-land-keeps-history] A stacked change lands cleanly after its dependency lands

Depends on: landed-means-on-main

### Goal

A change stacked on another (162 on 161) syncs with the default branch without conflicts after its dependency lands, when it changed nothing since its dependency's tip that main changed too.

### Context

As of 2026-10-10:

- `osq land` writes the land commit with `commitTree` in `src/core/vcs/git-vcs-land.ts`: the branch's tree with the default branch as its only parent. Main never holds the branch's commits.
- A stacked dependent's branch holds its dependency's original commits. After the dependency lands, `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` merges main with the merge base at the old main, so every line the dependent changed on top of its dependency conflicts. A trial on 2026-10-10: landing 161 alone on 159 and merging into 162 conflicted in `src/cli/server-worker.ts`, `src/core/web/web-server.ts`, `README.md` and `decisions/014-server-mode.md`.
- A code conflict at land stops the change, and approving its revised plan restarts the branch from main (change 129), so the whole stack above a landed dependency reruns every task.
- Land order deadlocks when a dependency is steered and archives again: on 2026-10-10 `osq land 161` refused with `162-remote-cli archived before 161-osq-server and also writes cli-foundation, web-inspection; land it first, or reject it`, while `osq land 162` refuses because 162 is stacked on unlanded 161, and `osq reject` refuses archived changes. `assertNoEarlierChange` in `src/core/vcs/land-checks.ts` should skip a change stacked on the one being landed, and no refusal should suggest a command that cannot run.

### Requirements

- After a dependency lands, syncing its stacked dependent takes main without conflicts in lines only the dependency and the dependent changed.
- osq never rewrites history (ADR 003), and agents still never run git.
- Main's history stays one commit per landed change, or the change writes an ADR saying why not.

### Non-goals

- Resolving real conflicts between unrelated changes; those still stop and restart.

### Notes for planning

- Options to weigh: a land commit with the branch tip as a second parent, or a sync that merges the dependency's land commit with the dependency's branch tip as the merge base. Bring them to the user with a recommendation.
- Test with a three-change stack in a temporary repo: land the bottom, then sync and land the next.
