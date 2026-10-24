//! Proves the show feature's JSON arguments, changes and archived head.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_show::ShowFeature;

/// The marker that says the JSON test runs with its own HOME.
const HOME_MARKER: &str = "OSQ_SHOW_JSON_HOME";
/// The archived change folder every archived head row shows.
const ARCHIVED: &str = "openspec/changes/archive/010-archived";
/// The lines that begin the archived members task 2 adds.
const ARCHIVED_MARKERS: [&str; 4] = [
    "  \"validation\": ",
    "  \"land\": ",
    "  \"verification\": ",
    "  \"digest\": ",
];

/// One not-archived golden row.
struct Row {
    /// The argument passed before `--json`.
    argument: &'static str,
    /// The golden's file name.
    golden: &'static str,
}

/// The eight rows of "Show JSON of a change that is not archived".
fn rows() -> [Row; 8] {
    [
        Row {
            argument: "1",
            golden: "active-001.json",
        },
        Row {
            argument: "approved",
            golden: "approved-002.json",
        },
        Row {
            argument: "003",
            golden: "running-003.json",
        },
        Row {
            argument: "004-dead",
            golden: "dead-004.json",
        },
        Row {
            argument: "5",
            golden: "steering-005.json",
        },
        Row {
            argument: "006",
            golden: "blocked-006.json",
        },
        Row {
            argument: "007",
            golden: "unplanned-007.json",
        },
        Row {
            argument: "011",
            golden: "rejected-011.json",
        },
    ]
}

/// Proves the JSON argument rows and the approved output row.
///
/// Covers: rust-show/show-json-arguments
#[test]
fn show_json_arguments() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child("show_json_arguments");
        return;
    }
    for (name, args, expected) in [
        ("none", vec!["--json"], Expected::Error("expected <id>")),
        (
            "extra",
            vec!["1", "--json", "2"],
            Expected::Error("expected <id>"),
        ),
        (
            "blank",
            vec!["--json", "  "],
            Expected::Error("specify a spec ID to show (e.g. osq show 001)"),
        ),
        (
            "approved",
            vec!["--json", "approved", "--json"],
            Expected::Golden,
        ),
    ] {
        let base = base("show_json_arguments", name);
        let checkout = base.join("checkout");
        if matches!(expected, Expected::Golden) {
            copy_fixture(&checkout);
        } else {
            fs::create_dir_all(&checkout).expect("the error root is created");
        }
        match (run(&checkout, &args), expected) {
            (Outcome::Error(text), Expected::Error(message)) => {
                assert_eq!(text, format!("usage of show: {message}"), "{name}");
            }
            (Outcome::Ok(output), Expected::Golden) => {
                assert_eq!(
                    replace_base(&output, &base),
                    golden("approved-002.json"),
                    "{name}"
                );
            }
            other => panic!("unexpected {other:?} for {name}"),
        }
    }
}

/// Proves every not-archived change's JSON equals TypeScript's golden.
///
/// Covers: rust-show/show-json-of-a-change-that-is-not-archived
#[test]
fn show_json_of_a_change_that_is_not_archived() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child("show_json_of_a_change_that_is_not_archived");
        return;
    }
    for row in rows() {
        let base = base("show_json_of_a_change_that_is_not_archived", row.golden);
        let checkout = base.join("checkout");
        copy_fixture(&checkout);
        let output = run_text(&checkout, &[row.argument, "--json"]).expect("the change is shown");
        assert_eq!(
            replace_base(&output, &base),
            golden(row.golden),
            "{}",
            row.golden
        );
    }
}

/// Proves both archived arguments print TypeScript's golden head.
///
/// Covers: rust-show/show-json-head-of-an-archived-change
#[test]
fn show_json_head_of_an_archived_change() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child("show_json_head_of_an_archived_change");
        return;
    }
    let expected = golden("archived-010.json");
    for (name, argument) in [("id", "10"), ("path", ARCHIVED)] {
        let base = base("show_json_head_of_an_archived_change", name);
        let checkout = base.join("checkout");
        copy_fixture(&checkout);
        let output = run_text(&checkout, &[argument, "--json"]).expect("the change is shown");
        assert_eq!(
            head(&replace_base(&output, &base)),
            head(&expected),
            "{name}"
        );
    }
}

