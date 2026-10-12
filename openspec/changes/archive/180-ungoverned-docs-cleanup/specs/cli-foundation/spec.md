## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/foundation/**, src/cli/**, src/index.ts, osq.config.ts, templates/**, AGENTS.md, PLANNER.md -->
The CLI Foundation capability SHALL own CLI entrypoints, retry and rejection
commands, configuration and shared harness capability resolution, doctor
diagnostics, logger, initialization, public configuration exports, managed
agent and planner instructions, and templates.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI, configuration, retry, scaffolding, or managed guidance files
- **THEN** system maps `src/core/foundation/**`, `src/cli/**`, `src/index.ts`, `osq.config.ts`, `templates/**`, `AGENTS.md`, and `PLANNER.md` to cli-foundation

### Requirement: Import graph lint limits
`limits` SHALL carry `importGraphDepth`, default 2, the import levels the
frozen-test warning follows, and `maxListedImporters`, default 8, the most tests
or files one import-graph warning lists. Both SHALL merge from `osq.config.ts`
like the other limits.

#### Scenario: Deeper reach
- **WHEN** `limits.importGraphDepth` is 3 and a test imports a scoped file three levels away
- **THEN** the frozen-test warning names that test

### Requirement: Inbox follow flag
`osq inbox --follow` SHALL run the dispatch follow loop until interrupted,
with the inbox sound built from the config, and SHALL stop cleanly on
SIGINT. `inboxDispatchCommand` SHALL take `follow`, `signal`, `sound`,
`watch`, `schedule`, `every`, and `now` options so tests drive the loop
without a terminal, a real watcher, a real timer, or a real sound. With `--json`, `--follow` SHALL print
`osq inbox: --follow prints text; drop --json` to stderr and exit with
code 1. Without `--follow`, `osq inbox` and `osq inbox --json` SHALL print
what they printed before. `formatDispatchItemSummary` SHALL return
`<kind> <id> <title>[ task <n>: <task title>] (<reason>)`, the text that
follows the position on each line of `osq inbox`'s list.

#### Scenario: Follow through the command
- **WHEN** `inboxDispatchCommand({ follow: true })` runs with a fake watcher, a recording sound, and a signal that aborts after one event
- **THEN** it prints `osq inbox`'s text, the waiting line, one line per new item, and resolves after the abort

#### Scenario: JSON refused
- **WHEN** `osq inbox --follow --json` runs
- **THEN** stderr holds `osq inbox: --follow prints text; drop --json` and the exit code is 1

### Requirement: Graph command
`osq graph --json` SHALL print `serializeWebJson` of `getSystemGraph` for the
current project, followed by a newline, to stdout. `osq graph` without
`--json` SHALL print three lines:

```
Nodes: <kind> <count>, ...
Edges: <kind> <count>, ...
Gaps: untested <n>, unclaimed <n>, unowned <n>
```

`Nodes` and `Edges` SHALL list only kinds with a count above zero, in the
order "System graph document" and "System graph links" list the kinds, with
`owns`, `proves`, `covers`, `serves`, and `follows` after `imports` in that
order. A failure, such as a config error, SHALL print its message to stderr
and exit one. The command SHALL write no file.

#### Scenario: JSON output
- **WHEN** `osq graph --json` runs in a fixture project
- **THEN** stdout parses to the same document `getSystemGraph` returns for that project

#### Scenario: Summary output
- **WHEN** `osq graph` runs in a project with two capabilities without sidecars, three requirements, and one unowned file
- **THEN** stdout starts with `Nodes: capability 2, requirement 3,` and its last line is `Gaps: untested 0, unclaimed 0, unowned 1`

### Requirement: Scaffolded harness default
`osq init` SHALL write `harness: process.env.OSQ_HARNESS || 'pi'` in
`osq.config.ts`, and the environment example it scaffolds SHALL start with
`OSQ_HARNESS=pi` and equal `templates/.env.example` byte for byte.

#### Scenario: Pi is the scaffolded default
- **WHEN** `osq init` runs in an empty directory
- **THEN** `osq.config.ts` contains `harness: process.env.OSQ_HARNESS || 'pi'` and the first line of the scaffolded environment example is `OSQ_HARNESS=pi`

#### Scenario: Scaffold copies match
- **WHEN** `osq init` runs in an empty directory
- **THEN** its scaffolded environment example equals `templates/.env.example`

