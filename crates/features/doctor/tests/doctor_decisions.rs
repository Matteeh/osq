//! Proves doctor's `decisions` line for TypeScript's `checkDecisions` rows.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, FeatureError, Invocation};
use osq_feature_doctor::DoctorFeature;

/// The accepted system-wide ADR the rows reuse.
const KEEP: &str = "---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n";
/// The current project rules block the rows reuse.
const RULES: &str =
    "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->";
/// The warning TypeScript appends when no accepted ADR applies to all.
const ALL: &str = "no accepted ADR applies to all; write the architecture and style ADRs first";

/// One row of "Doctor decisions lines".
struct Row {
    /// The row's name and its scratch folder.
    name: &'static str,
    /// The `osq.toml` text, or none when the root has no file.
    config: Option<&'static str>,
    /// Files written in the root, with the reused-text placeholders.
    files: &'static [(&'static str, &'static str)],
    /// The expected `decisions` line, or none when doctor prints none.
    line: Option<&'static str>,
}

/// The rows of "Doctor decisions lines", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "decisions-none",
        config: None,
        files: &[("AGENTS.md", "# Agents\n")],
        line: None,
    },
    Row {
        name: "decisions-valid",
        config: None,
        files: &[
            (
                "decisions/001-keep.md",
                "---\nstatus: accepted\napplies_to: all\nrule: Keep it.\nchecks: [checks/keep.rs]\n---\n# 001. Keep\n",
            ),
            ("checks/keep.rs", "x"),
            ("AGENTS.md", "<rules>\n"),
        ],
        line: Some("[ok] decisions: 1 ADRs valid"),
    },
    Row {
        name: "decisions-capability-only",
        config: None,
        files: &[
            ("openspec/specs/alpha/spec.md", "x"),
            (
                "decisions/001-alpha.md",
                "---\nstatus: accepted\napplies_to: [alpha]\nrule: Alpha only.\n---\n# 001. Alpha\n",
            ),
        ],
        line: Some(
            "[warn] decisions: no accepted ADR applies to all; \
             write the architecture and style ADRs first",
        ),
    },
    Row {
        name: "decisions-ghost-and-draft",
        config: None,
        files: &[
            (
                "decisions/001-ghost.md",
                "---\nstatus: proposed\napplies_to: [ghost]\n---\n# 001. Ghost\n",
            ),
            ("decisions/draft.md", "# Draft\n"),
        ],
        line: Some(
            "[warn] decisions: decisions/001-ghost.md: applies_to capability \"ghost\" has no \
             living spec; decisions/draft.md: no osq frontmatter, ignored; \
             no accepted ADR applies to all; write the architecture and style ADRs first",
        ),
    },
    Row {
        name: "decisions-ignored-only",
        config: None,
        files: &[("decisions/notes.md", "# Notes\n")],
        line: Some(
            "[warn] decisions: decisions/notes.md: no osq frontmatter, ignored; \
             no accepted ADR applies to all; write the architecture and style ADRs first",
        ),
    },
    Row {
        name: "decisions-marker-only",
        config: None,
        files: &[("AGENTS.md", "<!-- OSQ:RULES:START -->\n")],
        line: Some(
            "[warn] decisions: no accepted ADR applies to all; \
             write the architecture and style ADRs first",
        ),
    },
    Row {
        name: "decisions-missing-check-and-rules",
        config: None,
        files: &[
            (
                "decisions/001-keep.md",
                "---\nstatus: accepted\napplies_to: all\nrule: Keep it.\nchecks: [checks/missing.rs]\n---\n# 001. Keep\n",
            ),
            (
                "decisions/002-later.md",
                "---\nstatus: proposed\napplies_to: all\nchecks: [checks/gone.rs]\n---\n# 002. Later\n",
            ),
            ("AGENTS.md", "# Agents\n"),
        ],
        line: Some(
            "[fail] decisions: decisions/001-keep.md: check file checks/missing.rs does not exist; \
             AGENTS.md is missing its project rules block; run `osq init`",
        ),
    },
    Row {
        name: "decisions-invalid-status-and-unexpected-rules",
        config: None,
        files: &[
            (
                "decisions/001-odd.md",
                "---\nstatus: done\n---\n# 001. Odd\n",
            ),
            ("AGENTS.md", "<rules>\n"),
        ],
        line: Some(
            "[fail] decisions: decisions/001-odd.md: status must be proposed, accepted, or \
             superseded; AGENTS.md has an unexpected project rules block; run `osq init`",
        ),
    },
    Row {
        name: "decisions-out-of-date-rules",
        config: None,
        files: &[
            ("decisions/001-keep.md", "<keep>"),
            (
                "AGENTS.md",
                "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n",
            ),
        ],
        line: Some(
            "[fail] decisions: AGENTS.md project rules block is out of date; run `osq init`",
        ),
    },
    Row {
        name: "decisions-reversed-rules",
        config: None,
        files: &[
            ("decisions/001-keep.md", "<keep>"),
            (
                "AGENTS.md",
                "<!-- OSQ:RULES:END -->\n<!-- OSQ:RULES:START -->\n",
            ),
        ],
        line: Some(
            "[fail] decisions: AGENTS.md is missing its project rules block; run `osq init`",
        ),
    },
    Row {
        name: "decisions-limits",
        config: Some("[limits]\nmaxRuleLength = 5\nmaxProjectRules = 1"),
        files: &[
            ("decisions/001-keep.md", "<keep>"),
            (
                "decisions/002-also.md",
                "---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n",
            ),
            (
                "AGENTS.md",
                "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n",
            ),
        ],
        line: Some(
            "[fail] decisions: decisions/001-keep.md: rule is longer than limits.maxRuleLength \
             (5); AGENTS.md holds 2 project rules, more than limits.maxProjectRules (1)",
        ),
    },
    Row {
        name: "decisions-at-project-rule-limit",
        config: Some("[limits]\nmaxProjectRules = 1"),
        files: &[
            ("decisions/001-keep.md", "<keep>"),
            ("AGENTS.md", "<rules>\n"),
        ],
        line: Some("[ok] decisions: 1 ADRs valid"),
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

/// Expands the reused-text placeholders in one row file.
fn expand(text: &str) -> String {
    text.replace("<keep>", KEEP)
        .replace("<rules>", RULES)
        .replace("<all>", ALL)
}

/// The `decisions` line of a doctor result, or none when it prints none.
fn decisions_line(text: &str) -> Option<&str> {
    text.lines().find(|line| {
        line.starts_with("[ok] decisions:")
            || line.starts_with("[warn] decisions:")
            || line.starts_with("[fail] decisions:")
    })
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

/// Proves every row of "Doctor decisions lines" in its own scratch root.
///
/// Covers: rust-doctor/doctor-decisions-lines
#[test]
fn doctor_decisions_lines() {
    for row in ROWS {
        let root = scratch(row.name);
        if let Some(config) = row.config {
            write(&root.join("osq.toml"), config);
        }
        for (path, text) in row.files {
            write(&root.join(path), &expand(text));
        }
        let text = doctor_text(&root);
        assert_eq!(row.line, decisions_line(&text), "row {}", row.name);
    }
}
