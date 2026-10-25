//! Proves `report`'s Validation and Coverage sections and JSON members.

mod summary_support;

use serde_json::{Value, json};

use summary_support::{project, run, scratch};

/// The Validation section the coverage project's text holds.
const VALIDATION: &[&str] = &[
    "Validation:",
    "  2 of 4 changes validated, 2 findings",
    "  301-validated: 2 findings",
    "  302-timed-out: not validated (timed_out)",
    "  310-tie: not validated (failed)",
    "  311-findings-not-a-list: 0 findings",
];

/// The Coverage lines that end every report's text.
const COVERAGE: &[&str] = &[
    "Coverage:",
    "  Tasks with event files: 3",
    "  Tasks without event files: 4",
];

/// The Coverage lines of a project with no tasks.
const EMPTY_COVERAGE: &[&str] = &[
    "Coverage:",
    "  Tasks with event files: 0",
    "  Tasks without event files: 0",
];

/// Proves the coverage project's Validation text and member row by row.
///
/// Covers: rust-report/validation-of-the-coverage-project
#[test]
fn validation_of_the_coverage_project() {
    let root = project(
        "validation-of-the-coverage-project",
        "coverage-project",
        "coverage-project",
    );
    let text = run(&root, &[]).expect("report prints text");
    let lines: Vec<&str> = text.lines().collect();
    let start = lines
        .iter()
        .position(|line| *line == "Validation:")
        .expect("the text holds a Validation line");
    assert_eq!(lines[start - 1], "", "a blank line before Validation:");
    assert_eq!(&lines[start..start + VALIDATION.len()], VALIDATION);

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    assert_eq!(
        report["validation"],
        json!({
            "changes": 4,
            "validated": 2,
            "findings": 2,
            "perChange": [
                {"change": "301-validated", "outcome": "validated", "findings": 2},
                {"change": "302-timed-out", "outcome": "timed_out", "findings": 0},
                {"change": "310-tie", "outcome": "failed", "findings": 0},
                {"change": "311-findings-not-a-list", "outcome": "validated", "findings": 0},
            ],
        })
    );
}

/// Proves a project with no readable validator run leaves Validation out.
///
/// Covers: rust-report/no-validation-section-without-a-run
#[test]
fn no_validation_section_without_a_run() {
    let root = project(
        "no-validation-section-without-a-run",
        "sizes-project",
        "sizes-project",
    );
    let text = run(&root, &[]).expect("report prints text");
    assert!(
        !text.lines().any(|line| line == "Validation:"),
        "the text holds no Validation line: {text}"
    );
    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    assert!(report.get("validation").is_none(), "no validation member");
}

/// Proves the coverage project's Coverage text and member row by row.
///
/// Covers: rust-report/coverage-of-the-coverage-project
#[test]
fn coverage_of_the_coverage_project() {
    let root = project(
        "coverage-of-the-coverage-project",
        "coverage-project",
        "coverage-project",
    );
    let text = run(&root, &[]).expect("report prints text");
    assert!(text.ends_with(&COVERAGE.join("\n")), "{text}");

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    assert_eq!(
        report["coverage"],
        json!({
            "withEvents": 3,
            "withoutEvents": 4,
            "capabilities": {
                "withSidecar": ["alpha"],
                "withoutSidecar": ["beta"],
            },
            "byChange": {
                "301-validated": {"withEvents": ["1"], "withoutEvents": ["2"]},
                "302-timed-out": {"withEvents": [], "withoutEvents": ["1"]},
                "303-unreadable": {"withEvents": [], "withoutEvents": ["1"]},
                "305-active": {"withEvents": ["2", "10"], "withoutEvents": ["1"]},
            },
        })
    );
}

/// Proves an empty project gives empty Coverage without a capability split.
///
/// Covers: rust-report/coverage-with-no-living-spec
#[test]
fn coverage_with_no_living_spec() {
    let root = scratch("coverage-with-no-living-spec", "empty");
    let text = run(&root, &[]).expect("report prints text");
    assert!(text.ends_with(&EMPTY_COVERAGE.join("\n")), "{text}");

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    assert_eq!(
        report["coverage"],
        json!({"byChange": {}, "withEvents": 0, "withoutEvents": 0})
    );
    assert!(
        report["coverage"].get("capabilities").is_none(),
        "no capabilities member"
    );
}
