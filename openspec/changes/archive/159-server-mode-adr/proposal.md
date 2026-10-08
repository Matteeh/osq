---
title: An ADR decides how osq runs on a server next to local use
depends_on: []
verify: pnpm verify
features:
  reads: [web-inspection, version-control, watcher-and-harness]
---
## Goal

ADR 006 decision 7 promises a server-mode ADR before any server code. This
change writes it, designed with the user on 2026-10-08, as two decisions.
ADR 014, accepted and system-wide, says server mode is an addition: the server
runs the same command functions on its own clone, and every command keeps
working locally exactly as today. It decides what the server holds, how
changes come in and landed work leaves, how it runs, how the CLI and MCP reach
it, that sign-in waits, where credentials live, and that every tap view leads
with what the human must notice. ADR 013, proposed, records the one step a
phone needs first: `osq serve` stays on loopback but accepts writes from
configured hosts, such as a Tailscale name. `osq-server` builds it, accepts it,
and supersedes ADR 009. ADR 014's rule reaches every agent through AGENTS.md.

## Verify

`pnpm verify`

The typechecks, build, full suite and lint pass. `tests/decisions-own.test.ts`
and `tests/doctor.test.ts` validate osq's decisions folder and AGENTS.md's
rules block, and the decisions index test checks every ADR is indexed once.
The new `tests/remote-access-adr.test.ts` checks ADR 013 is proposed, governs
web-inspection, and leaves ADR 009 accepted. The new
`tests/server-mode-adr.test.ts` checks ADR 014 is accepted and system-wide,
its rule is in AGENTS.md, and its Rejected section names what the brief asks.

## Non-goals

- Any server code. `approve-highlights`, `osq-server`, `remote-cli` and
  `local-mcp` build it.
- Removing or changing any local command.
- Accepting ADR 013 or superseding ADR 009. Both wait for the code that
  implements configured hosts, so no accepted rule describes behaviour that
  does not exist.
- Sign-in. ADR 014 defers it; its requirement is on the Notion page "Server,
  UI and MCP".

## Surface

- Added: ADR 013, `decisions/013-remote-access.md` (document, proposed)
- Added: ADR 014, `decisions/014-server-mode.md` (document)
- Changed: AGENTS.md's `## Project rules` block gains ADR 014's rule
- Changed: the index in `decisions/README.md` lists ADR 013 and ADR 014

## Decisions

- ADR 001: unchanged; nothing here loads config.
- ADR 004: unchanged; nothing here runs the OpenSpec validator.
- ADR 005: unchanged; nothing here checks the validator range.
- ADR 010: unchanged; the server decision adds no role, and the validator keeps its own.
- ADR 012: the server decided here runs under this supervisor, with no system unit.

## Background

**Decided with the user on 2026-10-08.** Land pushes to `origin` as a
fast-forward and stops when the remote moved; landing through a forge PR and a
server without `origin` are named, not built. One project per server, with API
paths under `/p/<project>/` so several projects only add. Planners work on a
local copy of the change folder against server state; planning on the server
(from the dashboard, then from anywhere after sign-in) are later items.
Commands are forwarded whole rather than routed through a backend interface.
Sign-in is deferred, so the server stays on loopback behind a private network.
Claude Code uses the CLI and Claude Desktop uses `osq mcp`, both over the same
forwarded commands, and an MCP tool returns exactly the CLI's text.

**Two ADRs, one proposed.** Configured hosts change ADR 009's rule, and an ADR
is superseded rather than edited. Accepting ADR 013 now would put a rule in
every web-inspection plan prompt that the code does not follow, so it stays
proposed until `osq-server` builds it. Only accepted ADRs take effect.

**Measured in a scratch worktree on 2026-10-08.** With both ADRs and the
refreshed rules block, the only failing test outside build-dependent suites
was the decisions index, which each task's README line fixes. A first draft of
ADR 014's rule used `: ` and `readDecisions` silently ignored the whole ADR
because the frontmatter was no longer valid YAML; both rules now avoid it and
each task says so. No existing test changes.

**Why a delta.** AGENTS.md belongs to cli-foundation, and `osq lint` requires a
delta. The cli-foundation delta adds "Server mode is an addition to local use",
which pins the rule rather than the ADR number, as "osq's decisions index is
complete" does. ADR 013 changes no requirement until its code exists.

**Shared file.** `decisions/README.md` is in both tasks' scope. Task 2 runs
after task 1 and adds its line after task 1's.

## Contract

### Requirement: ADR 013 is proposed
`decisions/013-remote-access.md` SHALL be a proposed ADR for web-inspection
whose rule is "osq serve binds only loopback; writes need an allowed host, a
matching origin and the per-server token, one at a time, through the CLI
command functions.", and ADR 009 SHALL stay accepted.

#### Scenario: Reading osq's decisions after task 1
- **WHEN** `readDecisions` reads the repository's decisions folder
- **THEN** ADR 013 is listed as `proposed` with that rule, ADR 009 is `accepted` with no replacement, and `validateDecisions` reports nothing

### Requirement: ADR 014 is accepted and reaches every agent
`decisions/014-server-mode.md` SHALL be an accepted, system-wide ADR whose rule
is "Server mode is an addition; an osq server runs the same command functions
on its own clone, and every command keeps working locally exactly as today.",
and AGENTS.md's rules block SHALL be what `renderRulesBlock` renders for the
repository's decisions.

#### Scenario: Reading osq's decisions after task 2
- **WHEN** `readDecisions` reads the repository's decisions folder and `checkProjectRules` checks AGENTS.md
- **THEN** ADR 014 is listed as `accepted` for `all` with that rule, the rules block ends with its line, and neither reports a problem

## Human steps

### Before approval

None

### After landing

- Update the Notion roadmap and the "Server, UI and MCP" page with ADRs 013 and 014.

## Delta

- cli-foundation: ADDED "Server mode is an addition to local use", proven by
  task 2's `tests/server-mode-adr.test.ts`.

The change also reads web-inspection, version-control and watcher-and-harness.
`decisions/README.md` is shared by tasks 1 and 2.
