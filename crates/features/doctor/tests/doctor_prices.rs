//! Proves doctor's `planning-prices` warning for recorded-token models.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The config every row starts from.
const CONFIG: &str = "[executor]\nharness = \"mock\"\n";
/// The prices for model `m-a`.
const PRICE_A: &str =
    "\n\n[planning.prices.m-a]\ninput = 1\noutput = 1\ncacheRead = 0\ncacheWrite = 0";

/// One row of "Doctor planning prices lines".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The `osq.toml` text appended to the config.
    prices: &'static str,
    /// Change folders and the models their planning sessions recorded.
    plans: &'static [(&'static str, &'static [&'static str])],
    /// The row's `planning-prices` line, or none when it prints none.
    expected: Option<&'static str>,
}

/// The rows of "Doctor planning prices lines", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "no-plans",
        prices: "",
        plans: &[],
        expected: None,
    },
    Row {
        name: "two-folders",
        prices: "",
        plans: &[("001-a", &["m-b"]), ("archive/002-b", &["m-a"])],
        expected: Some(
            "[warn] planning-prices: planning cost stays unreported for m-a, m-b; add planning.prices[\"m-a\"], planning.prices[\"m-b\"]",
        ),
    },
    Row {
        name: "one-priced",
        prices: PRICE_A,
        plans: &[("001-a", &["m-b"]), ("archive/002-b", &["m-a"])],
        expected: Some(
            "[warn] planning-prices: planning cost stays unreported for m-b; add planning.prices[\"m-b\"]",
        ),
    },
    Row {
        name: "both-priced",
        prices: "\n\n[planning.prices.m-a]\ninput = 1\noutput = 1\ncacheRead = 0\ncacheWrite = 0\n\n[planning.prices.m-b]\ninput = 1\noutput = 1\ncacheRead = 0\ncacheWrite = 0",
        plans: &[("001-a", &["m-b"]), ("archive/002-b", &["m-a"])],
        expected: None,
    },
    Row {
        name: "rejected-only",
        prices: "",
        plans: &[("rejected/003-c", &["m-c"])],
        expected: None,
    },
    Row {
        name: "same-model-twice",
        prices: "",
        plans: &[("001-a", &["m"]), ("archive/002-b", &["m"])],
        expected: Some(
            "[warn] planning-prices: planning cost stays unreported for m; add planning.prices[\"m\"]",
        ),
    },
    Row {
        name: "escaped-model",
        prices: "",
        plans: &[("001-a", &["say \"hi\""])],
        expected: Some(
            "[warn] planning-prices: planning cost stays unreported for say \"hi\"; add planning.prices[\"say \\\"hi\\\"\"]",
        ),
    },
];

/// A fresh scratch folder named after the row, with its old contents removed.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("doctor_prices")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("the file has a parent"))
        .expect("the parent folders are created");
    fs::write(path, text).expect("the file is written");
}

/// The managed files doctor checks, paired with their test fixture copies.
const MANAGED_FILES: [(&str, &str); 3] = [
    ("AGENTS.md", "agents-block.txt"),
    ("PLANNER.md", "planner-block.txt"),
    (".claude/commands/osq-plan.md", "claude-plan-command.txt"),
];

/// Writes the managed files every doctor root holds.
fn managed_files(root: &Path) {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/managed");
    for (path, fixture) in MANAGED_FILES {
        let text = fs::read_to_string(fixtures.join(fixture)).expect("the managed fixture reads");
        write(&root.join(path), &format!("{text}\n"));
    }
}

/// Escapes one model as a JSON string literal.
fn quoted(model: &str) -> String {
    model.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Two plan lines for one session that recorded an input token.
fn session(id: &str, model: &str) -> String {
    format!(
        "{{\"type\":\"plan_started\",\"sessionId\":\"{id}\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"data\":{{\"harness\":\"claude\",\"model\":\"{}\"}}}}\n{{\"type\":\"plan_exited\",\"sessionId\":\"{id}\",\"timestamp\":\"2026-01-01T00:01:00Z\",\"data\":{{\"exitCode\":0,\"usage\":{{\"inputTokens\":5}}}}}}\n",
        quoted(model)
    )
}

/// Writes one row's change folders with their plan records.
fn write_plans(root: &Path, plans: &[(&str, &[&str])]) {
    for (folder, models) in plans {
        let dir = root.join("openspec/changes").join(folder);
        let mut text = String::new();
        for (index, model) in models.iter().enumerate() {
            text.push_str(&session(&format!("s{}", index + 1), model));
        }
        write(&dir.join(".run/plan.jsonl"), &text);
        if folder.starts_with("archive/") || folder.starts_with("rejected/") {
            write(&dir.join("proposal.md"), "x");
            write(&dir.join("tasks.md"), "x");
        }
    }
}

/// Runs doctor on a root and returns its output or its failure message.
fn doctor_text(root: &Path) -> String {
    match DoctorFeature.run(&Invocation::new(root, "doctor", Vec::new())) {
        Ok(output) => output.text,
        Err(FeatureError::Failed {
            command, message, ..
        }) => {
            assert_eq!("doctor", command);
            message
        }
        Err(other) => panic!("doctor returned {other:?}"),
    }
}

/// The first line that starts with a status and `planning-prices:`.
fn prices_line(text: &str) -> Option<String> {
    text.lines()
        .find(|line| {
            line.starts_with("[ok] planning-prices: ")
                || line.starts_with("[warn] planning-prices: ")
        })
        .map(str::to_owned)
}

/// Builds one row's root with its config and change folders.
fn build(row: &Row) -> PathBuf {
    let root = scratch(row.name);
    write(&root.join("osq.toml"), &format!("{CONFIG}{}", row.prices));
    managed_files(&root);
    write_plans(&root, row.plans);
    root
}

/// Proves every row of "Doctor planning prices lines" in its own scratch root.
///
/// Covers: rust-doctor/doctor-planning-prices-lines
#[test]
fn doctor_planning_prices_lines() {
    for row in ROWS {
        let root = build(row);
        assert_eq!(
            row.expected.map(str::to_owned),
            prices_line(&doctor_text(&root)),
            "row {}",
            row.name
        );
    }
}
