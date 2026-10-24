---
queue_item: rust-feature-events-adr
queue_hash: sha256:3b07a56e272821cd171af2f26147a8b15272a1bcd7a5cb1ae799c2f9e5bb9ec5
planner: null
date: 2026-10-23
---

### Goal

ADR 022 says features never call each other and talk through event files, and ADR 028 left "loop hooks, the events a feature reacts to" for later. Steered approval is the first place that needs them: after a re-approval, retry's code must clear the triggers, and approve may not call the retry crate. This change writes the ADR and builds the mechanism, so approve can emit an event and retry can react to it. It also gives the loop and the server their hook.

### Context

As of 2026-10-24, decided with the human in a design session:

- Trait: `Feature` gains `reacts_to() -> Vec<EventKind>` (plain data, like `commands()`, default empty) and `react(&self, reaction: &Reaction<'_>) -> Result<Output, FeatureError>`. `Reaction<'a>` is a `#[non_exhaustive]` core struct holding the root, the change and `&'a Envelope`; it is declared with a lifetime now so a borrowed database transaction can join it later without changing any handler. Storage is `rusqlite`, which works through `&`, so no `&mut`.
- Delivery: one kernel entry point, in the loop kernel, runs a command and then delivers its new events. The CLI, the future server (ADR 014) and the future loop all call it, and no app delivers on its own. One pass: events a reaction appends are delivered by the next command or loop pass, so there are no cycles. Reactions may not call the entry point.
- Handled-record: `.run/delivered/<feature>` per change holds a byte offset per event file. Delivery is at-least-once and handlers must be idempotent, as with Kafka consumer offsets or EventStoreDB checkpoints. Delivery reads from the offset and consumes only up to the last `\n`, since TypeScript and Rust append unlocked, each writing a whole line in one call. A file whose size equals its cursor is skipped with one size check; a file shorter than its cursor is an error. Only active changes are delivered. Later the record becomes a database row committed in the handler's transaction.
- Lock: `.run/delivery.lock` per change, separate from the event files, taken once with std `File::lock` (Rust 1.89, so `rust-version` goes from 1.85 to 1.89), never deleted, git-ignored like `.run/running/`, released by the kernel on exit. A lock error fails loudly. osq assumes a local filesystem for `.run/`.
- Cursor writes are durable: temp file, `sync_all`, rename, then fsync the directory under `#[cfg(unix)]`. No Rust code does this today, so a storage-kernel helper is new here.
- Failure: the command's output, then `<feature> could not handle <event> for <change>: <error>`, and exit 1. The cursor stays, so the next delivery tries again.
- In-house on std and core's event parser. No event-sourcing framework (`cqrs-es`, `esrs`, `eventually`): each brings its own storage and async runtime, and ADR 025 keeps today's files. No broker, and no in-memory bus as truth (ADR 022).
- First user: approve appends an `approved` event to `change.jsonl` naming the triggers it saw, and retry reacts by clearing them (queue item `rust-approve-steered`, change 325, held until this lands). TypeScript reads `change.jsonl` too, so check that it tolerates a new event type.

### Requirements

- A new Rust ADR records these decisions, and ADR 028's "Loop hooks" line points to it.
- Core gains the trait methods, `EventKind`, `Reaction` and the `approved` event; the loop kernel gains the delivery entry point with cursor, lock and failure output; the storage kernel gains the durable write; the CLI dispatches through the entry point.
- Tests prove: at-least-once delivery after a crash between handler and cursor, a partial last line left for later, the size-check skip, a shorter file failing, a held lock refused loudly, and failure output with exit 1.

### Non-goals

- Steered approval itself; `rust-approve-steered` uses this next.
- A shared event appender and durable marker renames; roadmap rows.
- The server and the loop; they call the entry point when they are built.
