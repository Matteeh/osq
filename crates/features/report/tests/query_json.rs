//! Proves the report feature's `query --json` output, keys, values and reals.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use osq_core::{Feature, FeatureError, Invocation, Output};
use osq_feature_report::ReportFeature;
use serde_json::Value;

/// One golden JSON query case from `tests/fixtures/queries-json.json`.
#[derive(Debug)]
struct Case {
    /// The case's name.
    name: String,
    /// The fixture folder the case runs on.
    fixture: String,
    /// The select argument, or `None` for the table list.
    select: Option<String>,
    /// `output` or `failed`.
    result: String,
    /// The expected output or error message.
    text: String,
}

/// The path of the crate's `tests/fixtures` folder.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// All golden JSON cases, in file order.
fn cases() -> Vec<Case> {
    let text = fs::read_to_string(fixtures().join("queries-json.json")).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&text).unwrap();
    cases.iter().map(case).collect()
}

/// One golden JSON case.
fn case(value: &Value) -> Case {
    Case {
        name: string(value, "name"),
        fixture: string(value, "fixture"),
        select: value
            .get("select")
            .and_then(Value::as_str)
            .map(str::to_owned),
        result: string(value, "result"),
        text: string(value, "text"),
    }
}

/// One string field of a golden JSON case.
fn string(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap().to_owned()
}

/// The named golden JSON case.
fn named(name: &str) -> Case {
    cases().into_iter().find(|case| case.name == name).unwrap()
}

/// A fresh scratch copy of a fixture, replacing any leftover folder of the name.
fn scratch(fixture: &str, name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    copy_dir(&fixtures().join(fixture), &root);
    fs::canonicalize(root).unwrap()
}

/// Copies a folder's entries, files, dot folders and subfolders alike.
fn copy_dir(source: &Path, target: &Path) {
    for entry in fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let destination = target.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            fs::create_dir_all(&destination).unwrap();
            copy_dir(&entry.path(), &destination);
        } else {
            fs::copy(entry.path(), destination).unwrap();
        }
    }
}

/// Runs `query` with `--json` and an optional select.
fn run_json(root: &Path, select: Option<&str>) -> Result<Output, FeatureError> {
    let mut args = vec!["--json".to_owned()];
    if let Some(select) = select {
        args.push(select.to_owned());
    }
    run_args(root, &args)
}

/// Runs `query` with the given arguments.
fn run_args(root: &Path, args: &[String]) -> Result<Output, FeatureError> {
    ReportFeature.run(&Invocation::new(root, "query", args.to_vec()))
}

/// Proves every golden JSON case byte for byte.
///
/// Covers: rust-report/golden-json-query-output
#[test]
fn golden_json_query_output() {
    for case in cases() {
        let root = scratch(&case.fixture, &format!("query-json-{}", case.name));
        match run_json(&root, case.select.as_deref()) {
            Ok(output) => {
                assert_eq!(case.result, "output", "{} is not an output case", case.name);
                assert_eq!(output.text, case.text, "{}", case.name);
            }
            Err(FeatureError::Failed {
                command, message, ..
            }) => {
                assert_eq!(case.result, "failed", "{} is not a failed case", case.name);
                assert_eq!(command, "query", "{}", case.name);
                assert_eq!(message, case.text, "{}", case.name);
            }
            Err(other) => panic!("{}: expected Failed, got {other:?}", case.name),
        }
    }
}

/// Proves `--json` in the first, last and both positions.
///
/// Covers: rust-report/json-flag-in-any-position
#[test]
fn json_flag_in_any_position() {
    let select = "SELECT id, title FROM changes ORDER BY id";
    let expected = r#"[{"id":"001","title":"Run"},{"id":"002","title":"Quiet"}]"#;
    for (index, args) in [
        vec!["--json".to_owned(), select.to_owned()],
        vec![select.to_owned(), "--json".to_owned()],
        vec!["--json".to_owned(), select.to_owned(), "--json".to_owned()],
    ]
    .into_iter()
    .enumerate()
    {
        let root = scratch("history", &format!("query-json-flag-{index}"));
        let output = run_args(&root, &args).expect("the select succeeds").text;
        assert_eq!(output, expected, "arguments row {index}");
    }
}