### Requirement: Inbox card actions run in-process
`inboxDispatchCommand` SHALL take `isTerminal`, `input`, and `launch`
options, defaulting to both stdio streams being TTYs, the terminal input, and
`createActionLauncher` from `src/cli/inbox-actions.ts` built with the
command's `cwd`, loaded config, `stdout`, and `stderr`. When `isTerminal()`
is true and neither `json` nor `follow` is set, it SHALL run
`runCardSession` with the inbox sound built by `createInboxSound`.

`createTerminalInput(stream)` SHALL read one key at a time with raw mode on
while a key is awaited and off otherwise, and `line(question)` SHALL write
the question and read one line with raw mode off. A stream without
`setRawMode` SHALL still work. Each read SHALL resume the stream when it
starts, and when it ends remove its listeners and pause the stream, so
between reads the stream is paused, out of raw mode, and has no listener
of its own.

`createActionLauncher(inputs, actions?)` SHALL return a `Launcher` that runs
a card key's command in the same process, never through a child process,
calling the command function with `inputs` (`cwd`, `config`, `stdout`,
`stderr`):

- `approve <id>`: `approveCommand([id], inputs)`.
- `plan <id>`: `planCommand(id, inputs)`.
- `retry <id> <target>`: `retryCommand(id, target, inputs)`.
- `reject <id> --reason <text>`: `rejectCommand(id, { ...inputs, reason: text })`.
- `show <id>`: `showCommand(id, inputs)`.

It SHALL resolve 0 when the command resolves. When the command throws a
`CommandError`, it SHALL write the message and `\n` to `stderr` when the
message is not empty, then `Next: <next>\n` to `stdout` when `next` is set,
and resolve with the error's `exitCode`. Any other thrown value SHALL write
`Error: <message>\n` to `stderr` and resolve 1. Arguments that match no
entry, by verb or by count, SHALL write
`osq inbox: no action for <arguments joined by spaces>\n` to `stderr` and
resolve 1 without calling a command. The launcher SHALL never set
`process.exitCode`, end the process, or reject. `actions` SHALL default to
the table above; a test may pass its own table of the same shape.

#### Scenario: Terminal runs the session
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, scripted keys `q`, and a project with one approval item
- **THEN** the approval card with its `Keys:` block prints and the command resolves without launching

#### Scenario: No terminal prints
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` false
- **THEN** it prints what `osq inbox` printed before

#### Scenario: Raw mode around a key
- **WHEN** `createTerminalInput` reads a key from a fake stream with `setRawMode`
- **THEN** raw mode is turned on before the read and off after it

#### Scenario: Show in the same process
- **WHEN** `inboxDispatchCommand` runs with `isTerminal` true, the default launcher, scripted keys `s` then `q`, and a project with one approval item for change 001
- **THEN** stdout holds `── osq show 001 ──`, then `osq show`'s `Spec: 001-` line, then `── exit 0 ──`

#### Scenario: Failed approve carries on
- **WHEN** the same session gets keys `a` then `q`, and approving change 001 fails
- **THEN** stderr starts with `Error approving 001:`, stdout holds a `Next: ` line before `── exit 1 ──` and then the approval card again, and `process.exitCode` is what it was before

#### Scenario: Each verb reaches its command
- **WHEN** the default launcher runs `retry 999 1`, `reject 999 --reason r`, and `show 999` in a project with no change 999, and `plan 001` for a change with a brief
- **THEN** stderr starts with `Error retrying 999 1:`, `Error rejecting 999:`, and `Show error:` and each resolves 1, and `plan 001` prints the prompt handoff line and resolves 0

#### Scenario: Failures without a command error
- **WHEN** a launcher built with a test table runs an action that throws `new Error('boom')`, one that throws a `CommandError` with an empty message and exit code 3, and the arguments `land 001`
- **THEN** they resolve 1 with `Error: boom\n` on stderr, 3 with nothing on stderr, and 1 with `osq inbox: no action for land 001\n` on stderr without calling any action

#### Scenario: Terminal between reads
- **WHEN** `inboxDispatchCommand` runs with `createTerminalInput` over a fake stream holding `sq` and a recording launcher
- **THEN** while the launcher runs, the stream is paused, has no `data` listener, and the last raw mode set was off

### Requirement: Decisions scaffold
`osq init` SHALL write `<paths.decisions>/README.md` from
`templates/decisions/README.md` when that file is missing. It SHALL write
`<paths.decisions>/000-how-this-project-is-built.md` from
`templates/decisions/000-how-this-project-is-built.md` only when the decisions
folder is missing or holds no markdown file other than
`<paths.decisions>/README.md`. An existing file SHALL never be overwritten,
`--refresh-schema` included, and SHALL be reported as existing like the other
scaffolded files.

The starter SHALL have frontmatter `status: proposed` and `applies_to: all` and
no `rule`, the heading `# 000. How this project is built`, and one `## `
section per question, in this order: `Layering` (which layers exist, what
each may import, and where logic lives), `State` (where state lives and who
writes it), `Errors` (how errors are raised, reported, and recovered), `Tests`
(what a test looks like and what it may touch), and `Naming` (how files,
modules, and functions are named). A closing section SHALL say to turn each
answer that is a rule into an accepted ADR with `applies_to: all`, a
one-sentence `rule`, and `checks` naming a test wherever the rule can be
tested. The starter SHALL prescribe no answer.

