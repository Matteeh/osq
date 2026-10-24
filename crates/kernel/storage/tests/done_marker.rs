//! Proves reading, comparing and refreshing a task's done marker.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::{
    DoneScope, ScopeFile, ScopeHash, differing_scope_paths, read_done_scope, refresh_done_marker,
    scope::write_frontmatter, task_scope_hash,
};
use yaml_rust2::Yaml;

/// The fixture whose `src/one.txt` the refresh rows hash.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/scope-project")
}

/// The recorded hash every refresh row starts with.
const RECORDED: &str = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

/// The hash of the fixture's `src/one.txt`.
const TASK_4_HASH: &str = "sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06";

/// The hash of the fixture's `src/one.txt` file.
const FILE_HASH: &str = "sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae";

/// The current time every refresh row passes.
const NOW: &str = "2026-10-24T08:00:00.000Z";

/// A fresh temporary folder for one test row, with nothing left at its name.
fn temp_folder(test: &str, name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR")).join(test).join(name);
    let _ = fs::remove_dir_all(&folder);
    folder
}

/// Copies every file below `from` into `to`, keeping the bytes as they are.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let path = entry.path();
        let target = to.join(entry.file_name());
        if path.is_dir() {
            copy_tree(&path, &target);
        } else {
            fs::copy(&path, &target).unwrap();
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// The scope hash of `src/one.txt` in a fresh fixture copy.
fn current(name: &str) -> ScopeHash {
    let root = temp_folder("done_marker_scope_project", name);
    copy_tree(&fixture(), &root);
    task_scope_hash(&root, &["src/one.txt".to_owned()])
}

/// One row of "Done marker scope reads".
struct ScopeRow {
    /// The row's folder name.
    name: &'static str,
    /// The marker's text, or none for a row without a file.
    marker: Option<&'static str>,
    /// The expected scope hash, or none for a row that reads as nothing.
    hash: Option<&'static str>,
    /// The expected scope files.
    files: &'static [(&'static str, Option<&'static str>)],
}

/// Every row of "Done marker scope reads".
const SCOPE_ROWS: [ScopeRow; 8] = [
    ScopeRow {
        name: "mapping",
        marker: Some(
            "---\nscope_hash: sha256:aa\nscope_files:\n  src/a.txt: sha256:1\n  src/b.txt: null\n  7: sha256:7\n  src/c.txt: 3\n---\nx\n",
        ),
        hash: Some("sha256:aa"),
        files: &[
            ("7", Some("sha256:7")),
            ("src/a.txt", Some("sha256:1")),
            ("src/b.txt", None),
            ("src/c.txt", None),
        ],
    },
    ScopeRow {
        name: "list",
        marker: Some("---\nscope_hash: sha256:aa\nscope_files: [a]\n---\n"),
        hash: Some("sha256:aa"),
        files: &[],
    },
    ScopeRow {
        name: "absent",
        marker: Some("---\nscope_hash: sha256:aa\n---\n"),
        hash: Some("sha256:aa"),
        files: &[],
    },
    ScopeRow {
        name: "empty",
        marker: Some("---\nscope_hash: \"\"\n---\n"),
        hash: None,
        files: &[],
    },
    ScopeRow {
        name: "number",
        marker: Some("---\nscope_hash: 5\n---\n"),
        hash: None,
        files: &[],
    },
    ScopeRow {
        name: "no-frontmatter",
        marker: Some("no frontmatter\n"),
        hash: None,
        files: &[],
    },
    ScopeRow {
        name: "unparsable",
        marker: Some("---\nscope_hash: [\n---\n"),
        hash: None,
        files: &[],
    },
    ScopeRow {
        name: "missing",
        marker: None,
        hash: None,
        files: &[],
    },
];

/// The expected read of one row.
fn expected_scope(row: &ScopeRow) -> Option<DoneScope> {
    Some(DoneScope {
        scope_hash: row.hash?.to_owned(),
        scope_files: row
            .files
            .iter()
            .map(|(path, hash)| ((*path).to_owned(), hash.map(ToOwned::to_owned)))
            .collect(),
    })
}

/// Proves every row of "Done marker scope reads".
///
/// Covers: rust-storage/done-marker-scope-reads
#[test]
fn done_marker_scope_reads() {
    for row in &SCOPE_ROWS {
        let folder = temp_folder("done_marker_scope_reads", row.name);
        fs::create_dir_all(&folder).unwrap();
        if let Some(marker) = row.marker {
            write(&folder.join(".run/done/1"), marker);
        }
        assert_eq!(
            read_done_scope(&folder, "1"),
            expected_scope(row),
            "{}",
            row.name
        );
    }
}

/// Proves other YAML key kinds also become the marker's path text.
///
/// Covers: rust-storage/done-marker-scope-reads
#[test]
fn done_marker_scope_reads_other_key_kinds() {
    let folder = temp_folder("done_marker_scope_reads", "other-keys");
    write(
        &folder.join(".run/done/1"),
        "---\nscope_hash: sha256:aa\nscope_files:\n  true: sha256:t\n  1.5: sha256:r\n  null: sha256:n\n---\n",
    );
    let scope = read_done_scope(&folder, "1").expect("the marker reads");
    assert_eq!(
        scope.scope_files,
        BTreeMap::from([
            (String::from("1.5"), Some(String::from("sha256:r"))),
            (String::from("null"), Some(String::from("sha256:n"))),
            (String::from("true"), Some(String::from("sha256:t"))),
        ])
    );
}

/// Proves every differing path is classified once in byte order.
///
/// Covers: rust-storage/differing-scope-paths
#[test]
fn differing_scope_paths_are_classified() {
    let recorded = BTreeMap::from([
        (String::from("b.txt"), Some(String::from("sha256:1"))),
        (String::from("a.txt"), Some(String::from("sha256:2"))),
        (String::from("c.txt"), None),
        (String::from("d.txt"), Some(String::from("sha256:4"))),
    ]);
    let current = ScopeHash {
        hash: String::from("sha256:x"),
        files: vec![
            ScopeFile {
                path: String::from("a.txt"),
                hash: Some(String::from("sha256:9")),
            },
            ScopeFile {
                path: String::from("c.txt"),
                hash: Some(String::from("sha256:3")),
            },
            ScopeFile {
                path: String::from("d.txt"),
                hash: Some(String::from("sha256:4")),
            },
            ScopeFile {
                path: String::from("e.txt"),
                hash: None,
            },
        ],
    };
    assert_eq!(
        differing_scope_paths(&recorded, &current),
        ["a.txt (modified)", "b.txt (deleted)", "c.txt (added)"]
    );
}

/// One row of "Refreshed marker text".
struct MarkerRow {
    /// The row's folder name.
    name: &'static str,
    /// The frontmatter lines the row writes.
    frontmatter: &'static str,
    /// The lines that must follow the scope hash line.
    expected: &'static [&'static str],
}

