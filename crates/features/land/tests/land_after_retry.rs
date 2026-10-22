//! Proves the after-land retry on a landed change and the refusal that keeps it
//! from running.

mod support;

use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use support::{FIXTURE_FOLDER, LandRepo};

/// The record's file name under the project's watch state folder.
const AFTER_LAND: &str = "after-land.json";
/// The landed line for a change whose worktree remains.
const LANDED: &str = "001-alpha-orders has already landed; Rust land does not remove worktrees yet";
/// The passing command every successful row configures.
const PASSING_COMMAND: &str = r"printf 'built\n' > built.txt";
/// The failing command the failing row configures.
const FAILING_COMMAND: &str = "echo one; exit 3";
/// The record naming the fixture change.
const ALPHA_RECORD: &str = r#"{"change":"001-alpha-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}"#;
/// The record naming another change.
const BETA_RECORD: &str = r#"{"change":"002-beta-orders","command":"false","exitCode":1,"failedAt":"2026-10-01T10:00:00.000Z"}"#;
/// A file that is not JSON.
const INVALID_RECORD: &str = "not json";
/// The old timestamp every record starts with.
const OLD_TIME: &str = "2026-10-01T10:00:00.000Z";

/// The `osq.toml` for a row without an after-land command.
const NO_AFTER_LAND: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
"#;

/// The `osq.toml` for the passing command.
const PASSING: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "printf 'built\\n' > built.txt"
"#;

/// The `osq.toml` for the failing command.
const FAILING: &str = r#"[vcs]
enabled = true
author = "osq <osq@example.invalid>"
afterLand = "echo one; exit 3"
"#;

