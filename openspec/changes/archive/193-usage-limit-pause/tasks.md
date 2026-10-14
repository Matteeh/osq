# Tasks

## 1. Adapters

- [x] 1. When Claude Code, OpenCode or Codex reports the account's usage limit, the adapter writes a usage_limit event

## 2. Pause marker

- [x] 2. When osq reads a usage limit, usage-pause.ts gives the pause time and reads and writes .run/paused.md, and gates.usageLimitWaitSeconds sets the wait

## 3. Watcher

- [x] 3. When an agent's run holds a usage_limit event, the watcher pauses every change until the reset and then reruns the same task with the same attempt

## 4. Next step

- [x] 4. When a running change holds an active pause, its next step reads running (paused until <time>) in osq show and osq status

## 5. Inbox

- [x] 5. When a task is paused, the inbox lists it under Running as paused until <time> in JSON, text and the dashboard home

## 6. Query

- [x] 6. When osq query runs, a pauses table lists every paused event of the archived changes after task_outcomes
