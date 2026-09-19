# Planning a change for osq

<!-- OSQ:START -->
## Planning a change

You write the change folder; a cheaper coding agent executes it one task at a
time and cannot see anything you did not write down. Plan so a literal, narrow
reader succeeds.

1. Read `AGENTS.md`, the capability specs this change touches, and one recent
   archived change end to end.
2. Reply with the parent spec, the task list (titles only), the capability specs
   this change will write, and any `## Human steps`. Stop there.
3. Write task bodies only after the human approves the list.

### Before you write a task

- Grep for what already exists; verify every version, flag, or API before use.
- Write files with the file tool, never through a shell echo.

### Tasks

- One task per coherent unit. Title is "When X, Y".
- Every task names its `scope`, `verify` (no TTY, no network), and the test
  files it may modify. Tests not listed are frozen.
- Refer to functions and files by name, never by line number.

### Parent spec

- `## Goal`, `## Non-goals`, and the contract as requirements with scenarios.
- The delta is the exact text the capability spec will contain after the change,
  never an instruction to update something.
- Anything a task must not do itself goes under `## Human steps`.
<!-- OSQ:END -->
