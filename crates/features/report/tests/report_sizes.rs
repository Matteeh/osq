//! Proves `report`'s rework, disclosure, dependency and size History blocks.

mod summary_support;

use std::path::Path;

use serde_json::{Value, json};

use summary_support::{field, golden, project, run, scratch, write};

/// The lines right after `    Requeued for agent: 0` in the sizes project.
const BLOCKS: &[&str] = &[
    "Rework:",
    "  001: fixed by 203",
    "  201: fixed by 202",
    "  abc: fixed by 203",
    "Executor disclosures:",
    "  201: deviated 1, missing context 0, outside scope 0",
    "  202: deviated 0, missing context 1, outside scope 1",
    "  203: deviated 1, missing context 0, outside scope 1",
    "Dependencies added:",
    "  202-second: anyhow (Cargo.toml), serde (Cargo.toml), zod (package.json)",
];

/// The size lines that end the sizes project's text.
const SIZES: &[&str] = &[
    "  Size by scope files (legacy):",
    "    bucket     tasks  first-attempt pass rate  mean attempts  median duration",
    "    1-2        1      1                       1              1m",
    "    3-4        0      0                       0              unavailable",
    "    5-8        1      0                       2              4m 30s",
    "    over-8     0      0                       0              unavailable",
    "  Size by scope files (resolver-2):",
    "    bucket     tasks  first-attempt pass rate  mean attempts  median duration",
    "    1-2        0      0                       0              unavailable",
    "    3-4        1      0                       1              46s",
    "    5-8        0      0                       0              unavailable",
    "    over-8     1      1                       1              30m",
    "  Resolver 2 starts at: 202-second",
    "  Size by acceptance lines:",
    "    bucket     tasks  first-attempt pass rate  mean attempts  median duration",
    "    1-2        1      1                       1              unavailable",
    "    3-4        2      0.5                     1              53s",
    "    5-8        1      1                       1              30m",
    "    over-8     1      0                       2              4m 30s",
    "  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 8; acceptance lines 7 is within 1 of configured maxAcceptanceLines 7",
];

/// The lines right after `    Requeued for agent: 0` in the sizes project.
const NO_BLOCKS: &[&str] = &["Rework:", "  (none)", "Executor disclosures:", "  (none)"];

/// One "Size hints" row.
struct HintRow {
    /// The scratch folder's suffix and the assertion's label.
    name: &'static str,
    /// The configured `limits.maxScopeFiles`.
    max_scope_files: u32,
    /// The configured `limits.maxAcceptanceLines`.
    max_acceptance_lines: u32,
    /// The event files to remove, relative to `openspec/changes/`.
    removed: &'static [&'static str],
    /// The expected last line, or none when no hint line is written.
    hint: Option<&'static str>,
}

/// Every "Size hints" row in table order.
const HINT_ROWS: &[HintRow] = &[
    HintRow {
        name: "both",
        max_scope_files: 8,
        max_acceptance_lines: 7,
        removed: &[],
        hint: Some(
            "  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 8; acceptance lines 7 is within 1 of configured maxAcceptanceLines 7",
        ),
    },
    HintRow {
        name: "acceptance-lines",
        max_scope_files: 11,
        max_acceptance_lines: 8,
        removed: &[],
        hint: Some(
            "  Size hint: largest first-attempt pass 202-second/1 — acceptance lines 7 is within 1 of configured maxAcceptanceLines 8",
        ),
    },
    HintRow {
        name: "scope-files",
        max_scope_files: 9,
        max_acceptance_lines: 5,
        removed: &[],
        hint: Some(
            "  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 9",
        ),
    },
    HintRow {
        name: "none",
        max_scope_files: 6,
        max_acceptance_lines: 10,
        removed: &[],
        hint: None,
    },
    HintRow {
        name: "no-resolver-2",
        max_scope_files: 9,
        max_acceptance_lines: 3,
        removed: &["archive/202-second/.run/events/1.jsonl"],
        hint: None,
    },
    HintRow {
        name: "legacy-fallback",
        max_scope_files: 3,
        max_acceptance_lines: 9,
        removed: &[
            "archive/202-second/.run/events/1.jsonl",
            "203-third/.run/events/1.jsonl",
        ],
        hint: Some(
            "  Size hint: largest first-attempt pass 201-first/1 — scope files 2 is within 1 of configured maxScopeFiles 3",
        ),
    },
];

