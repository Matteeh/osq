---
queue_item: dashboard-writing-adr
queue_hash: sha256:a5276cd623dc2dabbdd8180b2d6cb02413d5a07aeecadfc627c88b642802097f
planner: null
date: 2026-10-15
---

### Goal

An accepted ADR states, in one rule, how the React dashboard in `packages/ui` is written: where data comes from, where logic lives, how state moves between components, and how it is tested. Planners name it in `## Decisions` for every change that writes web-inspection, and a checks test enforces the parts that can be tested. The dashboard keeps having no state library.

### Context

As of 2026-10-14:

- The dashboard's rules are spread out, and most are unwritten. web-inspection "Frontend dependency and size boundaries" bans a state library, a router library and a test framework, and caps the bundle at 1,000,000 bytes and each source at 250 lines. `tests/ui-change.test.tsx` bans `EventSource`, `addEventListener`, `setInterval`, `setTimeout`, `fetch(`, `dangerouslySetInnerHTML` and the word `markdown` in `packages/ui/src/change/`, and breaks on a subfolder there. `tests/import-graph.test.ts` lets the UI import only types from `src/`.
- Unwritten habits: the server builds every document and the browser derives no state; a refetch on a server-sent event is the only update path; pure logic sits in model files (`page-model.ts` in 192) apart from components; tests render with `renderToStaticMarkup` and prove click behaviour through pure helpers (`copyText` in 192).
- 192 task 4 died once on `scope_violation`: it needed to pass the retry actions through `PageFolds.tsx`, a file it didn't own. Attempt 2 used a React context (`ActionRetry.ts`) from `ChangeView` to `TaskTable`. Nothing written told either attempt which way to go.
- On 2026-10-14 the user asked whether to add a state library. Decided: no. Almost no state lives in the browser; what's left is local (which notices are open, the hand-off toggle, the action in flight) or crosses a component that doesn't use it, which context covers.
- ADRs 001 to 018 cover the CLI, watcher and server. None covers the browser code.

### Requirements

- A new ADR, the next free number, applies to web-inspection. Its one-sentence rule is close to: "The dashboard shows server documents and derives no state; logic lives in pure model files, components only render, state shared across the tree uses React context, and no state library is added."
- Its decisions cover:
  - **Data:** documents come only through the data module and its event-driven refetch, with no timers or polling in views.
  - **Files:** one folder per screen, a `*-model.ts` for pure logic, components that render, one CSS file per feature on the dashboard's colour tokens, and phone-first sizing (44 px touch targets, no horizontal page scroll at 390 px).
  - **State:** `useState` for local state, context for state that crosses a component that doesn't use it, and a hand-written `useSyncExternalStore` store before any library.
  - **Tests:** tables of cases for models, `renderToStaticMarkup` for components, and pure helpers for anything a click does.
- It names when to revisit the state decision: several screens that share and change the same live data, such as the phone app or more than one project on a server.
- A checks test enforces what can be tested: at least the dependency ban from the package manifests and the view-file bans `tests/ui-change.test.tsx` already holds, widened from `packages/ui/src/change/` to every screen folder. The old scan moves into it instead of being kept twice.

### Non-goals

- Adding a state, data-fetching or router library.
- Restructuring existing screens to match. Each change brings the screens it touches in line.
- A design system. The in-house one is a later item.

### Notes for planning

- Widening the bans may flag files in other screen folders, such as the graph or report views. Measure that in a scratch worktree first; files that break the rule today go on an explicit list in the test, the way the line budget lists its exceptions.
- Copy the shape of `tests/language-support-adr.test.ts` or `tests/steering-planner-adr.test.ts` for the ADR's own test.
