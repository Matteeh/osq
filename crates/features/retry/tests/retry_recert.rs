//! Proves recertification against the goldens TypeScript printed, and its tables.

mod support;

#[path = "../src/retry/excerpt.rs"]
mod source_excerpt;
#[path = "../src/retry/scope.rs"]
mod source_scope;
#[path = "../src/retry/yaml.rs"]
mod source_yaml;

use std::fmt::Write as _;
use std::fs;
use std::path::PathBuf;

use osq_kernel_storage::change_folder_seal;
use serde_json::{Value, json};
use support::{
    change_folder, copy_tree, dump, failed_message, fixture, parse_golden, run, scratch, tree,
    write,
};
use yaml_rust2::Yaml;
use yaml_rust2::yaml::Hash;

/// The current scope hash of task 4's `src/one.txt` and `src/none/*.txt` scope.
const TASK_4_HASH: &str = "sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06";

/// The recorded hash "Recertified marker text" gives task 4's done marker.
const RECORDED_HASH: &str =
    "sha256:2222222222222222222222222222222222222222222222222222222222222222";

/// A fresh scratch copy of the recert fixture, named after its row.
fn recert_copy(name: &str) -> PathBuf {
    let root = scratch("retry_recert", name);
    copy_tree(&fixture("recert-project"), &root);
    root
}