/// Proves the sizes project's rework, disclosure and dependency blocks.
///
/// Covers: rust-report/blocks-of-the-sizes-project
#[test]
fn blocks_of_the_sizes_project() {
    let root = project("blocks", "sizes-project", "sizes-project");
    let text = run(&root, &[]).expect("report prints text");
    assert_eq!(field(&text, "Total attempts"), "7");
    let lines = after(&text, "    Requeued for agent: 0");
    assert_eq!(&lines[..BLOCKS.len()], BLOCKS);

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    assert_eq!(
        report["history"]["rework"],
        json!([
            {"change": "001", "fixedBy": ["203"]},
            {"change": "201", "fixedBy": ["202"]},
            {"change": "abc", "fixedBy": ["203"]},
        ])
    );
    assert_eq!(
        report["history"]["disclosures"],
        json!([
            {"change": "201", "deviated": 1, "missingContext": 0, "outsideScope": 0},
            {"change": "202", "deviated": 0, "missingContext": 1, "outsideScope": 1},
            {"change": "203", "deviated": 1, "missingContext": 0, "outsideScope": 1},
        ])
    );
    assert_eq!(
        report["history"]["dependencies"],
        json!([{
            "change": "202-second",
            "added": [
                {"file": "Cargo.toml", "name": "anyhow"},
                {"file": "Cargo.toml", "name": "serde"},
                {"file": "package.json", "name": "zod"},
            ],
        }])
    );
}

/// Proves a project with no rework, disclosure or dependency block.
///
/// Covers: rust-report/no-blocks-in-the-history-project
#[test]
fn no_blocks_in_the_history_project() {
    let root = project("no-blocks", "history-project", "history-project");
    let text = run(&root, &[]).expect("report prints text");
    assert_eq!(field(&text, "Total attempts"), "8");
    let lines = after(&text, "    Requeued for agent: 1");
    assert_eq!(&lines[..NO_BLOCKS.len()], NO_BLOCKS);
    assert!(!text.lines().any(|line| line == "Dependencies added:"));

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    for key in ["rework", "disclosures", "dependencies"] {
        assert!(report["history"].get(key).is_none(), "{key}");
    }
}

/// Proves every size row of the sizes project and its starts-at line.
///
/// Covers: rust-report/sizes-of-the-sizes-project
#[test]
fn sizes_of_the_sizes_project() {
    let root = project("sizes", "sizes-project", "sizes-project");
    let report_text = run(&root, &[]).expect("report prints text");
    let text = before_coverage(&report_text);
    assert!(text.ends_with(&SIZES.join("\n")), "{text}");

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    let golden: Value =
        serde_json::from_str(&golden("sizes-project", "json")).expect("the golden is JSON");
    assert_eq!(report["history"]["sizes"], golden["history"]["sizes"]);
    let sizes = &report["history"]["sizes"];
    let acceptance = sizes["byAcceptanceLines"]
        .as_array()
        .expect("the rows are an array");
    assert_eq!(acceptance[1]["bucket"], "3-4");
    assert_eq!(acceptance[1]["medianDurationSeconds"], 52.78);
    let series = sizes["scopeFileSeries"]
        .as_array()
        .expect("the series are an array");
    assert_eq!(series[1]["resolver"], "resolver-2");
    assert_eq!(series[1]["byScopeFiles"][1]["bucket"], "3-4");
    assert_eq!(series[1]["byScopeFiles"][1]["medianDurationSeconds"], 45.56);
}

