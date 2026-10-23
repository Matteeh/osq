//! Proves the findings the proposal rules give.

mod copy;
mod support;

use osq_core::FeatureError;

use support::{run, write};

/// The proposal file every row writes when it has one.
const PROP: &str = "openspec/changes/001-clean/proposal.md";
/// The clean frontmatter and sections every row starts its proposal with.
const GOAL: &str = "---\nverify: cargo test -p delta\n---\n## Goal\n\nSum a list.\n\n## \
                    Surface\n\nNone\n\n";
/// An accepted ADR that governs the delta capability.
const D009: (&str, &str) = (
    "decisions/009-delta.md",
    "---\nstatus: accepted\napplies_to: [delta]\nrule: Delta only.\n---\n# 009. Delta\n",
);
/// An accepted ADR in the `rust` group, which resolves to delta.
const D010: (&str, &str) = (
    "decisions/010-rust.md",
    "---\nstatus: accepted\napplies_to: [group:rust]\nrule: Rust only.\n---\n# 010. Rust\n",
);
/// A proposed ADR that governs delta.
const D009_PROPOSED: (&str, &str) = (
    "decisions/009-delta.md",
    "---\nstatus: proposed\napplies_to: [delta]\n---\n# 009. Delta\n",
);
/// An accepted ADR that applies to all.
const KEEP: (&str, &str) = (
    "decisions/001-keep.md",
    "---\nstatus: accepted\napplies_to: all\nrule: Keep it.\n---\n# 001. Keep\n",
);
/// A second accepted ADR that applies to all.
const ALSO: (&str, &str) = (
    "decisions/002-also.md",
    "---\nstatus: accepted\napplies_to: all\nrule: Also.\n---\n# 002. Also\n",
);
/// The project rules block the first keep ADR expects.
const RULES: &str =
    "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n<!-- OSQ:RULES:END -->\n";
/// A stale project rules block.
const RULES_STALE: &str = "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it now. ADR 001\n<!-- OSQ:RULES:END -->\n";
/// The project rules block two system-wide ADRs expect.
const RULES_TWO: &str = "<!-- OSQ:RULES:START -->\n## Project rules\n\n- Keep it. ADR 001\n- Also. ADR 002\n<!-- OSQ:RULES:END -->\n";
/// The one-line `osq.toml` that allows only one project rule.
const TOML_MAX_ONE: &str = "[limits]\nmaxProjectRules = 1\n";

/// One row: its files and either its output or its failure message.
struct Row {
    /// The scratch root's folder name for this row.
    name: &'static str,
    /// The files to write over the copied fixture.
    files: Vec<(&'static str, String)>,
    /// The row's output or failure message.
    result: Result<&'static str, &'static str>,
}

/// A proposal body that starts from the clean goal and adds `rest`.
fn prop(rest: &str) -> String {
    format!("{GOAL}{rest}")
}

/// Every row of "Proposal rule findings", in the scenario's order.
fn rows() -> Vec<Row> {
    let mut rows = Vec::new();
    rows.extend(rows_start());
    rows.extend(rows_decisions());
    rows.extend(rows_rules());
    rows.extend(rows_extra());
    rows
}

/// One group of "Proposal rule findings" rows.
fn rows_start() -> Vec<Row> {
    vec![
        Row {
            name: "assumptions_none",
            files: vec![(PROP, prop("## Assumptions\n\nNone\n"))],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "assumptions_comment",
            files: vec![(
                PROP,
                prop("## Assumptions\n\n<!-- one line each -->\n\n## Delta\n\nx\n"),
            )],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): proposal.md's \
                 ## Assumptions section is empty: write None or one line per assumption"),
        },
        Row {
            name: "assumptions_at_start",
            files: vec![(PROP, "## Assumptions\n\n<!-- empty -->\n".to_owned())],
            result: Err("001-clean: 3 findings\n\
                 001-clean: error openspec/changes/001-clean/proposal.md: proposal.md must declare a \
                 verify command in frontmatter\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Surface): proposal.md needs \
                 a ## Surface section: list the commands, flags, config keys, frontmatter fields, \
                 document sections, dead reasons, and event types this change adds, changes, or \
                 removes, or write None\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): proposal.md's \
                 ## Assumptions section is empty: write None or one line per assumption"),
        },
        Row {
            name: "bad_frontmatter",
            files: vec![(
                PROP,
                "---\ntitle: [\n---\n## Goal\n\nSum a list.\n\n## Assumptions\n\n".to_owned(),
            )],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md: proposal.md frontmatter \
                 is not valid YAML at line 3: while parsing a node, did not find expected node \
                 content at byte 8 line 2 column 1"),
        },
    ]
}