/// Every row of "Refreshed marker text".
const MARKER_ROWS: [MarkerRow; 17] = [
    MarkerRow {
        name: "flag",
        frontmatter: "flag: true",
        expected: &["flag: true"],
    },
    MarkerRow {
        name: "empty-note",
        frontmatter: "note: \"\"",
        expected: &["note: \"\""],
    },
    MarkerRow {
        name: "hex",
        frontmatter: "stamp: \"0x1f\"",
        expected: &["stamp: \"0x1f\""],
    },
    MarkerRow {
        name: "exponent",
        frontmatter: "stamp: \"12e45\"",
        expected: &["stamp: \"12e45\""],
    },
    MarkerRow {
        name: "negative",
        frontmatter: "stamp: \"-1\"",
        expected: &["stamp: \"-1\""],
    },
    MarkerRow {
        name: "title-true",
        frontmatter: "stamp: \"True\"",
        expected: &["stamp: \"True\""],
    },
    MarkerRow {
        name: "trailing-colon",
        frontmatter: "stamp: \"a:\"",
        expected: &["stamp: \"a:\""],
    },
    MarkerRow {
        name: "plain",
        frontmatter: "stamp: a.b/c_d-e+f:g@h",
        expected: &["stamp: a.b/c_d-e+f:g@h"],
    },
    MarkerRow {
        name: "version",
        frontmatter: "stamp: 1.2.3",
        expected: &["stamp: 1.2.3"],
    },
    MarkerRow {
        name: "nothing",
        frontmatter: "nothing:",
        expected: &["nothing: null"],
    },
    MarkerRow {
        name: "list",
        frontmatter: "list: [{a: 1, b: [x]}, [y, z], {}, []]",
        expected: &[
            "list:",
            "  - a: 1",
            "    b:",
            "      - x",
            "  - - y",
            "    - z",
            "  - {}",
            "  - []",
        ],
    },
    MarkerRow {
        name: "nested",
        frontmatter: "nested: {a: {b: c}}",
        expected: &["nested:", "  a:", "    b: c"],
    },
    MarkerRow {
        name: "codes",
        frontmatter: "codes: {7: seven}",
        expected: &["codes:", "  \"7\": seven"],
    },
    MarkerRow {
        name: "count-zero",
        frontmatter: "recertification_count: 0",
        expected: &[
            "recertification_count: 1",
            "original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222",
        ],
    },
    MarkerRow {
        name: "count-string",
        frontmatter: "recertification_count: \"3\"",
        expected: &[
            "recertification_count: 1",
            "original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222",
        ],
    },
    MarkerRow {
        name: "empty-original",
        frontmatter: "original_scope_hash: \"\"",
        expected: &[
            "original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222",
            "scope_files:",
        ],
    },
    MarkerRow {
        name: "count-four",
        frontmatter: "recertification_count: 4\noriginal_scope_hash: sha256:1111",
        expected: &[
            "recertification_count: 5",
            "original_scope_hash: sha256:1111",
            "scope_files:",
        ],
    },
];

