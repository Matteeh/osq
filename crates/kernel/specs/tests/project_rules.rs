//! Proves the project rules errors TypeScript's `checkProjectRules` reports.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::{project_rules_errors, read_decisions};

/// The accepted system-wide ADR the rows reuse.
const KEEP: &str = "---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n";
/// The second accepted system-wide ADR one row reuses.
const ALSO: &str = "---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n";
/// The current project rules block the rows reuse.
const RULES: &str =
    "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->\n";
/// The block the two system-wide ADRs expect.
const BOTH_RULES: &str = "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n";

/// One row of "Project rules errors".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// Files written in the root.
    files: &'static [(&'static str, &'static str)],
    /// The `AGENTS.md` text, or the empty text when the root has no file.
    agents: &'static str,
    /// The row's `limits.maxProjectRules`.
    maximum: u64,
    /// The expected errors, in order.
    errors: &'static [&'static str],
}

/// The rows of "Project rules errors", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "project-rules-none",
        files: &[],
        agents: "",
        maximum: 10,
        errors: &[],
    },
    Row {
        name: "project-rules-unexpected",
        files: &[],
        agents: RULES,
        maximum: 10,
        errors: &["AGENTS.md has an unexpected project rules block; run `osq init`"],
    },
    Row {
        name: "project-rules-missing",
        files: &[("decisions/001-keep.md", KEEP)],
        agents: "",
        maximum: 10,
        errors: &["AGENTS.md is missing its project rules block; run `osq init`"],
    },
    Row {
        name: "project-rules-current",
        files: &[("decisions/001-keep.md", KEEP)],
        agents: "# Agents\n\n<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->\n\nMore.\n",
        maximum: 10,
        errors: &[],
    },
    Row {
        name: "project-rules-stale",
        files: &[("decisions/001-keep.md", KEEP)],
        agents: "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n",
        maximum: 10,
        errors: &["AGENTS.md project rules block is out of date; run `osq init`"],
    },
    Row {
        name: "project-rules-reversed",
        files: &[("decisions/001-keep.md", KEEP)],
        agents: "<!-- OSQ:RULES:END -->\n<!-- OSQ:RULES:START -->\n",
        maximum: 10,
        errors: &["AGENTS.md is missing its project rules block; run `osq init`"],
    },
    Row {
        name: "project-rules-unclosed",
        files: &[("decisions/001-keep.md", KEEP)],
        agents: "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n",
        maximum: 10,
        errors: &["AGENTS.md is missing its project rules block; run `osq init`"],
    },
    Row {
        name: "project-rules-two-at-limit",
        files: &[
            ("decisions/001-keep.md", KEEP),
            ("decisions/002-also.md", ALSO),
        ],
        agents: BOTH_RULES,
        maximum: 2,
        errors: &[],
    },
    Row {
        name: "project-rules-too-many",
        files: &[
            ("decisions/001-keep.md", KEEP),
            ("decisions/002-also.md", ALSO),
        ],
        agents: BOTH_RULES,
        maximum: 1,
        errors: &["AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)"],
    },
    Row {
        name: "project-rules-missing-and-too-many",
        files: &[
            ("decisions/001-keep.md", KEEP),
            ("decisions/002-also.md", ALSO),
        ],
        agents: "",
        maximum: 1,
        errors: &[
            "AGENTS.md is missing its project rules block; run `osq init`",
            "AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)",
        ],
    },
    Row {
        name: "project-rules-proposed-only",
        files: &[(
            "decisions/001-later.md",
            "---\nstatus: proposed\napplies_to: all\nrule: Later.\n---\n# 001. Later\n",
        )],
        agents: "",
        maximum: 0,
        errors: &[],
    },
    Row {
        name: "project-rules-capability-only",
        files: &[
            ("openspec/specs/alpha/spec.md", "x"),
            (
                "decisions/001-alpha.md",
                "---\nstatus: accepted\napplies_to: [alpha]\nrule: Alpha only.\n---\n# 001. Alpha\n",
            ),
        ],
        agents: RULES,
        maximum: 10,
        errors: &["AGENTS.md has an unexpected project rules block; run `osq init`"],
    },
];

/// A fresh empty scratch folder for one row.
fn scratch(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
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

/// Proves every row of "Project rules errors" in its own scratch root.
///
/// Covers: rust-specs/project-rules-errors
#[test]
fn project_rules_errors_rows() {
    for row in ROWS {
        let root = scratch(row.name);
        for (path, text) in row.files {
            write(&root.join(path), text);
        }
        if !row.agents.is_empty() {
            write(&root.join("AGENTS.md"), row.agents);
        }
        let records = read_decisions(&root, Path::new("decisions"), Path::new("openspec"));
        let actual = project_rules_errors(&records, row.agents, row.maximum);
        let expected: Vec<&str> = row.errors.to_vec();
        assert_eq!(actual, expected, "row {}", row.name);
    }
}
