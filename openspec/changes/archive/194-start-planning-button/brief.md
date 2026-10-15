---
queue_item: start-planning-button
queue_hash: sha256:e75e9a050540402084cb39f7a4c16a8028825f7a1cd777e04a118a2939be4408
planner: null
date: 2026-10-14
---

### Goal

On the phone, Plan it, Plan again and the unplanned state get a Start planning button. It runs the planner on the server, in the server's clone, with the server's own Claude Code login, so the human never leaves the osq page. While it runs, the Change page shows "Planning on server, N min" instead of the hand-off block. When the plan passes `osq lint`, the page moves to Approve.

### Context

As of 2026-10-14:

- `change-page-phone` shows the paste block from `plan-handoff-prompt` with a Copy button. The human then pastes it into a Claude Code Remote Control session on the server, from the Claude app.
- 189 (`auto-steer-blocked`, ADR 018) already runs a planner without a human: its own role environment, a tree guard that keeps only change-folder edits, lint afterwards, and a record in `.run/auto-steer.md`. It runs only for run steering triggers.
- ADR 006 rejected headless planning; ADR 018 allowed it for steering only. A planner the human starts with a tap is new, so this needs its own ADR, or a change to ADR 018, first.
- osq has no "planner is working" signal today; the Change page design left it out.

### Requirements

- An ADR first: a planner a human starts from the server UI runs the way ADR 018's steering planner runs, writes only the change folder, and still needs a human approve.
- The server gains a write action, through the same command function the CLI uses (ADR 013, ADR 014), that starts the planner for one unapproved change, or for a dead change that needs steering. It refuses while a planner already runs for that change.
- The planner reuses 189's run: the agent-role environment, the tree guard, lint after, the outcome record. The prompt is `plan-prompt.md` as `osq plan` writes it, plus the human's notes when Plan again sent some.
- The change's next step and the Change page show "planning on server" with how long it has run, and then the outcome: ready (lint clean, Approve), lint red or failed (with the paste block as the fallback).
- The CLI keeps working as today. `osq plan` keeps handing off, and a human can still plan by hand.

### Non-goals

- Live steering comments to a running planner.
- Keeping AI credentials in osq. The planner uses the server's own harness login, as executors do.
- Planning in the cloud. Cloud sessions plan a GitHub copy, not the server's clone.

### Notes for planning

- Wait until 189 has run for real a few times; its outcomes in `osq query` show whether a tap-started planner can reuse it as is.
