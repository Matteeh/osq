//! Proves the `lint --json` document against TypeScript's goldens and its
//! failure before a document.

mod copy;
mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::{run_args, scratch, write};

/// The proposal file the rules copy writes.
const PROP: &str = "openspec/changes/001-clean/proposal.md";
/// The task file the rules copy writes.
const TASK: &str = "openspec/changes/001-clean/tasks/1.md";
/// The ban the rules copy's `osq.toml` uses.
const BAN: &str = "[[bannedWords]]\nword = \"legacy\"\npaths = [\"crates/**\"]\n";
/// The proposal text the rules copy writes.
const PROP_TEXT: &str = "## Goal\n\nSum a list.\n\n## Assumptions\n\n";

/// The root each row runs on.
enum Root {
    /// The lint fixture project, copied for the row.
    Fixture,
    /// A new scratch root with no `openspec/` folder.
    Empty,
    /// A fixture copy with the files of the last "Banned word warnings" row.
    Rules,
}

/// One row of "Lint JSON documents".
struct Row {
    /// The row's scratch folder name.
    name: &'static str,
    /// The row's literal args.
    args: &'static [&'static str],
    /// The row's root.
    root: Root,
    /// The row's golden file under `tests/golden`.
    golden: &'static str,
    /// The exit code the output carries.
    code: i32,
}

/// Every row of "Lint JSON documents", in the scenario's order.
fn rows() -> [Row; 7] {
    [
        Row {
            name: "clean",
            args: &["--json", "1"],
            root: Root::Fixture,
            golden: "json-clean.json",
            code: 0,
        },
        Row {
            name: "dangling",
            args: &["--json", "3"],
            root: Root::Fixture,
            golden: "json-dangling.json",
            code: 1,
        },
        Row {
            name: "merge",
            args: &["4", "--json"],
            root: Root::Fixture,
            golden: "json-merge.json",
            code: 1,
        },
        Row {
            name: "bad_delta",
            args: &["--json", "--repository", "2"],
            root: Root::Fixture,
            golden: "json-bad-delta.json",
            code: 1,
        },
        Row {
            name: "several",
            args: &["--json", "1", "5"],
            root: Root::Fixture,
            golden: "json-several.json",
            code: 1,
        },
        Row {
            name: "rules",
            args: &["--json", "1"],
            root: Root::Rules,
            golden: "json-rules.json",
            code: 1,
        },
        Row {
            name: "empty",
            args: &["--json"],
            root: Root::Empty,
            golden: "json-empty.json",
            code: 0,
        },
    ]
}

/// Proves every row of "Lint JSON documents".
///
/// Covers: rust-lint/lint-json-documents
#[test]
fn lint_json_documents() {
    for row in rows() {
        let root = prepare(&row);
        let output = run_args(&root, "lint", row.args)
            .unwrap_or_else(|error| panic!("{}: unexpected error {error:?}", row.name));
        assert_eq!(
            output.text.as_bytes(),
            golden(row.golden).as_slice(),
            "{}: text",
            row.name
        );
        assert_eq!(output.code, row.code, "{}: code", row.name);
    }
}

/// Proves "Lint JSON failures".
///
/// Covers: rust-lint/lint-json-failures
#[test]
fn lint_json_failures() {
    let root = copy::fixture("lint_json/lint_json_failures/missing_id");
    let error =
        run_args(&root, "lint", &["--json", "9"]).expect_err("the id names no active change");
    let FeatureError::Failed {
        command, message, ..
    } = error
    else {
        panic!("expected a failed error, got {error:?}");
    };
    assert_eq!(command, "lint");
    let changes = root.join("openspec").join("changes");
    assert_eq!(
        message,
        format!("Spec \"9\" not found in {}", changes.display())
    );
}

/// Creates the row's new scratch root and writes the files its root needs.
fn prepare(row: &Row) -> PathBuf {
    let name = format!("lint_json/lint_json_documents/{}", row.name);
    match row.root {
        Root::Fixture => copy::fixture(&name),
        Root::Empty => scratch(&name),
        Root::Rules => {
            let root = copy::fixture(&name);
            write_rules_copy(&root);
            root
        }
    }
}

/// Writes the files of the last "Banned word warnings" row over a fixture copy.
fn write_rules_copy(root: &Path) {
    write(root, "osq.toml", BAN);
    write(
        root,
        TASK,
        "---\ntitle: When x, y\nverify: cargo test\nscope:\n  - crates/delta/src/lib.rs\n---\n## \
         Acceptance\n\n- [ ] Set `legacyMode` to false.\n",
    );
    write(root, PROP, PROP_TEXT);
}

/// Reads one golden file's bytes under `tests/golden`.
fn golden(name: &str) -> Vec<u8> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("golden")
        .join(name);
    fs::read(path).expect("the golden is read")
}
