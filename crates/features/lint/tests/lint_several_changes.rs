//! Proves lint over several fixture changes and its first missing id.

mod support;

use osq_core::FeatureError;

use support::{fixture, run_args, run_args_without_repository, tree};

/// The line for the `Ghost` finding of `002-bad-delta`.
const GHOST: &str = "openspec/changes/002-bad-delta/specs/delta/spec.md:12: the delta names \
                     `Ghost`, which the living spec has no requirement for";
/// The line for the `Phantom` finding of `002-bad-delta`.
const PHANTOM: &str = "openspec/changes/002-bad-delta/specs/delta/spec.md:21: the delta names \
                       `Phantom`, which the living spec has no requirement for";
/// The line for the missing delta of `005-no-delta`.
const NO_DELTA: &str =
    "openspec/changes/005-no-delta/proposal.md:1: the change holds no delta spec";
/// The line for the dangling tag of `003-dangling-tag` and `005-no-delta`.
const DANGLING: &str = "crates/delta/src/lib.rs:12: Implements: tag names \
                        requirement:delta/sums-lists, which does not exist";
/// The line for the refused merge of `004-merge-conflict`.
const MERGE: &str = "openspec/changes/004-merge-conflict/specs/delta/spec.md: delta ADDED failed \
                     for header \"### Requirement: Adds numbers\" - already exists";

/// One row: its name, arguments and either its output or failure message.
type Row = (
    &'static str,
    &'static [&'static str],
    Result<String, String>,
);

/// Every row of "Lint several fixture changes", in the scenario's order.
fn rows() -> Vec<Row> {
    vec![
        (
            "one_three",
            &["1", "3"],
            Err(format!(
                "001-clean: valid\n003-dangling-tag: 1 finding\n003-dangling-tag: {DANGLING}"
            )),
        ),
        (
            "five_one",
            &["5", "1"],
            Err(format!(
                "005-no-delta: 2 findings\n005-no-delta: {NO_DELTA}\n005-no-delta: {DANGLING}\n\
                 001-clean: valid"
            )),
        ),
        (
            "one_twice",
            &["1", "001-clean"],
            Ok("001-clean: valid\n001-clean: valid\n".to_owned()),
        ),
        (
            "none",
            &[],
            Err(format!(
                "001-clean: valid\n002-bad-delta: 2 findings\n002-bad-delta: {GHOST}\n\
                 002-bad-delta: {PHANTOM}\n003-dangling-tag: 1 finding\n003-dangling-tag: \
                 {DANGLING}\n004-merge-conflict: 1 finding\n004-merge-conflict: {MERGE}\n\
                 005-no-delta: 2 findings\n005-no-delta: {NO_DELTA}\n005-no-delta: {DANGLING}"
            )),
        ),
    ]
}

/// Proves every row of "Lint several fixture changes", leaving the fixture unchanged.
///
/// Covers: rust-lint/lint-several-fixture-changes
#[test]
fn lint_several_fixture_changes() {
    let root = fixture();
    let before = tree(&root);
    for (name, args, expected) in rows() {
        assert_result(
            name,
            run_args_without_repository(&root, "lint", args),
            &expected,
        );
    }
    assert_eq!(tree(&root), before, "the fixture is unchanged");
}

/// Proves "Lint stops at a missing id".
///
/// Covers: rust-lint/lint-stops-at-a-missing-id
#[test]
fn lint_stops_at_a_missing_id() {
    let root = fixture();
    let changes = root.join("openspec").join("changes");
    let error = run_args(&root, "lint", &["1", "9"]).expect_err("the second id names no change");
    assert_eq!(
        error.to_string(),
        format!("lint failed: Spec \"9\" not found in {}", changes.display())
    );
    match error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "lint"),
        other => panic!("expected a failed error, got {other:?}"),
    }
}

/// Compares one row's result with its expected output or failure message.
fn assert_result(
    name: &str,
    result: Result<osq_core::Output, FeatureError>,
    expected: &Result<String, String>,
) {
    match (result, expected) {
        (Ok(output), Ok(text)) => assert_eq!(&output.text, text, "{name}"),
        (Err(error), Err(text)) => match error {
            FeatureError::Failed {
                command, message, ..
            } => {
                assert_eq!(command, "lint", "{name}: command");
                assert_eq!(&message, text, "{name}");
            }
            other => panic!("{name}: expected a failed error, got {other:?}"),
        },
        (result, _) => panic!("{name}: unexpected result {result:?}"),
    }
}
