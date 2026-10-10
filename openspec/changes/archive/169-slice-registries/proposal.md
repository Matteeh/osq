---
title: Each slice registers its own config, command, help and MCP tools
depends_on: ["167"]
verify: pnpm verify
features:
  reads: [status-inspection, web-inspection]
---
## Goal

ADR 016 decision 3 says each slice exports one `slice.ts` naming its config
defaults, its commands with their help group, and its MCP tools, and one
static list in the `cli` kernel imports every `slice.ts`. Today every
feature edits the same four lists instead: `DEFAULT_CONFIG` in
`src/core/foundation/config.ts`, the registrations in `createProgram`,
`COMMAND_GROUPS` in `src/cli/help-groups.ts`, and `createMcpTools` in
`src/cli/mcp-tools.ts`. Two changes to different features conflict there.

This change builds the seam. It adds the `Slice` port, the static list
`SLICES` in `src/cli/slices.ts` (empty, because no slice has moved yet), and
makes each of the four lists take what the registered slices add. With
`SLICES` empty, every seam adds nothing, so `osq --help`, every command's
help, `DEFAULT_CONFIG`, `defineConfig` and the MCP tool list stay
byte-identical. Once this lands, adding a command, config block or tool to a
slice edits only that slice's `slice.ts`, and adding a slice adds one line to
`SLICES`.

Per ADR 016 decision 7, the new files go where their capability's code is
today: the list and the port in `src/cli/`, the config merging in
`src/core/foundation/`.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test (the new registry, config,
command and tool tests, plus the help, MCP, import-graph and budget tests that
pin today's output), and lint, on the final tree.

## Non-goals

- Moving any existing command, config block or tool into a slice. Each slice's
  move change does that.
- Watcher hooks in `slice.ts`. The first move that needs one adds the field.
- Forwarding slice commands to a server. A slice command runs locally even
  with `OSQ_SERVER` set, as `osq mcp` does today.
- Changing README's command list or its test.

## Surface

None

## Decisions

- ADR 001: the registry is a static import list checked by a test, with no runtime discovery, so jiti loads `osq.config.ts` as before.
- ADR 004: unchanged; no validator call is touched.
- ADR 005: unchanged; no validator call is touched.
- ADR 010: unchanged; validator config stays where it is until the validate slice moves.
- ADR 012: unchanged; the watch commands keep their registration until the watch slice moves.
- ADR 015: a slice's MCP tools follow the same rule as the nine planning tools: they write only inside one unapproved change folder, and none approves, lands, rejects, retries or syncs.

## Assumptions

- `tests/import-graph.test.ts` gets one exception: `src/core/foundation/config.ts` may import `src/cli/slices.ts`. ADR 016 decision 2 makes config merge slice defaults, and the layer rules end as slices move.
- A `slice.ts` whose static imports reach `config.ts` would create an import cycle that crashes at startup. The registry test refuses one, so a slice loads its command and tool code through `import()` inside functions.
- A slice adds its config key to `OsqConfig` by TypeScript module augmentation from inside the slice, so `config.ts` and `config-user.ts` need no edit.

## Contract

The cli-foundation delta below is the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: ADDED "Slice registry", "Slice configuration blocks", "Slice commands"; MODIFIED "Help groups cover every command", "MCP planning tools".

Each file belongs to one task. Task 1 owns the port and list
(`src/cli/slice-types.ts`, `src/cli/slices.ts`), which tasks 2 and 3 read
but do not edit.
