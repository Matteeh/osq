## ADDED Requirements

### Requirement: Plan paste block
`src/core/foundation/plan-handoff.ts` SHALL export
`formatPlanPasteBlock(folderPath)` and
`formatPlanHandoff({ folderPath, nextStep, slashCommandId })`. Neither reads a
file, so the CLI, a server and the dashboard can give the same text.

`formatPlanPasteBlock` SHALL return the text a human pastes into a new agent
session to plan the change in `folderPath`: the line `You are the planner for
osq change <folder>.` and the line `Read <prompt path> and follow it exactly;
it is your complete prompt.`, each followed by a newline, where `<folder>` is
the folder's name and `<prompt path>` is `plan-prompt.md` joined to
`folderPath` with `path.join`.

`formatPlanHandoff` SHALL return these lines, each followed by a newline: the
handoff line `<folderPath>: ask your planning tool to plan change <folder> —
next: <nextStep>`, an empty line, `Paste this into a new agent session to plan
it:`, an empty line, and the two lines of the paste block. Only when
`slashCommandId` is not null SHALL it add an empty line and `In Claude Code,
/osq-plan <slashCommandId> does the same.`

#### Scenario: Paste block text
- **WHEN** `formatPlanPasteBlock('/p/openspec/changes/190-demo')` runs
- **THEN** it returns `You are the planner for osq change 190-demo.`, a newline, `Read /p/openspec/changes/190-demo/plan-prompt.md and follow it exactly; it is your complete prompt.` and a newline

### Requirement: Plan handoff with the paste block
The default handoff of `osq plan <name>` and `osq plan --next`, a change that
needs steering included, SHALL print `formatPlanHandoff` for the folder it
wrote `plan-prompt.md` into, with that change's next step. Its
`slashCommandId` SHALL be the change's id when `.claude/commands/osq-plan.md`
exists in the working directory and the folder sits directly in that
directory's changes folder, where the command looks for it, and null
otherwise. `--print` and `--session` SHALL print what they print today.

#### Scenario: Handoff with the Claude Code command
- **WHEN** `osq plan 001` runs in the default mode in a project that holds `.claude/commands/osq-plan.md` and whose change `001-demo` in its changes folder holds `brief.md`
- **THEN** stdout is exactly these lines, each followed by a newline, where `<folder>` is the change folder's path and `<next>` its next step:

| Line |
|---|
| `<folder>: ask your planning tool to plan change 001-demo — next: <next>` |
| (empty) |
| `Paste this into a new agent session to plan it:` |
| (empty) |
| `You are the planner for osq change 001-demo.` |
| `Read <folder>/plan-prompt.md and follow it exactly; it is your complete prompt.` |
| (empty) |
| `In Claude Code, /osq-plan 001 does the same.` |

#### Scenario: Handoff without the Claude Code command
- **WHEN** the same command runs in a project without `.claude/commands/osq-plan.md`
- **THEN** stdout is exactly the first six of those lines, each followed by a newline

#### Scenario: Queue handoff gives the same block
- **WHEN** `osq plan --next` creates a change from an eligible queue item in a project that holds `.claude/commands/osq-plan.md`
- **THEN** stdout ends with the handoff line, the paste block for the new folder, an empty line and `In Claude Code, /osq-plan <id> does the same.` with the new change's id, laid out as "Handoff with the Claude Code command" shows

#### Scenario: Steered change in its worktree
- **WHEN** `osq plan 001` runs for a change that needs steering and whose folder is in its worktree, in a checkout that holds `.claude/commands/osq-plan.md`
- **THEN** stdout's handoff line and paste block name the worktree folder, and no line holds `/osq-plan`

## MODIFIED Requirements

### Requirement: Interactive planning command
The CLI SHALL provide `osq plan <name> [--brief <file> | -] [--session | --print]`
and `osq plan --next [--session | --print]` to prepare an ordinary or
queue-selected change. Every mode SHALL build the same five ordered prompt
sections: complete `PLANNER.md`, change identity, capability spec paths,
complete brief, and `This repository's record` derived from the 20 most recent
archived changes under the established bounded rules. When the archive holds
enough task history, as metrics-and-reporting "What history says in the plan
prompt" defines, every mode SHALL add `## What history says` after the record.
When the recent archived changes hold any executor disclosure, every mode
SHALL add `## Recent executor disclosures` after those, as the last section.

