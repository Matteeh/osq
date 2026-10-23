---
reason: sync_verify_red
---
319-rust-run-test-git-identity: verify failed on osq/319-rust-run-test-git-identity merged with main:
test branch_and_worktree_writes_on_a_repository ... ok
test commit_from_a_tree ... ok

failures:

---- commit_writes_with_a_program_that_cannot_start stdout ----

thread 'commit_writes_with_a_program_that_cannot_start' (3725369) panicked at crates/kernel/vcs/tests/branch_and_commit_writes.rs:126:5:
assertion `left == right` failed
  left: InputOutputError
 right: NotFound
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    commit_writes_with_a_program_that_cannot_start

test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.36s

error: test failed, to rerun pass `-p osq-kernel-vcs --test branch_and_commit_writes`
