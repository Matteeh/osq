## ADDED Requirements

### Requirement: Plan refuses before writing
`osq plan <name>` SHALL create a new change folder only after it has read the
brief. Before that read it SHALL refuse a finished change as "Planning a change
that needs steering" defines, then refuse an all-digit `<name>` that matches no
active, archived or rejected change with the message the scenario gives. Every
refusal and every brief read error SHALL leave the changes directory as it was.

#### Scenario: Plan with a brief it cannot read
- **WHEN** a human runs `osq plan order-flow` in a project with no change named `order-flow`, with the row's brief input
- **THEN** the command fails with the row's message and the changes directory holds the same folders as before:

| Brief input | Message |
|---|---|
| `--brief` naming a file that does not exist | the `ENOENT` error of reading that file |
| no `--brief`, and neither `VISUAL` nor `EDITOR` set | `No brief provided. Specify --brief <file> or set $EDITOR.` |

#### Scenario: Plan a number that names no change
- **WHEN** a human runs `osq plan 307 --brief <file>` with a readable brief in a project with no change numbered 307 in any location
- **THEN** the command fails with `osq plan 307 names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.` and the changes directory holds the same folders as before
