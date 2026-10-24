//! Proves the models of a change folder's planning sessions that recorded tokens.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::planning_token_models;

/// One row of the "Planning token models of a folder" table.
struct Row {
    /// The scratch folder's name and the assertion's label.
    name: &'static str,
    /// The `.run/plan.jsonl` lines, empty when the file is absent.
    lines: Vec<String>,
    /// The models the row expects.
    expected: Vec<&'static str>,
}

/// A fresh change folder under `CARGO_TARGET_TMPDIR`, named after the test and row.
fn scratch(name: &str) -> PathBuf {
    let folder = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_planning_token_models")
        .join("planning_token_models_of_a_folder")
        .join(name);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).expect("the scratch change folder is created");
    folder
}

/// One `plan_started` line for the row's session id and model.
fn started(id: &str, model: &str) -> String {
    format!(
        "{{\"type\":\"plan_started\",\"sessionId\":\"{id}\",\"timestamp\":\"2026-01-01T00:00:00Z\",\"data\":{{\"harness\":\"claude\",\"model\":\"{model}\"}}}}"
    )
}

/// One `plan_exited` line for the row's session id and data object.
fn exited(id: &str, data: &str) -> String {
    format!(
        "{{\"type\":\"plan_exited\",\"sessionId\":\"{id}\",\"timestamp\":\"2026-01-01T00:01:00Z\",\"data\":{data}}}"
    )
}

/// The slice fields of the scenario's `<slice>` placeholder.
const SLICE: &str =
    "\"start\":\"a\",\"end\":\"b\",\"approvedAt\":\"c\",\"turns\":1,\"activeMinutes\":2";

/// The rows of the "Planning token models of a folder" table, in order.
fn rows() -> Vec<Row> {
    let mut rows = usage_rows();
    rows.extend(slice_rows());
    rows.extend(session_rows());
    rows
}

/// The rows whose exits record tokens through `usage`, or none at all.
fn usage_rows() -> Vec<Row> {
    vec![
        Row {
            name: "no-file",
            lines: Vec::new(),
            expected: Vec::new(),
        },
        Row {
            name: "tokens-count-and-models-sort-distinct",
            lines: vec![
                started("s1", "m-b"),
                exited("s1", "{\"usage\":{\"inputTokens\":5}}"),
                started("s2", "m-a"),
                exited("s2", "{\"usage\":{\"outputTokens\":0}}"),
                started("s3", "m-b"),
                exited("s3", "{\"usage\":{\"inputTokens\":1}}"),
            ],
            expected: vec!["m-a", "m-b"],
        },
        Row {
            name: "empty-usage",
            lines: vec![started("s1", "m"), exited("s1", "{\"usage\":{}}")],
            expected: Vec::new(),
        },
        Row {
            name: "start-without-exit",
            lines: vec![started("s1", "m")],
            expected: Vec::new(),
        },
        Row {
            name: "invalid-usage-values",
            lines: vec![
                started("s1", "m"),
                exited(
                    "s1",
                    "{\"usage\":{\"inputTokens\":-1,\"outputTokens\":\"5\"}}",
                ),
            ],
            expected: Vec::new(),
        },
    ]
}

