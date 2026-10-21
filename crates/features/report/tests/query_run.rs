//! Proves the report feature's query output, path rewriting, cache and errors.

mod support;

use std::fs;
use std::process::Command;

use osq_core::FeatureError;

/// The literal-values golden case's column names.
const LITERAL_HEADER: &str = "empty\tlines\treal\twhole\tbytes";
/// The literal-values golden case's one row.
const LITERAL_ROW: &str = "\ta\\nb\t1.5\t7\t1,2";

/// Proves every `run` golden case byte for byte.
///
/// Covers: rust-report/golden-query-output
#[test]
fn golden_query_output() {
    for case in support::golden_cases()
        .iter()
        .filter(|case| case.group == "run")
    {
        let root = support::scratch(&case.fixture, &format!("query-run-golden-{}", case.name));
        let result = support::run(&root, case.select.as_deref());
        match result {
            Ok(output) => {
                assert_eq!(case.result, "output", "{} is not an output case", case.name);
                assert_eq!(output.text, case.text, "{}", case.name);
            }
            Err(error) => {
                assert_eq!(case.result, "failed", "{} is not a failed case", case.name);
                match error {
                    FeatureError::Failed {
                        command, message, ..
                    } => {
                        assert_eq!(command, "query", "{}", case.name);
                        assert_eq!(message, case.text, "{}", case.name);
                    }
                    other => panic!("{}: expected Failed, got {other:?}", case.name),
                }
            }
        }
    }
}

/// Proves the two table-list cases, their first and last line, and no cache.
///
/// Covers: rust-report/table-list-without-a-select
#[test]
fn table_list_without_a_select() {
    let cases = support::golden_cases();
    for name in ["table-list", "blank-select"] {
        let case = cases.iter().find(|case| case.name == name).unwrap();
        let root = support::scratch(&case.fixture, &format!("query-run-table-list-{name}"));
        let output = support::run(&root, case.select.as_deref())
            .expect("the table list succeeds")
            .text;
        let lines: Vec<&str> = output.lines().collect();
        assert_eq!(lines.len(), 16, "{name} holds sixteen tables");
        assert_eq!(
            lines[0],
            "changes(id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner)",
            "{name} starts with changes"
        );
        assert_eq!(
            lines[15], "manual_edits(kept_at, record, comment, paths, capabilities)",
            "{name} ends with manual_edits"
        );
        assert!(!root.join(".osq").exists(), "{name} writes no .osq folder");
    }
}

/// Proves the root and home rewrite in query values.
///
/// Covers: rust-report/paths-in-query-values
#[test]
fn paths_in_query_values() {
    let home = std::env::var("HOME").unwrap_or_default();
    let (home_path, expected) = if home.is_empty() {
        ("/home/osq-test".to_owned(), "/home/osq-test/b".to_owned())
    } else {
        (home, "~/b".to_owned())
    };
    let root = support::scratch("history", "query-run-paths");
    let select = format!("SELECT '{}/a' AS p, '{home_path}/b' AS q", root.display());
    let output = support::run(&root, Some(&select))
        .expect("the path query succeeds")
        .text;
    assert_eq!(output, format!("p\tq\n./a\t{expected}"));
}

/// Proves the home rewrite with a chosen HOME and with HOME unset.
///
/// Covers: rust-report/paths-in-query-values
#[test]
fn paths_in_query_values_without_home() {
    let Some(marker) = std::env::var("OSQ_QUERY_TEST_HOME").ok() else {
        spawn_home_child(true);
        spawn_home_child(false);
        return;
    };
    let (name, home_path, expected) = if marker.is_empty() {
        (
            "query-run-paths-child-unset",
            "/home/osq-test-unset".to_owned(),
            "/home/osq-test-unset/b".to_owned(),
        )
    } else {
        ("query-run-paths-child-set", marker, "~/b".to_owned())
    };
    let root = support::scratch("history", name);
    let select = format!("SELECT '{}/a' AS p, '{home_path}/b' AS q", root.display());
    let output = support::run(&root, Some(&select))
        .expect("the path query succeeds")
        .text;
    assert_eq!(output, format!("p\tq\n./a\t{expected}"));
}

/// Runs this test in a child with HOME set or unset.
fn spawn_home_child(with_home: bool) {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.args([
        "--exact",
        "paths_in_query_values_without_home",
        "--nocapture",
    ]);
    if with_home {
        command
            .env("OSQ_QUERY_TEST_HOME", "/home/osq-test")
            .env("HOME", "/home/osq-test");
    } else {
        command.env("OSQ_QUERY_TEST_HOME", "").env_remove("HOME");
    }
    let status = command.status().unwrap();
    assert!(status.success(), "the HOME {with_home} child fails");
}

/// Proves the cache files of each of the three cache rows.
///
/// Covers: rust-report/query-cache-files
#[test]
fn query_cache_files() {
    let absent = support::scratch("history", "query-run-cache-none");
    support::run(&absent, None).expect("the table list succeeds");
    assert!(
        !absent.join(".osq").exists(),
        "no argument writes no .osq folder"
    );

    let fresh = support::scratch("history", "query-run-cache-fresh");
    support::run(&fresh, Some("SELECT id FROM changes")).expect("the select succeeds");
    assert!(
        fresh.join(".osq/read-model.sqlite").is_file(),
        "the select writes the read model"
    );
    assert_eq!(
        fs::read_to_string(fresh.join(".osq/.gitignore")).unwrap(),
        "*\n",
        "the select writes the gitignore"
    );

    let kept = support::scratch("history", "query-run-cache-kept");
    fs::create_dir_all(kept.join(".osq")).unwrap();
    fs::write(kept.join(".osq/.gitignore"), "keep\n").unwrap();
    support::run(&kept, Some("SELECT id FROM changes")).expect("the select succeeds");
    assert!(
        kept.join(".osq/read-model.sqlite").is_file(),
        "the kept gitignore still builds the read model"
    );
    assert_eq!(
        fs::read_to_string(kept.join(".osq/.gitignore")).unwrap(),
        "keep\n",
        "the existing gitignore is left alone"
    );
}

/// Proves each value kind's cell text in the literal-values case.
///
/// Covers: rust-report/cells-of-each-value-kind
#[test]
fn cells_of_each_value_kind() {
    let case = support::golden_cases()
        .into_iter()
        .find(|case| case.name == "literal-values")
        .unwrap();
    let root = support::scratch(&case.fixture, "query-run-cells-literal-values");
    let output = support::run(&root, case.select.as_deref())
        .expect("the literal query succeeds")
        .text;
    let lines: Vec<&str> = output.lines().collect();
    assert_eq!(
        lines.first().copied(),
        Some(LITERAL_HEADER),
        "literal-values header"
    );
    assert_eq!(
        lines.get(1).copied(),
        Some(LITERAL_ROW),
        "literal-values row"
    );
    assert_eq!(lines.len(), 2, "literal-values has one row");
}

/// Proves a row SQLite cannot step to fails with SQLite's message alone.
///
/// Covers: rust-report/row-that-cannot-be-stepped
#[test]
fn row_that_cannot_be_stepped() {
    let root = support::scratch("history", "query-run-row-step");
    let result = support::run(&root, Some("SELECT abs(-9223372036854775808)"));
    match result {
        Err(FeatureError::Failed {
            command, message, ..
        }) => {
            assert_eq!(command, "query", "row-that-cannot-be-stepped names query");
            assert_eq!(message, "integer overflow", "row-that-cannot-be-stepped");
        }
        other => panic!("row-that-cannot-be-stepped: expected Failed, got {other:?}"),
    }
}