Without `--session` or `--print`, planning SHALL create `plan-prompt.md` from
those exact prompt bytes, record `planner: null` in brief frontmatter, avoid
constructing or spawning a harness adapter, and print the handoff that "Plan
handoff with the paste block" defines, which starts with one line containing the folder path
and `ask your planning tool to plan change <slug>`. Queue item
selection, dependency projection, hashes, replanning, and halt rules SHALL stay
unchanged.

`--session` SHALL preserve the existing planner selection, brief attribution,
interactive process, and owned telemetry behavior. `--print` SHALL emit the
same prompt exclusively to stdout without writing `plan-prompt.md`, launching a
process, or recording telemetry.

#### Scenario: New change interactive planning session
- **WHEN** a user executes `osq plan <name> --session` with a usable brief
- **THEN** the system creates the change and brief, builds the five ordered prompt sections, and spawns the selected interactive planner

#### Scenario: Resuming existing change planning session
- **WHEN** a user executes `osq plan <id> --session` on an existing change with `brief.md`
- **THEN** the system reuses the folder and launches a fresh interactive session with the same five-section prompt contract

#### Scenario: Small repository record
- **WHEN** fewer than five measured tasks exist in the recent archive window
- **THEN** every planning mode keeps the established record-too-small fifth section and contains no partial repository record

#### Scenario: Ordinary prompt handoff
- **WHEN** a user executes `osq plan <name> --brief <file>` in the default mode
- **THEN** the change contains a null-attributed brief and complete prompt file, stdout gives the handoff with its paste block, and no harness or planning record is created

#### Scenario: Queue prompt handoff
- **WHEN** a user executes `osq plan --next` with an eligible item
- **THEN** exactly that item becomes planned through the existing queue semantics and receives the same prompt-file handoff

#### Scenario: Explicit osq-owned session
- **WHEN** either planning form includes `--session`
- **THEN** the configured interactive planner, model-attributed brief, and lifecycle telemetry behave as before

#### Scenario: Print mode outputs prompt to stdout
- **WHEN** either planning form includes `--print`
- **THEN** the complete five-section prompt is written exclusively to stdout without a prompt file, interactive process, or telemetry

#### Scenario: Disclosures section
- **WHEN** a recent archived change's result file holds a real disclosure section
- **THEN** every planning mode's prompt ends with `## Recent executor disclosures` after the repository record, and a prompt without disclosures is unchanged

### Requirement: Plan handoff next step
The handoff line, the first line the `osq plan` prompt handoff prints, SHALL
end with ` — next: <next step>` for the change it hands off.

#### Scenario: Fresh handoff
- **WHEN** `osq plan <name>` hands off a new change 021
- **THEN** its handoff line ends with ` — next: unplanned — osq plan 021`

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
downloaded files, print every line before that one unchanged, and in place
of that line and everything after it print `formatPlanHandoff` for the
working copy with `<next>` and no Claude Code command, as "Plan paste block"
defines. Without such a line, every line SHALL be printed unchanged.

A forwarded `lint` SHALL first upload, for each id it names, the working
copy whose folder name `matchesFolder` matches, with every file in it except
those under `.run/`, through `PUT api/files/<folder>`. When an upload is
refused, the command SHALL fail with the transport's error and lint nothing.
An id with no working copy SHALL be linted as the server holds it, and `lint`
with no ids SHALL upload nothing. Then it SHALL forward `lint` as every other
command is forwarded.

#### Scenario: Plan downloads a working copy
- **WHEN** the server's change `001-demo` holds `brief.md` and `.run/manifest.json`, and `osq plan 001` runs against it with home `<home>`
- **THEN** `<home>/.osq/remote/<host>/osq/001-demo/` holds the server folder's files, `plan-prompt.md` included and `.run/` left out, and stdout is exactly these lines, each followed by a newline:

| Line |
|---|
| `<that folder>: ask your planning tool to plan change 001-demo — next: <next>` |
| (empty) |
| `Paste this into a new agent session to plan it:` |
| (empty) |
| `You are the planner for osq change 001-demo.` |
| `Read <that folder>/plan-prompt.md and follow it exactly; it is your complete prompt.` |

#### Scenario: Lint uploads the working copy
- **WHEN** after that plan the working copy's `proposal.md` changes, `tasks/1.md` is deleted and `tasks/2.md` is added, and `osq lint 001` runs
- **THEN** the server's folder holds exactly the working copy's files plus its own `.run/`, and the output is what `osq lint 001` prints on the server for that folder

#### Scenario: Refused upload stops lint
- **WHEN** the server's change `001-demo` has `.run/approved`, a working copy of it exists, and `osq lint 001` runs
- **THEN** it fails with `osq server at <base> refused the request (409): change 001-demo is approved; only an unapproved change's files move`, exits 1, and no lint runs

