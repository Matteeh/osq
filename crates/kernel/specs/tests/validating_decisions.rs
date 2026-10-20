//! Validation of the decisions fixture: every finding code and every finding.

use osq_kernel_specs::{
    Adr, AppliesTo, DecisionCode, DecisionFinding, DecisionProblems, DecisionRecords,
    read_decisions, validate_decisions,
};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::Path;

/// One row of the "Decision finding codes" table.
const CODES: &[(&DecisionCode, &str, &str)] = &[
    (
        &DecisionCode::MalformedList,
        "malformed-list",
        "Write the field as a list of non-empty strings, or remove it.",
    ),
    (
        &DecisionCode::InvalidStatus,
        "invalid-status",
        "Set status to proposed, accepted or superseded.",
    ),
    (
        &DecisionCode::MissingAppliesTo,
        "missing-applies-to",
        "Set applies_to to `all` or to a list of capability names.",
    ),
    (
        &DecisionCode::MissingRule,
        "missing-rule",
        "Add a one-line rule that says what a spec must do.",
    ),
    (
        &DecisionCode::MultilineRule,
        "multiline-rule",
        "Write the rule on one line.",
    ),
    (
        &DecisionCode::LongRule,
        "long-rule",
        "Shorten the rule to the limit and keep the full wording in the body.",
    ),
    (
        &DecisionCode::MissingSupersededBy,
        "missing-superseded-by",
        "Set superseded_by to the number of the ADR that replaces this one.",
    ),
    (
        &DecisionCode::UnknownSupersededBy,
        "unknown-superseded-by",
        "Name an existing ADR's number in superseded_by.",
    ),
    (
        &DecisionCode::UnknownCapability,
        "unknown-capability",
        "Name a living capability, or add its spec first.",
    ),
    (
        &DecisionCode::UnknownGroup,
        "unknown-group",
        "Name a group that a living capability's `osq.yml` sets.",
    ),
    (
        &DecisionCode::IgnoredFile,
        "ignored-file",
        "Give the file a numbered name and frontmatter with a status, or move it out of the \
         decisions folder.",
    ),
];

/// The fixture's findings, in order, as printed by TypeScript's validator.
const FINDINGS: &[(bool, &str)] = &[
    (
        false,
        "decisions/04-malformed.md: checks must be a list of non-empty strings",
    ),
    (
        false,
        "decisions/04-malformed.md: denies must be a list of non-empty strings",
    ),
    (
        false,
        "decisions/04-malformed.md: enforced_by must be a non-empty string or a list of \
         non-empty strings",
    ),
    (
        false,
        "decisions/04-malformed.md: accepted ADR needs applies_to, either \"all\" or capabilities",
    ),
    (
        false,
        "decisions/04-malformed.md: accepted ADR needs a one-line rule",
    ),
    (
        false,
        "decisions/005-bad-status.md: status must be proposed, accepted, or superseded",
    ),
    (false, "decisions/007-multiline.md: rule must be one line"),
    (
        false,
        "decisions/008-long.md: rule is longer than limits.maxRuleLength (60)",
    ),
    (
        false,
        "decisions/009-superseded-missing.md: superseded ADR needs superseded_by naming its \
         replacement",
    ),
    (
        false,
        "decisions/010-superseded-unknown.md: superseded_by 099 names no existing ADR",
    ),
    (
        true,
        "decisions/006-warnings.md: applies_to capability \"ghost\" has no living spec",
    ),
    (
        true,
        "decisions/006-warnings.md: applies_to group \"nobody\" has no living capability",
    ),
    (
        true,
        "decisions/003-no-frontmatter.md: no osq frontmatter, ignored",
    ),
    (true, "decisions/draft.md: no osq frontmatter, ignored"),
];

/// Covers: rust-specs/decision-finding-codes
#[test]
fn decision_finding_codes() {
    for (code, text, fix) in CODES {
        assert_eq!(serde_json::to_value(code).unwrap(), json!(text), "{text}");
        assert_eq!(code.as_str(), *text);
        assert_eq!(code.fix(), *fix, "{text}");
    }
}

