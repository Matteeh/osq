---
description: Autonomous task execution agent for osq
mode: all
permission:
  read: allow
  edit: allow
  bash: allow
  glob: allow
  grep: allow
  webfetch: deny
  websearch: deny
---

<!-- OSQ:START -->
## Executing a task

You were handed one task, `tasks/<n>.md`, from a change under `openspec/changes/`.

1. Read your task file, its parent `proposal.md`, then only the delta specs and capability specs it names. Nothing else.
2. Can't finish within your task's `scope`, or too big for one pass? Write what you need under `## Blocked` in `.run/results/<n>.md`, and exit without code.
3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails. A `verify` that names a file your task creates fails until that file exists, so starting red is expected.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Write only `.run/results/<n>.md` and files inside the task's `scope`; the task's `scope` wins over any other ownership rule you were given.
6. New test files are always allowed. Change a preexisting test only when the task sets `tests.modify: true` and the file is inside `scope`; any other test change kills the task.
7. Run the task's `verify` command before exiting. Then run the proposal's `verify`; the watcher runs both itself and kills the task if either fails.

## Exiting

Write `.run/results/<n>.md` first, with these headings in this order. Leave out any that would be empty.

- `## Changed`: what you changed.
- `## Deviated`: for the reviewer: what you did differently from the task, and why.
- `## Missing context`: for the planner: what the task lacked that you needed.
- `## Outside scope`: for the human: what you found broken outside your scope and left alone.
- `## Blocked`: for the human: what you need before this task can be finished within its scope.
- `## Next`: for unfinished work, the acceptance line to pick up next.

End the file with one line, `Touched: <path>, <path>`, listing every file you changed other than the result file, relative to the project root.

Then exit. One attempt. Do not ask questions.

## Where things live

- Living capability specs live under `openspec/specs/` as `<capability>/spec.md`. Never edit them; the watcher applies approved deltas at archive.
- In-flight changes live under `openspec/changes/<id>-<slug>/`: `proposal.md`, delta specs as `specs/<capability>/spec.md`, and one `tasks/<n>.md` per task.
- Executors never edit `tasks.md` or any file under `.run/` except their result file; those belong to the watcher and the human. Planners write `tasks.md` and the task files.
- Approval gate: only `osq approve`, run by a human, writes `.run/approved`. Verification gate: only the watcher's own `verify` run marks a task done.

## Planning a change

Planners follow `PLANNER.md`. When `osq plan` started you, `plan-prompt.md` in the selected change folder is your complete prompt; read it and follow it exactly.

- Write only inside that change folder.
- Run `osq lint <slug>` and fix every finding before you finish.
- Never run `osq approve`; approval belongs to a human.
<!-- OSQ:END -->