#### Scenario: Fresh project
- **WHEN** `osq init` runs in an empty directory
- **THEN** `decisions/README.md` and `decisions/000-how-this-project-is-built.md` exist, both are in `createdFiles`, and `readDecisions` reads ADR `000` with status `proposed`

#### Scenario: Re-run keeps edits
- **WHEN** the starter has been edited and `osq init --refresh-schema` runs again
- **THEN** the starter keeps its edited bytes and is reported as existing

#### Scenario: Project with ADRs
- **WHEN** `osq init` runs in a project whose decisions folder holds `001-x.md` and no `decisions/README.md`
- **THEN** it writes `decisions/README.md` and no starter

### Requirement: Format command configuration
Configuration SHALL accept `gates.formatCommand`, an optional command that
contains `{files}`, which the watcher runs on a task's changed scoped files
before its verify, as watcher-and-harness "Format before verify" describes.
It SHALL be unset by default. A set value SHALL be kept trimmed; a value that
is not a string or does not contain `{files}` SHALL fail validation with
`gates.formatCommand must be a command containing {files}`.

The `osq.config.ts` that `osq init` writes SHALL hold, right after its
commented validator example, these three comment lines:

```
  // osq formats the files a task changed in its scope before running verify;
  // {files} becomes those files, each quoted.
  // gates: { formatCommand: 'npx prettier --write {files}' },
```

osq's own `osq.config.ts` SHALL set `gates.formatCommand` to
`pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}`.

#### Scenario: Unset by default
- **WHEN** `defineConfig({})` runs
- **THEN** `gates` has no `formatCommand`

#### Scenario: Format command kept
- **WHEN** configuration declares `gates.formatCommand: ' npx prettier --write {files} '`
- **THEN** resolved configuration holds `npx prettier --write {files}` and the other gate defaults

#### Scenario: Invalid format command
- **WHEN** `gates.formatCommand` is each value below
- **THEN** validation fails with `gates.formatCommand must be a command containing {files}`

| value |
| --- |
| `''` |
| `'npx prettier --write .'` |
| `5` |

#### Scenario: Init shows the key
- **WHEN** `osq init` scaffolds a project
- **THEN** its `osq.config.ts` holds the three comment lines right after the validator example, and loading it yields no `gates.formatCommand`

#### Scenario: osq formats its own tasks
- **WHEN** osq's own `osq.config.ts` is loaded
- **THEN** `gates.formatCommand` is `pnpm exec biome check --linter-enabled=false --write --no-errors-on-unmatched {files}`

### Requirement: Server commands
The CLI SHALL provide `osq server start` and `osq server stop`, in the "Setup
and running" help group.

`osq server start` SHALL fail before it starts anything with `osq server is
already running (pid <pid>). Log: <log>. Stop it with osq server stop` when
`readServerRecord` returns a live record; a process with `OSQ_SERVER_ROLE`
set is exempt from this check and from starting the watch service. Otherwise
it SHALL start the watch
service exactly as `osq watch --background` does, printing its line, when
`readWatchState` returns no live service or watcher record, and leave a live
one alone. It SHALL then spawn the same Node executable with its `execArgv`,
the `osq` entry it runs from, and `server start`, as a detached process with
`OSQ_SERVER_ROLE=supervisor`, its stdout and stderr appended to `server.log`;
write `server.json` with the child's pid, `startedAt`, the log path, and the
URL `http://127.0.0.1:<serve.server.port>/p/<project>/`; and print `osq server
is running in the background (pid <pid>) at <url>. Log: <log>`.