/// Proves every "Size hints" row's last line.
///
/// Covers: rust-report/size-hints
#[test]
fn size_hints() {
    for row in HINT_ROWS {
        let root = project("hints", row.name, "sizes-project");
        for removed in row.removed {
            remove(&root.join("openspec/changes").join(removed));
        }
        write(
            &root.join("osq.toml"),
            &format!(
                "[limits]\nmaxScopeFiles = {}\nmaxAcceptanceLines = {}\n",
                row.max_scope_files, row.max_acceptance_lines
            ),
        );
        let text = run(&root, &[]).expect("report prints text");
        let text = before_coverage(&text);
        if let Some(hint) = row.hint {
            assert_eq!(text.lines().last(), Some(hint), "{}", row.name);
        } else {
            assert!(
                !text.lines().any(|line| line.starts_with("  Size hint:")),
                "{}",
                row.name
            );
            assert_eq!(
                text.lines().last(),
                Some("    over-8     1      0                       2              4m 30s"),
                "{}",
                row.name
            );
        }
    }
}

/// Proves numeric ordering across digit lengths in rework and size series.
///
/// Covers: rust-report/sizes-of-the-sizes-project
#[test]
fn numeric_order_across_digit_lengths() {
    let root = scratch("numeric-order", "digit-lengths");
    write_ordered_change(&root, "1000-late", "[1, 1000]");
    write_ordered_change(&root, "archive/999-early", "[1, 999]");

    let text = run(&root, &[]).expect("report prints text");
    let lines = after(&text, "    Requeued for agent: 0");
    assert_eq!(
        &lines[..4],
        [
            "Rework:",
            "  001: fixed by 999, 1000",
            "  999: fixed by 999",
            "  1000: fixed by 1000",
        ]
    );

    let report: Value = serde_json::from_str(&run(&root, &["--json"]).expect("report prints JSON"))
        .expect("the report is JSON");
    let second = &report["history"]["sizes"]["scopeFileSeries"][1];
    assert_eq!(second["resolver"], "resolver-2");
    assert_eq!(second["startsAtChange"], "999-early");
    assert_eq!(second["largestFirstAttemptPass"]["change"], "999-early");
}

/// Writes one measured resolver-2 change with the given `fixes` list.
fn write_ordered_change(root: &Path, folder: &str, fixes: &str) {
    let change = root.join("openspec/changes").join(folder);
    write(
        &change.join("proposal.md"),
        &format!("---\ntitle: Ordered\nfixes: {fixes}\n---\n## Goal\n\nOrdered.\n"),
    );
    write(
        &change.join("tasks/1.md"),
        "---\ntitle: When ordered, it passes\n---\n## Acceptance\n\n- [ ] One.\n",
    );
    let events = [
        r#"{"type":"measures","timestamp":"2026-10-20T08:00:00.000Z","data":{"phase":"start","scopeFiles":1,"scopeResolver":2}}"#,
        r#"{"type":"started","timestamp":"2026-10-20T08:00:01.000Z"}"#,
        r#"{"type":"done","timestamp":"2026-10-20T08:01:00.000Z"}"#,
        r#"{"type":"measures","timestamp":"2026-10-20T08:01:00.000Z","data":{"phase":"end"}}"#,
    ];
    write(
        &change.join(".run/events/1.jsonl"),
        &format!("{}\n", events.join("\n")),
    );
}

/// The text before the blank line that starts the `Coverage:` section.
fn before_coverage(text: &str) -> &str {
    text.split("\n\nCoverage:")
        .next()
        .expect("a split gives at least one part")
}

/// The lines after the first line equal to `marker`.
fn after<'a>(text: &'a str, marker: &str) -> Vec<&'a str> {
    let lines: Vec<&str> = text.lines().collect();
    let position = lines
        .iter()
        .position(|line| *line == marker)
        .unwrap_or_else(|| panic!("no {marker:?} line in {text}"));
    lines[position + 1..].to_vec()
}

/// Removes one fixture file without failing when it is already absent.
fn remove(path: &Path) {
    std::fs::remove_file(path).unwrap_or_else(|error| panic!("{}: {error}", path.display()));
}
