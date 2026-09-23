---
title: Dashboard home and changes
depends_on:
  - '054'
verify: pnpm verify
features:
  reads:
    - web-inspection
    - status-inspection
---
## Goal

This is the second of four dashboard changes. It makes the dashboard open on
what needs attention.

The dashboard's most useful view is what needs you, what's running, and what
just landed, and today it exists only in the CLI inbox. The dashboard opens on
a cost report. This change adds a `#/` home built from the same inbox
projection as `osq`. Each needs-you item shows the exact command to run. A
`#/changes` list shows every change's state, task progress, cost, and landed
date, with links to its page. The nav becomes Home · Changes · Report · Graph.

The server already serves `/api/inbox`, the UI's data module already fetches
it, and every inbox item already carries its command. Reading the inbox never
advances the CLI's last-look cursor.

## Verify

`pnpm verify`

The suite checks the change nodes' done counts, the route table (the empty hash
opens home), the home view's three groups and their commands and empty states,
the changes list's rows, order, and links, and that inlined documents render
both views without a fetch. It stays within the UI size and line budgets, and
needs no network service, TTY, or real model.

## Non-goals

- Write actions of any kind, including buttons that run the shown commands.
- Advancing or changing the CLI inbox's last-look cursor.
- Styling beyond what readable tables need. Change 056 owns the visual
  hierarchy and status palette.
- New metrics. `doneCount` counts existing done markers.

## Surface

- Added: the `#/` home and `#/changes` dashboard views (routes).
- Changed: the empty hash opens home instead of the report (route).

## Contract

### Requirement: Dashboard home

The empty hash SHALL open a home view. It SHALL show the inbox's needs-you
items, each with its exact command, then running tasks, then recently landed
changes, all from the same projection as the CLI inbox.

#### Scenario: Change awaiting approval
- **WHEN** a change awaits approval
- **THEN** home lists it under Needs you with `osq approve <id>` and a link to its page

### Requirement: Changes list

`#/changes` SHALL list every change with its state, done-of-total tasks, cost,
and landed date, linking each row to its change page.

#### Scenario: Mixed changes
- **WHEN** active, archived, and rejected changes exist
- **THEN** each appears once with its state and progress, active changes first

## Human steps

- Review the proposal, the delta, and both task bodies, then run
  `pnpm osq approve 055` yourself after 054 archives.

## Delta

- `specs/web-inspection/spec.md` modifies `Typed UI data boundary` for the new
  routes, and adds `Change task progress`, `Dashboard home`, and `Changes list`.

Task 1 adds `doneCount` to the graph's change nodes. Task 2 adds the routes and
both views. No file belongs to two tasks.
