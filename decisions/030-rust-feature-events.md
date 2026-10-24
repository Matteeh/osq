---
status: accepted
applies_to: [group:rust]
rule: A feature reacts to events it lists; the loop kernel runs each command, then delivers new events at least once from a durable cursor to handlers safe to rerun.
checks:
  - tests/rust-adrs.test.ts
  - crates/core/tests/feature_reactions.rs
  - crates/kernel/loop/tests/delivery.rs
  - crates/kernel/storage/tests/durable_write.rs
---
# 030. Rust feature events

Date: 2026-10-24

## Status

Accepted by Mathias on 2026-10-24 on approving change 326,
rust-feature-events-adr, after a design session the same evening. It fills
in the "loop hooks, the events a feature reacts to" that ADR 028 left for
later, and puts ADR 022's "the log is the bus" to work.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not
the TypeScript code under `src/`.

## Context

ADR 022 says features never call each other and talk through event files.
Until now no feature reacted to another's events, so nothing had to deliver
them. Steered approval is the first case: after a human approves a revised
plan, the steering triggers must be cleared, and that is retry's code.
TypeScript's approve calls retry directly. In Rust, approve may not call the
retry crate, and moving retry's code into a kernel only to share it would
leave the order of steps, approve then retry, hard-wired before the loop is
designed.

The loop, the server and the CLI will all run commands. If each delivered
events its own way, a server request could seal a plan and never clear its
triggers.

## Decision

### 1. A feature lists the events it reacts to

The `Feature` trait gains two methods with defaults, so no existing feature
changes:

```rust
fn reacts_to(&self) -> Vec<EventKind> { Vec::new() }
fn react(&self, reaction: &Reaction<'_>) -> Result<Output, FeatureError> {
    Ok(Output::text(""))
}
```

`reacts_to` is plain data, like `commands`. `EventKind` names each `Event`
variant without its payload, and `Event::kind` gives it. `react` handles one
event. `Reaction<'a>` is a `#[non_exhaustive]` core struct holding the
project root, the change folder and `&'a Envelope`. It has a lifetime from
the start, so a borrowed database transaction can join it later without
changing any handler. Storage is `rusqlite`, which works through `&`, so
`react` takes `&Reaction`.

### 2. One entry point runs a command and delivers

The loop kernel holds one entry point that finds the feature for a command,
runs it, and then delivers new events. The CLI calls it, and so will the
server (ADR 014) and the loop. No app runs a feature or delivers events any
other way, so every way of running a command behaves the same.

Delivery makes one pass. An event that a reaction appends is delivered by
the next command or loop pass, so reactions never cycle. A reaction may not
run a command through the entry point.

### 3. Delivery is at least once, from a durable byte cursor

For each active change, and each feature whose `reacts_to` is not empty,
`.run/delivered/<feature>` holds a byte offset for each event file. Delivery
reads each file from its offset and consumes only up to the last newline,
since TypeScript and Rust both append unlocked, each writing a whole line in
one call. A complete line that core's event parser refuses is passed over
with a warning on stderr, which does not change the exit code, so a bad line
or a parser bug leaves a trace. A file whose size equals its offset is
skipped after one size check. A file shorter than its offset is an error,
since event files only grow. An offset above 0 whose byte before it is not
a newline is an error too: cursors and event files are both committed, so a
merge, rebase or land can rewrite an event file under its cursor. A missing
cursor starts at 0.

The cursor is written durably: a temporary file, `sync_all`, a rename, and on
Unix an fsync of the folder. It is written after each handled event and at
the end of each file. A crash between a handler's work and its cursor write
delivers that event again. This is the standard pattern for event logs, as
with Kafka consumer offsets or EventStoreDB checkpoints: delivery is at
least once, and every handler is idempotent. A handler checks that the state
an event names still holds, by an identity the event carries, not by a file
name alone, so a replayed event never touches newer state.

When storage moves to a database, the cursor becomes a row written in the
same transaction as the handler's work.

### 4. One lock per change

Delivery to a change holds `.run/delivery.lock`, an empty file separate from
the event files, through std `File::try_lock`. The lock is taken once for
the change and its guard is passed down. The file is never deleted, and the
operating system releases the lock when the process ends.

