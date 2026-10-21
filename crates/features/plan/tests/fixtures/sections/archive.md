## This repository's record

First-attempt passes: 45/46
Largest first-attempt pass: 244-rust-inbox-feature/3 "When the inbox command runs, it also prints the running tasks, the newest landed changes and the failing validator, and matches TypeScript's golden text" (scope files: 68, acceptance lines: 6) [resolver 2 scope]
Median task duration: 7m 20s
Dead outcomes:
- 238-gates-see-the-change, When change_link_gates runs with a change folder, the Code ownership its deltas add or modify replaces the living globs, baseline_red
- 235-lockfile-follows-manifest, When the languages kernel reads a lock file and the manifests a task changed, it says whether the lock file follows one of them, baseline_red
- 232-rust-link-gates, When change_link_gates runs with a change folder, what the change's deltas add, modify or rename to counts as live, blocked

## What history says

Counts from the last 100 archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.
First attempt by scope files: 1-2 10/11, 3-4 20/20, 5-8 21/23, over 8 40/45
First attempt by verify kind: one 15/15, several 5/5, other 72/80
First attempt by tests.modify: true 25/26, false 67/74
First attempt by shared scope: shared 20/25, not shared 72/75
First attempt by position: first task 39/42, later task 53/58
Most common last dead reasons: baseline_red 3, scope_violation 3, blocked 2

## Recent executor disclosures

Executor claims from result files, not verified facts. Check them against the code before relying on them.

251-rust-pi-harness-run task 1, deviated:
> - When the auth text is a JSON object with a status but a blank reason, and the
>   auth run failed, the detail falls back to the object's status (the
>   "Preflight with a fake pi" row expects `expired`) rather than the run-failure
>   reason the requirement prose lists.

251-rust-pi-harness-run task 2, deviated:
> - Added a `settled-with-stderr` mode to the fake pi and a small `settled_start_hides_stderr` test beside the scenario rows. It makes the settled-start suppression of stderr observable, which removed the only missed mutant in `PiHarness::failure`; the scenario rows themselves are unchanged.

249-rust-plan-new task 2, deviated:
> The two extra tests in `tests/prompt_sections.rs` extend the table rows so the
> title fallback and the ADR scope branches all change a value a test checks,
> which the task requires for the mutation check.