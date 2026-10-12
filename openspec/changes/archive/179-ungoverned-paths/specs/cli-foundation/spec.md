# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Ungoverned paths configuration
`osq.config.ts` MAY set `ungoverned`, path globs osq does not govern, matched
the way task `scope` patterns are. The resolved config SHALL hold
`ungoverned`, by default `['README*', 'docs/**', 'LICENSE*', '.gitignore',
'.env*']`. A project's list SHALL replace the default, trimmed, and `[]` SHALL
govern every path. `defineConfig` SHALL throw `ungoverned must be a list of
path globs` for anything but an array of non-empty strings.

#### Scenario: Default ungoverned paths
- **WHEN** `defineConfig({})` runs
- **THEN** `ungoverned` is `['README*', 'docs/**', 'LICENSE*', '.gitignore', '.env*']`

#### Scenario: A project list replaces the default
- **WHEN** `defineConfig` receives the row's `ungoverned`
- **THEN** the resolved `ungoverned` is the row's result

| ungoverned | result |
| --- | --- |
| `['notes/**']` | `['notes/**']` |
| `[' notes/** ', 'NOTICE*']` | `['notes/**', 'NOTICE*']` |
| `[]` | `[]` |

#### Scenario: Invalid ungoverned
- **WHEN** `defineConfig` receives the row's `ungoverned`
- **THEN** it throws `ungoverned must be a list of path globs`

| ungoverned |
| --- |
| `'notes/**'` |
| `['notes/**', '']` |
| `['notes/**', 5]` |
| `{}` |

### Requirement: Init shows ungoverned paths
The `osq.config.ts` that `osq init` writes SHALL hold, right after its
commented format command example, these three comment lines:

```
  // osq governs every path except these; a human edits them directly on the
  // default branch with no change. [] governs everything.
  // ungoverned: ['README*', 'docs/**', 'LICENSE*', '.gitignore', '.env*'],
```

#### Scenario: Init shows the ungoverned key
- **WHEN** `osq init` scaffolds a project
- **THEN** its `osq.config.ts` holds the three comment lines right after the format command example, and loading it yields the default `ungoverned`

### Requirement: Ungoverned paths in managed blocks
The executor protocol's "Where things live" section SHALL say that the paths
`ungoverned` in `osq.config.ts` lists belong to no capability, and that a
human edits them directly on the default branch with no change. The managed
`PLANNER.md` block SHALL tell planners never to write a requirement, scenario
or test that pins an ungoverned file, that a human edits those directly on the
default branch with no change, and that a task may edit one in its scope
without a delta.

#### Scenario: Fresh init names ungoverned paths
- **WHEN** `osq init` writes the managed blocks into a new project
- **THEN** `PLANNER.md` and the executor protocol in `AGENTS.md` each name `ungoverned` and say a human edits those paths directly on the default branch
