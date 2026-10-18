//! Compares this repository's `disclosures` table with TypeScript's golden rows.
//!
//! A corpus test (rust-core "Corpus tests"): it reads the live archive outside
//! this crate, so it carries the corpus ignore, runs under
//! `scripts/verify-rust.sh --include-ignored`, and cargo-mutants leaves it out.
//! `tests/read_model_files.rs` is its fast fixture counterpart.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use osq_kernel_storage::build_read_model;
use rusqlite::Connection;
use rusqlite::types::Value;
use serde_json::Value as Json;

/// The lowest change number the golden rows cover.
const FIRST_GOLDEN: u32 = 14;

/// The highest change number the golden rows cover.
const LAST_GOLDEN: u32 = 209;

/// The number of rows `disclosures.json` holds.
const GOLDEN_ROWS: usize = 661;

/// The repository root, three folders above the storage manifest.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/storage")
        .to_path_buf()
}

/// The path the read model is built at, under the target's temp directory.
fn database_path() -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join("files_corpus.sqlite")
}

/// Builds the read model once for the whole test binary.
fn build_once() {
    static BUILT: OnceLock<()> = OnceLock::new();
    BUILT.get_or_init(|| {
        build_read_model(&repository_root(), &database_path())
            .expect("the read model builds from the archive");
    });
}

/// Proves the covered `disclosures` rows equal TypeScript's golden rows.
///
/// Covers: rust-storage/golden-disclosure-rows
#[ignore = "corpus test: reads the live archive"]
#[test]
fn golden_disclosure_rows() {
    build_once();
    let connection = Connection::open(database_path()).expect("the read model opens");
    let actual = covered_rows(&connection);
    let expected = read_golden();
    assert_eq!(expected.len(), GOLDEN_ROWS, "golden row count");
    let mut failures = Vec::new();
    compare_rows(&expected, &actual, &mut failures);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Reads the `disclosures` rows whose change is numbered 014 to 209, in order.
fn covered_rows(connection: &Connection) -> Vec<Vec<Value>> {
    let mut statement = connection
        .prepare("SELECT change, task, section, text FROM disclosures ORDER BY rowid")
        .expect("the disclosures table selects");
    let mapped = statement
        .query_map([], |row| {
            (0..4)
                .map(|index| row.get::<_, Value>(index))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .expect("the rows read");
    mapped
        .map(Result::unwrap)
        .filter(|row| row.first().is_some_and(covered))
        .collect()
}

/// Whether a change column is a folder numbered 014 to 209.
fn covered(value: &Value) -> bool {
    let Value::Text(folder) = value else {
        return false;
    };
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    digits
        .parse::<u32>()
        .is_ok_and(|number| (FIRST_GOLDEN..=LAST_GOLDEN).contains(&number))
}

/// Compares the covered rows with the golden rows, naming every mismatch.
fn compare_rows(expected: &[Json], actual: &[Vec<Value>], failures: &mut Vec<String>) {
    if expected.len() != actual.len() {
        failures.push(format!(
            "disclosures: golden holds {} rows, the read model {}",
            expected.len(),
            actual.len()
        ));
    }
    for (index, row) in actual.iter().enumerate() {
        let Some(golden) = expected.get(index).and_then(Json::as_object) else {
            continue;
        };
        let change = text_of(row.first());
        let task = text_of(row.get(1));
        let section = text_of(row.get(2));
        let text = text_of(row.get(3));
        let wanted = |column: &str| {
            golden
                .get(column)
                .and_then(Json::as_str)
                .unwrap_or_default()
                .to_owned()
        };
        if change != wanted("change") || task != wanted("task") || section != wanted("section") {
            failures.push(format!(
                "disclosures row {index}: read ({change}, {task}, {section}), golden ({}, {}, {})",
                wanted("change"),
                wanted("task"),
                wanted("section")
            ));
            continue;
        }
        let wanted = wanted("text");
        if text != wanted {
            failures.push(format!(
                "disclosures change {change} task {task} section {section}: read {text:?}, golden {wanted:?}"
            ));
        }
    }
}

/// A column's text, or its debug form for anything else.
fn text_of(value: Option<&Value>) -> String {
    match value {
        Some(Value::Text(text)) => text.clone(),
        other => format!("{other:?}"),
    }
}

/// Reads the golden `disclosures.json` as its rows, in table order.
fn read_golden() -> Vec<Json> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/files/disclosures.json");
    let text =
        fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}