/// The record a row starts with.
enum Record {
    /// No record at all.
    Absent,
    /// The record's bytes.
    Text(&'static str),
}

/// What a row expects from `land`.
enum Expected {
    /// The returned output.
    Output(String),
    /// The failure message.
    Failed(String),
}

/// What a row expects of the record after `land`.
enum AfterRecord {
    /// The record is gone.
    None,
    /// The record keeps its bytes.
    Same,
    /// The record names the row's failing command.
    Rewritten,
}

/// One row of "Retry on a landed change".
struct Row {
    /// The test's scratch name.
    name: &'static str,
    /// The record the row writes first.
    record: Record,
    /// The `osq.toml` the row writes.
    toml: &'static str,
    /// What `land` gives.
    expected: Expected,
    /// What `built.txt` holds, when it exists.
    built: Option<&'static str>,
    /// What the record holds afterwards.
    after: AfterRecord,
}

/// A landed repository with the fixture change, `toml` as its settings and no
/// record.
fn landed_repo(name: &str, toml: &str) -> (LandRepo, PathBuf) {
    let repo = LandRepo::new(name);
    let _ = repo.add_fixture_change();
    repo.write(repo.checkout(), "osq.toml", toml);
    repo.write(
        repo.checkout(),
        "openspec/changes/archive/001-alpha-orders/proposal.md",
        "---\ntitle: A\n---\n",
    );
    repo.commit(
        repo.checkout(),
        "land the fixture change",
        &["openspec/changes/archive/001-alpha-orders/proposal.md"],
    );
    let record = record_path(&repo);
    let _ = fs::remove_file(&record);
    (repo, record)
}

/// The `after-land.json` path TypeScript's `watchStateDir` gives the checkout.
fn record_path(repo: &LandRepo) -> PathBuf {
    let real = fs::canonicalize(repo.checkout()).expect("the checkout resolves");
    let digest = Sha256::digest(real.to_string_lossy().as_bytes());
    let mut hash = String::with_capacity(64);
    for byte in digest {
        write!(hash, "{byte:02x}").expect("writing to a String succeeds");
    }
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join(".osq")
        .join("watch")
        .join(hash)
        .join(AFTER_LAND)
}

/// Writes the record's bytes, creating its folders.
fn write_record(record: &Path, text: &str) {
    fs::create_dir_all(record.parent().expect("the record has a parent"))
        .expect("the record's folders are created");
    fs::write(record, text).expect("the record is written");
}

/// The message of a `Failed` land error.
fn message(error: &FeatureError) -> &str {
    match error {
        FeatureError::Failed { message, .. } => message,
        other => panic!("expected a Failed error, got {other:?}"),
    }
}

/// The record's parsed value.
fn read_record(record: &Path) -> Value {
    let text = fs::read_to_string(record).expect("the record reads");
    serde_json::from_str(&text).expect("the record is JSON")
}

/// The rows of "Retry on a landed change".
fn retry_rows() -> Vec<Row> {
    vec![
        Row {
            name: "retry_passes",
            record: Record::Text(ALPHA_RECORD),
            toml: PASSING,
            expected: Expected::Output(format!(
                "After-land command passed: {PASSING_COMMAND}\n{LANDED}\n"
            )),
            built: Some("built\n"),
            after: AfterRecord::None,
        },
        Row {
            name: "retry_fails",
            record: Record::Text(ALPHA_RECORD),
            toml: FAILING,
            expected: Expected::Failed(format!(
                "After-land command failed: {FAILING_COMMAND}\none\nrun osq land 001 again to retry it\n{LANDED}"
            )),
            built: None,
            after: AfterRecord::Rewritten,
        },
        Row {
            name: "retry_other_change",
            record: Record::Text(BETA_RECORD),
            toml: PASSING,
            expected: Expected::Output(format!("{LANDED}\n")),
            built: None,
            after: AfterRecord::Same,
        },
        Row {
            name: "retry_no_record",
            record: Record::Absent,
            toml: PASSING,
            expected: Expected::Output(format!("{LANDED}\n")),
            built: None,
            after: AfterRecord::None,
        },
        Row {
            name: "retry_unset",
            record: Record::Text(ALPHA_RECORD),
            toml: NO_AFTER_LAND,
            expected: Expected::Output(format!("{LANDED}\n")),
            built: None,
            after: AfterRecord::Same,
        },
        Row {
            name: "retry_invalid_record",
            record: Record::Text(INVALID_RECORD),
            toml: PASSING,
            expected: Expected::Output(format!("{LANDED}\n")),
            built: None,
            after: AfterRecord::Same,
        },
    ]
}

/// Proves every row of "Retry on a landed change".
///
/// Covers: rust-land/retry-on-a-landed-change
#[test]
fn retry_on_a_landed_change() {
    for row in retry_rows() {
        let (repo, record) = landed_repo(row.name, row.toml);
        if let Record::Text(text) = row.record {
            write_record(&record, text);
        }
        let before = repo.head(repo.checkout());
        let outcome = repo.run("1");
        match &row.expected {
            Expected::Output(text) => {
                let output = outcome.unwrap_or_else(|error| panic!("{}: {error}", row.name));
                assert_eq!(&output.text, text, "{}", row.name);
            }
            Expected::Failed(text) => {
                let error = outcome.expect_err(row.name);
                assert_eq!(message(&error), text, "{}", row.name);
            }
        }
        assert_eq!(
            repo.head(repo.checkout()),
            before,
            "{}: main gains no commit",
            row.name
        );
        assert_eq!(
            repo.exists(repo.checkout(), "built.txt"),
            row.built.is_some(),
            "{}: built.txt",
            row.name
        );
        if let Some(text) = row.built {
            assert_eq!(
                repo.read(repo.checkout(), "built.txt"),
                text,
                "{}",
                row.name
            );
        }
        match row.after {
            AfterRecord::None => assert!(!record.exists(), "{}: no record", row.name),
            AfterRecord::Same => {
                let text = fs::read_to_string(&record).expect("the record still reads");
                let expected = match row.record {
                    Record::Absent => String::new(),
                    Record::Text(text) => text.to_owned(),
                };
                assert_eq!(text, expected, "{}: record bytes", row.name);
            }
            AfterRecord::Rewritten => {
                let value = read_record(&record);
                let failed_at = value["failedAt"].as_str().expect("failedAt is text");
                assert_eq!(
                    value,
                    json!({
                        "change": FIXTURE_FOLDER,
                        "command": FAILING_COMMAND,
                        "exitCode": 3,
                        "failedAt": failed_at,
                    }),
                    "{}: record fields",
                    row.name
                );
                assert_eq!(failed_at.len(), 24, "{}: milliseconds", row.name);
                assert!(failed_at.ends_with('Z'), "{}: UTC", row.name);
                assert_ne!(failed_at, OLD_TIME, "{}: the new time", row.name);
            }
        }
        let _ = fs::remove_file(&record);
    }
}

/// Proves a refused land runs nothing and leaves the record's bytes as they are.
///
/// Covers: rust-land/refused-retry-runs-nothing
#[test]
fn refused_retry_runs_nothing() {
    let (repo, record) = landed_repo("retry_refused", PASSING);
    write_record(&record, ALPHA_RECORD);
    let bytes = fs::read(&record).expect("the record reads");
    let _ = repo.git(repo.checkout(), &["checkout", "-q", "-b", "feature"]);
    let before = repo.head(repo.checkout());

    let error = repo.run("1").expect_err("the checkout is not on main");

    assert!(
        matches!(&error, FeatureError::Failed { command, .. } if command == "land"),
        "the land fails with its command: {error:?}"
    );
    assert_eq!(
        message(&error),
        "osq land runs on main; the checkout is on feature"
    );
    assert_eq!(repo.head(repo.checkout()), before, "main gains no commit");
    assert!(
        !repo.exists(repo.checkout(), "built.txt"),
        "the command does not run"
    );
    assert_eq!(
        fs::read(&record).expect("the record still reads"),
        bytes,
        "the record keeps its bytes"
    );
    let _ = fs::remove_file(&record);
}
