## ADDED Requirements

### Requirement: Own folder name gate
After a task's `verify` passes and before the change-level verify runs, the
watcher SHALL read every file the task's measures name as changed in its
scope since the spawn, except paths under `openspec/`, and look in each for
the change's own folder name, the base name of the change folder, as
`findOwnFolderLines` in `src/watcher/own-folder-gate.ts` finds it:

- Comments are blanked first, scanning left to right: `/*` up to the next
  `*/`, or the end of the file, and `//` up to the end of its line. Quotes
  are not tracked, so a `//` inside a string also starts a comment.
- A match is the folder name with neither neighbour a letter, a digit, `_`
  or `-`, so another change's folder name, or a longer name that starts
  with this one, does not match.
- Each line with a match counts once, by its 1-based number.

When any file matches, the task SHALL die with reason `own_folder_path`,
a `dead` event and the marker
`---\nreason: own_folder_path\n---\nThese files name this change's folder, <folder>, whose path changes when the change archives:\n`,
one `- <path>:<line>` line per match, with paths sorted and lines ascending,
and `Reach the change folder through the OSQ_CHANGE environment variable.\n`.
It SHALL write no done marker, and the change-level verify SHALL not run.

#### Scenario: Own folder lines
- **WHEN** `findOwnFolderLines` reads the row's text, written with `\n` escapes, for the folder `042-alpha`
- **THEN** it gives the row's line numbers:

| Text | Lines |
|---|---|
| `const SLUG = '042-alpha';` | 1 |
| `// const SLUG = '042-alpha';` | none |
| `const a = 1; // 042-alpha` | none |
| `/* 042-alpha */` | none |
| `/*\n042-alpha\n*/\nconst b = 2;` | none |
| `x\nconst p = 'openspec/changes/042-alpha/specs';` | 2 |
| `const s = '041-beta';` | none |
| `const s = '042-alpha-two';` | none |
| `'042-alpha' /* a */ '042-alpha'\n'042-alpha'` | 1, 2 |
| `const u = 'http://x/042-alpha';` | none |

#### Scenario: Task naming its own folder dies
- **WHEN** `runTask` runs task 1 of an approved change `042-alpha` whose task scope is `tests/slug.test.ts` and whose task and proposal verify are `node verify.cjs`, a local script that exits 0, and the adapter writes the row's content to `tests/slug.test.ts`
- **THEN** the task ends as the row says; a dead task has `.run/dead/1.md` equal to `---\nreason: own_folder_path\n---\nThese files name this change's folder, 042-alpha, whose path changes when the change archives:\n- tests/slug.test.ts:1\nReach the change folder through the OSQ_CHANGE environment variable.\n`, a `dead` event with reason `own_folder_path`, and no `.run/done/1`

| Content | Outcome |
|---|---|
| `const SLUG = '042-alpha';\n` | dead |
| `// const SLUG = '042-alpha';\n` | done |
| `const SLUG = '041-beta';\n` | done |

## MODIFIED Requirements

### Requirement: Automatic retry
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `verify_path_missing`, `denied_dependency`,
`vcs_violation`, `scope_violation`, `own_folder_path`, `no_result`, `crashed`,
`timeout`, and `provider_unavailable`.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with exactly one `retry` event carrying `automatic: true`, and the watcher printed one automatic-retry line

#### Scenario: Missing verify path is retried
- **WHEN** a task dies with `verify_path_missing`
- **THEN** it is retried automatically once and the next attempt's prompt contains the missing path

#### Scenario: Denied dependency is retried
- **WHEN** a task dies with `denied_dependency` for `vue`
- **THEN** it is retried automatically once and the next attempt's prompt contains `vue`

#### Scenario: Ineligible reason
- **WHEN** a task dies with `spec_conflict`, `already_running`, or `verify_precondition`
- **THEN** it stays dead and no automatic `retry` event is appended

#### Scenario: Count exhausted
- **WHEN** a task that already had one automatic retry dies again with a new fingerprint and the count is 1
- **THEN** it stays dead until a human runs `osq retry`, after which it may be retried automatically once more

#### Scenario: Disabled
- **WHEN** `gates.autoRetries` is 0
- **THEN** no automatic retry happens, no task is marked stuck, and dead tasks behave as before

#### Scenario: Restart between death and retry
- **WHEN** the watcher stops after a death is recorded and before the retry, then starts again
- **THEN** the task is retried exactly once and runs once more

#### Scenario: Once mode
- **WHEN** `osq watch --once` performs an automatic retry
- **THEN** it continues and runs the retried task before exiting

#### Scenario: Scope violation is retried
- **WHEN** a task in a worktree dies with `scope_violation`
- **THEN** it is retried automatically once and the next attempt's prompt contains the violating file
