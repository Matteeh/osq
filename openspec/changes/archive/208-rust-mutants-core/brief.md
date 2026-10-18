---
queue_item: rust-mutants-core
queue_hash: sha256:fa77bcad98dd842eeaf575ca432a021e14d81d629c964ed1dceffb4d744c066c
planner: null
date: 2026-10-18
---

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