/// Writes a line that starts `recertified_at: ` as the golden script does.
fn blank_recertified(text: &str) -> String {
    text.split('\n')
        .map(|line| {
            if line.starts_with("recertified_at: ") {
                "recertified_at: <timestamp>"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// One row of "Recertification equals TypeScript's".
struct GoldenRow {
    /// The row's golden and scratch folder name.
    name: &'static str,
    /// The two literal retry arguments.
    args: [&'static str; 2],
}

/// Proves every row of "Recertification equals TypeScript's".
///
/// Covers: rust-retry/recertification-equals-typescript-s
#[test]
fn recertification_equals_typescript() {
    let rows: [GoldenRow; 4] = [
        GoldenRow {
            name: "passed-1",
            args: ["1", "1"],
        },
        GoldenRow {
            name: "requeued-2",
            args: ["1", "2"],
        },
        GoldenRow {
            name: "long-3",
            args: ["001", "3"],
        },
        GoldenRow {
            name: "again-4",
            args: ["1", "4"],
        },
    ];
    for row in &rows {
        let root = recert_copy(row.name);
        let folder = change_folder(&root, "001-recert");
        let output = run(&root, row.args).expect("the recertification runs");
        let text = fs::read_to_string(fixture("recert-golden").join(format!("{}.txt", row.name)))
            .expect("the golden reads");
        let (outcome, body, golden_tree) = parse_golden(&text);
        assert_eq!(outcome, "output", "{}: outcome", row.name);
        assert_eq!(output.text, body, "{}: output", row.name);
        assert_eq!(
            format!("{}\n", blank_recertified(&dump(&folder))),
            golden_tree,
            "{}: tree",
            row.name
        );
    }
}

/// Proves a bad config refuses before the verify and writes nothing.
///
/// Covers: rust-retry/recertification-refusals
#[test]
fn recertification_refusals() {
    let root = recert_copy("refusals");
    write(&root, "osq.toml", "bogus = 1\n");
    let mut before = tree(&root);
    before.remove("osq.toml");
    let error = run(&root, ["1", "1"]).expect_err("the config is refused");
    assert_eq!(
        failed_message(error),
        "bogus is not an osq.toml key",
        "the config error"
    );
    let mut after = tree(&root);
    after.remove("osq.toml");
    assert_eq!(after, before, "every file apart from osq.toml is unchanged");
}

/// One row of "Recertified scope files".
struct ScopeRow {
    /// The row's scratch folder name.
    name: &'static str,
    /// The task file's scope entries.
    entries: &'static [&'static str],
    /// The expected scope hash line value.
    hash: &'static str,
    /// The expected `scope_files:` block lines.
    files: &'static [&'static str],
}

/// Every row of "Recertified scope files".
const SCOPE_ROWS: [ScopeRow; 10] = [
    ScopeRow {
        name: "outside",
        entries: &["../outside.txt"],
        hash: "sha256:985bc8dcecaee4913c191e1d3b327a931d48951f486500edd41ab73a57918030",
        files: &["scope_files:", "  ../outside.txt: null"],
    },
    ScopeRow {
        name: "absolute",
        entries: &["/abs/file.txt"],
        hash: "sha256:d84705e84283af54e8d2e9a3d8f1a7f34c018c3aeb577b80d8186dd3577d841a",
        files: &["scope_files:", "  /abs/file.txt: null"],
    },
    ScopeRow {
        name: "outside-globs",
        entries: &["../*.txt", "/abs/*.txt"],
        hash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        files: &["scope_files: {}"],
    },
    ScopeRow {
        name: "directory",
        entries: &["src"],
        hash: "sha256:7aaf195b39732b39c116a660cd4ffe54eae09e8fc8a4970b2d7e295e68ad4892",
        files: &["scope_files:", "  src: null"],
    },
    ScopeRow {
        name: "backslash",
        entries: &[".\\src\\one.txt"],
        hash: TASK_4_HASH,
        files: &[
            "scope_files:",
            "  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae",
        ],
    },
    ScopeRow {
        name: "one-level-glob",
        entries: &["src/two/*"],
        hash: "sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d",
        files: &[
            "scope_files:",
            "  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7",
        ],
    },
    ScopeRow {
        name: "question-mark",
        entries: &["src/two/deep/?.txt"],
        hash: "sha256:3515f8747e9ad61510ae928351f0d194a568fb85538f2a36a8cf865bcc42f53a",
        files: &[
            "scope_files:",
            "  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f",
        ],
    },
    ScopeRow {
        name: "duplicates",
        entries: &["src/one.txt", "./src/one.txt"],
        hash: TASK_4_HASH,
        files: &[
            "scope_files:",
            "  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae",
        ],
    },
    ScopeRow {
        name: "recursive-glob",
        entries: &["src/two/**/*.txt"],
        hash: "sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342",
        files: &[
            "scope_files:",
            "  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7",
            "  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f",
        ],
    },
    ScopeRow {
        name: "folder-glob",
        entries: &["src/**"],
        hash: "sha256:d21bc7711678dcf1a2bd9bc1c5e7be5282b4baa70f6d001ba39ab0937d5ef4ac",
        files: &[
            "scope_files:",
            "  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae",
            "  src/two/a.txt: sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7",
            "  src/two/deep/b.txt: sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f",
        ],
    },
];

/// The task file "Recertified scope files" writes for one row.
fn scope_task(entries: &[&str]) -> String {
    let mut text = String::from("---\ntitle: t\nverify: sh checks/pass.sh\nscope:\n");
    for entry in entries {
        let quoted = serde_json::to_string(entry).expect("the entry is JSON");
        let _ = writeln!(text, "  - {quoted}");
    }
    text.push_str("---\n");
    text
}

/// The `scope_files:` line and its indented lines in one done marker.
fn scope_files_lines(marker: &str) -> Vec<&str> {
    let lines: Vec<&str> = marker.split('\n').collect();
    let start = lines
        .iter()
        .position(|line| line.starts_with("scope_files:"))
        .expect("the marker has scope files");
    let mut block = vec![lines[start]];
    for line in &lines[start + 1..] {
        if !line.starts_with("  ") {
            break;
        }
        block.push(line);
    }
    block
}

/// Proves every row of "Recertified scope files".
///
/// Covers: rust-retry/recertified-scope-files
#[test]
fn recertified_scope_files() {
    for row in &SCOPE_ROWS {
        let root = recert_copy(row.name);
        let folder = change_folder(&root, "001-recert");
        write(
            &root,
            "openspec/changes/001-recert/tasks/4.md",
            scope_task(row.entries),
        );
        let seal = change_folder_seal(&folder).expect("the folder seals");
        write(
            &root,
            "openspec/changes/001-recert/.run/approved",
            format!("{}\n", seal.as_str()),
        );
        run(&root, ["1", "4"]).expect("the recertification runs");
        let marker = fs::read_to_string(folder.join(".run/done/4")).expect("the done marker reads");
        let hash_line = format!("scope_hash: {}", row.hash);
        assert!(
            marker.split('\n').any(|line| line == hash_line),
            "{}: {hash_line}",
            row.name
        );
        assert_eq!(
            scope_files_lines(&marker),
            row.files,
            "{}: scope files",
            row.name
        );
    }
}

/// One row of "Recertified marker text".
struct MarkerRow {
    /// The row's scratch folder name.
    name: &'static str,
    /// The frontmatter line the row writes.
    line: &'static str,
    /// The lines that must follow the scope hash line.
    expected: &'static [&'static str],
}

/// Every row of "Recertified marker text".
const MARKER_ROWS: [MarkerRow; 16] = [
    MarkerRow {
        name: "flag",
        line: "flag: true",
        expected: &["flag: true"],
    },
    MarkerRow {
        name: "empty-note",
        line: "note: \"\"",
        expected: &["note: \"\""],
    },
    MarkerRow {
        name: "hex",
        line: "stamp: \"0x1f\"",
        expected: &["stamp: \"0x1f\""],
    },
    MarkerRow {
        name: "exponent",
        line: "stamp: \"12e45\"",
        expected: &["stamp: \"12e45\""],
    },
    MarkerRow {
        name: "negative",
        line: "stamp: \"-1\"",
        expected: &["stamp: \"-1\""],
    },
    MarkerRow {
        name: "title-true",
        line: "stamp: \"True\"",
        expected: &["stamp: \"True\""],
    },
    MarkerRow {
        name: "trailing-colon",
        line: "stamp: \"a:\"",
        expected: &["stamp: \"a:\""],
    },
    MarkerRow {
        name: "plain",
        line: "stamp: a.b/c_d-e+f:g@h",
        expected: &["stamp: a.b/c_d-e+f:g@h"],
    },
    MarkerRow {
        name: "version",
        line: "stamp: 1.2.3",
        expected: &["stamp: 1.2.3"],
    },
    MarkerRow {
        name: "nothing",
        line: "nothing:",
        expected: &["nothing: null"],
    },
    MarkerRow {
        name: "list",
        line: "list: [{a: 1, b: [x]}, [y, z], {}, []]",
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
        line: "nested: {a: {b: c}}",
        expected: &["nested:", "  a:", "    b: c"],
    },
    MarkerRow {
        name: "codes",
        line: "codes: {7: seven}",
        expected: &["codes:", "  \"7\": seven"],
    },
    MarkerRow {
        name: "count-zero",
        line: "recertification_count: 0",
        expected: &[
            "recertification_count: 1",
            "original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222",
        ],
    },
    MarkerRow {
        name: "count-string",
        line: "recertification_count: \"3\"",
        expected: &[
            "recertification_count: 1",
            "original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222",
        ],
    },
    MarkerRow {
        name: "empty-original",
        line: "original_scope_hash: \"\"",
        expected: &[
            "original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222",
            "scope_files:",
        ],
    },
];

/// Proves every row of "Recertified marker text".
///
/// Covers: rust-retry/recertified-marker-text
#[test]
fn recertified_marker_text() {
    for row in &MARKER_ROWS {
        let root = recert_copy(row.name);
        let folder = change_folder(&root, "001-recert");
        let marker = format!(
            "---\nscope_hash: {RECORDED_HASH}\n{}\n---\n2026-10-01T10:00:00.000Z\n",
            row.line
        );
        write(&root, "openspec/changes/001-recert/.run/done/4", marker);
        run(&root, ["1", "4"]).expect("the recertification runs");
        let rewritten =
            fs::read_to_string(folder.join(".run/done/4")).expect("the done marker reads");
        let prefix = marker_prefix(row);
        assert!(
            rewritten.starts_with(&prefix),
            "{}: expected prefix {prefix:?}, got {rewritten:?}",
            row.name
        );
    }
}

/// The lines a row's rewritten marker must start with.
///
/// Covers: rust-retry/recertified-marker-text
fn marker_prefix(row: &MarkerRow) -> String {
    let mut lines = vec!["---".to_owned(), format!("scope_hash: {TASK_4_HASH}")];
    lines.extend(row.expected.iter().map(|line| (*line).to_owned()));
    format!("{}\n", lines.join("\n"))
}

/// Proves the tail keeps the last lines when every line fits the character limit.
///
/// Covers: rust-retry/recertification-equals-typescript-s
#[test]
fn output_tail_keeps_the_last_lines_when_each_fits() {
    let output = "alpha\nbeta\ngamma\n";
    assert_eq!(
        source_excerpt::tail_verify_output(output, 2, 400),
        "beta\ngamma",
        "the last two lines"
    );
    assert_eq!(
        source_excerpt::tail_verify_output(output, 3, 400),
        output,
        "an output within both limits is unchanged"
    );
    assert_eq!(
        source_excerpt::tail_verify_output(" \n\n", 40, 400),
        "",
        "blank output is empty"
    );
}

/// Proves the verify sees the change folder's absolute path as `OSQ_CHANGE`.
///
/// Covers: rust-retry/recertification-equals-typescript-s
#[test]
fn recertification_passes_the_absolute_change_folder() {
    let root = recert_copy("absolute-change");
    let folder = change_folder(&root, "001-recert");
    let expected = folder
        .canonicalize()
        .expect("the change folder canonicalizes");
    let script = format!(
        "if [ \"$OSQ_CHANGE\" = \"{}\" ]; then echo pass; else echo \"bad:$OSQ_CHANGE\"; exit 1; fi\n",
        expected.display()
    );
    write(&root, "checks/change.sh", script);
    write(
        &root,
        "openspec/changes/001-recert/tasks/1.md",
        "---\ntitle: t\nverify: sh checks/change.sh\nscope:\n  - src/one.txt\n---\n",
    );
    let seal = change_folder_seal(&folder).expect("the folder seals");
    write(
        &root,
        "openspec/changes/001-recert/.run/approved",
        format!("{}\n", seal.as_str()),
    );
    let output = run(&root, ["1", "1"]).expect("the recertification runs");
    assert!(
        output.text.starts_with("Recertified 001 task 1"),
        "the absolute change folder passed the verify: {}",
        output.text
    );
}

/// Proves the event keeps a non-string attribution key by its text.
///
/// Covers: rust-retry/recertification-equals-typescript-s
#[test]
fn recertification_event_keeps_attribution_mapping_keys() {
    let root = recert_copy("attribution-keys");
    let folder = change_folder(&root, "001-recert");
    write(
        &root,
        "openspec/changes/001-recert/.run/regressed/1.md",
        "---\nreason: scope_regression\nattribution: [{7: seven, true: yes}]\n---\nTask 1 changed:\n- src/one.txt (modified)\n",
    );
    run(&root, ["1", "1"]).expect("the recertification runs");
    let events = fs::read_to_string(folder.join(".run/events/1.jsonl")).expect("the events read");
    let line = events.lines().last().expect("the recertification line");
    let event: Value = serde_json::from_str(line).expect("the event is JSON");
    assert_eq!(
        event["data"]["attribution"],
        json!([{"7": "seven", "true": "yes"}]),
        "the attribution mapping keys"
    );
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
    source_yaml::write(&mapping)
}

/// Proves empty values and deeper list items are written as TypeScript writes them.
///
/// Covers: rust-retry/recertified-marker-text
#[test]
fn yaml_writes_empty_values_and_deeper_items() {
    let rows: [(&str, &str); 3] = [
        ("empty: []\n", "empty: []\n"),
        ("deep: [[{a: [x]}]]\n", "deep:\n  - - a:\n        - x\n"),
        ("deep: [[[x, y]]]\n", "deep:\n  - - - x\n      - y\n"),
    ];
    for (text, expected) in rows {
        assert_eq!(yaml_write_of(text), expected, "{text:?}");
    }
}

/// The YAML writer's output for one string value.
fn yaml_string(value: &str) -> String {
    let mut mapping = Hash::new();
    mapping.insert(
        Yaml::String("stamp".to_owned()),
        Yaml::String(value.to_owned()),
    );
    source_yaml::write(&mapping)
}

/// Proves which strings are quoted and which stay plain.
///
/// Covers: rust-retry/recertified-marker-text
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

/// Proves an outside pattern and an outside exact entry give nothing.
///
/// Covers: rust-retry/recertified-scope-files
#[test]
fn scope_outside_roots_and_entries_give_no_hash() {
    let outer = scratch("retry_recert_scope", "outside");
    let project = outer.join("project");
    fs::create_dir_all(project.join("src")).expect("the project exists");
    write(&project, "src/one.txt", "one\n");
    let parent = project.parent().expect("the project has a parent");
    write(parent, "outside.txt", "out\n");
    write(parent, "sub/inside.txt", "in\n");
    write(parent, "abs.txt", "abs\n");
    for pattern in ["../*.txt", "../sub/*.txt"] {
        let hash = source_scope::compute_hash(&project, &[pattern.to_owned()]);
        assert!(!hash.hash.is_empty(), "{pattern:?} still has a digest");
        assert!(hash.files.is_empty(), "{pattern:?} escapes the project");
    }
    let absolute = parent.join("abs.txt");
    let absolute = absolute.to_string_lossy().into_owned();
    for entry in ["../outside.txt", absolute.as_str()] {
        let hash = source_scope::compute_hash(&project, &[entry.to_owned()]);
        assert!(!hash.hash.is_empty(), "{entry:?} still has a digest");
        assert_eq!(hash.files.len(), 1, "{entry:?} gives one result");
        assert_eq!(hash.files[0].path, entry, "{entry:?} gives itself");
        assert!(hash.files[0].hash.is_none(), "{entry:?} has no hash");
    }
}