`osq server start` with `OSQ_SERVER_ROLE=supervisor` SHALL run
`runServiceSupervisor` with `service: 'server'`. With `OSQ_SERVER_ROLE=worker`
it SHALL run the server worker: `startWebServer` on `serve.server.port` with
`site` `{ name, project }` from "Server configuration" and a `runAction` from
`createWebActionRunner({ cwd, config }, createServerCommands())`, whose table runs
`approve`, `reject` and `retry` as `osq serve` does and runs `land` as
`landCommand(change, { ...inputs, publish: true })`. Every
`serve.server.buildCheckSeconds` the worker SHALL call a
`createServiceBuildCheck` check. On a settled new build, when no action
runs, it SHALL close the server and exit with `EXIT_NEW_BUILD`; while an
action runs, it SHALL wait for it to end first. A waiting build SHALL not stop
the worker. On SIGINT or SIGTERM the worker SHALL close the server after any
running action ends and exit 0.

`landCommand` SHALL take an optional `publish`. With it, the command SHALL
land through `landAndPublish` instead of `landChange`, with the same output,
refusals and exit codes otherwise. No CLI flag sets `publish`.

`osq server stop` SHALL send SIGTERM to a live server supervisor and wait up
to `watch.stopWaitSeconds` for it to exit, printing `osq server stopped (pid
<pid>)` when it exited, `osq server is stopping after its running action (pid
<pid>)` when it did not, and `osq server is not running` when there is no
live record. It SHALL then stop the watch service exactly as `osq watch
--stop` does, printing its line. `osq server` with no subcommand or another
one SHALL print the command's help and exit nonzero, as Commander does.

#### Scenario: Start and stop
- **WHEN** a user runs `osq server start` in a project with no live records, with `serve.server.port` set to a free port and `harness: 'mock'`, and then `osq server stop`
- **THEN** start prints the watch service line and `osq server is running in the background (pid <pid>) at http://127.0.0.1:<port>/p/<project>/. Log: <log>`, `GET <url>api/server` answers 200 with the project and a live watcher, and after stop `server.json` and `service.json` name no live pid

#### Scenario: Already running
- **WHEN** `server.json` names a live pid and the user runs `osq server start`
- **THEN** it fails with `osq server is already running (pid <pid>). Log: <log>. Stop it with osq server stop` and spawns nothing

#### Scenario: Watcher already running
- **WHEN** a terminal watcher's live `watcher.json` exists and the user runs `osq server start`
- **THEN** no watch service is started and the server starts

#### Scenario: Stop with nothing running
- **WHEN** no server and no watch service run and the user runs `osq server stop`
- **THEN** it prints `osq server is not running` and `osq watch is not running in the background`

#### Scenario: Server land publishes
- **WHEN** the server worker's runner runs `land` for change `001`
- **THEN** the land function it was built with is called once for change `001` with `publish: true` and the runner's `cwd` and config

### Requirement: Planning against a server
A planner working against a server SHALL edit a working copy of the change
folder at `<home>/.osq/remote/<host>/<project>/<folder>/`, with every `:` in
the host replaced by `-` and `<home>` the user's home folder.
`src/cli/remote-plan.ts` SHALL hold the client side.

On the server, a forwarded `plan` without `--next` SHALL run only for an
active change in the project's own tree that holds a `brief.md`; otherwise
it SHALL fail before `planCommand` runs with `osq plan <name> on a server
needs an unapproved change with a brief; queue the brief and run osq plan
--next`.

On the client, a forwarded `plan` with `--print` SHALL print the server's
output unchanged. Without it, the client SHALL collect the stdout; when the
command ends with exit code 0 and one line reads `<path>: ask your planning
tool to plan change <folder> — next: <next>`, it SHALL download the folder
from `api/files/<folder>`, replace the working copy with exactly the
downloaded files, and print that line as `<working copy>: ask your planning
tool to plan change <folder> — next: <next>`. Every other line SHALL be
printed unchanged.

A forwarded `lint` SHALL first upload, for each id it names, the working
copy whose folder name `matchesFolder` matches, with every file in it except
those under `.run/`, through `PUT api/files/<folder>`. When an upload is
refused, the command SHALL fail with the transport's error and lint nothing.
An id with no working copy SHALL be linted as the server holds it, and `lint`
with no ids SHALL upload nothing. Then it SHALL forward `lint` as every other
command is forwarded.

#### Scenario: Plan downloads a working copy
- **WHEN** the server's change `001-demo` holds `brief.md` and `.run/manifest.json`, and `osq plan 001` runs against it with home `<home>`
- **THEN** `<home>/.osq/remote/<host>/osq/001-demo/` holds the server folder's files, `plan-prompt.md` included and `.run/` left out, and stdout is `<that folder>: ask your planning tool to plan change 001-demo — next: <next>`

