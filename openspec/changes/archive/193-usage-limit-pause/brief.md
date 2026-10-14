---
queue_item: usage-limit-pause
queue_hash: sha256:c37376315a357865dc39b3113b502ccfc147e83f516a7ec19ecc5f8664647b6d
planner: null
date: 2026-10-14
---

### Goal

When an executor stops because the account hit its usage limit, osq waits until the limit resets and runs the task again. That run does not use up an attempt and does not halt the change. The inbox and the Change page show "paused until <time>", which is not a failure and needs nothing from the human.

### Context

As of 2026-10-14:

- Nothing in `src/` recognises a usage limit. A task that hits one ends as whatever the run looks like, most likely `crashed` or `no_result`, uses up an attempt, and can halt the change after the configured attempts.
- `task_outcomes` in `osq query` holds 5 `crashed` and 1 `no_result` dead reasons. Some may be usage limits; nothing records which.
- Each harness adapter in `src/harness/` translates the harness's output into osq events, so the adapter is where a usage-limit message can be recognised (CLAUDE.md: adapters vary spawn, setup and event translation).
- The server UI sketch (Notion, "Server UI screens", screen 14) and the Change page design (`docs/designs/change-page.html`) left the pause line out because osq has no such state.

### Requirements

- An adapter that recognises its harness's usage-limit message reports it with the reset time when the harness gives one. Planning measures what each harness actually prints; an adapter that cannot tell reports nothing new.
- On a usage limit, the watcher does not count the attempt, records the pause as a marker under `.run/` so it survives a restart, and starts no task on any change until the reset time. Without a reset time, a configured wait applies.
- After the reset, the same task runs again as a normal attempt.
- `osq show`, `osq status` and the inbox show `paused until <time>` for the change, and the change's next step is still running.
- An event records each pause and its reset time, so `osq query` can count them.

### Non-goals

- Switching to another model or account during the pause.
- Notifying anyone. A pause is not a failure.
- Showing the pause on the phone Change page; `change-page-phone` gets it through the next step once both have landed.

### Notes for planning

- The planner pauses too, when 189's automatic planner or a task hits the limit. Decide in the plan whether the automatic planner's run counts as its one attempt.
- New event keys break the golden-event fixtures; scope `tests/fixtures/events`.
