---
queue_item: provider-outage-deaths
queue_hash: sha256:3c656d67431cde2890a00c4a8887a451daeacb54fdc4a75bdbf7cc29e1f9c575
planner: null
date: 2026-10-01
---

### Goal

When a task dies because the model provider never answered, osq records that as its own dead reason, does not count it toward the stuck rule, and does not wait out the whole task timeout to find out.

### Context

As of 2026-10-02:

- 135 task 1 died twice with `timeout` during a DeepSeek outage. Each time the provider answered after 900 s with "We were unable to start processing your request within the 900-second timeout limit. Please try again later.", pi retried, and osq killed the task at `timeouts.taskTimeoutSeconds` (1800). The first attempt spent 0 tokens and changed no file. The second got five tool calls in after DeepSeek recovered, then hit the timeout.
- Both deaths had the same fingerprint, so `src/watcher/auto-retry.ts` marked the task stuck and the inbox asked for `osq plan 135`. The plan was fine; `osq retry 135 1` finished it.
- The pi adapter already writes `harness_retry` events, `phase: start` with the provider `error` and `phase: end` with `success`, from pi's `auto_retry_start` and `auto_retry_end` (`src/harness/pi/pi-stream.ts`). A `tokens` event with all zeros comes before each failed request. Nothing in the watcher reads either.
- Only the pi adapter emits `harness_retry`. The Notion page "Provider outages are not task failures" under ROADMAP has the timeline.

### Requirements

- A task that dies while its harness is in a provider retry (a `harness_retry` start with no matching end), or that never got a model response, dies with a new reason instead of `timeout`, and its dead marker quotes the provider's error.
- That reason never marks a task stuck, and an automatic retry of it waits before starting again instead of retrying straight into the outage. The wait comes from config.
- osq stops a task early when its harness has been in a provider retry longer than a configured limit, instead of waiting for `timeouts.taskTimeoutSeconds`.
- `osq report` and `osq query` show these deaths as their own reason, so they don't count against a plan.
- Every limit and wait comes from config, with defaults in `DEFAULT_CONFIG`.

### Non-goals

- Teaching the other adapters to report provider errors. Record in the proposal which of claude, codex, opencode and agy could, and leave the adapter interface alone unless one really differs.
- Pausing the task timeout during a retry.
- Switching to another provider or model automatically.

### Notes for planning

- The new dead reason, its marker text and any config keys are Surface.
- Measure test fallout in a scratch worktree first: the dead-reason list is pinned in tests, README and the auto-retry eligibility set.