#### Scenario: Lint uploads the working copy
- **WHEN** after that plan the working copy's `proposal.md` changes, `tasks/1.md` is deleted and `tasks/2.md` is added, and `osq lint 001` runs
- **THEN** the server's folder holds exactly the working copy's files plus its own `.run/`, and the output is what `osq lint 001` prints on the server for that folder

#### Scenario: Refused upload stops lint
- **WHEN** the server's change `001-demo` has `.run/approved`, a working copy of it exists, and `osq lint 001` runs
- **THEN** it fails with `osq server at <base> refused the request (409): change 001-demo is approved; only an unapproved change's files move`, exits 1, and no lint runs

#### Scenario: Plan without a brief refused
- **WHEN** a forwarded `plan` names `demo`, which matches no change on the server
- **THEN** the runner resolves exit code 1 with `osq plan demo on a server needs an unapproved change with a brief; queue the brief and run osq plan --next`, and `planCommand` is not called

### Requirement: MCP command
The CLI SHALL provide `osq mcp`, registered by `registerMcpCommand` in
`src/cli/mcp.ts`, in the "Setup and running" help group after `server`. It
SHALL serve the planning tools to an
MCP client over stdio: one JSON-RPC message per line in, each answer as one
line of JSON out, and nothing else on stdout. `--cwd <dir>` SHALL name the
project folder, resolved to an absolute path, and default to the process
folder. When `readServerSetting(process.env)` returns a server, the tools
SHALL target it; otherwise they target the project. `forwardProgram` SHALL
leave `mcp` alone, so it runs on the planner's machine either way.

A line that is not JSON SHALL get `{ jsonrpc: '2.0', id: null, error: {
code: -32700, message: 'Parse error' } }`. `tools/call` requests SHALL run
one at a time in the order they arrive; every other request SHALL be
answered at once. When stdin ends, the command SHALL answer every request
it has read and exit 0. The instructions SHALL tell the client to run
`plan`, read `plan-prompt.md` and follow it, write only inside the change
folder, run `lint` until it passes, and leave approval to a human.

#### Scenario: A planning session over stdio
- **WHEN** the CLI, spawned from `src/cli/bin.ts`, runs `osq mcp --cwd <project>` for a temporary project with change `001-demo` holding `brief.md`, receives `initialize`, `notifications/initialized`, `tools/list`, then `tools/call` for `plan`, `write_file` of `tasks/1.md`, `read_file` of `tasks/1.md`, `write_file` of `../x.md` and `lint`, all written before any answer, and stdin closes
- **THEN** every stdout line parses as JSON, each request gets one answer with its id, `read_file` gives the text `write_file` wrote, `../x.md` fails with `path outside the change folder: ../x.md`, `plan-prompt.md` exists, and the command exits 0

#### Scenario: Not JSON
- **WHEN** `osq mcp` receives the line `not json` and stdin closes
- **THEN** it writes the parse error line and exits 0

### Requirement: Capability command
`createProgram` SHALL register, through `registerCapabilityCommand` in
`src/cli/capability.ts`, a `capability` command with the description
`generate the deltas that rename or split a capability into a change`, listed
last in the Plumbing help group. It SHALL have two subcommands:

- `rename <old> <new>`, described `move every requirement of <old> to <new>`.
- `split <old>`, described `move the requirements a map file names out of <old>`,
  with a required `--map <file>`, a YAML map read relative to the working
  directory.

Each SHALL take a required `--change <id>` and run `generateCapabilityMove`
through `capabilityRenameCommand` or `capabilitySplitCommand`. Each takes the
command inputs, as `landCommand` does, and loads `osq.config.ts` and reads
the map inside its error handling. On success it SHALL print `wrote <path>`
to stdout for each written path, relative to the change folder, then
`<n> file(s) outside the specs name <old>; proposal.md lists them`, and exit
zero. On any failure, a map that cannot be read or parsed included, it SHALL
print `Error: <message>` to stderr and exit one. With `OSQ_SERVER` set,
`osq capability` SHALL refuse as a local-only command.

#### Scenario: Rename through the CLI
- **WHEN** `osq capability rename gadgets widgets --change 002` runs in a project where `gadgets` has a living spec and `002` is unapproved
- **THEN** stdout is `wrote specs/gadgets/spec.md`, `wrote specs/widgets/osq.yml`, `wrote specs/widgets/spec.md`, then `<n> file(s) outside the specs name gadgets; proposal.md lists them`, and it exits zero

#### Scenario: Split through the CLI
- **WHEN** `osq capability split gadgets --map map.yml --change 002` runs with a valid `map.yml`
- **THEN** `002` holds the deltas "Generated move map" describes, and it exits zero

