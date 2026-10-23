## MODIFIED Requirements

### Requirement: Planner file tool protocol instruction
The managed planner block in `PLANNER.md`, `templates/PLANNER.md` and `src/core/foundation/init-blocks.ts` SHALL instruct planners to write file contents with the file tool, never through a shell echo or heredoc, and SHALL allow a script to make mechanical edits whose result `osq lint` checks.

#### Scenario: Managed block includes file tool instruction
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** the text contains `Write file contents with the file tool, never through a shell echo or heredoc.` and `A script may make mechanical edits, such as one scope change across several task files;`
