## ADDED Requirements

### Requirement: Dashboard writing decision
osq's decisions SHALL include ADR 020, `decisions/020-dashboard-writing.md`,
accepted for `web-inspection`, with the rule its scenario quotes, its checks
test as `checks`, and the state, data-fetching and router packages as
`denies`. `validateDecisions` SHALL report no error or warning, the decisions
index SHALL link it once, and AGENTS.md's rules block SHALL not change.

#### Scenario: Dashboard writing ADR is accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** ADR 020 is listed and not ignored, with status `accepted`, `appliesTo` `["web-inspection"]`, the rule "The dashboard renders server documents; logic sits in pure model files, components only render, shared state uses React context, and no state library is added.", `checks` `["tests/dashboard-writing-adr.test.ts"]` and `denies` `["zustand", "redux", "@reduxjs/toolkit", "react-redux", "mobx", "mobx-react-lite", "jotai", "recoil", "valtio", "xstate", "@xstate/react", "@tanstack/react-query", "swr", "react-router", "react-router-dom"]`, `validateDecisions` reports no error and no warning, and `decisions/README.md` links `020-dashboard-writing.md` exactly once

#### Scenario: Rules block without ADR 020
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 020` and `checkProjectRules` reports nothing

### Requirement: Dashboard screen sources
A screen folder, any folder directly under `packages/ui/src`, SHALL hold files
only. No file in a screen folder SHALL contain
`EventSource`, `addEventListener`, `setInterval`, `setTimeout`,
`AbortSignal.timeout`, `fetch(`, `dangerouslySetInnerHTML` or `markdown`
unless the test's exception list names that file and token. The list SHALL
hold only `change/ChangeView.tsx` with `AbortSignal.timeout`, and an entry
whose file is missing or lacks its token SHALL fail the check.

#### Scenario: The dashboard keeps to ADR 020
- **WHEN** the screen check runs over the repository's `packages/ui/src` and the manifest check over `packages/ui/package.json`
- **THEN** each reports nothing

#### Scenario: Screen file problems
- **WHEN** the check runs over a `src` folder holding exactly one file with this content, and over this exception list
- **THEN** it reports exactly this list

| file | content | exceptions | report |
| --- | --- | --- | --- |
| `home/Clock.tsx` | `setInterval(tick, 1000);` | none | `home/Clock.tsx must not contain setInterval` |
| `report/Load.ts` | `fetch('/x');` | none | `report/Load.ts must not contain fetch(` |
| `change/ChangeView.tsx` | `AbortSignal.timeout(1);` | `change/ChangeView.tsx` with `AbortSignal.timeout` | none |
| `change/ChangeView.tsx` | `export const x = 1;` | `change/ChangeView.tsx` with `AbortSignal.timeout` | `change/ChangeView.tsx: AbortSignal.timeout is on the exception list but no longer appears` |
| `home/View.tsx` | `export const x = 1;` | `change/ChangeView.tsx` with `AbortSignal.timeout` | `change/ChangeView.tsx: AbortSignal.timeout is on the exception list but no longer appears` |
| `home/parts/Row.tsx` | `export const x = 1;` | none | `home/parts is a folder inside a screen folder` |
| `data.ts` | `fetch('/x');` | none | none |

### Requirement: Dashboard UI manifest
`packages/ui/package.json` SHALL list no package ADR 020 denies under
`dependencies` or `devDependencies`.

#### Scenario: Denied package in the UI manifest
- **WHEN** the check runs over a UI manifest
- **THEN** it reports exactly this list

| manifest | report |
| --- | --- |
| `{"devDependencies":{"react":"19.3.0","zustand":"5.0.0"}}` | `zustand is denied by ADR 020` |
| `{"dependencies":{"swr":"2.0.0"}}` | `swr is denied by ADR 020` |
| `{"devDependencies":{"react":"19.3.0","vite":"8.3.0"}}` | none |
