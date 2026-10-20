---
status: accepted
applies_to: [web-inspection]
rule: The dashboard renders server documents; logic sits in pure model files, components only render, shared state uses React context, and no state library is added.
checks:
  - tests/dashboard-writing-adr.test.ts
denies:
  - zustand
  - redux
  - "@reduxjs/toolkit"
  - react-redux
  - mobx
  - mobx-react-lite
  - jotai
  - recoil
  - valtio
  - xstate
  - "@xstate/react"
  - "@tanstack/react-query"
  - swr
  - react-router
  - react-router-dom
---
# 020. Dashboard writing

Date: 2026-10-15

## Status

Accepted

## Context

The React dashboard in `packages/ui` is the phone surface for osq, and every
change that touches it is written by an executor that sees only its task. The
rules for that code are spread out. web-inspection's "Frontend dependency and
size boundaries" bans a state library, a router library and a test framework
and caps the bundle and each source. A test banned subscriptions, timers,
`fetch(` and raw HTML in `packages/ui/src/change/` only. The rest are habits
nobody wrote down: the server builds every document, pure logic sits in
`page-model.ts`, and a click is tested through a pure helper such as
`copyText`.

Executors learned the gaps by failing. Change 192 task 4 died on
`scope_violation` passing retry actions through `PageFolds.tsx`, a file it
did not own; its second attempt used a React context. Change 194 task 7 needed
a clock and used `AbortSignal.timeout` because the ban listed only timer
names.

Almost no state lives in the browser. What is left is local, such as which
notices are open, the hand-off toggle and the action in flight, or crosses a
component that does not use it. On 2026-10-14 the user decided against a state
library.

## Decision

1. **Data.** The server builds every document, and the browser derives no
   state from osq's files. Documents come only through the data module,
   `packages/ui/src/data.ts`, and its refetch on a server-sent `changed`
   event. A screen that reads or writes anything else, such as actions or
   server status, uses a `*-client.ts` built over a request function the app
   passes in. No screen file calls `fetch(`, opens an `EventSource`, adds an
   event listener, or runs a timer; a view that needs moving time gets it
   from one shared clock beside the data module.
2. **Files.** One folder per screen directly under `packages/ui/src`, with no
   folder inside it. Pure logic sits in a `*-model.ts` file beside the
   components, and components only render what a model returns. Each feature
   has one CSS file whose colours come from the tokens in `styles.css`.
   Screens are phone-first: touch targets at least 44 px, and no horizontal
   page scroll at 390 px wide.
3. **State.** `useState` holds local state. State that crosses a component
   that does not use it goes through a React context provided by the screen's
   top view, as `ActionRetry.ts` does, never through props on a file the task
   does not own. When state must outlive a screen or be shared by several,
   write a small store over `useSyncExternalStore` before reaching for a
   library.
4. **Tests.** A model is tested with a table of cases. A component is tested
   by rendering it with `renderToStaticMarkup`. Anything a click does is a
   pure helper, tested on its own, that the click handler calls. The
   dashboard adds no test framework.
5. **What osq checks.** `tests/dashboard-writing-adr.test.ts` fails on a
   screen file that holds `EventSource`, `addEventListener`, `setInterval`,
   `setTimeout`, `AbortSignal.timeout`, `fetch(`, `dangerouslySetInnerHTML`
   or `markdown`, on a folder inside a screen folder, and on a package this
   ADR denies in the UI manifest. Files that break the rule today sit on its
   exception list, which only shrinks: `change/ChangeView.tsx` keeps its
   planning clock until a change that touches it moves the clock out. The
   watcher kills a task that adds a denied package anywhere.
6. **Revisit.** Reopen the state decision when several screens share and
   change the same live data, such as a phone app or more than one project
   on one server.

## Consequences

- A planner that writes web-inspection names ADR 020 under `## Decisions`,
  and an executor knows where logic, state and tests go before it starts.
- Existing screens are not restructured. Each change brings the screens it
  touches in line.
- Colours and phone sizing are written here but not checked by a test.

## Rejected

- **A state library such as Zustand or Redux.** The browser holds almost no
  state, and context plus `useSyncExternalStore` covers what crosses a
  component.
- **A data-fetching library such as TanStack Query or SWR.** The server
  already says when a document changed; a refetch on that event is the only
  update path, and a cache with its own timers would compete with it.
- **Deriving documents in the browser.** It would duplicate osq's core in a
  second place and break the static export.
- **Keeping the bans in `tests/ui-change.test.tsx`.** They covered one screen
  only, and nothing pointed an executor to them before it failed.
