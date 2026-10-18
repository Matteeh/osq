//! Compares this repository's nine event tables with TypeScript's golden rows.
//!
//! A corpus test (rust-core "Corpus tests"): it reads the live archive outside
//! this crate, so it carries the corpus ignore, runs under
//! `scripts/verify-rust.sh --include-ignored`, and cargo-mutants leaves it out.
//! `tests/read_model_history.rs` is its fast fixture counterpart.
//!
//! Golden numbers are read through `yaml-rust2`, not `serde_json`: the JSON
//! files are valid YAML, and `yaml-rust2` parses a number with
//! `f64::from_str`, which is correctly rounded, while `serde_json`'s default
//! parser is one unit in the last place off for some 17-digit decimals.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use osq_kernel_storage::build_read_model;
use rusqlite::Connection;
use rusqlite::types::Value;
use yaml_rust2::{Yaml, YamlLoader};

/// The lowest change number the golden event rows cover.
const FIRST_GOLDEN: u32 = 14;

/// The highest change number the golden event rows cover.
const LAST_GOLDEN: u32 = 209;

/// One event table: its name, golden file and comma-joined columns, in order.
type Table = (&'static str, &'static str, &'static str);

/// The nine event tables, in table order.
const TABLES: [Table; 9] = [
    (
        "pauses",
        "pauses.json",
        "change,task,paused_at,until,source",
    ),
    (
        "recertifications",
        "recertifications.json",
        "change,task,recertified_at,outcome,automatic,path,credited_to,source",
    ),
    (
        "notices",
        "notices.json",
        "change,notice,severity,opened,outcome",
    ),
    (
        "focused_runs",
        "focused_runs.json",
        "change,task,run,outcome,exit_code,duration,timed_out,scenarios,files",
    ),
    (
        "mutation_picks",
        "mutation_picks.json",
        "change,task,pick,file,function,outcome,reason,killed,survived,invalid,duration,scenarios",
    ),
    (
        "mutation_survivors",
        "mutation_survivors.json",
        "id,change,task,pick,file,function,line,column,mutator,replacement,label",
    ),
    (
        "validator_runs",
        "validator_runs.json",
        "change,run,outcome,harness,model,duration,exit_code,scenarios,findings,reason,output",
    ),
    (
        "validator_findings",
        "validator_findings.json",
        "id,change,run,finding,capability,requirement,scenario,problem,detail,label",
    ),
    (
        "link_findings",
        "link_findings.json",
        "id,change,severity,file,message,label",
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

/// The path the read model is built at, under the target's temp directory.
fn database_path() -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join("history_corpus.sqlite")
}

/// Builds the read model once for the whole test binary.
fn build_once() {
    static BUILT: OnceLock<()> = OnceLock::new();
    BUILT.get_or_init(|| {
        build_read_model(&repository_root(), &database_path())
            .expect("the read model builds from the archive");
    });
}

/// Proves the nine event tables' covered rows equal TypeScript's golden rows.
///
/// Covers: rust-storage/golden-event-table-rows
#[ignore = "corpus test: reads the live archive"]
#[test]
fn golden_event_table_rows() {
    build_once();
    let connection = Connection::open(database_path()).expect("the read model opens");
    let mut failures = Vec::new();
    for (name, file, columns) in TABLES {
        let actual = covered_rows(&connection, name, columns);
        compare_rows(name, columns, &read_golden(file), &actual, &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// Reads one table's rows whose change is numbered 014 to 209, in table order.
fn covered_rows(connection: &Connection, name: &str, columns: &str) -> Vec<Vec<Value>> {
    let select = format!("SELECT {} FROM {name} ORDER BY rowid", spaced(columns));
    let position = change_position(columns);
    table_rows(connection, &select, column_count(columns))
        .into_iter()
        .filter(|row| row.get(position).is_some_and(covered))
        .collect()
}

/// The columns of a comma-joined column list, separated by `, ` for a query.
fn spaced(columns: &str) -> String {
    columns.split(',').collect::<Vec<&str>>().join(", ")
}

/// How many columns a comma-joined column list names.
fn column_count(columns: &str) -> usize {
    columns.split(',').count()
}

/// The position of the `change` column in a comma-joined column list.
fn change_position(columns: &str) -> usize {
    columns
        .split(',')
        .position(|column| column == "change")
        .expect("every event table has a change column")
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

/// Compares one table's rows, naming the table, change, column and both values.
fn compare_rows(
    name: &str,
    columns: &str,
    expected: &[Yaml],
    actual: &[Vec<Value>],
    failures: &mut Vec<String>,
) {
    if expected.len() != actual.len() {
        failures.push(format!(
            "{name}: golden holds {} rows, the read model {}",
            expected.len(),
            actual.len()
        ));
    }
    let position = change_position(columns);
    for (row, expected) in actual.iter().zip(expected.iter()) {
        let Some(golden) = expected.as_hash() else {
            continue;
        };
        let folder = text_of(row.get(position));
        for (column, value) in columns.split(',').zip(row) {
            let Some(want) = golden.get(&Yaml::String(column.to_owned())) else {
                continue;
            };
            if !equal(value, want) {
                failures.push(format!(
                    "{name} change {folder} column {column}: read {value:?}, golden {want:?}"
                ));
            }
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
        .join("tests/golden/events")
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