#### Scenario: Missing map file
- **WHEN** `--map missing.yml` names no file
- **THEN** it prints `Error: ` and the read failure to stderr, exits one, and writes nothing

#### Scenario: Help group
- **WHEN** `osq --help` prints
- **THEN** the Plumbing group lists `new`, `lint`, `queue`, `sync`, `message`, `migrate` and `capability`, in that order

### Requirement: Product description
The `description` in `package.json` SHALL be exactly `A spec-driven software
factory. You write briefs and tap decisions; osq plans, builds, verifies and
lands each change against living specs.` The root command's description in
`osq --help` SHALL be exactly `Spec-driven software factory: you brief and
decide; osq lands verified changes.`, which fits in commander's 80-column help
width so it prints on one line. Neither SHALL say `Strict spec queue`.

#### Scenario: Product description text
- **WHEN** `package.json`'s `description` and `createProgram().description()` are read
- **THEN** each equals its text below:

| Source | Text |
|---|---|
| `package.json` `description` | `A spec-driven software factory. You write briefs and tap decisions; osq plans, builds, verifies and lands each change against living specs.` |
| root command description | `Spec-driven software factory: you brief and decide; osq lands verified changes.` |

#### Scenario: Description on one help line
- **WHEN** `osq --help` is printed at commander's default 80-column width
- **THEN** the line `Spec-driven software factory: you brief and decide; osq lands verified changes.` appears whole on one line

### Requirement: Package hygiene and release distribution
The system SHALL package exclusively compiled CLI artifacts, staged dashboard
assets, templates, and legal metadata for npm distribution. The private React
and Vite workspace SHALL build production files into package-root `ui/dist`
through the root build used by `prepublishOnly`, and root `package.json` SHALL
list that directory in `files`.

React, React DOM, their type declarations, and Vite SHALL remain build-time
dependencies of the private UI workspace. The published CLI's runtime
dependency set SHALL gain no frontend or server package. All regular files
below staged `ui/dist` SHALL total no more than 1,000,000 bytes, enforced by
`pnpm verify` after a production UI build.

The repository and published package SHALL use Node 24 as their supported
major-version floor. Package engines, CI setup, and the UI workspace SHALL
agree on that baseline; CI SHALL resolve the maintained Node 24
LTS line rather than a Current release. At planning time the verified current
LTS patch is 24.21.0.

#### Scenario: Runtime executable version resolution
- **WHEN** `osq --version` is executed from the compiled binary
- **THEN** system dynamically reads version from `package.json` matching release metadata

#### Scenario: Packed dashboard assets
- **WHEN** the root package is built and packed
- **THEN** the tarball contains `ui/dist/index.html` and production assets but excludes UI source, tests, and workspace build dependencies

#### Scenario: Installed dashboard server
- **WHEN** the tarball is installed into an isolated consumer project
- **THEN** `osq serve` can return the packaged index without React or Vite appearing in the installed package's runtime dependencies

#### Scenario: Dashboard exceeds its budget
- **WHEN** staged UI regular files total more than one million bytes
- **THEN** the ordinary verification gate fails and reports the measured total

#### Scenario: Node toolchain alignment
- **WHEN** package metadata, CI, and workspace manifests are inspected
- **THEN** each names the Node 24 LTS baseline without retaining a Node 22-only setup

### Requirement: Capability-driven planner validation
Planner configuration SHALL remain optional and SHALL be resolved, validated,
and required only for an explicit `--session` planning path. Session selection
SHALL use explicit planner configuration when present and otherwise the
selected executor's catalog entry without borrowing another harness's model,
effort, or agent. Default prompt handoff and print mode SHALL not resolve a
planner or use configuration to attribute a brief or manifest.

The `osq.config.ts` that `osq init` generates SHALL hold no planner
configuration, so model choice for planning belongs to the tool in which the
author plans unless osq is explicitly asked to launch the session.

#### Scenario: Supported planner configuration
- **WHEN** `--session` uses planner settings supported by the selected catalog entry
- **THEN** validation returns normalized configuration and the session uses that harness's model and agent selection

#### Scenario: Unsupported planner setting
- **WHEN** `--session` supplies an optional setting unsupported by its selected harness
- **THEN** validation fails with an error naming the harness and unsupported setting

#### Scenario: Implicit planner selection
- **WHEN** `--session` is requested without a planner block
- **THEN** planning uses the selected executor's planner capabilities without borrowing settings from another harness

#### Scenario: Default handoff has no planner configuration
- **WHEN** an author prepares or prints a prompt without a planner block
- **THEN** planning succeeds without model selection and the default brief attribution is null

