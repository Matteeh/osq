## ADDED Requirements

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

README's "Gates and permissions" SHALL describe the step in a "Formatting"
bullet, and osq's own `osq.config.ts` SHALL set `gates.formatCommand` to
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
