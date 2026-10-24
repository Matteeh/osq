//! Proves the repository findings lint prints after the change blocks.

mod copy;
mod support;

use std::fs;

use osq_core::FeatureError;

use support::{run_args, write};

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
/// The repository count line for three findings.
const COUNT_THREE: &str = "repository: 3 findings about other changes and living specs; osq lint \
                           --repository lists them";
/// The repository header that replaces the count line.
const HEADER: &str = "repository: findings about other changes and living specs; they do not \
                      affect the exit code";
/// The text appended to the living spec that gives it a scenario-less requirement.
const APPEND: &str = "\n### Requirement: Halves numbers\nThe system SHALL halve a number.\n";

/// One row: its name, arguments and either its output or failure message.
type Row = (
    &'static str,
    &'static [&'static str],
    Result<String, String>,
);

/// Every row of "Repository lines on the fixture", in the scenario's order.
fn fixture_rows() -> Vec<Row> {
    let listed = format!(
        "001-clean: valid\n{HEADER}\nrepository: {GHOST}\nrepository: {PHANTOM}\nrepository: \
         {NO_DELTA}\n"
    );
    vec![
        (
            "one",
            &["1"],
            Ok(format!("001-clean: valid\n{COUNT_THREE}\n")),
        ),
        ("one_repository", &["1", "--repository"], Ok(listed.clone())),
        (
            "repeated_repository",
            &["--repository", "--repository", "1"],
            Ok(listed),
        ),
        (
            "two",
            &["2"],
            Err(format!(
                "002-bad-delta: 2 findings\n002-bad-delta: {GHOST}\n002-bad-delta: \
                 {PHANTOM}\nrepository: 1 finding about other changes and living specs; osq lint \
                 --repository lists them"
            )),
        ),
        (
            "five_repository",
            &["--repository", "5"],
            Err(format!(
                "005-no-delta: 2 findings\n005-no-delta: {NO_DELTA}\n005-no-delta: \
                 {DANGLING}\n{HEADER}\nrepository: {GHOST}\nrepository: {PHANTOM}"
            )),
        ),
        (
            "one_five",
            &["1", "5"],
            Err(format!(
                "001-clean: valid\n005-no-delta: 2 findings\n005-no-delta: {NO_DELTA}\n\
                 005-no-delta: {DANGLING}\n{COUNT_THREE}"
            )),
        ),
    ]
}

/// Proves every row of "Repository lines on the fixture".
///
/// Covers: rust-lint/repository-lines-on-the-fixture
#[test]
fn repository_lines_on_fixture() {
    for (name, args, expected) in fixture_rows() {
        let root = copy::fixture(&format!(
            "lint_repository/repository_lines_on_fixture/{name}"
        ));
        assert_result(name, run_args(&root, "lint", args), &expected);
    }
}

/// Proves every row of "Repository living spec findings".
///
/// Covers: rust-lint/repository-living-spec-findings
#[test]
fn repository_living_spec_findings() {
    let rows: [Row; 2] = [
        (
            "count",
            &["1"],
            Ok(
                "001-clean: valid\nrepository: 4 findings about other changes and living specs; \
                 osq lint --repository lists them\n"
                    .to_owned(),
            ),
        ),
        (
            "list",
            &["1", "--repository"],
            Ok(format!(
                "001-clean: valid\n{HEADER}\nrepository: {GHOST}\nrepository: {PHANTOM}\n\
                 repository: {NO_DELTA}\nrepository: openspec/specs/delta/spec.md:23: \
                 requirement `Halves numbers` has no scenario\n"
            )),
        ),
    ];
    for (name, args, expected) in rows {
        let root = copy::fixture(&format!(
            "lint_repository/repository_living_spec_findings/{name}"
        ));
        append_to_living_spec(&root);
        assert_result(name, run_args(&root, "lint", args), &expected);
    }
}

/// Proves "Repository check error".
///
/// Covers: rust-lint/repository-check-error
#[test]
fn repository_check_error() {
    let root = copy::fixture("lint_repository/repository_check_error");
    write(
        &root,
        "openspec/changes/006-unreadable/proposal.md",
        "---\ntitle: Unreadable\n---\n",
    );
    write(
        &root,
        "openspec/changes/006-unreadable/specs/delta/spec.md",
        [0xff, 0xfe],
    );
    let error = run_args(&root, "lint", &["1"]).expect_err("the repository check cannot run");
    let FeatureError::Failed {
        command, message, ..
    } = error
    else {
        panic!("expected a failed error, got {error:?}");
    };
    assert_eq!(command, "lint");
    let prefix = format!(
        "{}/openspec/changes/006-unreadable/specs/delta/spec.md: ",
        root.display()
    );
    assert!(message.starts_with(&prefix), "{message}");
}

/// Appends a scenario-less requirement to a copied fixture's living spec.
fn append_to_living_spec(root: &std::path::Path) {
    let path = "openspec/specs/delta/spec.md";
    let mut spec = fs::read_to_string(root.join(path)).expect("the living spec is read");
    spec.push_str(APPEND);
    write(root, path, spec);
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