#### Scenario: Session uses planner configuration
- **WHEN** an author requests `--session`
- **THEN** supported planner settings are validated and selected through the canonical harness catalog before launch

## ADDED Requirements

### Requirement: Planner verify start rule
The managed planner block SHALL state that a task whose verify names a test it
creates declares `verify_starts: red`, that a new test file may share a verify
with existing tests, and that `any` is only for a task that can honestly start
either way.

#### Scenario: Planner block guidance
- **WHEN** `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it states the `red` rule for a task that creates the test its verify names, allows a new test next to existing ones in one verify, and limits `any` to honest either-way starts

### Requirement: osq's own version control configuration
osq's own `osq.config.ts` SHALL set `vcs.enabled` to true, `vcs.author` to
`osq <osq@noreply.invalid>`, and `vcs.prepare` to
`pnpm install --frozen-lockfile`.

#### Scenario: Own config
- **WHEN** `loadConfig` reads the repository root
- **THEN** `vcs.enabled` is true, `vcs.author` is `osq <osq@noreply.invalid>`, and `vcs.prepare` is `pnpm install --frozen-lockfile`

### Requirement: Capability relation planner bullet
`MANAGED_PLANNER_BLOCK` SHALL hold, under `### Parent spec` and right before
the bullet that starts `- Replacing a requirement's behavior`, this bullet:

```
- Every change relates to a capability: it writes a delta or names one in
  `features.reads`, and every read names a living capability or one the
  change creates. List each new capability in `creates` in the proposal
  frontmatter. Never invent a capability to avoid touching an existing one.
```

`PLANNER.md` and `templates/PLANNER.md` SHALL hold the block between their
`OSQ:START` and `OSQ:END` markers.

#### Scenario: Planner bullet
- **WHEN** `MANAGED_PLANNER_BLOCK`, `PLANNER.md`, and `templates/PLANNER.md` are read with line wrapping collapsed
- **THEN** each holds the bullet, before the `Replacing a requirement's behavior` bullet

### Requirement: osq's own capability sidecars
osq's own `osq.config.ts` SHALL set `capabilities.requireGroups` to true,
and every osq capability SHALL have a sidecar with the group the change
names: cli-foundation `platform`, spec-lint-and-approve and traceability
`planning`, watcher-and-harness and version-control `execution`, and
status-inspection, web-inspection, and metrics-and-reporting `inspection`.

#### Scenario: Own sidecars
- **WHEN** every `openspec/specs/<capability>/osq.yml` in the repository is read with `parseSidecar`
- **THEN** each parses with the group named here, and `loadConfig` on the repository root gives `capabilities.requireGroups` true

### Requirement: Codex scaffold guidance
The environment example `osq init` scaffolds SHALL describe, in comments,
Codex selection, its binary and model settings, and independent planning
configuration. Codex selection SHALL stay commented, and the example SHALL
contain no credentials or hard-coded recommended model.

#### Scenario: Scaffold preservation
- **WHEN** a clean project is scaffolded and later scaffolded again after its environment example is edited
- **THEN** the original generated example includes commented Codex guidance and the repeat run preserves consumer edits

### Requirement: osq's own validator configuration
osq's own `osq.config.ts` SHALL set
`validator: { harness: 'claude', model: 'claude-opus-5-5' }`, the model that
plans osq's changes, so a model other than the `pi` executor's judges them.

#### Scenario: Own validator
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `validator` is `{ enabled: true, harness: 'claude', model: 'claude-opus-5-5', timeoutSeconds: 900 }`

### Requirement: Change verify rerun configuration
Configuration SHALL accept `gates.changeVerifyReruns`, a non-negative integer
defaulting to 1: the most times the runner reruns a failing change-level
verify at one task boundary when its failing tests are unrelated to the task,
as watcher-and-harness "Change verify rerun after unrelated failures"
describes. `0` SHALL turn reruns off. A partial `gates` block SHALL keep the
default, and any other value SHALL fail validation with an error naming
`gates.changeVerifyReruns`.

#### Scenario: Default rerun count
- **WHEN** `defineConfig({})` or `defineConfig({ gates: { preSpawnVerify: 'off' } })` runs
- **THEN** `gates.changeVerifyReruns` is 1

#### Scenario: Reruns off
- **WHEN** configuration declares `gates.changeVerifyReruns: 0`
- **THEN** resolved configuration retains 0 while preserving the other gate defaults

