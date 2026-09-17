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
## Executing a spec

1. Read your task file, its parent `spec.md`, then only the docs listed under `features`. Nothing else.
2. Too big for one pass? Write why in `.run/results/<n>.md`, exit without code.
3. Read a previous result file for this task if present. Run the task's `verify`. Start from what fails.
4. Tests for each acceptance line before implementing.
5. Minimal code to pass. Stay inside `scope`.
6. Run the task's `verify` command before exiting.

## Exiting

Write `.run/results/<n>.md` first: changed, deviated, drift against `features/`, missing context, and for unfinished work which acceptance line is next. Omit empty sections. Then exit. One attempt. Never write to `features/`, `tasks.md`, or anything in `specs/` outside `.run/results/`. Do not ask questions.
<!-- OSQ:END -->
