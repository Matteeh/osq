//! Replays this repository's live archive: every fold against its done
//! markers, and every golden row against TypeScript's `osq query --json`.
//!
//! Both tests are corpus tests (rust-core "Corpus tests"): they read the
//! archive outside this crate, so they carry the corpus ignore, run under
//! `scripts/verify-rust.sh --include-ignored`, and cargo-mutants leaves them
//! out. `tests/read_model.rs` and `tests/reading_snapshot.rs` are their fast
//! fixture counterparts.
//!
//! Golden numbers are read through `yaml-rust2`, not `serde_json`: the JSON
//! files are valid YAML, and `yaml-rust2` parses a number with
//! `f64::from_str`, which is correctly rounded, while `serde_json`'s default
//! parser is one unit in the last place off for some 17-digit decimals.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use osq_core::TaskStatus;
use osq_kernel_storage::{ChangeSnapshot, read_archive, write_read_model};
use rusqlite::Connection;
use rusqlite::types::Value;
use yaml_rust2::{Yaml, YamlLoader};

/// The lowest change number the golden rows cover.
const FIRST_GOLDEN: u32 = 14;

/// The highest change number the golden rows cover.
const LAST_GOLDEN: u32 = 209;

/// The replay's exceptions, 003 to 013: 003 has no `.run/events/` folder, and the watcher of 004 to 013 wrote no `done` event.
const EXCEPTIONS: [u32; 11] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/// The `changes` table's columns, in table order.
const CHANGES_COLUMNS: [&str; 11] = [
    "id",
    "folder",
    "title",
    "archived_on",
    "goal",
    "tasks",
    "attempts",
    "halts",
    "elapsed_seconds",
    "cost",
    "planner",
];

/// Each table's name, golden file and columns, in table order.
const TABLES: [(&str, &str, &[&str]); 3] = [
    ("changes", "changes.json", &CHANGES_COLUMNS),
    (
        "tasks",
        "tasks.json",
        &["change", "task", "title", "attempts", "done"],
    ),
    (
        "dead_attempts",
        "dead_attempts.json",
        &["change", "task", "reason"],
    ),
];

/// The repository root, three folders above the storage manifest.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/storage")
        .to_path_buf()
}

/// The archive's snapshots, read once for every test of this binary.
fn snapshots() -> &'static [ChangeSnapshot] {
    static SNAPSHOTS: OnceLock<Vec<ChangeSnapshot>> = OnceLock::new();
    SNAPSHOTS.get_or_init(|| read_archive(&repository_root()).expect("the archive reads"))
}

/// The change number a snapshot's folder leads with, or `None`.
fn number(snapshot: &ChangeSnapshot) -> Option<u32> {
    snapshot.id.parse().ok()
}

