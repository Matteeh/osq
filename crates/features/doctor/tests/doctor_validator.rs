//! Proves doctor's `validator-runs`, `validator-harness` and `validator-model`
//! lines.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The config for a mock executor.
const MOCK: &str = "[executor]\nharness = \"mock\"";
/// A validator on the mock harness with model `m`.
const MOCK_VALIDATOR: &str =
    "[executor]\nharness = \"mock\"\n\n[validator]\nharness = \"mock\"\nmodel = \"m\"";
/// The missing claude program text.
const MISSING_CLAUDE: &str =
    "cannot start /nonexistent/claude: No such file or directory (os error 2)";
/// One failed validator run on `007-seven`, with a three-line output.
const SEVEN_FAILED: &str = r#"{"type":"validator_ran","timestamp":"2026-10-15T15:16:11.198Z","data":{"outcome":"failed","harness":"mock","model":"m","duration":2,"exitCode":1,"scenarios":5,"findings":[],"restored":[],"output":"\nmodel not found\nmore"}}"#;
/// One timed-out validator run on `007-seven`, without an output.
const SEVEN_TIMED_OUT: &str = r#"{"type":"validator_ran","timestamp":"2026-10-15T16:16:11.198Z","data":{"outcome":"timed_out","harness":"mock","model":"m","duration":2,"exitCode":1,"scenarios":5,"findings":[],"restored":[]}}"#;
/// One failed validator run on `008-eight`, with a three-line output.
const EIGHT_FAILED: &str = r#"{"type":"validator_ran","timestamp":"2026-10-15T15:16:11.198Z","data":{"outcome":"failed","harness":"mock","model":"m","duration":2,"exitCode":1,"scenarios":5,"findings":[],"restored":[],"output":"\nmodel not found\nmore"}}"#;

/// One row of "Doctor validator lines".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The row's `osq.toml`.
    config: &'static str,
    /// Files written in the root, each with a trailing newline.
    files: &'static [(&'static str, &'static str)],
    /// Archived folders and their validator event lines.
    folders: &'static [(&'static str, &'static [&'static str])],
    /// The validator lines, in order.
    expected: &'static [&'static str],
}

/// The rows of "Doctor validator lines", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "no-validator",
        config: MOCK,
        files: &[],
        folders: &[("007-seven", &[SEVEN_FAILED])],
        expected: &[],
    },
    Row {
        name: "validator-disabled",
        config: "[executor]\nharness = \"mock\"\n\n[validator]\nenabled = false",
        files: &[],
        folders: &[("007-seven", &[SEVEN_FAILED])],
        expected: &[],
    },
    Row {
        name: "two-failing-runs",
        config: MOCK_VALIDATOR,
        files: &[],
        folders: &[("007-seven", &[SEVEN_FAILED, SEVEN_TIMED_OUT])],
        expected: &[
            "[fail] validator-runs: validator timed_out 2× in a row, last on 007: timed_out — update the mock harness or change validator.model",
            "[ok] validator-model: validator mock/m, executor mock/default",
        ],
    },
    Row {
        name: "one-failing-run",
        config: MOCK_VALIDATOR,
        files: &[],
        folders: &[("008-eight", &[EIGHT_FAILED])],
        expected: &[
            "[fail] validator-runs: validator failed 1× in a row, last on 008: model not found — update the mock harness or change validator.model",
            "[ok] validator-model: validator mock/m, executor mock/default",
        ],
    },
    Row {
        name: "claude-validator",
        config: "[executor]\nharness = \"mock\"\n\n[validator]\nharness = \"claude\"\nmodel = \"opus\"\n\n[claude]\nbin = \"<fake>\"",
        files: &[("fake-pi-version", "2.1.300")],
        folders: &[],
        expected: &[
            "[ok] validator-harness: <fake> 2.1.300",
            "[ok] validator-harness-version: Claude Code 2.1.300 (minimum 2.1.278)",
            "[ok] validator-model: validator claude/opus, executor mock/default",
        ],
    },
    Row {
        name: "same-as-executor",
        config: "[executor]\nharness = \"claude\"\nmodel = \"opus\"\n\n[validator]\nharness = \"claude\"\nmodel = \"opus\"\n\n[claude]\nbin = \"<fake>\"",
        files: &[("fake-pi-version", "2.1.300")],
        folders: &[],
        expected: &[
            "[warn] validator-model: validator uses the executor's harness and model (claude/opus); its findings share the executor's blind spots",
        ],
    },
    Row {
        name: "missing-validator-binary",
        config: "[executor]\nharness = \"pi\"\n\n[pi]\nbin = \"<fake>\"\nmodel = \"deepseek-flash\"\n\n[validator]\nharness = \"claude\"\nmodel = \"opus\"\n\n[claude]\nbin = \"/nonexistent/claude\"",
        files: &[("fake-pi-version", "0.87.1")],
        folders: &[],
        expected: &[
            "[fail] validator-harness: binary unavailable: /nonexistent/claude (<missing claude>)",
            "[ok] validator-model: validator claude/opus, executor pi/deepseek-flash",
        ],
    },
    Row {
        name: "pi-validator-with-auth",
        config: "[executor]\nharness = \"mock\"\n\n[validator]\nharness = \"pi\"\nmodel = \"m\"\n\n[pi]\nbin = \"<fake>\"\nprovider = \"deepseek\"",
        files: &[
            ("fake-pi-version", "0.87.1"),
            (
                "fake-pi-auth",
                r#"{"status":"ready","provider":"deepseek"}"#,
            ),
        ],
        folders: &[],
        expected: &[
            "[ok] validator-harness: <fake> 0.87.1",
            "[ok] validator-harness-version: Pi 0.87.1 (tested >=0.87.0 <0.88.0)",
            "[ok] validator-harness-auth: deepseek credentials ready",
            "[ok] validator-model: validator pi/m, executor mock/default",
        ],
    },
    Row {
        name: "opencode-same-as-executor",
        config: "[executor]\nharness = \"opencode\"\n\n[opencode]\nbin = \"/nonexistent/opencode\"\n\n[validator]\nharness = \"opencode\"\nmodel = \"deepseek/deepseek-flash\"",
        files: &[],
        folders: &[],
        expected: &[
            "[warn] validator-model: validator uses the executor's harness and model (opencode/deepseek/deepseek-flash); its findings share the executor's blind spots",
        ],
    },
];