#### Scenario: Plan without a brief refused
- **WHEN** a forwarded `plan` names `demo`, which matches no change on the server
- **THEN** the runner resolves exit code 1 with `osq plan demo on a server needs an unapproved change with a brief; queue the brief and run osq plan --next`, and `planCommand` is not called

### Requirement: MCP planning tools
`createMcpTools(target, slices)` in `src/cli/mcp-tools.ts` SHALL give exactly
these tools in this order, then the tools each slice's `tools(target)` gives,
in registry order, and none other. `slices` defaults to `SLICES`. `target` is
`{ kind: 'local', cwd }` or `{ kind: 'remote', server, home? }`.

| Tool | Arguments | Runs |
|---|---|---|
| `plan` | `change` | `osq plan <change>` |
| `list_files` | `change` | "MCP file tools" |
| `read_file` | `change`, `path` | "MCP file tools" |
| `write_file` | `change`, `path`, `text` | "MCP file tools" |
| `edit_file` | `change`, `path`, `old_text`, `new_text` | "MCP file tools" |
| `delete_file` | `change`, `path` | "MCP file tools" |
| `spec` | `capability?`, `requirement?` | `osq spec [capability] [requirement]` |
| `query` | `select?` | `osq query [select]` |
| `lint` | `change` | `osq lint <change>` |

Each `inputSchema` SHALL be a JSON Schema object listing the arguments as
strings, the ones without `?` required, with `additionalProperties: false`.
No tool, a slice's included, SHALL approve, land, reject, retry, sync, or
write outside one change folder. A slice tool whose name an earlier tool
already has SHALL throw `slice <slice>: tool <name> is already defined`.

A command tool SHALL send `{ command, args, options: {} }`, with a missing
argument as null. Locally it SHALL run through `createForwardedRunner(cwd)`
from `src/cli/remote-commands.ts`, so it calls the command function the CLI
calls, and `plan` keeps that runner's refusal of a change with no brief.
Against a server, `plan` SHALL run through `planOnServer`, which replaces
the working copy, `lint` through `lintOnServer`, which uploads it first, and
the others through `runOnServer`, each with `home`. The tool's text SHALL be
every stdout and stderr chunk in the order they arrived, then, when the
command fails, its error and a newline when it has one and `Next: <next>`
and a newline when it has a next step, as `runCli` prints them. `isError`
SHALL be true exactly when the exit code is not 0.

#### Scenario: Tools give the CLI's text
- **WHEN** each tool below runs locally on a fixture project with change `001-demo`, and the same command runs by calling its command function with string writers
- **THEN** the tool's text is that stdout and stderr in arrival order, and `isError` is true exactly when the command failed:

| Tool | Arguments | Command |
|---|---|---|
| `spec` | `{}` | `osq spec` |
| `query` | `{}` | `osq query` |
| `lint` | `{ change: '001' }` | `osq lint 001` |

#### Scenario: Plan prepares the prompt
- **WHEN** the `plan` tool runs locally for change `001`, which holds `brief.md`
- **THEN** its text is what `planCommand('001')` prints there with string writers: `<folder>: ask your planning tool to plan change 001-demo — next: <next>` and a newline, then the rest of the handoff "Plan paste block" defines for `<folder>`, and the folder holds `plan-prompt.md`

#### Scenario: Planning against a server
- **WHEN** the tools target a server built with `startWebServer`, a site and `createForwardedRunner` over a fixture project whose change `001-demo` holds `brief.md`, and `plan`, `write_file` of `tasks/2.md`, and `lint` run for `001` with home `<home>`
- **THEN** `plan` fills `<home>/.osq/remote/<host>/osq/001-demo/`, `write_file` writes there, and after `lint` the server's folder holds `tasks/2.md` and the lint text is what `osq lint 001` prints on the server

#### Scenario: No tap tools
- **WHEN** the tool names `createMcpTools` gives for an empty slice list are read
- **THEN** they are exactly `plan`, `list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`, `spec`, `query` and `lint`

#### Scenario: Slice tools follow the planning tools
- **WHEN** `createMcpTools(target, slices)` runs with the slices below
- **THEN** it gives the tool names below, and each `tools` receives that same `target`:

| Slices | Tool names |
|---|---|
| none | the nine planning tools |
| `widgets` giving `widget_list` | the nine, then `widget_list` |
| `widgets` giving `widget_list`, then `gizmos` giving `gizmo_list` | the nine, then `widget_list`, `gizmo_list` |
| `widgets` giving `lint` | throws `slice widgets: tool lint is already defined` |