/// One group of "Proposal rule findings" rows.
fn rows_decisions() -> Vec<Row> {
    vec![
        Row {
            name: "decisions_missing",
            files: vec![(D009.0, D009.1.to_owned())],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Decisions): proposal.md needs \
                 a ## Decisions section: name each accepted ADR that governs a capability this change \
                 writes, or write None"),
        },
        Row {
            name: "decisions_unnamed",
            files: vec![
                (D009.0, D009.1.to_owned()),
                (PROP, prop("## Decisions\n\nNone\n")),
            ],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Decisions): proposal.md ## \
                 Decisions does not name ADR 009, which applies to delta"),
        },
        Row {
            name: "decisions_short_number",
            files: vec![
                (D009.0, D009.1.to_owned()),
                (PROP, prop("## Decisions\n\n- ADR 9: delta stays small.\n")),
            ],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "decisions_unknown",
            files: vec![
                (D009.0, D009.1.to_owned()),
                (
                    PROP,
                    prop(
                        "## Decisions\n\n- Departs from ADR 009: reasons.\n- ADR 042 and ADR 42 are \
                         planned.\n",
                    ),
                ),
            ],
            result: Ok(
                "001-clean: warning openspec/changes/001-clean/proposal.md (Decisions): \
                 proposal.md ## Decisions names ADR 042, which does not exist or is not \
                 accepted\n001-clean: valid\n",
            ),
        },
        Row {
            name: "decisions_group",
            files: vec![
                (D010.0, D010.1.to_owned()),
                (PROP, prop("## Decisions\n\nNone\n")),
            ],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Decisions): proposal.md ## \
                 Decisions does not name ADR 010, which applies to delta"),
        },
        Row {
            name: "decisions_proposed",
            files: vec![(D009_PROPOSED.0, D009_PROPOSED.1.to_owned())],
            result: Ok("001-clean: valid\n"),
        },
    ]
}

/// One group of "Proposal rule findings" rows.
fn rows_rules() -> Vec<Row> {
    vec![
        Row {
            name: "rules_missing",
            files: vec![
                (KEEP.0, KEEP.1.to_owned()),
                (PROP, prop("## Decisions\n\nNone\n")),
            ],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error AGENTS.md: AGENTS.md is missing its project rules block; run `osq \
                 init`"),
        },
        Row {
            name: "rules_present",
            files: vec![
                (KEEP.0, KEEP.1.to_owned()),
                ("AGENTS.md", RULES.to_owned()),
                (PROP, prop("## Decisions\n\nNone\n")),
            ],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "rules_stale",
            files: vec![
                (KEEP.0, KEEP.1.to_owned()),
                ("AGENTS.md", RULES_STALE.to_owned()),
                (PROP, prop("## Decisions\n\nNone\n")),
            ],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error AGENTS.md: AGENTS.md project rules block is out of date; run `osq \
                 init`"),
        },
        Row {
            name: "rules_unexpected",
            files: vec![
                (D009.0, D009.1.to_owned()),
                ("AGENTS.md", RULES.to_owned()),
                (PROP, prop("## Decisions\n\n- ADR 009: small.\n")),
            ],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error AGENTS.md: AGENTS.md has an unexpected project rules block; run \
                 `osq init`"),
        },
        Row {
            name: "rules_too_many",
            files: vec![
                (KEEP.0, KEEP.1.to_owned()),
                (ALSO.0, ALSO.1.to_owned()),
                ("AGENTS.md", RULES_TWO.to_owned()),
                ("osq.toml", TOML_MAX_ONE.to_owned()),
                (PROP, prop("## Decisions\n\nNone\n")),
            ],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error AGENTS.md: AGENTS.md holds 2 project rules, more than \
                 limits.maxProjectRules (1)"),
        },
        Row {
            name: "both_blank",
            files: vec![
                (KEEP.0, KEEP.1.to_owned()),
                ("AGENTS.md", RULES.to_owned()),
                (
                    PROP,
                    prop("## Assumptions\n\n\n## Decisions\n\n<!-- later -->\n"),
                ),
            ],
            result: Err("001-clean: 2 findings\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): proposal.md's \
                 ## Assumptions section is empty: write None or one line per assumption\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Decisions): proposal.md needs \
                 a ## Decisions section: name each accepted ADR that governs a capability this change \
                 writes, or write None"),
        },
    ]
}

