//! Proves the report feature refuses every query that is not one read-only select.

mod support;

use osq_core::FeatureError;

/// Proves every `authorize` golden case byte for byte.
///
/// Covers: rust-report/golden-query-refusals
#[test]
fn golden_query_refusals() {
    for case in support::golden_cases()
        .iter()
        .filter(|case| case.group == "authorize")
    {
        let root = support::scratch(
            &case.fixture,
            &format!("query-authorize-golden-{}", case.name),
        );
        let result = support::run(&root, case.select.as_deref());
        match result {
            Err(FeatureError::Failed {
                command, message, ..
            }) => {
                assert_eq!(case.result, "failed", "{} is a failed case", case.name);
                assert_eq!(
                    (command.as_str(), message.as_str()),
                    ("query", case.text.as_str()),
                    "{}",
                    case.name
                );
            }
            Ok(output) => panic!("{}: expected Failed, got {:?}", case.name, output.text),
            Err(other) => panic!("{}: expected Failed, got {other:?}", case.name),
        }
    }
}

/// Proves a write refusal and a second-statement refusal write no file.
///
/// Covers: rust-report/refusal-writes-nothing
#[test]
fn refusal_writes_nothing() {
    for (name, select) in [
        ("refused-delete", "DELETE FROM changes"),
        ("refused-second-select", "SELECT 1; SELECT 2"),
    ] {
        let root = support::scratch("history", &format!("query-authorize-writes-{name}"));
        let result = support::run(&root, Some(select));
        assert!(result.is_err(), "{name} fails");
        assert!(!root.join(".osq").exists(), "{name} writes no .osq folder");
    }
}

/// Proves the hidden-table and transaction refusals.
///
/// Covers: rust-report/hidden-table-and-transaction
#[test]
fn hidden_table_and_transaction() {
    let cases = support::golden_cases();
    for name in ["refused-hidden-table", "refused-transaction"] {
        let case = cases.iter().find(|case| case.name == name).unwrap();
        let root = support::scratch(&case.fixture, &format!("query-authorize-other-{name}"));
        let result = support::run(&root, case.select.as_deref());
        match result {
            Err(FeatureError::Failed { message, .. }) => {
                assert_eq!(message, case.text, "{name}");
            }
            other => panic!("{name}: expected Failed, got {other:?}"),
        }
    }
}

/// Proves a trailing semicolon stays one statement and a second is refused.
///
/// Covers: rust-report/trailing-semicolon-is-one-statement
#[test]
fn trailing_semicolon_is_one_statement() {
    let cases = support::golden_cases();
    let single = cases
        .iter()
        .find(|case| case.name == "trailing-semicolon")
        .unwrap();
    let root = support::scratch(&single.fixture, "query-authorize-trailing-single");
    let output = support::run(&root, single.select.as_deref())
        .expect("one trailing semicolon succeeds")
        .text;
    assert_eq!(
        (single.result.as_str(), output.as_str()),
        ("output", single.text.as_str()),
        "trailing-semicolon"
    );

    let double = cases
        .iter()
        .find(|case| case.name == "refused-double-semicolon")
        .unwrap();
    let root = support::scratch(&double.fixture, "query-authorize-trailing-double");
    match support::run(&root, double.select.as_deref()) {
        Err(FeatureError::Failed { message, .. }) => {
            assert_eq!(
                (double.result.as_str(), message.as_str()),
                ("failed", double.text.as_str()),
                "refused-double-semicolon"
            );
        }
        other => panic!("refused-double-semicolon: expected Failed, got {other:?}"),
    }
}
