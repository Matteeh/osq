## ADDED Requirements

### Requirement: Banned word warning
`collectBannedWordFindings` in `src/core/spec/banned-word-lint.ts` SHALL check
a task file against a `bannedWords` entry when an entry path and a task
`scope` entry overlap, either covering the other by `scopeCoversPath`, and
every delta spec when any task file is checked. It SHALL check inline code
spans, fenced code lines, and double-quoted text under a `#### Scenario:`
heading. A text holds the word when a token contains it, ignoring case,
unless the token holds `/` outside the entry's paths.

#### Scenario: Texts that hold a banned word
- **WHEN** the config sets `bannedWords: [{ word: 'legacy', paths: ['src/**'] }]` and task 1, whose `scope` is `[src/a.ts]`, holds the row's line
- **THEN** lint's warnings on `tasks/1.md` are the row's

| line | warnings |
| --- | --- |
| ``Set `legacyMode` to false.`` | `Banned word "legacy" in "legacyMode": bannedWords[0] bans it in src/**; name it another way` |
| ``Print `Mode: LEGACY (old)`.`` | `Banned word "legacy" in "Mode: LEGACY (old)": bannedWords[0] bans it in src/**; name it another way` |
| ``Run `tests/legacy-free.test.ts`.`` | none |
| ``Remove `src/legacy.ts`.`` | `Banned word "legacy" in "src/legacy.ts": bannedWords[0] bans it in src/**; name it another way` |
| `Drop the legacy flag.` | none |

#### Scenario: Fenced code and scenario quotes
- **WHEN** the config bans `legacy` in `src/**`, a task scopes `src/**`, the task file holds a fenced block with the line `type Mode = 'legacy' | 'new';`, and the change's delta spec has a scenario line `- **THEN** it prints "legacy mode"`
- **THEN** lint warns on the task file with text `type Mode = 'legacy' | 'new';` and on the delta spec with text `legacy mode`

#### Scenario: Scope that misses the ban
- **WHEN** the config bans `legacy` in `src/**`, the only task scopes `tests/a.test.ts`, and both its task file and the change's delta spec hold `` `legacyMode` ``
- **THEN** lint gives no banned word warning

#### Scenario: A glob scope that reaches the ban
- **WHEN** the config bans `legacy` in `src/core/**` and a task with `scope: [src/**]` holds `` `legacyMode` ``
- **THEN** lint warns on that task file naming `bannedWords[0]`

### Requirement: Banned word warning text
Lint SHALL warn once per distinct text per entry per file, task files in task
order, then delta specs by capability name, texts in file order. The warning
SHALL be on the file's repository-relative path and read `Banned word
"<word>" in "<text>": bannedWords[<index>] bans it in <paths>; name it another
way`, `<paths>` joined by `, `. It SHALL NOT change `valid`, `osq lint`'s exit
code, or approval; `bannedWords: []` gives none.

#### Scenario: Banned word warnings never block
- **WHEN** the config bans `legacy` in `src/**` and a task scoping `src/a.ts` holds `` `legacyMode` ``
- **THEN** `osq lint` prints the warning, reports the change valid, and exits zero