/// The lines a row's rewritten marker must start with.
fn marker_prefix(row: &MarkerRow) -> String {
    let mut lines = vec!["---".to_owned(), format!("scope_hash: {TASK_4_HASH}")];
    lines.extend(row.expected.iter().map(|line| (*line).to_owned()));
    format!("{}\n", lines.join("\n"))
}

/// Proves every row of "Refreshed marker text".
///
/// Covers: rust-storage/refreshed-marker-text
#[test]
fn refreshed_marker_text() {
    for row in &MARKER_ROWS {
        let folder = temp_folder("refreshed_marker_text", row.name);
        let marker = format!(
            "---\nscope_hash: {RECORDED}\n{}\n---\n2026-10-01T10:00:00.000Z\n",
            row.frontmatter
        );
        write(&folder.join(".run/done/4"), &marker);
        let current = current(&format!("text_{}", row.name));
        refresh_done_marker(&folder, "4", RECORDED, &current, NOW).expect("the marker refreshes");
        let rewritten = fs::read_to_string(folder.join(".run/done/4")).unwrap();
        assert!(
            rewritten.starts_with(&marker_prefix(row)),
            "{}: expected prefix {:?}, got {rewritten:?}",
            row.name,
            marker_prefix(row)
        );
    }
}

/// Proves the refresh keeps the body and adds the missing keys in order.
///
/// Covers: rust-storage/refreshed-marker-tail
#[test]
fn refreshed_marker_tail() {
    let folder = temp_folder("refreshed_marker_tail", "flag");
    write(
        &folder.join(".run/done/4"),
        &format!("---\nscope_hash: {RECORDED}\nflag: true\n---\n2026-10-01T10:00:00.000Z\n"),
    );
    let current = current("tail");
    refresh_done_marker(&folder, "4", RECORDED, &current, NOW).expect("the marker refreshes");
    let expected = format!(
        "---\nscope_hash: {TASK_4_HASH}\nflag: true\noriginal_scope_hash: {RECORDED}\nscope_files:\n  src/one.txt: {FILE_HASH}\nscope_resolver: 2\nrecertified_at: {NOW}\nrecertification_count: 1\n---\n2026-10-01T10:00:00.000Z\n"
    );
    assert_eq!(
        fs::read_to_string(folder.join(".run/done/4")).unwrap(),
        expected
    );
}

/// One row of "Marker that cannot refresh".
struct BadRow {
    /// The row's folder name.
    name: &'static str,
    /// The marker kind the row creates.
    marker: Bad,
}

/// The marker kind a "Marker that cannot refresh" row creates.
enum Bad {
    /// No marker file at all.
    Missing,
    /// A marker whose frontmatter does not parse.
    Unparsable,
    /// A folder where the marker file should be.
    Folder,
}

