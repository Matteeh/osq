//! The table list and the cell text of one query result.

use rusqlite::types::ValueRef;

/// The sixteen history tables and their columns, in the table list's order.
type Table = (&'static str, &'static [&'static str]);

/// The documented tables, in TypeScript's `HISTORY_TABLES` order.
const TABLES: &[Table] = &[
    (
        "changes",
        &[
            "id",
            "folder",
            "title",
            "archived_on",
            "goal",
            "tasks",
            "attempts",
            "halts",
            "elapsed_seconds",
            "cost",
            "planner",
        ],
    ),
    (
        "requirements",
        &[
            "change",
            "capability",
            "kind",
            "requirement",
            "renamed_from",
        ],
    ),
    ("tasks", &["change", "task", "title", "attempts", "done"]),
    ("dead_attempts", &["change", "task", "reason"]),
    ("disclosures", &["change", "task", "section", "text"]),
    (
        "notices",
        &["change", "notice", "severity", "opened", "outcome"],
    ),
    (
        "validator_runs",
        &[
            "change",
            "run",
            "outcome",
            "harness",
            "model",
            "duration",
            "exit_code",
            "scenarios",
            "findings",
            "reason",
            "output",
        ],
    ),
    (
        "validator_findings",
        &[
            "id",
            "change",
            "run",
            "finding",
            "capability",
            "requirement",
            "scenario",
            "problem",
            "detail",
            "label",
        ],
    ),
    (
        "focused_runs",
        &[
            "change",
            "task",
            "run",
            "outcome",
            "exit_code",
            "duration",
            "timed_out",
            "scenarios",
            "files",
        ],
    ),
    (
        "mutation_picks",
        &[
            "change",
            "task",
            "pick",
            "file",
            "function",
            "outcome",
            "reason",
            "killed",
            "survived",
            "invalid",
            "duration",
            "scenarios",
        ],
    ),
    (
        "mutation_survivors",
        &[
            "id",
            "change",
            "task",
            "pick",
            "file",
            "function",
            "line",
            "column",
            "mutator",
            "replacement",
            "label",
        ],
    ),
    (
        "link_findings",
        &["id", "change", "severity", "file", "message", "label"],
    ),
    (
        "task_outcomes",
        &[
            "change",
            "task",
            "capability",
            "scope_globs",
            "scope_files",
            "verify_kind",
            "tests_modify",
            "verify_starts",
            "shares_scope",
            "position",
            "attempts",
            "first_attempt",
            "dead_reason",
            "files_touched",
        ],
    ),
    (
        "pauses",
        &["change", "task", "paused_at", "until", "source"],
    ),
    (
        "recertifications",
        &[
            "change",
            "task",
            "recertified_at",
            "outcome",
            "automatic",
            "path",
            "credited_to",
            "source",
        ],
    ),
    (
        "manual_edits",
        &["kept_at", "record", "comment", "paths", "capabilities"],
    ),
];

/// The table list: one `name(column, column, ...)` line per table.
///
/// Implements: rust-report/query-table-list
pub(super) fn table_list() -> String {
    TABLES
        .iter()
        .map(|(name, columns)| format!("{name}({})", columns.join(", ")))
        .collect::<Vec<_>>()
        .join("\n")
}

/// One cell's text: empty for null, rewritten text for text, digits otherwise.
///
/// Implements: rust-report/query-cells
pub(super) fn cell_text(value: ValueRef<'_>, root: &str, home: &str) -> String {
    match value {
        ValueRef::Null => String::new(),
        ValueRef::Integer(number) => number.to_string(),
        ValueRef::Real(number) => number.to_string(),
        ValueRef::Blob(bytes) => bytes
            .iter()
            .map(u8::to_string)
            .collect::<Vec<_>>()
            .join(","),
        ValueRef::Text(bytes) => {
            let text = String::from_utf8_lossy(bytes);
            rewrite_paths(&text, root, home).replace('\n', "\\n")
        }
    }
}

/// Replaces the root with `.`, then a non-empty home with `~`.
///
/// Implements: rust-report/query-cells
/// Implements: rust-report/query-json-values
pub(super) fn rewrite_paths(text: &str, root: &str, home: &str) -> String {
    let rewritten = text.replace(root, ".");
    if home.is_empty() {
        rewritten
    } else {
        rewritten.replace(home, "~")
    }
}
