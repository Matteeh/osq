---
queue_item: harness-exit-with-result
queue_hash: sha256:4706bfa8c0b4cd3d42c4b9fea7f3dce41b540211b4b18974c9b3af0baad4738d
planner: null
date: 2026-10-19
---

### Goal

Finished work survives a harness that reports failure after a recoverable provider error. osq's own verify decides whether the task is done, as it does for a clean exit.

### Context

As of 2026-10-19:

- 219 task 3 died as `crashed` twice in a row (attempts 1 and 2, both `exited` with `exitCode: 1`), which used up its automatic retries. Each time, opencode with `opencode-go/deepseek-v4.1-flash` hit `provider.invalid-output: "OpenAI Chat stream ended without finish_reason"` mid-session, kept going, finished the task and wrote `.run/results/3.md`. It still exited 1. A manual `osq retry 219 3` then passed with exit 0 and the same code.
- `src/watcher/spawn.ts` writes the dead marker as soon as `spawnResult.exitCode !== 0 || spawnResult.timedOut`, before `ensureTaskResult` and before the watcher's verify run. `describeAgentFailure` (`src/watcher/provider-outage.ts`) picks `crashed`, `timeout` or `provider_unavailable`.
- The opencode adapter does not translate opencode's `{"type":"error"}` stream lines into any task event. The provider errors appear only in the dead marker's quoted output, so `provider-outage.ts` cannot see them.
- Bugs and incidents row in Notion: "Recoverable provider error throws away finished task work".

### Requirements

- When a task's harness exits non-zero without timing out and the task's `.run/results/<n>.md` exists, the watcher goes on to its normal result, scope and verify checks as for exit 0. The task becomes done only if those pass, and otherwise dies with the reason those checks give, such as `verify_red`.
- The task's events record that the exit code was non-zero and the attempt continued, so `osq show` and the archive can tell it apart from a clean exit.
- A non-zero exit with no result file still dies as `crashed` (or `provider_unavailable`), as today. A timeout still dies as `timeout`.

### Non-goals

- Translating opencode's error lines into events, or changing other harness adapters.
- Changing retry counts or the usage-limit pause.