/// Proves the join, integer-key and duplicate-key rows.
///
/// Covers: rust-report/keys-in-javascript-order
#[test]
fn keys_in_javascript_order() {
    for (name, expected) in [
        (
            "join",
            r#"[{"title":"When one, run","task":"1"},{"title":"When two, run","task":"2"}]"#,
        ),
        (
            "integer-keys",
            r#"[{"1":1,"2":2,"10":10,"4294967294":4294967294,"b":"x","a":"y","4294967295":4294967295,"01":3,"-1":4,"1.5":5}]"#,
        ),
        ("duplicate-keys", r#"[{"2":5,"a":3,"b":2}]"#),
    ] {
        let case = named(name);
        let root = scratch(&case.fixture, &format!("query-json-keys-{name}"));
        let output = run_json(&root, case.select.as_deref())
            .expect("the select succeeds")
            .text;
        assert_eq!(output, expected, "{name}");
    }
}

/// Proves the root and home rewrite in JSON values.
///
/// Covers: rust-report/paths-in-json-values
#[test]
fn paths_in_json_values() {
    let home = std::env::var("HOME").unwrap_or_default();
    let (home_path, expected) = if home.is_empty() {
        (
            "/home/osq-json-test".to_owned(),
            "/home/osq-json-test/b".to_owned(),
        )
    } else {
        (home, "~/b".to_owned())
    };
    let root = scratch("history", "query-json-paths");
    let select = format!(
        "SELECT '{}/a' AS p, '{home_path}/b' AS q, 3 AS n",
        root.display()
    );
    let output = run_json(&root, Some(&select))
        .expect("the path query succeeds")
        .text;
    assert_eq!(
        output,
        format!("[{{\"p\":\"./a\",\"q\":\"{expected}\",\"n\":3}}]")
    );
}

/// Proves the home rewrite with a chosen HOME and with HOME unset.
///
/// Covers: rust-report/paths-in-json-values
#[test]
fn paths_in_json_values_without_home() {
    let Some(marker) = std::env::var("OSQ_QUERY_JSON_TEST_HOME").ok() else {
        spawn_home_child(true);
        spawn_home_child(false);
        return;
    };
    let (name, home_path, expected) = if marker.is_empty() {
        (
            "query-json-paths-child-unset",
            "/home/osq-json-test-unset".to_owned(),
            "/home/osq-json-test-unset/b".to_owned(),
        )
    } else {
        ("query-json-paths-child-set", marker, "~/b".to_owned())
    };
    let root = scratch("history", name);
    let select = format!(
        "SELECT '{}/a' AS p, '{home_path}/b' AS q, 3 AS n",
        root.display()
    );
    let output = run_json(&root, Some(&select))
        .expect("the path query succeeds")
        .text;
    assert_eq!(
        output,
        format!("[{{\"p\":\"./a\",\"q\":\"{expected}\",\"n\":3}}]")
    );
}

/// Runs this test in a child with HOME set or unset.
fn spawn_home_child(with_home: bool) {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.args([
        "--exact",
        "paths_in_json_values_without_home",
        "--nocapture",
    ]);
    if with_home {
        command
            .env("OSQ_QUERY_JSON_TEST_HOME", "/home/osq-json-test")
            .env("HOME", "/home/osq-json-test");
    } else {
        command
            .env("OSQ_QUERY_JSON_TEST_HOME", "")
            .env_remove("HOME");
    }
    let status = command.status().unwrap();
    assert!(status.success(), "the HOME {with_home} child fails");
}

/// Proves integers past JavaScript's safe range keep their exact digits.
///
/// Covers: rust-report/integers-beyond-javascript-s-safe-range
#[test]
fn integers_beyond_javascript_s_safe_range() {
    let root = scratch("history", "query-json-integers-beyond");
    let select = "SELECT 9007199254740993 AS big, -9223372036854775808 AS least";
    let output = run_json(&root, Some(select))
        .expect("the integer query succeeds")
        .text;
    assert_eq!(
        output,
        r#"[{"big":9007199254740993,"least":-9223372036854775808}]"#
    );
}

/// Proves every real in the reals case as ECMAScript writes it.
///
/// Covers: rust-report/reals-as-javascript-writes-them
#[test]
fn reals_as_javascript_writes_them() {
    let case = named("reals");
    let root = scratch(&case.fixture, "query-json-reals");
    let output = run_json(&root, case.select.as_deref())
        .expect("the reals query succeeds")
        .text;
    assert_eq!(
        output,
        r#"[{"a":1e+21,"b":100000000000000000000,"c":1e-7,"d":0.000001,"e":2,"f":0,"g":0.30000000000000004,"h":0.3333333333333333,"i":5e-324,"j":1.7976931348623157e+308,"k":-1.5e-10,"l":123456.789,"m":null,"n":null}]"#
    );
}

/// Proves DEL and U+2028 are left as they are inside a JSON string.
///
/// Covers: rust-report/characters-json-leaves-as-they-are
#[test]
fn characters_json_leaves_as_they_are() {
    let root = scratch("history", "query-json-characters");
    let select = "SELECT 'a' || char(127) || char(8232) || '/é' AS d";
    let output = run_json(&root, Some(select))
        .expect("the character query succeeds")
        .text;
    assert_eq!(output, "[{\"d\":\"a\u{7f}\u{2028}/é\"}]");
}
