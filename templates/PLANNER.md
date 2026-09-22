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
- `osq init` and `osq new` seed `verify: node -e "process.exit(0)"` as a
  planning sentinel, not trusted coverage. `osq lint` rejects it; replace it
  before approval with a command that verifies the completed change's final tree.
- Every task's `verify` exercises its slice through the real entry point, wiring
  included. If closing the loop requires a file outside the task's `scope`, the
  scope is wrong; widen it or merge the task. An executor result that says the
  work is outside its scope is a planning failure.
- Every task's `verify` must stay re-runnable against the final tree of the
  completed change, because the watcher and archive recertification run it there
  after later tasks land. A command that passes only mid-change is a planning
  failure.
- A file belongs to one task. A later task may extend it only when it must; order
  that later task after the owner and name the shared file in the proposal.
- Task bodies carry acceptance lines and the names of existing code to reuse,
  without signature blocks, numbered implementation steps, or line numbers. Write
  full signatures only for ports.
- Refer to functions and files by name, never by line number.

### Parent spec

- `## Goal`, then the change-level `verify` every proposal declares as the first
  thing written after the goal, then `## Non-goals` and the contract as
  requirements with scenarios.
- The delta is the exact text the capability spec will contain after the change,
  never an instruction to update something.
- Anything a task must not do itself goes under `## Human steps`.
<!-- OSQ:END -->