/// Covers: rust-specs/validation-of-the-decisions-fixture
#[test]
fn validation_of_the_decisions_fixture() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/decisions");
    let records = read_decisions(&root, Path::new("decisions"), Path::new("openspec"));
    let living = vec!["alpha".to_string(), "beta".to_string()];
    let problems = validate_decisions(&records, &living, 60);

    let actual = displayed(&problems);
    let expected: Vec<(bool, String)> = FINDINGS
        .iter()
        .map(|(warning, text)| (*warning, (*text).to_string()))
        .collect();
    assert_eq!(actual, expected, "findings");

    for finding in problems.errors.iter().chain(&problems.warnings) {
        assert_eq!(finding.fix, finding.code.fix(), "{}", finding.file);
    }
}

/// The findings as their kind and display text, errors first then warnings.
fn displayed(problems: &DecisionProblems) -> Vec<(bool, String)> {
    let warnings = problems
        .warnings
        .iter()
        .map(|finding| (true, finding.to_string()));
    let errors = problems
        .errors
        .iter()
        .map(|finding| (false, finding.to_string()));
    errors.chain(warnings).collect()
}

/// Covers: rust-specs/decision-finding-codes
#[test]
fn a_rule_at_the_limit_is_not_long() {
    let records = records(vec![adr(
        "001",
        "accepted",
        &"a".repeat(60),
        Some(AppliesTo::All),
        None,
    )]);
    let problems = validate_decisions(&records, &[], 60);
    assert!(problems.errors.is_empty(), "{:?}", problems.errors);
}

/// Covers: rust-specs/decision-finding-codes
#[test]
fn superseded_by_compares_nonnumbers_as_text() {
    let records = records(vec![
        adr("abc", "superseded", "", Some(AppliesTo::All), Some("abc")),
        adr("1", "superseded", "", Some(AppliesTo::All), Some("-1")),
        adr("0", "superseded", "", Some(AppliesTo::All), Some("-0")),
        adr("007", "superseded", "", Some(AppliesTo::All), Some("+7")),
    ]);
    let problems = validate_decisions(&records, &[], 60);
    let unknown: Vec<&str> = problems
        .errors
        .iter()
        .filter(|finding| finding.code == DecisionCode::UnknownSupersededBy)
        .map(|finding| finding.file.as_str())
        .collect();
    assert_eq!(unknown, vec!["decisions/1.md"]);
}

/// One ADR with the given fields and every other field empty.
fn adr(
    number: &str,
    status: &str,
    rule: &str,
    applies_to: Option<AppliesTo>,
    superseded_by: Option<&str>,
) -> Adr {
    Adr {
        number: number.to_string(),
        title: String::new(),
        date: None,
        path: format!("decisions/{number}.md"),
        hash: String::new(),
        status: status.to_string(),
        applies_to,
        governs: AppliesTo::Capabilities(Vec::new()),
        rule: rule.to_string(),
        superseded_by: superseded_by.map(str::to_string),
        checks: Vec::new(),
        denies: Vec::new(),
        enforced_by: Vec::new(),
        malformed: Vec::new(),
    }
}

/// Records holding `adrs` and nothing else.
fn records(adrs: Vec<Adr>) -> DecisionRecords {
    DecisionRecords {
        adrs,
        ignored: Vec::new(),
        groups: BTreeMap::new(),
    }
}

/// Covers: rust-specs/decision-finding-codes
#[test]
fn findings_display_with_their_file() {
    let finding = DecisionFinding {
        code: DecisionCode::IgnoredFile,
        file: "decisions/x.md".to_string(),
        message: "no osq frontmatter, ignored".to_string(),
        fix: DecisionCode::IgnoredFile.fix().to_string(),
    };
    assert_eq!(
        finding.to_string(),
        "decisions/x.md: no osq frontmatter, ignored"
    );
}
