---
reason: verify_red
command: "sh scripts/verify-rust.sh"
exit_code: 101
---
Archive-time change-level verification failed.

running 2 tests
test rejected_snapshots_give_no_outcome ... ok
test query_rows_equal_the_table_rows ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running unittests src/lib.rs (target/debug/deps/osq_kernel_vcs-00d262b2ff92d7d8)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/branch_and_commit_writes.rs (target/debug/deps/branch_and_commit_writes-164c72e20a70b170)

running 6 tests
test stage_and_commit_on_a_repository ... ok
test branch_and_worktree_writes_with_a_program_that_cannot_start ... FAILED
test commit_from_a_tree_that_git_is_set_to_sign ... ok
test commit_writes_with_a_program_that_cannot_start ... ok
test branch_and_worktree_writes_on_a_repository ... ok
test commit_from_a_tree ... ok

failures:

---- branch_and_worktree_writes_with_a_program_that_cannot_start stdout ----

thread 'branch_and_worktree_writes_with_a_program_that_cannot_start' (3472766) panicked at crates/kernel/vcs/tests/branch_and_commit_writes.rs:126:5:
assertion `left == right` failed
  left: InputOutputError
 right: NotFound
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    branch_and_worktree_writes_with_a_program_that_cannot_start

test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.26s

error: test failed, to rerun pass `-p osq-kernel-vcs --test branch_and_commit_writes`
Full output: .run/logs/change-2.log