A lock another process holds is normal, since the loop and a CLI command
overlap. Delivery skips that change quietly and the exit code stays as it
is: the holder delivers, and an event it read too early to see waits,
behind an unmoved cursor, for the next command or loop pass. A lock that
cannot be taken at all, through an IO error or an unsupported platform,
fails delivery to that change loudly. osq assumes a local
filesystem for `.run/`, since file locks over network filesystems are
unreliable. `File::lock` came in Rust 1.89, so the workspace's
`rust-version` is 1.89.

### 5. A failed reaction is shown and retried

The command's own result is printed as before. Each failed reaction adds
`<feature> could not handle <event> for <change>: <error>` on stderr, and
the exit code is 1, so autopilot stops too. Delivery reaches every active
change, so a command on one change exits 1 when a reaction fails for
another; that is intended, and the line names the change. The cursor stays
at the failed event, so the next delivery tries it again. Delivery to other
changes and other features goes on.

### 6. Built in-house

Delivery uses only std and core's event parser. Event-sourcing frameworks
such as `cqrs-es`, `esrs` and `eventually` each bring their own storage and
an async runtime, and ADR 025 keeps today's files. A broker such as Kafka or
NATS needs a server. An in-memory channel may later wake the loop, but never
holds the truth (ADR 022).

### 7. When to use a reaction

Use a reaction when something one feature did must lead to work that
another feature owns, such as approve leading to retry's clearing of
steering triggers. The event names what happened, in the past tense, such
as `approved`. It is never an order addressed to one feature.

Do not use a reaction:

- for work inside one feature. The feature calls its own code.
- for shared logic with no IO, such as parsing or a file format. That goes
  in core, or in a kernel when it needs IO (ADR 022).
- when the command needs the result to finish or to decide its own outcome.
  A reaction runs after the command, and its failure does not undo the
  command. Such work stays in the command's own feature, or the design
  waits for the loop.
- when the work cannot be run twice or cannot wait until the next command.

## Enforcement

- `crates/core/tests/feature_reactions.rs` proves the trait defaults, every
  `EventKind`, and `Reaction`'s constructor and fields.
- `crates/kernel/loop/tests/delivery.rs` proves delivery with hand-written
  features: at least once after a rewound cursor, a partial last line left
  for later, a refused line passed over with a warning, the size-check skip,
  a shorter file failing, a cursor inside a line failing, a held lock
  skipped quietly, a lock that cannot be taken failing, one pass, and the
  failure text.
- `crates/kernel/storage/tests/durable_write.rs` proves the durable write.
- The CLI's tests prove it dispatches through the entry point.
- `#[non_exhaustive]` on `Reaction` and `EventKind` keeps fields and kinds
  additive.

Not enforced yet: that a handler is idempotent. Each handler's own tests
replay its event and check that nothing changes the second time.

## Consequences

- Features react to each other without depending on each other, and the
  loop and the server get their hook from the same code.
- Every command pays one size check per event file of each active change,
  and only for features that react to something.
- Cursor files live in `.run/` and move with the change between the checkout
  and its worktree, so they are committed with the change like its other
  `.run/` files. The lock file is empty and never changes.
- Handlers must be written to run twice. That is the price of at-least-once
  delivery without a database transaction.
- A failing event blocks the later events for that feature and change until
  it succeeds or its cursor is edited by hand.
- Events still waiting when a change is archived are never delivered.
- A rewrite of an event file that still ends each line where the cursor
  expects, such as a merge adding whole lines before the offset, is not
  detected. Catching it would need a hash of the last line read in the
  cursor; that waits until it is seen to happen.

## Rejected

- **Features calling each other**, directly or through a shared kernel made
  only for one caller. It fixes the order of steps before the loop is
  designed, and ADR 022 rejects it.
- **Delivery by the loop only.** Nothing would react until the Rust loop
  exists.
- **A reply event per handled event.** It needs an id on every event first.
- **Cursors outside the change**, such as in `.git/osq/` or `~/.osq`. They
  would not move with the change to its worktree or through land.
- **Exactly-once delivery.** It cannot be had across files without a
  transaction; at least once with idempotent handlers is the standard.
