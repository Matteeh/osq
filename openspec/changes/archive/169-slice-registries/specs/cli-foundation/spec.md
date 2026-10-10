# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Slice registry
Each slice SHALL register itself through one file, `src/<capability>/slice.ts`
or `src/kernel/<capability>/slice.ts`, that exports `slice`, a `Slice` named
after its folder. `SLICES` in `src/cli/slices.ts` SHALL be the one static
list of every such `slice`, sorted by name, and SHALL hold nothing else. It
starts empty. The port lives in `src/cli/slice-types.ts`, except
`SliceConfigBlock`, which lives in `src/core/foundation/config-slices.ts`:

```ts
export type HelpGroupTitle = 'Everyday' | 'Setup and running' | 'Inspection' | 'Plumbing';

export interface SliceCommand {
  readonly name: string;
  readonly group: HelpGroupTitle;
  /** Adds the command named `name` to `program`. */
  readonly register: (program: Command) => void;
}

export interface Slice {
  readonly name: string;
  readonly config?: readonly SliceConfigBlock[];
  readonly commands?: readonly SliceCommand[];
  readonly tools?: (target: McpTarget) => readonly McpTool[];
}

export interface SliceConfigBlock {
  /** The top-level `OsqConfig` key this block owns. */
  readonly key: string;
  readonly defaults: unknown;
  /** The resolved block for the user's raw value, or `undefined`; throws on an invalid value. */
  readonly resolve: (raw: unknown) => unknown;
}
```

`src/core/foundation/config.ts` imports `SLICES`, so a `slice.ts` SHALL NOT
reach `src/core/foundation/config.ts` or `src/cli/slices.ts` through its
static runtime imports, followed file to file through relative specifiers.
`import type` and `export type` lines do not count, and neither does
`import()`, so a slice loads its command and tool code through `import()`
inside a function. `tests/cli-slice-registry.test.ts` SHALL check the
registry against the folders and the import rule against every `slice.ts`.

#### Scenario: Registry matches the slice folders
- **WHEN** the registry check runs on a list of slice folders, each with the `slice` its `slice.ts` exports, and a registered list
- **THEN** it reports exactly these problems:

| Folders and their slice names | Registered names | Problems |
|---|---|---|
| `src/land` → `land`, `src/kernel/git` → `git` | `git`, `land` | none |
| `src/land` → `land` | none | `src/land/slice.ts is not in SLICES` |
| none | `land` | `SLICES lists land, which has no slice.ts` |
| `src/land` → `landing` | `landing` | `src/land/slice.ts names landing, not land` |
| `src/land` → `land`, `src/kernel/git` → `git` | `land`, `git` | `SLICES is not sorted by name` |

#### Scenario: Slice imports stay off the configuration module
- **WHEN** the import check reads a `slice.ts` and the files it imports
- **THEN** it reports the chain for a runtime import and nothing otherwise:

| `src/land/slice.ts` imports | Chain reported |
|---|---|
| `import { runLand } from './run.js'`, and `src/land/run.ts` has `import { loadConfig } from '../core/foundation/config.js'` | `src/land/slice.ts -> src/land/run.ts -> src/core/foundation/config.ts` |
| `export { runLand } from './run.js'`, with the same `run.ts` | `src/land/slice.ts -> src/land/run.ts -> src/core/foundation/config.ts` |
| `import type { OsqConfig } from '../core/foundation/config.js'` | none |
| `const run = async () => (await import('./run.js')).runLand()`, with the same `run.ts` | none |
| `import { SLICES } from '../cli/slices.js'` | `src/land/slice.ts -> src/cli/slices.ts` |

#### Scenario: osq's registry passes its own check
- **WHEN** the registry and import checks run on osq's `src/` tree and `SLICES`
- **THEN** neither reports a problem

### Requirement: Slice configuration blocks
`DEFAULT_CONFIG` SHALL be `composeDefaultConfig(base, SLICES)`, where `base`
is today's default object and `composeDefaultConfig` in
`src/core/foundation/config-slices.ts` returns a new object with `base`'s
keys in order, then each slice's config block keys with their `defaults`, in
registry order. A block key that `base` or an earlier block already holds
SHALL throw `slice <slice>: config key <key> is already defined`.
`defineConfig` SHALL end its result with
`resolveSliceConfig(config, SLICES)`, which maps each block key to
`resolve(config[key])`, so `resolve` validates the user's value and an
invalid one fails config loading as other blocks do. Every block's
`resolve(undefined)` SHALL deep-equal its `defaults`. A slice SHALL type its
key by augmenting `OsqConfig` from inside the slice, so neither `config.ts`
nor `config-user.ts` changes. Limits and timeouts SHALL stay in config,
never in code. With no block registered, `DEFAULT_CONFIG` and `defineConfig`
results SHALL be what they were before the registry existed.

#### Scenario: A slice block joins the defaults
- **WHEN** `composeDefaultConfig` runs on a base `{ harness: 'agy', limits: { maxScopeFiles: 8 } }` and the slices below
- **THEN** it returns the result below:

