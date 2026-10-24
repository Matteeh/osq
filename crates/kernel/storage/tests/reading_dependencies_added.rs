//! Proves the dependency reader matches TypeScript's report collection.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{DependencyPair, read_dependencies_added};

/// One row of the "Dependencies of task streams" table.
struct Row {
    /// The scratch folder's name and the assertion's label.
    name: &'static str,
    /// The event files to write: their names and contents.
    files: Vec<(&'static str, String)>,
    /// The pairs the row expects, in order.
    expected: Vec<DependencyPair>,
}

/// One `dependencies_added` event whose `added` data is `added`.
fn event(added: &str) -> String {
    format!(
        r#"{{"type":"dependencies_added","timestamp":"2026-10-20T08:00:00.000Z","data":{{"added":{added}}}}}"#
    )
}

/// A fresh change folder under `CARGO_TARGET_TMPDIR`.
fn scratch(test: &str, name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_dependencies_added")
        .join(test)
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent")).expect("the parent is made");
    fs::write(path, text).expect("the file is written");
}

/// Writes the row's event files under `.run/events/`.
fn write_events(folder: &Path, files: &[(&str, String)]) {
    for (name, content) in files {
        write(&folder.join(".run").join("events").join(name), content);
    }
}

/// A pair of the given file and name.
fn pair(file: &str, name: &str) -> DependencyPair {
    DependencyPair {
        file: file.to_owned(),
        name: name.to_owned(),
    }
}

/// Every row of the "Dependencies of task streams" table, in its order.
fn rows() -> Vec<Row> {
    vec![
        Row {
            name: "two-streams",
            files: vec![
                (
                    "1.jsonl",
                    event(
                        r#"[{"file":"package.json","name":"zod"},{"file":"package.json","name":"zod"},{"file":" Cargo.toml ","name":" serde "},{"file":"","name":"empty-file"},{"file":"Cargo.toml","name":7},"bad"]"#,
                    ),
                ),
                (
                    "2.jsonl",
                    event(r#"[{"file":"Cargo.toml","name":"anyhow"}]"#),
                ),
            ],
            expected: vec![
                pair("Cargo.toml", "anyhow"),
                pair("Cargo.toml", "serde"),
                pair("package.json", "zod"),
            ],
        },
        Row {
            name: "added-not-array",
            files: vec![("1.jsonl", event(r#"{"file":"Cargo.toml","name":"serde"}"#))],
            expected: Vec::new(),
        },
        Row {
            name: "other-file-names",
            files: vec![
                (
                    "change.jsonl",
                    event(r#"[{"file":"Cargo.toml","name":"serde"}]"#),
                ),
                ("1.json", event(r#"[{"file":"Cargo.toml","name":"serde"}]"#)),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "loose-line",
            files: vec![(
                "1.jsonl",
                format!(
                    "not json\n{}\n",
                    event(r#"[{"file":"b","name":"x"},{"file":"a","name":"y"}]"#)
                ),
            )],
            expected: vec![pair("a", "y"), pair("b", "x")],
        },
        Row {
            name: "no-events-folder",
            files: Vec::new(),
            expected: Vec::new(),
        },
    ]
}

/// Proves every row of the "Dependencies of task streams" table.
///
/// Covers: rust-storage/dependencies-of-task-streams
#[test]
fn dependencies_of_task_streams() {
    for row in rows() {
        let folder = scratch("dependencies_of_task_streams", row.name);
        write_events(&folder, &row.files);
        assert_eq!(
            read_dependencies_added(&folder),
            row.expected,
            "{}",
            row.name
        );
    }
}

/// Proves a blank name and JavaScript's BOM trim drop or trim entries.
///
/// Covers: rust-storage/dependencies-of-task-streams
#[test]
fn blank_names_and_javascript_trim() {
    let folder = scratch("blank_names_and_javascript_trim", "row");
    write_events(
        &folder,
        &[(
            "1.jsonl",
            event(
                "[{\"file\":\"\\uFEFFCargo.toml\\uFEFF\",\"name\":\"serde\"},{\"file\":\"Cargo.toml\",\"name\":\"   \"}]",
            ),
        )],
    );
    assert_eq!(
        read_dependencies_added(&folder),
        vec![pair("Cargo.toml", "serde")]
    );
}

/// Proves an empty `.jsonl` name is not a numbered task stream.
///
/// Covers: rust-storage/dependencies-of-task-streams
#[test]
fn empty_jsonl_name_is_ignored() {
    let folder = scratch("empty_jsonl_name_is_ignored", "row");
    write_events(
        &folder,
        &[(".jsonl", event(r#"[{"file":"Cargo.toml","name":"serde"}]"#))],
    );
    assert_eq!(
        read_dependencies_added(&folder),
        Vec::<DependencyPair>::new()
    );
}
