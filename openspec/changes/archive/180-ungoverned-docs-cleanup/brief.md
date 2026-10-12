---
queue_item: ungoverned-docs-cleanup
queue_hash: sha256:0486fc241df549a3184a2d08d2bc3ec1aed8b278b9cf687650fa521d8dadf992
planner: null
date: 2026-10-12
---

### Goal

osq's own repository follows the default `ungoverned` list: cli-foundation no longer owns `README.md` or `.env.example`, and no living requirement or test pins README prose, so a README edit needs no change and breaks no test.

### Context

As of 2026-10-11:

- cli-foundation's `Code ownership` source lists `README.md`, `AGENTS.md`, `PLANNER.md` and `.env.example`.
- 13 living-spec requirements say `README.md SHALL ...`, across cli-foundation and metrics-and-reporting at least, and 55 tests read `README.md`.
- 177 (readme-software-factory) adds two more README requirements to cli-foundation, "Product description" and "README intro describes the flow", and `tests/readme-intro.test.ts`.

### Requirements

- cli-foundation's `Code ownership` drops `README.md` and `.env.example`; `AGENTS.md` and `PLANNER.md` stay.
- Each living requirement that pins README wording is REMOVED, or rewritten without the README clause when the rest of it states program behavior. Their tests go, or lose their README assertions.
- "Product description" drops its README line 3 clause, and "README intro describes the flow" is REMOVED; the `package.json` and `osq --help` clauses stay.
- `osq lint --repository` shows no ungoverned-path warning for osq's own specs.

### Non-goals

- Editing README text.
- Unpinning CHANGELOG wording.
- Unpinning `AGENTS.md` or `PLANNER.md`.

### Notes for planning

- Measure first: list every requirement and test that reads `README.md` or `.env.example`, and sort them into prose pins (remove) and program-output pins (keep).
- Removed requirements need no pin-list task.
