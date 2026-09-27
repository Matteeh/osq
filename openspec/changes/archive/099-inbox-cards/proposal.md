---
title: osq inbox opens cards and the next item when one is done
depends_on: ["098"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - status-inspection
    - web-inspection
---
## Goal

On a terminal, `osq inbox` opens the first item as a card with a key for
each action, a key for the full detail, a key to skip, and a key to quit.
A key runs the existing osq command as a child process on the same
terminal, so its output and prompts are exactly what the reviewer would see
typing it. When the command exits and the item is gone, the next card opens
at once; when the item is still there, its card shows again. An empty inbox
waits, and the first item that arrives opens with the sound. No sound plays
while a card is open. Without a terminal, `osq inbox` prints as it does
today.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. The watch primitive goes
through `watchDispatch` with a fake watcher, an immediate scheduler, and a
manual poll timer, and `tests/inbox-follow.test.ts` still passes unchanged
on top of it. Keys go through `cardKeys` over items that `readDispatchItems`
reads from temporary projects. The session goes through `runCardSession`
with scripted keys, a recording launcher, and a recording sound. The command
goes through `inboxDispatchCommand` with `isTerminal` forced true, and the
default launcher runs `osq --version` as a real child process.

## Non-goals

- New actions. Every key runs a command the item already lists.
- A key for the land command. ADR 003 keeps osq from writing the human's
  checkout except through a future `osq land`, and the command is a shell
  pipeline. The land card shows it under `Run yourself:`.
- Running commands in-process. The action commands end the process with
  `process.exit` on errors; making them throw instead is a separate change.
- Refreshing an open card when its item changes by itself, such as a task
  the watcher retries. The card refreshes after the next key.
- Clearing the screen. Cards and command output scroll.
- Cards in the browser.
- Changing `osq inbox --follow`, `osq inbox --json`, or bare `osq`.

## Surface

- Changed: `osq inbox` on a terminal (stdin and stdout both TTYs, without `--json` or `--follow`) runs a card session instead of printing (command behaviour)
- Added: card keys `a` approve, `r` retry, `x` reject (asks `Reason: `), `c` check, `p` verified passed, `f` verified failed, `s` show, `n` skip, `q` quit (keys)
- Added: card session output `Needs you (<n>):` header, `Keys:` block, `Run yourself:` block, `── <command> ──` and `── exit <code> ──` separators, and `Nothing needs you. Waiting for new items (q to quit).` (command output)

## Decisions

- ADR 001: unchanged; the session uses the config `inboxDispatchCommand` already loads.
- ADR 003: no key runs git or writes the checkout. The land command stays a line to copy.
- ADR 004: unchanged; no key runs the validator directly.
- ADR 005: unchanged; nothing here checks the validator range.

## Background

Change 097 built the items, their order, and their cards; 098 added
`--follow`, the sound, and the watch loop in
`src/core/status/dispatch-follow.ts`. That file is at 246 lines, near the
250-line budget, and its watching (hub, poll, tree refresh, one derivation
at a time) is what the empty inbox needs too. Task 1 moves that watching
into `src/core/status/dispatch-watch.ts` and rebuilds the follow loop on
it, with its tests unchanged.

A key runs its command as a child process of the same osq: `process.execPath`
with osq's own `bin` beside the launcher module, with stdio inherited. The
action commands (approve, retry, reject, show, check, verified) call
`process.exit` on errors, so running them in-process would end the inbox.
Everything a command does lands in files, so the session loses nothing by
reading the items again after the child exits. While a child runs, the
session leaves raw mode and ignores SIGINT, so Ctrl-C stops only the
command.

Item commands come from `dispatch-items.ts`. Reject is listed as
`osq reject <id> --reason <text>`, so its key asks for the reason on one
line and passes it as a single argument, never through a shell. Verify
items list `osq verified <id> --passed|--failed`, which becomes two keys.
Commands that do not start with `osq ` get no key.

The default input and launcher touch the terminal and processes, so they
live in `src/cli/inbox-terminal.ts`; the session in core takes them as
ports.

## Contract

### Requirement: Printing unchanged
`osq inbox` without a terminal, `osq inbox --json`, `osq inbox --follow`,
bare `osq`, and `osq --json` SHALL print exactly what they printed before
this change.

#### Scenario: Existing inbox suites
- **WHEN** the existing inbox, inbox dispatch, and inbox follow tests run
- **THEN** every one passes unchanged

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/status-inspection/spec.md`: adds "Dispatch watch", "Card keys", and "Card session".
- `specs/cli-foundation/spec.md`: modifies "Inbox dispatch command" and adds "Inbox cards on a terminal".

Four tasks, and no two share a file. Task 1 extracts the watch primitive,
task 2 maps items to keys and formats the card screen, task 3 runs the
session, and task 4 wires the terminal, the launcher, the command, and
README.md.
