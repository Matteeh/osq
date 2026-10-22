//! Proves the findings lint reports on the lint fixture project's changes.

mod support;

use osq_core::FeatureError;

use support::{fixture, run, tree};

/// One row: its query and either its output or its failure message.
type Row = (&'static str, Result<&'static str, &'static str>);

/// Every row of "Lint fixture changes", in the scenario's order.
const ROWS: &[Row] = &[
    ("1", Ok("001-clean: valid\n")),
    (
        "002",
        Err("002-bad-delta: 2 findings\n\
             002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:12: the delta \
             names `Ghost`, which the living spec has no requirement for\n\
             002-bad-delta: openspec/changes/002-bad-delta/specs/delta/spec.md:21: the delta \
             names `Phantom`, which the living spec has no requirement for"),
    ),
    (
        "003-dangling-tag",
        Err("003-dangling-tag: 1 finding\n\
             003-dangling-tag: crates/delta/src/lib.rs:12: Implements: tag names \
             requirement:delta/sums-lists, which does not exist"),
    ),
    (
        "4",
        Err("004-merge-conflict: 1 finding\n\
             004-merge-conflict: openspec/changes/004-merge-conflict/specs/delta/spec.md: delta \
             ADDED failed for header \"### Requirement: Adds numbers\" - already exists"),
    ),
    (
        "005-no-delta",
        Err("005-no-delta: 2 findings\n\
             005-no-delta: openspec/changes/005-no-delta/proposal.md:1: the change holds no \
             delta spec\n\
             005-no-delta: crates/delta/src/lib.rs:12: Implements: tag names \
             requirement:delta/sums-lists, which does not exist"),
    ),
];

/// Proves every row of "Lint fixture changes", leaving the fixture unchanged.
///
/// Covers: rust-lint/lint-fixture-changes
#[test]
fn lint_fixture_changes() {
    let root = fixture();
    let before = tree(&root);
    for &(query, ref expected) in ROWS {
        match (run(&root, query), expected) {
            (Ok(output), Ok(text)) => assert_eq!(&output.text, text, "{query}"),
            (Err(error), Err(text)) => match error {
                FeatureError::Failed {
                    command, message, ..
                } => {
                    assert_eq!(command, "lint", "{query}: command");
                    assert_eq!(&message, text, "{query}");
                }
                other => panic!("{query}: expected a failed error, got {other:?}"),
            },
            (result, _) => panic!("{query}: unexpected result {result:?}"),
        }
    }
    assert_eq!(tree(&root), before, "the fixture is unchanged");
}
