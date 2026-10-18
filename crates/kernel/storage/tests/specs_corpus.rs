//! Compares this repository's `requirements` and `task_outcomes` tables with
//! TypeScript's golden rows. A corpus test (rust-core "Corpus tests"): it reads
//! the live archive, so cargo-mutants leaves it out.
//! `tests/read_model_specs.rs` and `tests/read_model_specs_cases.rs` are its
//! fast counterparts.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use osq_kernel_specs::CapabilityOwnership;
use osq_kernel_storage::{
    ChangeSnapshot, Location, read_history, write_read_model, write_task_outcomes,
};
use rusqlite::Connection;
use rusqlite::types::Value;
use serde_json::Value as Json;

/// The lowest change number the golden rows cover.
const FIRST_GOLDEN: u32 = 1;

/// The highest change number the golden rows cover.
const LAST_GOLDEN: u32 = 215;

/// One table's name, golden file, comma-separated columns and row count.
struct Table {
    /// The table's name.
    name: &'static str,
    /// The golden file under `tests/golden/specs/`.
    file: &'static str,
    /// The table's columns, in table order, separated by `, `.
    columns: &'static str,
    /// The row count the table's golden file holds.
    rows: usize,
}

/// The two tables built from the specs kernel's parses, in table order.
const TABLES: [Table; 2] = [
    Table {
        name: "requirements",
        file: "requirements.json",
        columns: "change, capability, kind, requirement, renamed_from",
        rows: 1683,
    },
    Table {
        name: "task_outcomes",
        file: "task_outcomes.json",
        columns: "change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, \
                  verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, \
                  files_touched",
        rows: 732,
    },
];

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
    Path::new(env!("CARGO_TARGET_TMPDIR")).join("specs_corpus.sqlite")
}

/// The path of one golden file under `tests/golden/specs/`.
fn golden_path(file: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/golden/specs")
        .join(file)
}

/// Reads history, keeps changes 001 to 215 and writes both spec tables once.
fn build_once() {
    static BUILT: OnceLock<()> = OnceLock::new();
    BUILT.get_or_init(|| {
        let path = database_path();
        let snapshots: Vec<ChangeSnapshot> = read_history(&repository_root())
            .expect("the history reads")
            .into_iter()
            .filter(covered)
            .collect();
        write_read_model(&path, &snapshots).expect("the read model writes");
        write_task_outcomes(&path, &snapshots, &read_ownership()).expect("the task outcomes write");
    });
}

/// Whether a snapshot is archived and numbered 001 to 215.
fn covered(snapshot: &ChangeSnapshot) -> bool {
    snapshot.location == Location::Archived
        && snapshot
            .id
            .parse::<u32>()
            .is_ok_and(|number| (FIRST_GOLDEN..=LAST_GOLDEN).contains(&number))
}

/// Reads the frozen ownership TypeScript used when it printed the goldens.
fn read_ownership() -> Vec<CapabilityOwnership> {
    let path = golden_path("ownership.json");
    let text =
        fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let parsed: Json =
        serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    parsed
        .as_array()
        .expect("ownership.json is an array")
        .iter()
        .map(|entry| CapabilityOwnership {
            capability: entry["capability"]
                .as_str()
                .expect("a capability is text")
                .to_owned(),
            globs: entry["globs"]
                .as_array()
                .expect("globs is an array")
                .iter()
                .map(|glob| glob.as_str().expect("a glob is text").to_owned())
                .collect(),
        })
        .collect()
}

/// Proves both tables equal TypeScript's golden rows, row by row.
///
/// Covers: rust-storage/golden-spec-table-rows
#[ignore = "corpus test: reads the live archive"]
#[test]
fn golden_spec_table_rows() {
    build_once();
    let connection = Connection::open(database_path()).expect("the read model opens");
    let mut failures = Vec::new();
    for table in &TABLES {
        compare_table(&connection, table, &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Compares one table's rows with its golden file, recording every mismatch.
fn compare_table(connection: &Connection, table: &Table, failures: &mut Vec<String>) {
    let actual = table_rows(connection, table);
    let expected = read_golden(table.file);
    if expected.len() != table.rows {
        failures.push(format!(
            "{}: golden holds {} rows, expected {}",
            table.name,
            expected.len(),
            table.rows
        ));
    }
    if actual.len() != table.rows {
        failures.push(format!(
            "{}: the read model holds {} rows, expected {}",
            table.name,
            actual.len(),
            table.rows
        ));
    }
    for (index, (row, golden)) in actual.iter().zip(expected.iter()).enumerate() {
        let Some(golden) = golden.as_object() else {
            continue;
        };
        let context = row_context(table.name, row);
        for (position, value) in row.iter().enumerate() {
            let Some(column) = table.columns.split(", ").nth(position) else {
                continue;
            };
            let Some(wanted) = golden.get(column) else {
                continue;
            };
            if !equal(value, wanted) {
                failures.push(format!(
                    "{} row {index} {context} column {column}: read {value:?}, golden {wanted:?}",
                    table.name
                ));
            }
        }
    }
}

/// Names a row's change and, per table, its requirement or its task.
fn row_context(table: &str, row: &[Value]) -> String {
    if table == "requirements" {
        format!(
            "change {}, capability {}, requirement {}",
            text_of(row.first()),
            text_of(row.get(1)),
            text_of(row.get(3))
        )
    } else {
        format!(
            "change {}, task {}",
            text_of(row.first()),
            text_of(row.get(1))
        )
    }
}

/// Whether a read column equals a golden column: text and null as written,
/// numbers equal by value.
fn equal(actual: &Value, expected: &Json) -> bool {
    match (actual, expected) {
        (Value::Null, Json::Null) => true,
        (Value::Text(left), Json::String(right)) => left == right,
        (Value::Integer(left), Json::Number(right)) => right.as_i64() == Some(*left),
        (Value::Real(left), Json::Number(right)) => right.as_f64() == Some(*left),
        _ => false,
    }
}

/// A column's text, or its debug form for anything else.
fn text_of(value: Option<&Value>) -> String {
    match value {
        Some(Value::Text(text)) => text.clone(),
        other => format!("{other:?}"),
    }
}

/// Reads one table's rows as typed values, in insertion order.
fn table_rows(connection: &Connection, table: &Table) -> Vec<Vec<Value>> {
    let select = format!(
        "SELECT {} FROM {} ORDER BY rowid",
        table.columns, table.name
    );
    let mut statement = connection.prepare(&select).expect("the table selects");
    let width = table.columns.split(", ").count();
    let mapped = statement
        .query_map([], |row| {
            (0..width)
                .map(|index| row.get::<_, Value>(index))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .expect("the rows read");
    mapped.map(Result::unwrap).collect()
}

/// Reads one golden file as its rows, in table order.
fn read_golden(file: &str) -> Vec<Json> {
    let path = golden_path(file);
    let text =
        fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}
