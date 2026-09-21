---
planner: gpt-5
date: 2026-09-21
---

# Dead letter retry and rejection

Add `osq retry <id> <n>` and `osq reject <id> --reason <text>`, the two verbs
missing from the dead letter queue.

Retry is the only operation that retires an active dead or regressed marker. It
renames markers instead of deleting diagnostics, preserves prior results, and
supplies the previous failure to the next attempt. Reject moves an eligible
change intact under `openspec/changes/rejected/`, records the human reason, and
keeps its brief, proposal, planning log, tasks, deltas, results, and events for
status and reporting.

Rejected changes never satisfy `depends_on`. The report records rejection
history by planner model when `brief.md` supplies one. Automatic retries,
model or harness changes, interactive prompts, undo, and UI work are out of
scope.