#### Scenario: Invalid rerun count
- **WHEN** `gates.changeVerifyReruns` is -1, 1.5, `NaN`, or `'one'`
- **THEN** configuration validation fails with an error naming `gates.changeVerifyReruns`

### Requirement: Steering changelog entries
`CHANGELOG.md` SHALL hold an entry ending `(128)` that says what changed for
a stuck, blocked, or regressed change, and an entry ending `(129)` that says
what changed for a change the default branch stops. Each entry SHALL sit in a
section that a release section follows.

#### Scenario: Steering changelog entries
- **WHEN** `CHANGELOG.md` is read
- **THEN** its `(128)` entry names `stuck, blocked, or regressed`, `osq plan <id>`, `osq approve` and the first task that is not done, and its `(129)` entry names the default branch, `osq plan <id>`, a conflict and a merge

## REMOVED Requirements

### Requirement: Scope resolver upgrade guidance
**Reason**: It pins the README's Upgrading note, and the README is ungoverned.
**Migration**: None. The resolver behavior stays in watcher-and-harness.

### Requirement: Pi consumer guidance
**Reason**: It pins the README's Pi section, and the README is ungoverned.
**Migration**: None.

### Requirement: Planner verify start guidance
**Reason**: Its second sentence and its "README names the new reason and flag" scenario pin README wording, and the README is ungoverned.
**Migration**: "Planner verify start rule" keeps the planner block sentence and the "Planner block guidance" scenario word for word.

### Requirement: Claude consumer guidance
**Reason**: It pins the README's Claude Code section, and the README is ungoverned.
**Migration**: None.

### Requirement: Reference mutation setup
**Reason**: It pins the README's StrykerJS setup, and the README is ungoverned.
**Migration**: None.

### Requirement: osq runs its own changes under version control
**Reason**: Its walkthrough sentences and "Walkthrough" scenario pin the README's version control section, and the README is ungoverned.
**Migration**: "osq's own version control configuration" keeps the config sentence and the "Own config" scenario word for word.

### Requirement: Capability relation guidance
**Reason**: Its last sentence and its "README" scenario pin the README's Change folder section, and the README is ungoverned.
**Migration**: "Capability relation planner bullet" keeps the planner bullet text and the "Planner bullet" scenario word for word.

### Requirement: Capability sidecar guidance
**Reason**: Its last sentence and its "README" scenario pin the README's Change folder section, and the README is ungoverned.
**Migration**: "osq's own capability sidecars" keeps the config and sidecar sentences and the "Own sidecars" scenario word for word.

### Requirement: Spec command documentation
**Reason**: It pins the README's command list and executor description, and the README is ungoverned.
**Migration**: None.

### Requirement: Steering guidance
**Reason**: It pins the README's steering bullet, sync paragraph, loop diagram and inbox section, and the README is ungoverned.
**Migration**: "Steering changelog entries" keeps the CHANGELOG clause.

### Requirement: Codex guidance
**Reason**: It pins README wording and its "Honest support boundaries" scenario reads the README, and the README is ungoverned.
**Migration**: "Codex scaffold guidance" keeps the scaffolded environment example's part and the "Scaffold preservation" scenario word for word.

### Requirement: README command groups
**Reason**: It pins the README's Commands section, and the README is ungoverned.
**Migration**: None. "Grouped root help" still fixes the groups in `osq --help`.

### Requirement: osq validates its own changes
**Reason**: Its README sentence and "README section" scenario pin the README's Validator section, and the README is ungoverned.
**Migration**: "osq's own validator configuration" keeps the config sentence and the "Own validator" scenario word for word.

### Requirement: Architecture-first documentation
**Reason**: It pins the README's Install block and Architecture decisions section, and the README is ungoverned.
**Migration**: None.

### Requirement: Change verify rerun count
**Reason**: Its README paragraph and "README describes the rerun" scenario pin the README's Gates and permissions section, and the README is ungoverned.
**Migration**: "Change verify rerun configuration" keeps the configuration paragraph and the three configuration scenarios word for word.

### Requirement: README names changes waiting to land
**Reason**: It pins the README's Human Attention Inbox section, and the README is ungoverned.
**Migration**: None. status-inspection "Changes waiting to land in status" still says how an archived change waiting to land shows.

### Requirement: README describes the after-land command
**Reason**: It pins the README's version control configuration, and the README is ungoverned.
**Migration**: None. "After-land command configuration" still defines `vcs.afterLand`.

### Requirement: README intro describes the flow
**Reason**: It pins the README's intro, and the README is ungoverned.
**Migration**: None. "Product description" keeps the `package.json` and `osq --help` text.

