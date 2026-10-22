//! Proves the report feature's name, commands and argument errors.

use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_report::ReportFeature;

/// The `history` fixture every argument case runs against.
fn history_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/history")
}

/// Proves the feature's name and its one command.
///
/// Covers: rust-report/report-feature-commands
#[test]
fn report_feature_commands() {
    let feature = ReportFeature;
    assert_eq!(feature.name(), "report");
    let commands = feature.commands();
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].name, "query");
    assert_eq!(
        commands[0].summary,
        "run one read-only SELECT over the osq history tables"
    );
    assert_eq!(commands[0].usage, "[--json] [select]");
}

/// Proves every argument-error row and that none writes a file.
///
/// Covers: rust-report/query-argument-errors
#[test]
fn query_argument_errors() {
    let root = history_root();
    for args in [
        vec!["a".to_owned(), "b".to_owned()],
        vec!["--json".to_owned(), "a".to_owned(), "b".to_owned()],
    ] {
        let result = ReportFeature.run(&Invocation::new(&root, "query", args));
        assert_eq!(
            result.expect_err("two selects fail").to_string(),
            "usage of query: expected at most one select, got 2 arguments"
        );
    }
    let result = ReportFeature.run(&Invocation::new(&root, "report", Vec::new()));
    assert_eq!(
        result.expect_err("an unknown command fails").to_string(),
        "unknown command: report"
    );
    assert!(
        !root.join(".osq").exists(),
        "an argument error writes no file"
    );
}