/// Proves every archived fold matches its done markers and archive events.
///
/// Covers: rust-storage/archived-changes-replay
#[ignore = "corpus test: reads the live archive"]
#[test]
fn archived_changes_replay() {
    let snapshots = snapshots();
    assert!(
        snapshots.len() >= 200,
        "read only {} archived changes",
        snapshots.len()
    );
    let mut failures = Vec::new();
    for snapshot in snapshots {
        let number = number(snapshot);
        if number.is_some_and(|number| EXCEPTIONS.contains(&number)) {
            continue;
        }
        check_fold_matches_markers(snapshot, &mut failures);
        if number.is_some_and(|number| number >= 38) && snapshot.state.record().archived.is_none() {
            failures.push(format!("change {} has no archived event", snapshot.folder));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Records a failure for every task whose fold and done marker disagree.
fn check_fold_matches_markers(snapshot: &ChangeSnapshot, failures: &mut Vec<String>) {
    for task in &snapshot.tasks {
        let folded = snapshot
            .state
            .tasks()
            .get(&task.id)
            .map(|state| state.status);
        if (folded == Some(TaskStatus::Done)) != task.done {
            failures.push(format!(
                "change {} task {}: folded {folded:?}, done marker {}",
                snapshot.folder, task.id, task.done
            ));
        }
    }
}

/// Proves the rows of the three tables equal TypeScript's for 014 to 209.
///
/// Covers: rust-storage/golden-rows
#[ignore = "corpus test: reads the live archive"]
#[test]
fn golden_rows() {
    let path = Path::new(env!("CARGO_TARGET_TMPDIR")).join("archive_golden.sqlite");
    let covered: Vec<ChangeSnapshot> = snapshots()
        .iter()
        .filter(|snapshot| {
            number(snapshot).is_some_and(|number| (FIRST_GOLDEN..=LAST_GOLDEN).contains(&number))
        })
        .cloned()
        .collect();
    write_read_model(&path, &covered).expect("the read model writes");
    let connection = Connection::open(&path).expect("the read model opens");
    let mut failures = Vec::new();
    for (table, file, columns) in TABLES {
        let select = format!("SELECT {} FROM {table} ORDER BY rowid", columns.join(", "));
        let actual = table_rows(&connection, &select, columns.len());
        compare_rows(table, columns, &read_golden(file), &actual, &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Compares one table's rows, recording the table, row, column and both values.
fn compare_rows(
    table: &str,
    columns: &[&str],
    expected: &[Yaml],
    actual: &[Vec<Value>],
    failures: &mut Vec<String>,
) {
    if expected.len() != actual.len() {
        failures.push(format!(
            "{table}: golden holds {} rows, the read model {}",
            expected.len(),
            actual.len()
        ));
    }
    for (index, row) in actual.iter().enumerate() {
        let Some(golden) = expected.get(index).and_then(Yaml::as_hash) else {
            continue;
        };
        let context = row_context(table, row);
        for (position, value) in row.iter().enumerate() {
            let Some(name) = columns.get(position) else {
                continue;
            };
            let Some(want) = golden.get(&Yaml::String((*name).to_owned())) else {
                continue;
            };
            if !equal(value, want) {
                failures.push(format!(
                    "{table} {context} column {name}: read {value:?}, golden {want:?}"
                ));
            }
        }
    }
}

/// Names a row's folder and, except for `changes`, its task.
fn row_context(table: &str, row: &[Value]) -> String {
    match table {
        "changes" => format!("folder {}", text_of(row.get(1))),
        _ => format!(
            "folder {}, task {}",
            text_of(row.first()),
            text_of(row.get(1))
        ),
    }
}

/// A column's text, or its debug form for anything else.
fn text_of(value: Option<&Value>) -> String {
    match value {
        Some(Value::Text(text)) => text.clone(),
        other => format!("{other:?}"),
    }
}

/// Whether a read column equals a golden column: text and null as written,
/// numbers equal by value as `f64`.
fn equal(value: &Value, golden: &Yaml) -> bool {
    match (value, golden) {
        (Value::Null, Yaml::Null) => true,
        (Value::Text(left), Yaml::String(right)) => left == right,
        (Value::Integer(left), Yaml::Integer(right)) => left == right,
        _ => number_of(value) == golden.as_f64(),
    }
}

/// A column's numeric value as `f64`, or `None` for text and null.
fn number_of(value: &Value) -> Option<f64> {
    match value {
        Value::Integer(number) => number.to_string().parse().ok(),
        Value::Real(number) => Some(*number),
        _ => None,
    }
}

/// Reads one golden file as its rows, through the YAML superset of JSON.
fn read_golden(file: &str) -> Vec<Yaml> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/golden")
        .join(file);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let mut documents = YamlLoader::load_from_str(&text)
        .unwrap_or_else(|error| panic!("{}: {error:?}", path.display()));
    match documents.pop() {
        Some(Yaml::Array(rows)) => rows,
        _ => panic!("{} is not a JSON array", path.display()),
    }
}

/// Reads a table's rows as typed values, in insertion order.
fn table_rows(db: &Connection, select: &str, columns: usize) -> Vec<Vec<Value>> {
    let mut statement = db.prepare(select).expect("the table selects");
    let mapped = statement
        .query_map([], |row| {
            (0..columns)
                .map(|index| row.get::<_, Value>(index))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .expect("the rows read");
    mapped.map(Result::unwrap).collect()
}
