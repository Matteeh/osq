# osq queue

The remaining work on osq itself, as an osq brief queue.

Each item's body becomes that change's `brief.md` word for word. Drive the run with `osq plan --next`, then plan the change in a Claude Code session, review it, and `osq approve`.

Landed items are taken out of this file. Each one's text is kept as `brief.md` in its archived change folder, and each finished queue has a summary in Notion under OSQ > Archive. The latest, "osq queue, 2026-10-13 to 2026-10-15 (completed)", covers 189 to 197; earlier queues drove 166 to 188, 156 to 165, 145 to 155, 136 to 144, 132 to 135 and 103 to 131.

This queue serves the Rust rewrite, which is designed by hand in Notion (OSQ > Rust Rebuild, with its roadmap database) and built in this repository. osq's Rust support landed as 201 to 203, and the Rust crates themselves are planned by hand as changes, starting with 204 rust-core. The items here make the Rust code's tests prove something: ADR 024 says `cargo llvm-cov` proves a test runs the code and `cargo mutants` proves the test checks it. Run them after 207 (ADR groups) lands and before 208 (storage kernel) is planned, so storage is the first crate built under the gate.

One change at a time: land each before the next is planned.

osq reads only the `## [slug]` items below. Everything above the first item is for people.

## [rust-mutants-core] rust-core has no missed mutants, and a script and Rust CI check every crate with cargo-mutants

Depends on: nothing

### Goal

Every mutant cargo-mutants makes in rust-core is caught by a test, and one script runs cargo-mutants the same way locally and in CI, so a Rust crate's tests are known to check its code rather than only run it.

### Context

As of 2026-10-18:

- `cargo mutants -p osq-core` with cargo-mutants 27.1.0 found 117 mutants: 79 caught, 27 unviable, 11 missed, no timeouts. It took 16 minutes serially, about 9 seconds per test run.
- The 11 missed, all test gaps rather than equivalent mutants:
  - `crates/core/src/change.rs:135` `Change<S>::id` replaced with `""` and with `"xyzzy"`, and `:143` `Change<S>::tasks` replaced with an empty slice.
  - The `Display` impls of `EventError` (`event.rs:220`), `Seal` (`seal.rs:51`), `SealError` (`seal.rs:64`) and `TaskId` (`fold/stream.rs:38`) replaced with `Ok(Default::default())`: no test checks their text.
  - `fold/change.rs:68` match guard `data.task.as_deref() == Some("change")` and `:72` `data.target == "change"` in `apply_change` replaced with `true`.
  - `fold/stream.rs:48` match guard `left != right` in `<TaskId as Ord>::cmp` replaced with `true`.
  - `fold/task.rs:75` field `reason` deleted from the `TaskState` built in `apply_task`.
- cargo-mutants exits 0 when every mutant is caught and 2 when one is missed. It reads `.cargo/mutants.toml`, takes `--in-diff <file>` to mutate only lines a diff touches, `--jobs` to test in parallel, and writes `mutants.out/` into the source tree unless `--output` names another folder.
- `scripts/verify-rust.sh` runs format, clippy and test, and `.github/workflows/rust.yml` runs it on push and pull request to main. Neither file, nor the root `Cargo.toml`, is in any capability's Code ownership yet.
- ADR 024's Enforcement section has no mutation bullet. Its Notion copy has: "`cargo llvm-cov` proves a test runs the code, and `cargo mutants` proves the test checks it. `cargo mutants --in-diff` runs in Rust CI as a measured check now. Once core has zero missed mutants it becomes blocking for core and part of osq's verify for Rust changes, so agents fix misses inside the task. Each crate follows the same path as it is built."

### Requirements

- New tests in `crates/core/tests/` catch all 11 missed mutants. No source in `crates/core/src/` changes unless a mutant shows dead code, which the change then says.
- `.cargo/mutants.toml` holds the workspace's cargo-mutants settings. An `exclude_re` entry is allowed only for a mutant shown to be equivalent, with a comment saying why. This change adds none.
- `scripts/mutants-rust.sh` runs cargo-mutants over the workspace, or over the lines of a diff file when one is given, writes its output outside the source tree, and exits non-zero on any missed mutant or timeout.
- `.github/workflows/rust.yml` gains a job that installs cargo-mutants at a pinned version and runs the script on the push's or pull request's diff, failing on a missed mutant. A full workspace run happens on a weekly schedule.
- ADR 024's Enforcement section gains the mutation bullet, updated to say rust-core now has zero missed mutants and the CI check blocks.
- One capability owns `scripts/verify-rust.sh`, `scripts/mutants-rust.sh`, `.cargo/mutants.toml` and `.github/workflows/rust.yml`. rust-core is the default unless the planner finds a better owner.

### Non-goals

- Running cargo-mutants in osq's own verify; that is `rust-mutants-verify`.
- The TypeScript mutation check (Stryker), which stays as it is.
- `cargo llvm-cov`, which the link graph milestone brings.
## [rust-mutants-verify] A Rust change's verify fails on a missed mutant in the lines it changed

Depends on: rust-mutants-core

### Goal

An executor that adds or changes Rust code without a test that catches its mutants fails verify inside its own task and fixes it there, instead of the miss turning up in CI after land.

### Context

As of 2026-10-18:

- After `rust-mutants-core`, `scripts/mutants-rust.sh` runs cargo-mutants on a diff and Rust CI blocks on a missed mutant. osq lands on main locally and pushes afterwards, so CI only reports a miss after the change has landed.
- Rust changes use `sh scripts/verify-rust.sh` as the proposal verify, which the watcher runs after every task and at archive.
- A full rust-core run takes 16 minutes, too slow for every task. Mutating only the lines the change touched keeps it to the new code.
- The watcher passes `OSQ_CHANGE`, the change folder, to every verify command, and `.run/base` in that folder holds the commit the change started from.
- ADR 003: agents never run git, and osq alone writes to git. A verify command is run by osq, not by an agent, but whether it may read git, for example with `git diff`, is not written down.
- osq's existing mutation check (`traceability.mutation`, `src/watcher/mutation-check.ts`) observes TypeScript only and never fails a task.

### Requirements

- A Rust change's verify runs cargo-mutants on the Rust lines the change has touched since its base, and fails on a missed mutant or timeout. Outside an osq run, such as in CI or by hand, the same script runs on the diff it is given.
- The diff comes from something osq already gives verify or from a read-only git command. The planner checks this against ADR 003 and ADR 007, and if neither fits, osq writes the diff itself.
- A change with no Rust line touched runs no mutants and passes this step.
- AGENTS.md's Rust crates section tells executors that verify fails on a missed mutant and how to run the check by hand.

### Non-goals

- Making osq's TypeScript mutation check cover Rust.
- A new dead reason; a missed mutant fails verify like any other failing check.