/// Every row of "Marker that cannot refresh".
const BAD_ROWS: [BadRow; 3] = [
    BadRow {
        name: "missing",
        marker: Bad::Missing,
    },
    BadRow {
        name: "unparsable",
        marker: Bad::Unparsable,
    },
    BadRow {
        name: "folder",
        marker: Bad::Folder,
    },
];

/// Every entry below a folder, a file's text or none for a folder.
fn snapshot(root: &Path) -> Vec<(String, Option<String>)> {
    fn walk(root: &Path, dir: &Path, entries: &mut Vec<(String, Option<String>)>) {
        for entry in fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .into_owned();
            if path.is_dir() {
                entries.push((relative, None));
                walk(root, &path, entries);
            } else {
                entries.push((relative, Some(fs::read_to_string(&path).unwrap())));
            }
        }
    }
    let mut entries = Vec::new();
    walk(root, root, &mut entries);
    entries.sort();
    entries
}

/// Proves every row of "Marker that cannot refresh".
///
/// Covers: rust-storage/marker-that-cannot-refresh
#[test]
fn marker_that_cannot_refresh() {
    for row in &BAD_ROWS {
        let folder = temp_folder("marker_that_cannot_refresh", row.name);
        let marker = folder.join(".run/done/4");
        match row.marker {
            Bad::Missing => fs::create_dir_all(&folder).unwrap(),
            Bad::Unparsable => write(&marker, "---\nscope_hash: [\n---\n"),
            Bad::Folder => fs::create_dir_all(&marker).unwrap(),
        }
        let before = snapshot(&folder);
        let current = current(&format!("bad_{}", row.name));
        let error = refresh_done_marker(&folder, "4", RECORDED, &current, NOW)
            .expect_err("the marker cannot refresh");
        let display = error.to_string();
        let path = marker.display();
        match row.marker {
            Bad::Unparsable => assert!(display.starts_with("line "), "{display:?}"),
            Bad::Missing | Bad::Folder => assert!(
                display.starts_with(&format!("cannot read {path}: ")),
                "{display:?}"
            ),
        }
        assert_eq!(snapshot(&folder), before, "{}: files unchanged", row.name);
    }
}

/// The YAML writer's output for one parsed frontmatter mapping.
fn yaml_write_of(text: &str) -> String {
    let documents = yaml_rust2::YamlLoader::load_from_str(text).expect("the YAML parses");
    let document = documents
        .into_iter()
        .next()
        .expect("the YAML has a document");
    let Yaml::Hash(mapping) = document else {
        panic!("the YAML is a mapping");
    };
    write_frontmatter(&mapping)
}

/// Proves empty values and deeper list items are written as TypeScript writes them.
///
/// Covers: rust-storage/refreshed-marker-text
#[test]
fn yaml_writes_empty_values_and_deeper_items() {
    let rows = [
        ("empty: []\n", "empty: []\n"),
        ("empty: {}\n", "empty: {}\n"),
        ("deep: [[{a: [x]}]]\n", "deep:\n  - - a:\n        - x\n"),
        ("deep: [[[x, y]]]\n", "deep:\n  - - - x\n      - y\n"),
    ];
    for (text, expected) in rows {
        assert_eq!(yaml_write_of(text), expected, "{text:?}");
    }
}

/// The YAML writer's output for one string value.
fn yaml_string(value: &str) -> String {
    let mut mapping = yaml_rust2::yaml::Hash::new();
    mapping.insert(
        Yaml::String(String::from("stamp")),
        Yaml::String(value.to_owned()),
    );
    write_frontmatter(&mapping)
}

/// Proves which strings are quoted and which stay plain.
///
/// Covers: rust-storage/refreshed-marker-text
#[test]
fn yaml_quotes_reserved_strings_only() {
    let quoted = ["0o7", "0x1f", ".5", "1.", "12e45", "-1", "True", "a:"];
    for value in quoted {
        let expected = format!("stamp: {}\n", serde_json::to_string(value).unwrap());
        assert_eq!(yaml_string(value), expected, "{value:?} is quoted");
    }
    let plain = ["0o", "0x", "1e", "ae5", ".", "1.2.3", "a.b/c_d-e+f:g@h"];
    for value in plain {
        assert_eq!(
            yaml_string(value),
            format!("stamp: {value}\n"),
            "{value:?} is plain"
        );
    }
}
