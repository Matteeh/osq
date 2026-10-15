## ADDED Requirements

### Requirement: Manual edits configuration
The `vcs` block MAY carry `manualEdits`, either `'keep'` or `'block'`. Unset
SHALL mean `keep`, and a loaded config SHALL carry `manualEdits` only when the
block sets it. Any other value SHALL fail loading with `vcs.manualEdits must be
"keep" or "block"`. `validateVcsConfig` in `src/core/foundation/config-vcs.ts`
SHALL resolve it.

#### Scenario: Manual edits modes
- **WHEN** `osq.config.ts` sets the row's `vcs` block
- **THEN** loading gives the row's result

| vcs block | result |
| --- | --- |
| `{ enabled: false }` | `vcs` is `{ enabled: false }` |
| `{ enabled: false, manualEdits: 'keep' }` | `vcs.manualEdits` is `keep` |
| `{ enabled: false, manualEdits: 'block' }` | `vcs.manualEdits` is `block` |
| `{ enabled: false, manualEdits: 'never' }` | fails with `vcs.manualEdits must be "keep" or "block"` |

### Requirement: Manual command
`osq manual <comment> [paths...]` SHALL run `manualCommand` in
`src/cli/manual.ts`, which calls `keepManualEdits` for the project of the
working directory, prints each returned line to stdout, and exits zero; a
refusal SHALL print its message to stderr and exit one. Its description SHALL
be `keep uncommitted edits as a manual change with a comment`. It SHALL run
locally whether or not `OSQ_SERVER` is set.

#### Scenario: Manual command keeps edits
- **WHEN** a git project with `vcs.enabled` has an edited tracked `osq.config.ts` and `osq manual "raise the verify timeout"` runs
- **THEN** it prints `Kept osq.config.ts as <short commit>` and exits zero

#### Scenario: Manual command refusal
- **WHEN** `osq manual "   "` runs in that project
- **THEN** it prints `osq manual needs a comment: osq manual "<why>"` on stderr and exits one

## MODIFIED Requirements

### Requirement: Grouped root help
`osq --help` SHALL print, after the description, the line `Run osq with no
command first: it shows what needs you.`, then the options, then the commands
in four groups in this order, each headed `<title> commands:`:

- Everyday: `inbox`, `plan`, `approve`, `land`, `retry`, `reject`, `manual`
- Setup and running: `init`, `setup`, `watch`, `server`, `mcp`
- Inspection: `status`, `show`, `report`, `digest`, `query`, `label`, `spec`, `graph`, `serve`, `doctor`, then each slice command of the group
- Plumbing: `new`, `lint`, `queue`, `sync`, `message`, `migrate`, `capability`

Each row SHALL keep commander's term and description.

#### Scenario: Root help groups
- **WHEN** a user runs `osq --help`
- **THEN** the output holds the bare-`osq` line, then `Everyday commands:` listing `inbox`, `plan`, `approve`, `land`, `retry`, `reject` and `manual` in that order, then the other three groups in order, and no `Commands:` or `Other commands:` heading
