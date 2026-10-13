## ADDED Requirements

### Requirement: Banned words configuration
`osq.config.ts` MAY set `bannedWords`, entries `{ word, paths }` naming a word
the project bans from its code and the `scope`-style globs the ban covers. The
resolved config SHALL hold it, trimmed, by default `[]`. `defineConfig` SHALL
throw `bannedWords must be a list of { word, paths } entries` unless each
entry has a non-empty `word` and a non-empty `paths` list of non-empty
strings.

#### Scenario: No banned words by default
- **WHEN** `defineConfig({})` runs
- **THEN** `bannedWords` is `[]`

#### Scenario: A project bans words
- **WHEN** `defineConfig` receives the row's `bannedWords`
- **THEN** the resolved `bannedWords` is the row's result

| bannedWords | result |
| --- | --- |
| `[{ word: 'legacy', paths: ['src/**'] }]` | `[{ word: 'legacy', paths: ['src/**'] }]` |
| `[{ word: ' legacy ', paths: [' src/** ', 'lib/**'] }]` | `[{ word: 'legacy', paths: ['src/**', 'lib/**'] }]` |
| `[]` | `[]` |

#### Scenario: Invalid banned words
- **WHEN** `defineConfig` receives the row's `bannedWords`
- **THEN** it throws `bannedWords must be a list of { word, paths } entries`

| bannedWords |
| --- |
| `'legacy'` |
| `['legacy']` |
| `[{ word: '', paths: ['src/**'] }]` |
| `[{ word: 'legacy' }]` |
| `[{ word: 'legacy', paths: [] }]` |
| `[{ word: 'legacy', paths: ['src/**', ''] }]` |

### Requirement: Banned words in the planner block
The managed `PLANNER.md` block SHALL tell planners, under "Tasks", that the
words a project bans from its code are listed in `bannedWords` in
`osq.config.ts` with the paths each covers, that a plan never names one where
a task would write it, and that `osq lint` warns when a task file or delta
spec holds one in code.

#### Scenario: Fresh init names banned words
- **WHEN** `osq init` writes the managed blocks into a new project
- **THEN** `PLANNER.md` names `bannedWords` and says `osq lint` warns about a banned word in a task file or delta spec
