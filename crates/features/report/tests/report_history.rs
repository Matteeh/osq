//! Proves `report`'s History counts and cost texts against TypeScript's rules.

mod summary_support;

use std::path::Path;

use serde_json::Value;

use summary_support::{field, golden, project, run, scratch, write};

/// A `started` event with no cost.
const STARTED: &str =
    r#"{"type":"started","timestamp":"2026-10-21T08:00:00.000Z","data":{"task":"1"}}"#;

/// A `tokens` event reporting the cost zero.
const TOKENS_ZERO: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:01:00.000Z","data":{"cost":0}}"#;

/// A `tokens` event reporting one eighth.
const TOKENS_EIGHTH: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:01:00.000Z","data":{"cost":0.125}}"#;

/// A `tokens` event reporting one two-hundredth.
const TOKENS_HALF_CENT: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:01:00.000Z","data":{"cost":0.005}}"#;

/// A `tokens` event reporting negative one half.
const TOKENS_NEGATIVE: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:01:00.000Z","data":{"cost":-0.5}}"#;

/// A `tokens` event reporting the smallest two-decimal total.
const TOKENS_CENT: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:01:00.000Z","data":{"cost":0.01}}"#;

/// A `tokens` event reporting a whole number above one hundred.
const TOKENS_HUNDRED: &str =
    r#"{"type":"tokens","timestamp":"2026-10-21T08:01:00.000Z","data":{"cost":100}}"#;

/// One row of the "Reported cost texts" table.
struct CostRow {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The `tokens` line after `started`, or none.
    tokens: Option<&'static str>,
    /// The text after `  Harness-reported cost:`.
    text: &'static str,
    /// The compact `history.cost.perSpec` JSON.
    per_spec: &'static str,
}

/// Every "Reported cost texts" row, then the two-decimal boundary row.
const COST_ROWS: &[CostRow] = &[
    CostRow {
        name: "none",
        tokens: None,
        text: "not reported (0 of 1 attempts reported cost)",
        per_spec: "{}",
    },
    CostRow {
        name: "zero",
        tokens: Some(TOKENS_ZERO),
        text: "$0.0000 (1 of 1 attempts reported cost)",
        per_spec: "{}",
    },
    CostRow {
        name: "eighth",
        tokens: Some(TOKENS_EIGHTH),
        text: "$0.13 (1 of 1 attempts reported cost)",
        per_spec: r#"{"001-a":0.125}"#,
    },
    CostRow {
        name: "half-cent",
        tokens: Some(TOKENS_HALF_CENT),
        text: "$0.0050 (1 of 1 attempts reported cost)",
        per_spec: r#"{"001-a":0.005}"#,
    },
    CostRow {
        name: "negative",
        tokens: Some(TOKENS_NEGATIVE),
        text: "$-0.5000 (1 of 1 attempts reported cost)",
        per_spec: "{}",
    },
    CostRow {
        name: "cent",
        tokens: Some(TOKENS_CENT),
        text: "$0.01 (1 of 1 attempts reported cost)",
        per_spec: r#"{"001-a":0.01}"#,
    },
    CostRow {
        name: "hundred",
        tokens: Some(TOKENS_HUNDRED),
        text: "$100.00 (1 of 1 attempts reported cost)",
        per_spec: r#"{"001-a":100}"#,
    },
];

/// Proves the History counts and per-spec cost of the history project.
///
/// Covers: rust-report/history-of-the-history-project
#[test]
fn history_of_the_history_project() {
    let root = project(
        "history-of-the-history-project",
        "history-project",
        "history-project",
    );
    let text = run(&root, &[]).expect("report prints text");
    assert_eq!(text, golden("history-project", "txt"));
    let rows = [
        ("Total attempts", "8"),
        ("Tasks with multiple attempts", "3"),
        ("Unexplained re-runs", "1"),
        ("Verification runs", "3"),
        ("Verification runs missing exit code", "1"),
        ("Pre-spawn verify mismatches", "1 of 5 runs"),
        ("Pre-spawn verify with missing paths", "2 of 5 runs"),
        (
            "Pre-spawn verify by declared start",
            "red 1 of 2 passed, green 1 of 1 passed, any 0 of 1 passed",
        ),
        (
            "automatic",
            "2 retries, 1 reached done, cost $0.40 (1 of 2 attempts reported cost)",
        ),
        (
            "manual",
            "1 retries, 1 reached done, cost not reported (0 of 1 attempts reported cost)",
        ),
        ("Stuck", "1"),
        (
            "Harness-reported cost",
            "$4.70 (4 of 8 attempts reported cost)",
        ),
        ("Rejections", "2"),
    ];
    for (label, expected) in rows {
        assert_eq!(field(&text, label), expected, "{label}");
    }
    for line in [
        "    timeout: 2",
        "    unknown: 1",
        "    verify_red: 1",
        "    claude-opus: 1",
        "    unknown: 1",
        "    Detected: 3",
        "    Verification passed at detection: 1",
        "    Verification failed at detection: 1",
        "    Recertified by human: 1",
        "    Recertified automatically: 1",
        "    Requeued for agent: 1",
    ] {
        assert!(
            text.lines().any(|actual| actual == line),
            "missing line {line:?} in {text}"
        );
    }

    let json_text = run(&root, &["--json"]).expect("report prints JSON");
    assert_eq!(json_text, golden("history-project", "json"));
    let json: Value = serde_json::from_str(&json_text).expect("the report is JSON");
    assert_eq!(
        json["history"]["cost"]["perSpec"].to_string(),
        r#"{"101-alpha":4,"102-beta":0.7000000000000001}"#
    );
}

/// Proves every "Reported cost texts" row's text and per-spec JSON.
///
/// Covers: rust-report/reported-cost-texts
#[test]
fn reported_cost_texts() {
    for row in COST_ROWS {
        let root = scratch("reported-cost-texts", row.name);
        write_change(&root, row.tokens);
        let text = run(&root, &[]).expect("report prints text");
        assert_eq!(
            field(&text, "Tasks with multiple attempts"),
            "0",
            "{} attempts",
            row.name
        );
        assert_eq!(
            field(&text, "Harness-reported cost"),
            row.text,
            "{} text",
            row.name
        );
        let json: Value =
            serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
                .expect("the report is JSON");
        assert_eq!(
            json["history"]["cost"]["perSpec"].to_string(),
            row.per_spec,
            "{} perSpec",
            row.name
        );
    }
}

/// Writes one active `001-a` change with a started event and the row's tokens.
fn write_change(root: &Path, tokens: Option<&str>) {
    let change = root.join("openspec/changes/001-a");
    write(
        &change.join("proposal.md"),
        "---\ntitle: A\n---\n## Goal\n\nA.\n",
    );
    write(&change.join("tasks/1.md"), "## Task\n\nDo it.\n");
    let mut content = format!("{STARTED}\n");
    if let Some(tokens) = tokens {
        content.push_str(tokens);
        content.push('\n');
    }
    write(&change.join(".run/events/1.jsonl"), &content);
}
