---
queue_item: word-bans-lint
queue_hash: sha256:2006c2ba0842def9b48eb5e3e2f50d5273b0b2a8fd94f7ae267cc588fa0dad73
planner: null
date: 2026-10-13
---

### Goal

A ban on a word in the code, such as osq's ban on "skipped" in `src/`, lives in config where `osq lint` can read it. A plan that would make an executor write a banned word is caught at lint, not when a task dies on the test that enforces the ban.

### Context

As of 2026-10-12:

- `tests/no-skipped-in-src.test.ts` fails when any file under `src/` contains "skipped", case-insensitive, comments included. It is the only word ban in osq.
- 149 task 4 died `blocked`: its plan named an outcome `skipped`, and the frozen test rejected the code. Bugs row "Plan used a word a living requirement bans from src/".
- Lint does not read that test, and the ban appears nowhere a planner sees it.

### Requirements

- A config key lists banned words, each with the path globs it covers. The default is empty. osq's own `osq.config.ts` bans `skipped` in `src/**`.
- `osq lint` reports a banned word that appears inside a code span or a scenario's quoted value in a delta spec or task file, when the word's globs overlap a task's `scope`. The finding names the word and the config entry.
- `tests/no-skipped-in-src.test.ts` reads the ban from config instead of hard-coding it, so the test and lint can't drift.
- The managed planner block says banned words are listed in config.

### Notes for planning

- Decide error or warning by false positives against the archive: lint every archived change folder with osq's ban and see what fires. 149's plan should be caught.
- Prose that mentions the word outside a code span stays legal.
