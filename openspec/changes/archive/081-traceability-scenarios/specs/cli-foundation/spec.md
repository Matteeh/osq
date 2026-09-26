# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Traceability configuration
<!-- source: src/core/foundation/config.ts, src/core/foundation/config-traceability.ts, src/core/foundation/config-user.ts, tests/traceability-config.test.ts -->
`osq.config.ts` MAY set `traceability.capabilities` to `'all'` or a list of
capability names, and `traceability.mode` to `warn` or `require`. The resolved
config SHALL always hold `traceability`, defaulting to
`{ capabilities: [], mode: 'warn' }`, with a partial block keeping each
missing default. `defineConfig` SHALL throw
`traceability.capabilities must be 'all' or a list of capability names` or
`traceability.mode must be one of warn, require` for any other value.

#### Scenario: Default opts nothing in
- **WHEN** `osq.config.ts` has no `traceability` block
- **THEN** the resolved config holds `{ capabilities: [], mode: 'warn' }`

#### Scenario: Invalid mode
- **WHEN** `traceability.mode` is `strict`
- **THEN** `defineConfig` throws `traceability.mode must be one of warn, require`

### Requirement: Testing package subpath
<!-- source: package.json, tests/trace-helper.test.ts -->
`package.json` SHALL export `./testing`, with `types` at
`./dist/testing/index.d.ts` and `import` at `./dist/testing/index.js`, beside
the existing `.` export. It SHALL add no runtime dependency.

#### Scenario: Subpath resolves after build
- **WHEN** `pnpm build` has run
- **THEN** both files the `./testing` export names exist

### Requirement: Traceability instruction blocks
<!-- source: src/core/foundation/traceability-block.ts, src/core/foundation/init.ts, src/core/foundation/doctor-managed.ts, tests/trace-blocks.test.ts -->
When at least one capability is opted in, `osq init` SHALL write a block
between `<!-- OSQ:TRACEABILITY:START -->` and `<!-- OSQ:TRACEABILITY:END -->`
directly after the managed block's `<!-- OSQ:END -->` line. It goes in
PLANNER.md and in AGENTS.md, or at the end of a file without a managed block.
With none opted in, `osq init` SHALL remove any such block and leave both files
otherwise unchanged. `<scope>` below is `every capability` for `'all'` and
otherwise the opted-in names joined by `, `.

The PLANNER.md block SHALL read:

```
## Traceability

Traceability covers <scope>.

- Under `## Scenarios` in each task, list the scenarios its tests prove as `- <capability>: <scenario name>`, and scope their test files.
- Give a scenario with more than one case a table of exact inputs and outputs directly under its THEN.
- Put every test that names a modified scenario in its task's scope with `tests.modify: true`; `osq lint` lists them.
- Have exported functions tagged with `@scenario` and `@adr`.
```

The AGENTS.md block SHALL read:

```
## Traceability

For <scope>:

- Prove each scenario with `import { scenario } from '@matteeh/osq/testing'` and `scenario('<capability>', '<scenario name>', { covers: fn }, ({ run, then, each }) => ...)`, with literal names. Call `fn` only through `run`.
- Take expected values from the scenario's THEN lines and tables, never from running the code.
- Check a table with `each`. Check a rule that holds for every input with a property test inside `then`.
- Tag each exported function you add or change in a doc comment directly above `export function` or `export const <name> = (...) =>`: one `@scenario <capability>: <scenario name>` line per scenario it serves and one `@adr <number>` line per decision it follows.
```

`osq doctor` SHALL fail with
`` <file> traceability block is missing; run `osq init` ``,
`` <file> traceability block is out of date; run `osq init` ``, or
`` <file> has an unexpected traceability block; run `osq init` ``
when either file's block differs from the canonical one.

#### Scenario: Opted in
- **WHEN** `traceability.capabilities` is `['pricing']` and `osq init` runs
- **THEN** AGENTS.md and PLANNER.md each hold their block naming `pricing`, directly after `<!-- OSQ:END -->`

#### Scenario: Not opted in
- **WHEN** no capability is opted in and `osq init` runs
- **THEN** AGENTS.md and PLANNER.md are byte for byte what they were before this change, and `osq doctor` reports no traceability problem