/// One group of "Proposal rule findings" rows.
fn rows_extra() -> Vec<Row> {
    vec![
        Row {
            name: "assumptions_first_line",
            files: vec![(PROP, prop("## Assumptions\n\n<!-- empty -->\n"))],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): proposal.md's \
                 ## Assumptions section is empty: write None or one line per assumption"),
        },
        Row {
            name: "assumptions_hash_without_space",
            files: vec![(
                PROP,
                prop("## Goal\n\nSum a list.\n\n## Assumptions\n\n##X\n\nNone\n"),
            )],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "assumptions_inline_mention",
            files: vec![(
                PROP,
                prop("The ## Assumptions section is mentioned here.\n\n## Goal\n\nSum a list.\n"),
            )],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "assumptions_next_heading",
            files: vec![(
                PROP,
                prop("## Goal\n\nSum a list.\n\n## Assumptions\n## Delta\n\nx\n"),
            )],
            result: Err("001-clean: 1 finding\n\
                 001-clean: error openspec/changes/001-clean/proposal.md (Assumptions): proposal.md's \
                 ## Assumptions section is empty: write None or one line per assumption"),
        },
        Row {
            name: "assumptions_subheading",
            files: vec![(
                PROP,
                prop("## Goal\n\nSum a list.\n\n## Assumptions\n\n### Detail\n\nNone\n"),
            )],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "assumptions_unclosed_comment",
            files: vec![(
                PROP,
                prop("## Goal\n\nSum a list.\n\n## Assumptions\n\n<!-- open\n"),
            )],
            result: Ok("001-clean: valid\n"),
        },
        Row {
            name: "decisions_word_char",
            files: vec![
                (D009.0, D009.1.to_owned()),
                (
                    PROP,
                    prop("## Decisions\n\n- ADR 009: ok.\n- xADR 042 and _ADR 043.\n"),
                ),
            ],
            result: Ok("001-clean: valid\n"),
        },
    ]
}

/// Proves every row of "Proposal rule findings" on its own copy of the fixture.
///
/// Covers: rust-lint/proposal-rule-findings
#[test]
fn lint_proposal_rules() {
    for row in rows() {
        let root = copy::fixture(&format!("lint_proposal_rules/{}", row.name));
        for (path, contents) in &row.files {
            write(&root, path, contents);
        }
        assert_result(&root, &row);
    }
}

/// Checks one row's output or failure against the scratch root.
fn assert_result(root: &std::path::Path, row: &Row) {
    match (run(root, "1"), row.result) {
        (Ok(output), Ok(text)) => assert_eq!(output.text, text, "{}", row.name),
        (Err(error), Err(text)) => match error {
            FeatureError::Failed {
                command, message, ..
            } => {
                assert_eq!(command, "lint", "{}: command", row.name);
                assert_eq!(message, text, "{}", row.name);
            }
            other => panic!("{}: expected a failed error, got {other:?}", row.name),
        },
        (result, _) => panic!("{}: unexpected result {result:?}", row.name),
    }
}