| Slices | Result |
|---|---|
| none | `{"harness":"agy","limits":{"maxScopeFiles":8}}` |
| `widgets` with block `widgets`, defaults `{ size: 3 }` | `{"harness":"agy","limits":{"maxScopeFiles":8},"widgets":{"size":3}}` |
| `widgets` with block `harness` | throws `slice widgets: config key harness is already defined` |
| `widgets` with block `widgets`, then `gizmos` with block `widgets` | throws `slice gizmos: config key widgets is already defined` |

#### Scenario: A slice block resolves the user's value
- **WHEN** `resolveSliceConfig` runs with slice `widgets`, whose block `widgets` has defaults `{ size: 3 }` and a `resolve` that merges a raw object over them and throws `widgets.size must be a positive integer` on a size that is not one
- **THEN** it returns the result below:

| User config | Result |
|---|---|
| `{}` | `{ widgets: { size: 3 } }` |
| `{ widgets: { size: 5 } }` | `{ widgets: { size: 5 } }` |
| `{ widgets: { size: -1 } }` | throws `widgets.size must be a positive integer` |

#### Scenario: Registered defaults match their resolution
- **WHEN** every config block of every slice in `SLICES` is read
- **THEN** its `resolve(undefined)` deep-equals its `defaults`

### Requirement: Slice commands
`createProgram(version, slices)` SHALL take `slices`, defaulting to
`SLICES`, and after registering its own commands call each slice command's
`register(program)` in registry order, then install the root help with
`configureGroupedHelp(program, commandGroups(slices))`. Before a `register`,
a command of that name already on the program SHALL throw
`slice <slice>: command <name> is already registered`; after it, a missing
command of that name SHALL throw
`slice <slice>: register did not add command <name>`. A slice command keeps
commander's own help and is neither forwarded nor refused when `OSQ_SERVER`
is set.

#### Scenario: A slice command joins its help group
- **WHEN** `createProgram('0.0.0', slices)` builds with a slice `widgets` whose command `widgets`, described `list the widgets`, declares the group `Plumbing`
- **THEN** the program has a `widgets` command, the last row of `Plumbing commands:` in the root help is `widgets` with that description, and `widgets --help` is commander's default help

#### Scenario: Slice commands placed by group
- **WHEN** `commandGroups` runs on the slices below
- **THEN** it returns `COMMAND_GROUPS` changed as below:

| Slices | Result |
|---|---|
| none | `COMMAND_GROUPS`, deep-equal |
| `widgets` with command `widgets` in `Plumbing` | `widgets` appended after `capability` in Plumbing |
| `widgets` with `widgets` in `Plumbing`, then `gizmos` with `gizmos` in `Plumbing` | `widgets`, then `gizmos`, after `capability` |
| `landing` with command `land` in `Everyday` | `COMMAND_GROUPS`, deep-equal |
| `landing` with command `land` in `Plumbing` | throws `slice landing: command land is listed under Everyday, not Plumbing` |

#### Scenario: A slice command that clashes or goes missing
- **WHEN** `createProgram('0.0.0', slices)` builds with the slice below
- **THEN** it throws the message below:

| Slice | Message |
|---|---|
| `widgets` with command `status` in `Inspection`, whose `register` adds nothing | `slice widgets: command status is already registered` |
| `widgets` with command `widgets` in `Plumbing`, whose `register` adds nothing | `slice widgets: register did not add command widgets` |

## MODIFIED Requirements

### Requirement: Help groups cover every command
`COMMAND_GROUPS` in `src/cli/help-groups.ts` SHALL hold the groups of the
commands `createProgram` registers itself, and `commandGroups(slices)` there
SHALL return them with each slice command added: a command `COMMAND_GROUPS`
already names keeps its place and SHALL declare that group, and any other is
appended to its declared group, in registry order.
`configureGroupedHelp(program, groups)` there SHALL install the root help in
`createProgram`, with `commandGroups` of its slices. Every registered command
SHALL appear exactly once in the root help. A registered command no group
names SHALL print under `Other commands:`, and `commandGroups(SLICES)` SHALL
name every registered command, so that heading never prints; a new built-in
command SHALL be added to `COMMAND_GROUPS`, and a slice command names its
group. A subcommand's `--help` SHALL print commander's default help,
unchanged.

#### Scenario: Every command once
- **WHEN** the root help is printed for the program `createProgram` builds
- **THEN** each of its registered commands starts exactly one row, and `commandGroups(SLICES)` names exactly the registered commands

#### Scenario: Subcommand help unchanged
- **WHEN** a user runs `osq land --help`
- **THEN** the output is commander's default help for `land`, with no group heading and no bare-`osq` line

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
- **THEN** its text is `<folder>: ask your planning tool to plan change 001-demo — next: <next>` and a newline, and the folder holds `plan-prompt.md`

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
