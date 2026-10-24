---
status: accepted
applies_to: [group:rust]
rule: A feature crate exposes one core Feature, which gives its name, its commands as data, and runs one command to output or a typed error.
checks:
  - tests/rust-adrs.test.ts
  - crates/core/tests/feature.rs
---
# 028. Rust Feature trait

Date: 2026-10-21

## Status

Accepted by Mathias on 2026-10-21, when he approved change 240,
rust-feature-trait. It fills in the `Feature` trait that ADR 022 section 2
names and does not define.

Scope: this ADR governs every capability in group `rust`, the Rust crates, not
the TypeScript code under `src/`.

## Context

ADR 022 says a feature crate holds its logic, its CLI subcommand, its server
routes and the loop hooks it reacts to, and exposes one implementation of
core's `Feature` trait, with everything else private. The apps only register
features. No such trait exists yet, so no feature crate can be built, and
every feature change would otherwise invent its own entry point.

The CLI, the server and the loop are not built yet. The first features
planned on the trait are `report`, which answers `osq query`, and `inbox`.
Both are commands: they take arguments, read the project through the storage
read model, and print a result.

ADR 023 allows a trait in core only when a second implementation or a test
double needs it. Every feature crate implements this one, and core's own test
implements it by hand.

## Decision

### 1. The trait has three methods

```rust
pub trait Feature {
    fn name(&self) -> &str;
    fn commands(&self) -> Vec<Command>;
    fn run(&self, invocation: &Invocation) -> Result<Output, FeatureError>;
}
```

- `name` is the feature's name, the same as its crate folder, such as
  `report`.
- `commands` lists the commands the feature offers as plain data. A `Command`
  holds its `name`, a one-line `summary` and a `usage` text for its
  arguments, such as `<select>`. The CLI builds its help and finds a command's
  feature from this list alone.
- `run` runs one command. An `Invocation` holds the project `root` as a path,
  the `command` name and its `args` as strings, exactly as the user gave them.
  The feature parses its own arguments.
- `run` returns an `Output` holding the `text` to print, or a `FeatureError`:
  `UnknownCommand` for a name the feature does not offer, `Usage` for
  arguments it cannot read, and `Failed` for a command that read its
  arguments and then failed.

### 2. Core describes the call, the feature does the IO

Every type the trait names is plain data in `osq-core`, with no IO, so core
keeps ADR 022's rule. The feature's `run` does its IO itself, through the
kernel crates and the storage read model, inside its own crate.

### 3. The trait is object safe

Apps hold their features as a list of `Box<dyn Feature>`, in registration
order, and dispatch a command to the first feature that lists it.

### 4. The types grow without touching features

`Command`, `Invocation`, `Output` and `FeatureError`, and each `FeatureError`
variant, are `#[non_exhaustive]`. A feature builds them only through their
constructors, `Command::new(name, summary, usage)`,
`Invocation::new(root, command, args)`, `Output::text(text)`,
`FeatureError::unknown_command(name)`, `FeatureError::usage(command, message)`
and `FeatureError::failed(command, message)`, and reads their public fields.
A `match` on `FeatureError` outside core needs a wildcard arm.

So adding a field or a variant later is an additive change in core that
touches no feature crate. The expected ones are a JSON `data` field on
`Output` for the server and the dashboard, and config or environment values
on `Invocation`. Core already depends on `serde_json`, so JSON output stays a
small follow-up with no new dependency.

### 5. Features open storage per run

A feature opens the storage read model from `root` inside each `run` and
does not hold a SQLite connection, or other per-run state, in its feature
struct. A connection is `Send` but not `Sync`, so a struct that held one
could never be shared across threads. Keeping the struct to plain
configuration keeps adding `Send + Sync` to the trait later painless.

### 6. What the trait leaves for later

Each of these joins the trait in the change that first needs it, with its
own test:

- Server routes, when the server app is built.
- Loop hooks, the events a feature reacts to: ADR 030 adds them.
- Structured output such as JSON, as a new `Output` field, when the server
  or the dashboard needs it.
- `Send` and `Sync` bounds, when a feature runs off the main thread; section
  5 keeps every feature ready for them.
- Exit codes beyond success and failure, when the CLI app maps errors.

## Enforcement

- `tests/rust-adrs.test.ts` checks that this ADR is accepted, applies to group
  `rust`, names its checks and is linked from the index.
- `crates/core/tests/feature.rs` implements the trait by hand, runs its
  commands, registers it with a second feature as `Box<dyn Feature>`, builds
  every value through the constructors and checks their fields, and checks
  every error's text.
- `#[non_exhaustive]` makes the compiler refuse a struct literal or an
  exhaustive `match` on these types in any crate but core.
- Cargo enforces the shape: a feature crate that implements the trait must
  match its signature.

Not enforced yet, each with the work that will enforce it:

| Rule | Enforced by |
| --- | --- |
| A feature crate exposes exactly one public item, its `Feature` implementation | an osq lint gate, with the second feature crate |
| Apps only register features | the CLI app, when it is built |
| A feature's name equals its crate folder | the same lint gate as the first row |
| A feature struct holds no storage connection | review, until a feature first needs `Send + Sync` |

Each of those changes adds its tests to this ADR's `checks`.

## Consequences

- Feature crates can be built side by side, each against the same small
  trait in core, without waiting for the CLI.
- A feature is testable without a terminal: a test builds an `Invocation`
  and reads the `Output` or the error.
- Changing the trait is a core change, so it serializes behind other core
  work, as ADR 027 locks `crates/core` as a whole. Keeping the trait small
  keeps that rare.
- Raw string arguments mean each feature parses its own; a shared parser can
  come later without changing the trait.

## Rejected

- **Routes and loop hooks in the trait now.** Neither the server nor the loop
  calls features yet, so their shape would be a guess.
- **A typed argument list in `Command`.** The first features take one or two
  arguments; a usage line covers the help, and a typed list can come with the
  CLI app.
- **A context handle to the read model in `Invocation`.** Core cannot name the
  storage kernel without depending on it, which ADR 022 forbids. The feature
  opens the read model from `root`.
- **One trait per surface, such as `Command` and `Route` traits.** A feature
  would then expose more than one item, against ADR 022.