/// The rows whose exits record tokens through a slice.
fn slice_rows() -> Vec<Row> {
    vec![
        Row {
            name: "slice-output-token",
            lines: vec![
                started("s1", "m"),
                exited(
                    "s1",
                    &format!(
                        "{{\"usage\":{{}},\"slice\":{{{SLICE},\"tokens\":{{\"output\":3}},\"costSource\":null}}}}"
                    ),
                ),
            ],
            expected: vec!["m"],
        },
        Row {
            name: "slice-input-token-price-table",
            lines: vec![
                started("s1", "m"),
                exited(
                    "s1",
                    &format!(
                        "{{\"usage\":{{}},\"slice\":{{{SLICE},\"tokens\":{{\"input\":3}},\"costSource\":\"price_table\"}}}}"
                    ),
                ),
            ],
            expected: vec!["m"],
        },
        Row {
            name: "slice-unknown-cost-source",
            lines: vec![
                started("s1", "m"),
                exited(
                    "s1",
                    &format!(
                        "{{\"usage\":{{}},\"slice\":{{{SLICE},\"tokens\":{{\"input\":3}},\"costSource\":\"guess\"}}}}"
                    ),
                ),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "slice-empty-approved-at",
            lines: vec![
                started("s1", "m"),
                exited(
                    "s1",
                    "{\"usage\":{},\"slice\":{\"start\":\"a\",\"end\":\"b\",\"approvedAt\":\"\",\"turns\":1,\"activeMinutes\":2,\"tokens\":{\"input\":3}}}",
                ),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "slice-null-input-with-reasoning",
            lines: vec![
                started("s1", "m"),
                exited(
                    "s1",
                    &format!(
                        "{{\"usage\":{{}},\"slice\":{{{SLICE},\"tokens\":{{\"input\":null,\"reasoning\":4}}}}}}"
                    ),
                ),
            ],
            expected: Vec::new(),
        },
    ]
}

/// The rows about session correlation and malformed records.
fn session_rows() -> Vec<Row> {
    vec![
        Row {
            name: "empty-model",
            lines: vec![
                started("s1", ""),
                exited("s1", "{\"usage\":{\"inputTokens\":5}}"),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "first-exit-without-tokens",
            lines: vec![
                started("s1", "first"),
                started("s1", "second"),
                exited("s1", "{\"usage\":{}}"),
                exited("s1", "{\"usage\":{\"inputTokens\":5}}"),
            ],
            expected: Vec::new(),
        },
        Row {
            name: "first-start-model",
            lines: vec![
                started("s1", "first"),
                started("s1", "second"),
                exited("s1", "{\"usage\":{\"inputTokens\":5}}"),
            ],
            expected: vec!["first"],
        },
        Row {
            name: "skips-malformed-and-other-records",
            lines: vec![
                String::from("not json"),
                String::new(),
                String::from(
                    "{\"type\":\"plan_started\",\"sessionId\":\"\",\"timestamp\":\"t\",\"data\":{\"model\":\"x\"}}",
                ),
                String::from(
                    "{\"type\":\"plan_ready\",\"sessionId\":\"s9\",\"timestamp\":\"t\",\"data\":{}}",
                ),
                started("s1", "m"),
                exited("s1", "{\"usage\":{\"outputTokens\":2}}"),
            ],
            expected: vec!["m"],
        },
    ]
}

/// Proves every row of "Planning token models of a folder".
///
/// Covers: rust-storage/planning-token-models-of-a-folder
#[test]
fn planning_token_models_of_a_folder() {
    for row in rows() {
        let folder = scratch(row.name);
        if !row.lines.is_empty() {
            let run = folder.join(".run");
            fs::create_dir_all(&run).expect("the run folder is created");
            fs::write(
                run.join("plan.jsonl"),
                format!("{}\n", row.lines.join("\n")),
            )
            .expect("the plan log is written");
        }
        let expected: Vec<String> = row.expected.iter().map(ToString::to_string).collect();
        assert_eq!(planning_token_models(&folder), expected, "{}", row.name);
    }
}

/// Proves the slice's other valid cost sources and an unreadable log.
///
/// Covers: rust-storage/planning-token-models-of-a-folder
#[test]
fn planning_token_models_slice_cost_sources() {
    for (name, cost_source, expected) in [
        ("absent", "", vec!["m"]),
        ("harness", ",\"costSource\":\"harness\"", vec!["m"]),
    ] {
        let folder = scratch(name);
        let run = folder.join(".run");
        fs::create_dir_all(&run).expect("the run folder is created");
        fs::write(
            run.join("plan.jsonl"),
            format!(
                "{}\n{}\n",
                started("s1", "m"),
                exited(
                    "s1",
                    &format!("{{\"usage\":{{}},\"slice\":{{{SLICE},\"tokens\":{{\"input\":3}}{cost_source}}}}}")
                )
            ),
        )
        .expect("the plan log is written");
        let expected: Vec<String> = expected.iter().map(ToString::to_string).collect();
        assert_eq!(planning_token_models(&folder), expected, "{name}");
    }
}

/// Proves a plan log that is a folder gives no models.
///
/// Covers: rust-storage/planning-token-models-of-a-folder
#[test]
fn planning_token_models_unreadable_log() {
    let folder = scratch("unreadable-log");
    fs::create_dir_all(folder.join(".run").join("plan.jsonl"))
        .expect("the unreadable plan log is made");
    assert_eq!(planning_token_models(&folder), Vec::<String>::new());
}