/// A fresh scratch folder named after the row, with its old contents removed.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("doctor_validator")
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

/// Returns the committed fake pi's absolute path.
fn fake_pi() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-pi/doctor.sh")
}

/// Replaces the row's placeholders with their runtime text.
fn expand(text: &str, fake: &Path) -> String {
    text.replace("<fake>", &fake.to_string_lossy())
        .replace("<missing claude>", MISSING_CLAUDE)
}

/// Writes the row's archived folders with their proposal, tasks and events.
fn write_folders(root: &Path, folders: &[(&str, &[&str])]) {
    for (folder, events) in folders {
        let dir = root.join("openspec/changes/archive").join(folder);
        write(&dir.join("proposal.md"), "x");
        write(&dir.join("tasks.md"), "x");
        let mut text = String::new();
        for line in *events {
            text.push_str(line);
            text.push('\n');
        }
        write(&dir.join(".run/events/change.jsonl"), &text);
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

/// Every line that starts with a status and `validator-`.
fn validator_lines(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| {
            line.starts_with("[ok] validator-")
                || line.starts_with("[warn] validator-")
                || line.starts_with("[fail] validator-")
        })
        .map(str::to_owned)
        .collect()
}

/// Builds one row's root with its config, files and archived folders.
fn build(row: &Row, fake: &Path) -> PathBuf {
    let root = scratch(row.name);
    write(
        &root.join("osq.toml"),
        &format!("{}\n", expand(row.config, fake)),
    );
    managed_files(&root);
    for (path, text) in row.files {
        write(&root.join(path), &format!("{text}\n"));
    }
    write_folders(&root, row.folders);
    root
}

/// Proves every row of "Doctor validator lines" in its own scratch root.
///
/// Covers: rust-doctor/doctor-validator-lines
#[test]
fn doctor_validator_lines() {
    let fake = fake_pi();
    for row in ROWS {
        let root = build(row, &fake);
        let expected: Vec<String> = row
            .expected
            .iter()
            .map(|line| expand(line, &fake))
            .collect();
        assert_eq!(
            expected,
            validator_lines(&doctor_text(&root)),
            "row {}",
            row.name
        );
    }
}