/// Proves event data keeps JavaScript's key order and collapses duplicates.
///
/// Covers: rust-show/show-json-of-a-change-that-is-not-archived
#[test]
fn show_json_event_data_key_order() {
    if std::env::var_os(HOME_MARKER).is_none() {
        spawn_home_child("show_json_event_data_key_order");
        return;
    }
    let base = base("show_json_event_data_key_order", "row");
    let checkout = base.join("checkout");
    copy_fixture(&checkout);
    let line = concat!(
        "{ \"type\" : \"ordering\", \"timestamp\": \"t\", \"data\": {",
        " \"b\": \"first\", \"1\": \"one\", \"0\": \"zero\",",
        " \"b\": \"last\", \"a\": \"a\", \"01\": \"other\",",
        " \"2\": \"two\", \"4294967295\": \"not an index\" } }\n",
    );
    write(
        &checkout.join("openspec/changes/002-approved/.run/events/9.jsonl"),
        line,
    );
    let output = run_text(&checkout, &["2", "--json"]).expect("the change is shown");
    let expected = concat!(
        "      \"data\": {\n",
        "        \"0\": \"zero\",\n",
        "        \"1\": \"one\",\n",
        "        \"2\": \"two\",\n",
        "        \"b\": \"last\",\n",
        "        \"a\": \"a\",\n",
        "        \"01\": \"other\",\n",
        "        \"4294967295\": \"not an index\"\n",
        "      }",
    );
    assert!(output.contains(expected), "{output}");
}

/// What one JSON argument row gives.
#[derive(Debug)]
enum Outcome {
    /// The output text.
    Ok(String),
    /// A usage error as it displays.
    Error(String),
}

/// The result one JSON argument row expects.
#[derive(Clone, Copy, Debug)]
enum Expected {
    /// A usage error's text after `usage of show: `.
    Error(&'static str),
    /// A golden's output.
    Golden,
}

/// Runs show with arguments on a root.
fn run(root: &Path, args: &[&str]) -> Outcome {
    let invocation = Invocation::new(
        root,
        "show",
        args.iter().map(|arg| (*arg).to_owned()).collect(),
    );
    match ShowFeature.run(&invocation) {
        Ok(output) => Outcome::Ok(output.text),
        Err(error) => Outcome::Error(error.to_string()),
    }
}

/// Runs show with arguments and returns its output text.
fn run_text(root: &Path, args: &[&str]) -> Result<String, FeatureError> {
    ShowFeature
        .run(&Invocation::new(
            root,
            "show",
            args.iter().map(|arg| (*arg).to_owned()).collect(),
        ))
        .map(|output| output.text)
}

/// The text before its first archived-member line.
fn head(text: &str) -> String {
    let mut kept = Vec::new();
    for line in text.split('\n') {
        if ARCHIVED_MARKERS
            .iter()
            .any(|marker| line.starts_with(marker))
        {
            break;
        }
        kept.push(line);
    }
    kept.join("\n")
}

/// Replaces every spelling of a base folder's path by `<base>`.
fn replace_base(text: &str, base: &Path) -> String {
    let canonical = fs::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());
    text.replace(&base_text(&canonical), "<base>")
        .replace(&base_text(base), "<base>")
}

/// A path as text.
fn base_text(base: &Path) -> String {
    base.to_string_lossy().into_owned()
}

/// The golden file's text.
fn golden(name: &str) -> String {
    fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/json-golden")
            .join(name),
    )
    .expect("the golden reads")
}

/// A fresh base folder holding a checkout and home.
fn base(test: &str, row: &str) -> PathBuf {
    let base = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("show_json")
        .join(test)
        .join(row.trim_end_matches(".json"));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(base.join("home")).expect("the home is created");
    fs::canonicalize(base).expect("the base resolves")
}

/// Copies the fixture into a checkout and writes the running marker.
fn copy_fixture(checkout: &Path) {
    copy_dir(&fixture(), checkout);
    write(
        &checkout.join("openspec/changes/003-running/.run/running/1.pid"),
        "{\"pid\":4242,\"startedAt\":1759395600000}\n",
    );
}

/// The fixture project every case copies.
fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/show-project")
}

/// Runs this test in a child whose HOME is a fresh empty folder.
fn spawn_home_child(name: &str) {
    let home = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("show_json_home")
        .join(name);
    let _ = fs::remove_dir_all(&home);
    fs::create_dir_all(&home).expect("the home is created");
    let status = Command::new(std::env::current_exe().expect("the test binary is known"))
        .args(["--exact", name, "--nocapture"])
        .env(HOME_MARKER, &home)
        .env("HOME", &home)
        .status()
        .expect("the child starts");
    assert!(status.success(), "the isolated-home child fails");
}

/// Copies a directory tree recursively.
fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("the destination folder is created");
    for entry in fs::read_dir(from)
        .expect("the source folder reads")
        .flatten()
    {
        let target = to.join(entry.file_name());
        if entry.file_type().expect("the entry type reads").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("the file is copied");
        }
    }
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}
