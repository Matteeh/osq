---
queue_item: approve-view
queue_hash: sha256:1219ae44dce34f6cf4bbdb3aa9e8fca0f8880c34b19b58239b9e6d1c2f7f0f90
planner: null
date: 2026-10-04
---

### Goal

The dashboard's change view for an unapproved change shows everything a reviewer needs to approve it from a browser: the whole proposal, each delta next to the living requirement it changes, and the approval digest with its flags, followed by the Approve and Reject actions. This is M2 item 2.

### Context

As of 2026-10-04:

- The change view (`packages/ui/src/change/`) shows the header, brief, tasks and task evidence. The web change document (`WebChange`) has the goal, brief, dependencies, reads, writes and tasks.
- `change-detail-model` puts Surface, Decisions, Human steps and the approval digest into the model `osq show` renders. `web-write-actions` adds the approve and reject endpoints and buttons.
- `osq spec <capability> <requirement>` prints one living requirement. A delta's MODIFIED, REMOVED and RENAMED requirements name a living requirement; ADDED ones are new.
- ADR 006: before each tap, osq shows the plan's digest and flags for approve. Every human step passes the phone test.

### Requirements

- For an unapproved change, the web change document carries the proposal's goal, non-goals, surface, decisions, human steps and contract, each delta requirement with the current living text it replaces (none for ADDED), and the approval digest with its flags.
- The change view shows them in that order, then the actions. A fired flag shows with its excerpt next to the Approve button.
- It reads well at phone width.
- An approved, archived or rejected change shows what it shows today.

### Non-goals

- A rendered text diff inside a requirement; showing old and new text side by side is enough.
- The land view (M2 item 3).
- Editing the plan in the browser.

### Notes for planning

- The UI's size and dependency limits are in web-inspection's "Frontend dependency and size boundaries"; check them before choosing how to render Markdown.
- Read 142's and 144's archived proposals for how the commands take their inputs.
