---
queue_item: approve-highlights
queue_hash: sha256:db054b29e299b538e8a4b540f3a9b91379875bbca766a5eff66bfb68b8037cb9
planner: null
date: 2026-10-08
---

### Goal

The approve view opens with a short Notice block that osq derives from the plan: at most five notices sorted by severity, the rest folded, and a plain "Nothing unusual" when there is nothing to judge. A red notice must be opened before Approve unlocks. osq records which notices were shown and opened and what followed, so notices that never matter can be dropped. This is ADR 014's rule that every tap view leads with what the human must notice, built first on the approve view because it is useful locally and needs no server.

### Context

As of 2026-10-08 (mockup: https://claude.ai/artifact/GbooJHm44SaVUx1UdPHfsB):

- The approve view (148, "Approve review document" and "Approve review view" in web-inspection) shows every proposal section in full, then deltas side by side, then the digest flags beside the Approve button. Nothing ranks what matters.
- A backtest of candidate rules over 140–158, each plan as first approved: no plan rule predicted any task death. Five of the nine troubled changes died on flaky tests, and 149 and 151 died on frozen invariants (`tests/no-skipped-in-src.test.ts`, `src/watcher/fingerprint.ts`) their plans never named. Surface lines, human steps, `src/watcher/` paths and "file named outside scope" each fired on 9 to 15 of 19 plans, too often to be notices. With the set below, about half the plans read "Nothing unusual". The Notice block directs judgement; failure prediction stays with the gates.
- ADR 006 decision 6 (hash the plan when first reported ready, compare with the approved hash) is not built: only `plan_started` and `plan_exited` are recorded in `.run/plan.jsonl`.

### Requirements

- Notices, each from the change folder and config alone:
  - Red: scope reaches osq's rules (`PLANNER.md`, `AGENTS.md`, `CLAUDE.md`, `decisions/`, `templates/`, executor prompts); a delta removes a requirement or a scenario; a `Departs from ADR` line.
  - Amber: more tasks than a configured count, or a task scope resolving to more files than a configured count; `package.json` in scope; a non-empty `## Assumptions` section; `verify_starts: any`; a requirement no task's tests cover, where traceability is on.
  - Grey: `tests.modify`; a new capability; plan revisions between first ready and approval.
- At most a configured number of notices show (default 5), sorted by severity; the rest fold. With no red or amber notice the block reads "Nothing unusual".
- Approve stays disabled in the dashboard until each red notice has been opened. osq records shown and opened notices, never a claim that the human understood. `osq approve` in the CLI prints the same notices.
- The proposal gains a fixed `## Assumptions` section, `None` or one line per assumption; the template, lint and PLANNER.md say so.
- osq records the plan hash when the plan is first reported ready, so revisions can be counted (ADR 006 decision 6).
- Each shown notice is recorded with what followed (approved, planned again, rejected, halted), and `osq report` or `osq query` can list notices by outcome.
- Severity is shown in colour and in form (label and stripe), readable at phone width in both themes.

### Non-goals

- Predicting task deaths; that stays with the gates.
- An AI reviewer at plan time. It may follow as a measured trial.
- "I understood" checkboxes: they record a claim osq cannot check (ADR 006 decision 3).

### Notes for planning

- The backtest script is easy to rerun; carry its rule list into tests as a table over fixture plans.
- Changing the proposal template touches pinned tests; measure test fallout in a scratch worktree first.
