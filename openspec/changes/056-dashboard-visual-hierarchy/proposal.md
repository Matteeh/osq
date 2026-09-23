---
title: Dashboard visual hierarchy
depends_on:
  - '055'
verify: pnpm verify
features:
  reads:
    - web-inspection
---
## Goal

This is the third of four dashboard changes. It gives the dashboard a visual
hierarchy and fixes the layout bugs seen on this repository.

- **Tables** are centered, unstyled HTML with no hierarchy.
- **Chart axes overlap.** The cost chart and the writes chart print every
  change's folder key under its band, and with 50 changes the labels run
  together into one unreadable line.
- **The graph looks empty.** `styles.css` has no rule for `.graph-edge`, so
  every dependency and reads path renders with SVG defaults (no stroke) and is
  invisible, with both toggles on. And marks are placed by landed time, which
  37 of this repository's 52 archived changes lack, so those changes get no
  mark and every edge touching them is dropped. Lane names are clipped at a
  fixed label width, as in `etrics-and-reporting`.

The visual direction is quiet and operational. It uses the system font stack,
a neutral background, and one accent color, with hierarchy from type size,
weight, and spacing rather than boxes. There is one status palette, with light
and dark values: verified green, dead red, regressed amber, running blue, and
pending gray. Manual done reuses green with its own word. A status is always
shown as a colored dot followed by its word, so no meaning depends on color
alone.

## Verify

`pnpm verify`

The suite checks five things. Every status renders through one badge with its
word. The palette defines light and dark values for all five statuses. The
cost chart is horizontal bars with one row per change. The writes chart's axis
labels are thinned change numbers with full names in titles. Every archived
change gets a graph mark in change-number order, and full lane names and
styled edges render. It stays within the UI size and line budgets, and needs
no network service, TTY, or real model.

## Non-goals

- New views, data, or metrics.
- A theme switch. The palette follows `prefers-color-scheme`.
- Replacing the graph with a capability table. That's a follow-up if the fixed
  graph still doesn't answer which capabilities change most and at what cost.

## Surface

None

## Contract

### Requirement: Status palette

One status badge SHALL render every task status as a colored dot and its
word. The palette SHALL define verified, dead, regressed, running, and
pending colors for light and dark schemes.

#### Scenario: Dark scheme
- **WHEN** the page renders with a dark color preference
- **THEN** every status badge uses the dark palette value and still shows its word

### Requirement: Readable charts and graph

Chart axis labels SHALL never overlap. The graph SHALL place every change it
shows, draw visible edges for each enabled relationship toggle, and show full
lane names.

#### Scenario: Fifty changes
- **WHEN** the report and graph render 50 archived changes, 37 without a landed time
- **THEN** the cost chart shows 50 bar rows, and the graph shows 50 marks with visible dependency edges

## Human steps

- Review the proposal, the delta, and the three task bodies, then run
  `pnpm osq approve 056` yourself after 055 archives.
- After it lands, run `pnpm osq serve` here and look at every view in light and
  dark mode. The suite checks structure and budgets, not appearance.

## Delta

- `specs/web-inspection/spec.md` modifies `Delivery report visualization` and
  `Capability archive graph visualization`, and adds `Dashboard status palette
  and hierarchy`.

Task 1 owns `styles.css`, including the graph edge rules, and the status badge.
Task 2 owns the report charts, and task 3 the graph layout. No file belongs to
two tasks.
